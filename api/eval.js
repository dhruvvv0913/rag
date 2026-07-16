// POST /api/eval { limit? } -> eval summary JSON.
// The CLI (npm run eval) is the primary harness; this endpoint runs a small
// subset so the deployed demo can show the eval working within function
// time limits.
import { runEval } from '../lib/evaluate.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }
  const limit = Math.min(Number(req.body?.limit) || 3, 5)
  try {
    const { results, summary } = await runEval({ limit })
    res.status(200).json({ summary, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
