// POST /api/echo { text } -> streamed plain-text reply.
// Kept as the minimal example of streaming an LLM response through a
// serverless function; /api/research uses the same mechanics with NDJSON.
import { stream } from '../lib/llm.js'

export const config = { supportsResponseStreaming: true }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }
  const { text } = req.body ?? {}
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Body must be JSON with a "text" string' })
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' })
  try {
    for await (const delta of stream({
      system: 'You are a helpful assistant. Answer in at most three sentences.',
      messages: [{ role: 'user', content: text }],
    })) {
      res.write(delta)
    }
  } catch (err) {
    res.write(`\n[stream error] ${err.message}`)
  }
  res.end()
}
