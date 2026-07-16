// lib/tools.js — the agent's tools (§10): declarations the LLM sees, plus the
// plain functions that execute them. Every piece of evidence a tool returns is
// registered in ctx.sources with an id ([S1], [S2], ...) so the final report
// can cite it and the UI can render a source list.
import { searchDocuments } from './retrieve.js'

// Declarations use Gemini's schema dialect (same as responseSchema); the
// adapter would translate these if the provider ever changes.
export const toolDefs = [
  {
    name: 'search_documents',
    description:
      "Semantic search over the user's uploaded documents. Use this FIRST for anything the user's own files might cover.",
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'What to look for, phrased as a focused query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the public web. Returns result titles, URLs and text snippets.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'A focused search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description:
      'Fetch a web page and return its readable text. Use after web_search when a snippet looks promising but you need the full content.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'The absolute URL to fetch' },
      },
      required: ['url'],
    },
  },
]

export async function executeTool(name, args, ctx) {
  try {
    if (name === 'search_documents') return await runSearchDocuments(args.query, ctx)
    if (name === 'web_search') return await runWebSearch(args.query, ctx)
    if (name === 'fetch_url') return await runFetchUrl(args.url, ctx)
    return `Unknown tool: ${name}`
  } catch (err) {
    // Return errors as text: the model reads them and can adapt its plan
    // (e.g. fall back to web search when no documents are indexed).
    return `Tool error: ${err.message}`
  }
}

function addSource(ctx, entry) {
  const id = `S${ctx.sources.length + 1}`
  ctx.sources.push({ id, ...entry })
  return id
}

async function runSearchDocuments(query, ctx) {
  const chunks = await searchDocuments(query, 5)
  if (!chunks.length) return 'No matching content found in the uploaded documents.'
  return chunks
    .map((c) => {
      const id = addSource(ctx, {
        type: 'document',
        title: c.title ?? c.source,
        source: c.source,
        content: c.content,
      })
      return `[${id}] from "${c.source}" (similarity ${c.similarity.toFixed(2)}):\n${c.content}`
    })
    .join('\n\n')
}

async function runWebSearch(query, ctx) {
  const key = process.env.SEARCH_API_KEY
  if (!key) {
    return 'Web search is not available (no SEARCH_API_KEY configured). Rely on other tools or your own knowledge, and say so in the report.'
  }
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 5 }),
  })
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`)
  const data = await res.json()
  if (!data.results?.length) return 'No web results for that query.'
  return data.results
    .map((r) => {
      const id = addSource(ctx, { type: 'web', title: r.title, source: r.url, content: r.content })
      return `[${id}] ${r.title}\n${r.url}\n${r.content}`
    })
    .join('\n\n')
}

async function runFetchUrl(url, ctx) {
  // Note: fetching arbitrary URLs from a server is an SSRF risk in a real
  // product (an attacker could probe internal services). Acceptable for a
  // single-user learning project; a production version would allowlist hosts.
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    redirect: 'follow',
    headers: { 'User-Agent': 'ai-research-agent (student learning project)' },
  })
  if (!res.ok) throw new Error(`GET ${url} returned ${res.status}`)
  const text = htmlToText(await res.text()).slice(0, 8000)
  if (!text) return 'The page had no readable text.'
  const id = addSource(ctx, { type: 'web', title: url, source: url, content: text.slice(0, 2000) })
  return `[${id}] Content of ${url}:\n${text}`
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
