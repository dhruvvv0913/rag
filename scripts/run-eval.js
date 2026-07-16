// scripts/run-eval.js — run the eval harness from the CLI and print a report.
// Run with: npm run eval          (all cases)
//           npm run eval -- 3     (first N cases only)
import { mkdir, writeFile } from 'node:fs/promises'
import { runEval } from '../lib/evaluate.js'

const limit = process.argv[2] ? Number(process.argv[2]) : undefined
const startedAt = new Date()

const { results, summary } = await runEval({ limit, onLog: console.log })

console.log('\n================ EVAL REPORT ================')
for (const r of results) {
  console.log(`\nQ: ${r.question}`)
  console.log(
    `   recall@5 ${r.recallAt5.toFixed(2)} | fact coverage ${r.factCoverage.toFixed(2)} | faithfulness ${r.faithfulness.toFixed(2)}`
  )
  if (r.unsupportedClaims?.length) {
    console.log(`   unsupported claims: ${r.unsupportedClaims.join(' | ')}`)
  }
  if (r.judgeComment) console.log(`   judge: ${r.judgeComment}`)
}
console.log('\n---------------- AGGREGATES ----------------')
console.log(`cases:            ${summary.cases}`)
console.log(`avg recall@5:     ${summary.avgRecallAt5.toFixed(3)}`)
console.log(`avg fact coverage:${summary.avgFactCoverage.toFixed(3)}`)
console.log(`avg faithfulness: ${summary.avgFaithfulness.toFixed(3)}`)

// Keep a local record so before/after comparisons are easy (gitignored).
await mkdir('eval-results', { recursive: true })
const file = `eval-results/${startedAt.toISOString().replace(/[:.]/g, '-')}.json`
await writeFile(file, JSON.stringify({ startedAt, summary, results }, null, 2))
console.log(`\nsaved ${file}`)
