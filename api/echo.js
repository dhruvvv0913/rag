// POST /api/echo { text } -> { reply }
// Proves the end-to-end path: browser -> serverless -> LLM adapter -> Gemini -> back.
import { complete } from '../lib/llm.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }
  const { text } = req.body ?? {}
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Body must be JSON with a "text" string' })
  }

  try {
    const reply = await complete({
      system: 'You are a helpful assistant. Answer in at most three sentences.',
      messages: [{ role: 'user', content: text }],
    })
    res.status(200).json({ reply })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
