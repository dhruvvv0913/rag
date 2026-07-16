// lib/chunk.js — pure chunking logic (no imports, unit-tested).
//
// Why chunk at all: an embedding represents one idea well; a whole PDF
// embedded as a single vector averages everything and matches nothing.
// Why overlap: a fact that straddles a chunk boundary would otherwise be
// split across two chunks and retrievable from neither.
// Sizes are in characters (~4 chars per token, so 2000 chars ≈ 500 tokens).

export function chunkText(text, { maxChars = 2000, overlapChars = 200 } = {}) {
  if (overlapChars >= maxChars / 2) {
    throw new Error('overlapChars must be less than half of maxChars')
  }
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!clean) return []

  const chunks = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length)
    if (end < clean.length) {
      // Prefer to cut at a paragraph break, then a sentence end, then a line
      // break, then a space — a chunk that ends mid-word embeds (and reads)
      // worse. Only accept a cut in the back half so chunks stay full-sized.
      const slice = clean.slice(start, end)
      for (const sep of ['\n\n', '. ', '\n', ' ']) {
        const idx = slice.lastIndexOf(sep)
        if (idx > maxChars * 0.5) {
          end = start + idx + sep.length
          break
        }
      }
    }
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = end - overlapChars
  }
  return chunks.filter((c) => c.length > 0)
}
