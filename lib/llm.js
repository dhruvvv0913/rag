// lib/llm.js — the LLM provider adapter (§6 of project.md).
// This is the ONLY file in the codebase that talks to a provider API.
// Feature code speaks a neutral shape: complete({ system, messages }) -> reply text.
// Messages use { role: 'user' | 'assistant', content: string }.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
// gemini-2.5-flash (project.md §6) is closed to new accounts as of mid-2026;
// 3.5-flash is the current stable flash-class model this key can invoke.
const GEMINI_CHAT_MODEL = 'gemini-3.5-flash'

// One chat turn. Returns reply text — or a parsed object if `responseSchema`
// is given (the provider then guarantees valid JSON in that shape).
// `tools` (§6) gets implemented in Phase 3.
export async function complete({ system, messages, responseSchema }) {
  const provider = process.env.LLM_PROVIDER || 'gemini'
  if (provider === 'gemini') return geminiComplete({ system, messages, responseSchema })
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`)
}

// Batch embeddings — implemented in Phase 2 (RAG).
export async function embed(_texts) {
  throw new Error('llm.embed() is not implemented yet (Phase 2)')
}

async function geminiComplete({ system, messages, responseSchema }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set (add it to .env.local)')

  // Gemini's wire format: role is 'user' or 'model' (not 'assistant'),
  // and text lives in content "parts". The system prompt is a separate field.
  const body = {
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  if (responseSchema) {
    // Constrained decoding: Gemini only generates tokens that keep the
    // output valid JSON matching this schema.
    body.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema,
    }
  }

  const res = await fetch(`${GEMINI_BASE}/models/${GEMINI_CHAT_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Gemini API ${res.status}: ${detail}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')
  if (text == null) throw new Error(`Gemini returned no text: ${JSON.stringify(data)}`)
  return responseSchema ? JSON.parse(text) : text
}
