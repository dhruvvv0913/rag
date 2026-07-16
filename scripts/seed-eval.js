// scripts/seed-eval.js — load the eval test set (§11) into eval_cases.
// expected_facts are short verbatim phrases from the fixture docs, so the
// retrieval recall check (substring match) is reliable.
// Run with: npm run seed   (or: node --env-file=.env scripts/seed-eval.js)
import { supabase } from '../lib/db.js'

const CASES = [
  {
    question: "How many employees took part in Northwind Labs' four-day work week trial, and when did it run?",
    expected_facts: ['214 employees', 'February to September 2025'],
    notes: 'northwind-4day.md',
  },
  {
    question: 'By how much did productivity change during the Northwind Labs four-day week trial, and how was productivity measured?',
    expected_facts: ['18 percent', 'story points'],
    notes: 'northwind-4day.md',
  },
  {
    question: 'What happened to employee attrition at Northwind Labs during the four-day week trial?',
    expected_facts: ['14 percent', '6 percent'],
    notes: 'northwind-4day.md',
  },
  {
    question: 'What meeting rules did Northwind Labs introduce to protect the four-day week?',
    expected_facts: ['no internal meetings', '25 minutes'],
    notes: 'northwind-4day.md',
  },
  {
    question: "Who championed Northwind Labs' four-day week trial and what was decided at the end of it?",
    expected_facts: ['Maya Iyer', 'permanent'],
    notes: 'northwind-4day.md',
  },
  {
    question: 'What downsides did Northwind Labs report from the four-day work week trial?',
    expected_facts: ['Austin', '12 percent'],
    notes: 'northwind-4day.md',
  },
  {
    question: "How many students enrolled in Atlas University's spaced repetition program and when did it launch?",
    expected_facts: ['1,842 students', 'Fall 2024'],
    notes: 'atlas-spaced-repetition.md',
  },
  {
    question: "How did final exam scores change for students in Atlas University's spaced repetition program?",
    expected_facts: ['12.4 percent', 'General Chemistry'],
    notes: 'atlas-spaced-repetition.md',
  },
  {
    question: 'What were the six-month retention results of the Atlas University spaced repetition program versus the control group?',
    expected_facts: ['71 percent', '44 percent'],
    notes: 'atlas-spaced-repetition.md',
  },
  {
    question: 'Which algorithm powered the Atlas University review sessions, and how much daily review time did students need?',
    expected_facts: ['SM-2', '18 minutes'],
    notes: 'atlas-spaced-repetition.md',
  },
  {
    question: 'What caveats did the Atlas University report raise about its spaced repetition results?',
    expected_facts: ['self-selected', '20 hours'],
    notes: 'atlas-spaced-repetition.md',
  },
  {
    question: "Compare the headline quantitative outcomes of Northwind Labs' four-day week trial and Atlas University's spaced repetition program.",
    expected_facts: ['18 percent', '12.4 percent'],
    notes: 'both fixtures',
  },
]

const db = supabase()
// Idempotent: wipe and re-insert.
const { error: delErr } = await db.from('eval_cases').delete().not('id', 'is', null)
if (delErr) throw new Error(delErr.message)
const { error: insErr } = await db.from('eval_cases').insert(CASES)
if (insErr) throw new Error(insErr.message)
console.log(`seeded ${CASES.length} eval cases.`)
