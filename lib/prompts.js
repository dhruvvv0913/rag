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

// ---- Researcher (§10 step 2): the tool-calling loop ----

export const RESEARCHER_SYSTEM = `You are a research agent gathering evidence to answer a question.

You have tools. Rules:
- Start with search_documents: the user may have uploaded documents that cover the topic. If it returns nothing useful, move on to web_search.
- Issue focused queries, one sub-question at a time.
- If a web result snippet looks central to the question, fetch_url it for the full text.
- Every tool result is labelled with source ids like [S1], [S2]. Keep track of which sources answer which sub-question.
- STOP calling tools once you have enough evidence to answer every sub-question (or once it is clear no more is available). Then reply with a short plain-text summary of what you found and which sources matter. Do NOT write the final report.`

export function researcherUser(question, subQuestions) {
  return `Research question: ${question}

Sub-questions to cover:
${subQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Gather evidence with your tools, then summarise what you found.`
}

// ---- Writer (§10 step 3): evidence -> cited report ----

export const WRITER_SYSTEM = `You write research reports in Markdown.

Rules:
- Answer the research question directly; organise with short headed sections.
- Ground EVERY factual claim in the provided sources, citing inline like [S1] (multiple: [S2][S4]) right after the claim.
- Only cite source ids that exist in the provided list. Never invent sources.
- If the evidence is thin or conflicting, say so explicitly rather than papering over it.
- If some claims come from your own general knowledge because no source covers them, mark them "(no source)" — sparingly.
- Do not add your own source list at the end; the app renders one.
- Keep it under ~600 words unless the evidence demands more.`

export function writerUser(question, sources) {
  const sourceBlock = sources.length
    ? sources
        .map((s) => `[${s.id}] (${s.type}) ${s.title} — ${s.source}\n${s.content}`)
        .join('\n\n')
    : '(no sources were gathered)'
  return `Research question: ${question}

Evidence sources:
${sourceBlock}

Write the cited report now.`
}

// ---- Judge (§11): LLM-as-judge for the eval harness ----

export const JUDGE_SYSTEM = `You are a strict evaluator of research reports. You check two things:
1. Fact coverage: for each expected fact, is it present in the report (same meaning counts; wording may differ)?
2. Faithfulness: is every factual claim in the report supported by the provided sources? List claims that are not (ignore claims explicitly marked "(no source)" and obvious common knowledge).
Be strict: when in doubt, mark a fact as missing and a claim as unsupported.`

export const JUDGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    facts: {
      type: 'ARRAY',
      description: 'One entry per expected fact, in the given order',
      items: {
        type: 'OBJECT',
        properties: {
          fact: { type: 'STRING' },
          present: { type: 'BOOLEAN' },
        },
        required: ['fact', 'present'],
      },
    },
    unsupportedClaims: {
      type: 'ARRAY',
      description: 'Factual claims in the report not backed by any provided source',
      items: { type: 'STRING' },
    },
    faithfulness: {
      type: 'NUMBER',
      description: 'Fraction (0 to 1) of the report’s factual claims that are supported by the sources',
    },
    comment: { type: 'STRING', description: 'One-sentence overall assessment' },
  },
  required: ['facts', 'unsupportedClaims', 'faithfulness'],
}

export function judgeUser({ question, expectedFacts, report, sources }) {
  const sourceBlock = sources.length
    ? sources.map((s) => `[${s.id}] ${s.title} — ${s.source}\n${s.content}`).join('\n\n')
    : '(none)'
  return `Question: ${question}

Expected facts a correct answer must contain:
${expectedFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Report to evaluate:
---
${report}
---

Sources the report had access to:
${sourceBlock}`
}
