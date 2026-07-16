// lib/eval-score.js — pure scoring logic (no imports, unit-tested).
//
// Retrieval is scored mechanically: expected facts are short verbatim phrases
// from the seed documents, so a normalized substring check is reliable.
// Answer quality is NOT scored here — reports paraphrase, so that needs the
// LLM-as-judge (see lib/evaluate.js).

export function normalize(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function containsFact(text, fact) {
  return normalize(text).includes(normalize(fact))
}

// Fraction of expected facts present in the given text (0..1).
export function factCoverage(text, expectedFacts) {
  if (!expectedFacts?.length) return 1
  return expectedFacts.filter((f) => containsFact(text, f)).length / expectedFacts.length
}

// recall@k: fraction of expected facts found in ANY of the retrieved chunks.
// "Did retrieval bring back the information needed to answer?"
export function retrievalRecall(chunkTexts, expectedFacts) {
  return factCoverage(chunkTexts.join('\n'), expectedFacts)
}

export function average(numbers) {
  if (!numbers.length) return 0
  return numbers.reduce((s, n) => s + n, 0) / numbers.length
}
