// lib/prompts.js — every prompt in one place (§12), so tuning them never
// means hunting through feature code.

// ---- Planner (§10 step 1): question -> sub-questions ----

export const PLANNER_SYSTEM = `You are a research planner.
Given a research question, break it into 3 to 5 focused sub-questions that
together would fully answer it. Each sub-question must be:
- independently searchable (a good search query on its own),
- specific and concrete (no vague "explore the topic" items),
- non-overlapping with the others.`

// Gemini's schema dialect (an OpenAPI subset, UPPERCASE types). The adapter
// passes this through; if we ever switch providers, translation happens there.
export const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    subQuestions: {
      type: 'ARRAY',
      description: '3-5 focused sub-questions',
      items: { type: 'STRING' },
    },
  },
  required: ['subQuestions'],
}

export function plannerUser(question) {
  return `Research question: ${question}`
}
