// lib/agent.js — the agent loop (§10): plan -> act (tools) -> write.
// Kept out of /api so both /api/research and the eval harness can run it.
//
// onEvent receives progress events for streaming to the UI:
//   { type: 'plan', subQuestions }        planning done
//   { type: 'tool', name, args }          a tool is being called
//   { type: 'report', delta }             a piece of the report text
//   { type: 'sources', sources }          final source list (for citations)
import { complete, stream } from './llm.js'
import { toolDefs, executeTool } from './tools.js'
import {
  PLANNER_SYSTEM,
  PLAN_SCHEMA,
  plannerUser,
  RESEARCHER_SYSTEM,
  researcherUser,
  WRITER_SYSTEM,
  writerUser,
} from './prompts.js'

// The loop needs a hard stop: an LLM that keeps "wanting one more search"
// would otherwise run (and bill) forever.
const MAX_STEPS = 8

export async function runAgent({ question, onEvent = () => {} }) {
  // 1) PLAN — structured output, low temperature for focus.
  const { subQuestions } = await complete({
    system: PLANNER_SYSTEM,
    messages: [{ role: 'user', content: plannerUser(question) }],
    responseSchema: PLAN_SCHEMA,
    temperature: 0.3,
  })
  onEvent({ type: 'plan', subQuestions })

  // 2) ACT — let the model call tools until it stops (or we cap it).
  // The "conversation" grows: each tool result is appended and the whole
  // history is re-sent every turn (LLM APIs are stateless).
  const ctx = { sources: [] }
  const messages = [{ role: 'user', content: researcherUser(question, subQuestions) }]
  for (let step = 0; step < MAX_STEPS; step++) {
    const turn = await complete({ system: RESEARCHER_SYSTEM, messages, tools: toolDefs })
    if (!turn.toolCalls.length) break // the model decided it has enough
    messages.push({ role: 'assistant', content: turn.text, toolCalls: turn.toolCalls, _raw: turn._raw })
    for (const call of turn.toolCalls) {
      onEvent({ type: 'tool', name: call.name, args: call.args })
      const result = await executeTool(call.name, call.args, ctx)
      messages.push({ role: 'tool', name: call.name, content: result })
    }
  }

  // 3) WRITE — a fresh, focused context: just the question and the evidence.
  // (Cheaper and cleaner than dragging the whole tool transcript along.)
  let report = ''
  for await (const delta of stream({
    system: WRITER_SYSTEM,
    messages: [{ role: 'user', content: writerUser(question, ctx.sources) }],
  })) {
    report += delta
    onEvent({ type: 'report', delta })
  }

  const sources = ctx.sources.map(({ id, type, title, source }) => ({ id, type, title, source }))
  onEvent({ type: 'sources', sources })
  return { question, subQuestions, report, sources: ctx.sources }
}
