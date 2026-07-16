// POST /api/plan { question } -> { subQuestions: string[] }
// Phase 1: structured output demo. Later this becomes step 1 of the agent (§10).
import { complete } from '../lib/llm.js'
import { PLANNER_SYSTEM, PLAN_SCHEMA, plannerUser } from '../lib/prompts.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }
  const { question } = req.body ?? {}
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Body must be JSON with a "question" string' })
  }

  try {
    const plan = await complete({
      system: PLANNER_SYSTEM,
      messages: [{ role: 'user', content: plannerUser(question) }],
      responseSchema: PLAN_SCHEMA,
    })
    res.status(200).json(plan)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
