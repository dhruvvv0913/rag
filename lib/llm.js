// lib/llm.js — the LLM provider adapter (§6 of project.md).
// This is the ONLY file in the codebase that talks to a provider API.
// Feature code speaks neutral shapes:
//
//   complete({ system, messages, tools?, responseSchema?, temperature? })
//     -> string                (plain completion)
//     -> parsed object         (when responseSchema is given — guaranteed JSON)
//     -> { text, toolCalls }   (when tools are given — the agent loop's turn)
//   stream({ system, messages, temperature? })
//     -> async iterator of text deltas
//   embed(texts, { taskType? })
//     -> number[][] (one vector per text)
//
// Neutral message shapes:
//   { role: 'user' | 'assistant', content: string }
//   { role: 'assistant', content?, toolCalls: [{ name, args }] }
//   { role: 'tool', name, content: string }   (result of a tool call)

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
// gemini-2.5-flash (project.md §6) is closed to new accounts as of mid-2026,
// and the flagship models' free tier is tiny (3.5-flash: 20 requests/DAY).
// The lite tier gets a generous daily quota, which the agent loop and the
// eval harness actually need. Override with GEMINI_CHAT_MODEL if you upgrade.
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite'
const GEMINI_EMBED_MODEL = 'gemini-embedding-001'
// Must match vector(768) in supabase-schema.sql. gemini-embedding-001 natively
// outputs 3072 dims but supports truncation (Matryoshka embeddings); 768 keeps
// storage small with near-identical retrieval quality.
export const EMBEDDING_DIM = 768

function provider() {
  return process.env.LLM_PROVIDER || 'gemini'
}

export async function complete(opts) {
  if (provider() === 'gemini') return geminiComplete(opts)
  throw new Error(`Unknown LLM_PROVIDER: ${provider()}`)
}

export async function* stream(opts) {
  if (provider() === 'gemini') return yield* geminiStream(opts)
  throw new Error(`Unknown LLM_PROVIDER: ${provider()}`)
}

// Embeddings always run on Gemini regardless of LLM_PROVIDER — Anthropic has
// no embedding API (§6); mixing providers is exactly what the adapter is for.
export async function embed(texts, opts = {}) {
  if (!texts.length) return []
  return geminiEmbed(texts, opts)
}

// ---------------- Gemini implementation ----------------

function apiKey() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set (add it to .env)')
  return key
}

// The free tier rate-limits aggressively (429) and the model intermittently
// returns 503 "high demand" — both are transient, so wait them out with
// increasingly patient backoff before giving up.
const RETRY_DELAYS_MS = { 429: [5000, 15000, 30000], server: [2000, 5000, 12000, 30000] }

async function geminiFetch(path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GEMINI_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify(body),
    })
    if (res.ok) return res
    const detail = await res.text()
    const delays = res.status === 429 ? RETRY_DELAYS_MS[429] : res.status >= 500 ? RETRY_DELAYS_MS.server : null
    if (!delays || attempt >= delays.length) {
      throw new Error(`Gemini API ${res.status}: ${detail}`)
    }
    await new Promise((r) => setTimeout(r, delays[attempt]))
  }
}

// Translate a neutral message into Gemini's wire format: role is
// 'user'/'model' (not 'assistant'), text lives in "parts", tool calls are
// functionCall parts and tool results are functionResponse parts.
function toGeminiContent(m) {
  if (m.role === 'tool') {
    return {
      role: 'user',
      parts: [{ functionResponse: { name: m.name, response: { result: m.content } } }],
    }
  }
  // Assistant turns that came FROM Gemini carry provider-specific state
  // (thought signatures on Gemini 3.x) that must be echoed back verbatim,
  // so we round-trip the raw parts instead of rebuilding them.
  if (m.role === 'assistant' && m._raw) {
    return { role: 'model', parts: m._raw }
  }
  const parts = []
  if (m.content) parts.push({ text: m.content })
  for (const call of m.toolCalls ?? []) {
    parts.push({ functionCall: { name: call.name, args: call.args } })
  }
  if (!parts.length) parts.push({ text: '' })
  return { role: m.role === 'assistant' ? 'model' : 'user', parts }
}

function buildBody({ system, messages, tools, responseSchema, temperature }) {
  const body = { contents: messages.map(toGeminiContent) }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  if (tools?.length) body.tools = [{ functionDeclarations: tools }]
  const gen = {}
  if (responseSchema) {
    // Constrained decoding: Gemini only generates tokens that keep the
    // output valid JSON matching this schema.
    gen.responseMimeType = 'application/json'
    gen.responseSchema = responseSchema
  }
  if (temperature != null) gen.temperature = temperature
  if (Object.keys(gen).length) body.generationConfig = gen
  return body
}

async function geminiComplete(opts) {
  const res = await geminiFetch(`/models/${GEMINI_CHAT_MODEL}:generateContent`, buildBody(opts))
  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const text = parts.filter((p) => p.text).map((p) => p.text).join('')
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p) => ({ name: p.functionCall.name, args: p.functionCall.args ?? {} }))

  if (opts.tools) return { text, toolCalls, _raw: parts }
  if (!text) throw new Error(`Gemini returned no text: ${JSON.stringify(data).slice(0, 500)}`)
  return opts.responseSchema ? JSON.parse(text) : text
}

async function* geminiStream(opts) {
  const res = await geminiFetch(
    `/models/${GEMINI_CHAT_MODEL}:streamGenerateContent?alt=sse`,
    buildBody(opts)
  )
  // Server-sent events: the body is a stream of "data: {json}\n" lines.
  // Chunks can split mid-line, so buffer and only parse complete lines.
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      const text = JSON.parse(payload)
        .candidates?.[0]?.content?.parts?.map((p) => p.text ?? '')
        .join('')
      if (text) yield text
    }
  }
}

async function geminiEmbed(texts, { taskType = 'RETRIEVAL_DOCUMENT' } = {}) {
  const vectors = []
  const BATCH = 100 // API cap per batchEmbedContents call
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await geminiFetch(`/models/${GEMINI_EMBED_MODEL}:batchEmbedContents`, {
      requests: texts.slice(i, i + BATCH).map((text) => ({
        model: `models/${GEMINI_EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType, // RETRIEVAL_DOCUMENT for stored chunks, RETRIEVAL_QUERY for queries
        outputDimensionality: EMBEDDING_DIM,
      })),
    })
    const data = await res.json()
    vectors.push(...data.embeddings.map((e) => e.values))
  }
  return vectors
}
