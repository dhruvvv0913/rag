// lib/evaluate.js — the eval harness (§11). For each test case it scores:
//   1. Retrieval quality (recall@5): did the top-5 chunks contain the
//      expected facts? Mechanical substring check — cheap and objective.
//   2. Answer quality via LLM-as-judge: fact coverage (are the expected facts
//      in the report, paraphrase allowed) and faithfulness (is every claim
//      grounded in a retrieved source). A judge is used because reports
//      paraphrase; its known limitation is that it can be wrong itself, which
//      is why the mechanical retrieval score sits alongside it.
import { supabase } from './db.js'
import { searchDocuments } from './retrieve.js'
import { runAgent } from './agent.js'
import { complete } from './llm.js'
import { retrievalRecall, average } from './eval-score.js'
import { JUDGE_SYSTEM, JUDGE_SCHEMA, judgeUser } from './prompts.js'

export async function evaluateCase(evalCase, { onLog = () => {} } = {}) {
  const { question, expected_facts: expectedFacts } = evalCase

  // 1) Retrieval quality, independent of the agent.
  const retrieved = await searchDocuments(question, 5)
  const recallAt5 = retrievalRecall(retrieved.map((c) => c.content), expectedFacts)
  onLog(`  recall@5 = ${recallAt5.toFixed(2)}`)

  // 2) Full agent run, then judge the report.
  const { report, sources } = await runAgent({ question })
  const judge = await complete({
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: judgeUser({ question, expectedFacts, report, sources }) }],
    responseSchema: JUDGE_SCHEMA,
    temperature: 0,
  })
  const factCoverage = judge.facts.length
    ? judge.facts.filter((f) => f.present).length / judge.facts.length
    : 1
  onLog(`  factCoverage = ${factCoverage.toFixed(2)}, faithfulness = ${judge.faithfulness.toFixed(2)}`)

  return {
    question,
    recallAt5,
    factCoverage,
    faithfulness: judge.faithfulness,
    unsupportedClaims: judge.unsupportedClaims,
    judgeComment: judge.comment ?? '',
  }
}

export async function runEval({ limit, onLog = () => {} } = {}) {
  let query = supabase().from('eval_cases').select('*').order('created_at', { ascending: true })
  if (limit) query = query.limit(limit)
  const { data: cases, error } = await query
  if (error) throw new Error(`loading eval_cases failed: ${error.message}`)
  if (!cases?.length) throw new Error('No eval cases found — run `npm run seed` first')

  const results = []
  for (const [i, c] of cases.entries()) {
    onLog(`[${i + 1}/${cases.length}] ${c.question}`)
    results.push(await evaluateCase(c, { onLog }))
  }

  return {
    results,
    summary: {
      cases: results.length,
      avgRecallAt5: average(results.map((r) => r.recallAt5)),
      avgFactCoverage: average(results.map((r) => r.factCoverage)),
      avgFaithfulness: average(results.map((r) => r.faithfulness)),
    },
  }
}
