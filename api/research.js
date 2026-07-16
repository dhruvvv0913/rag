// POST /api/research { question } -> NDJSON stream of agent events.
// Each line is one JSON event (see lib/agent.js); the final line is
// { type: 'done' } or { type: 'error', message }.
import { runAgent } from '../lib/agent.js'

export const config = { supportsResponseStreaming: true }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }
  const { question } = req.body ?? {}
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Body must be JSON with a "question" string' })
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
  })
  const send = (event) => res.write(JSON.stringify(event) + '\n')

  try {
    await runAgent({ question, onEvent: send })
    send({ type: 'done' })
  } catch (err) {
    send({ type: 'error', message: err.message })
  }
  res.end()
}
