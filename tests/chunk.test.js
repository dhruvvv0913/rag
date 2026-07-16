import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkText } from '../lib/chunk.js'

test('empty or whitespace input produces no chunks', () => {
  assert.deepEqual(chunkText(''), [])
  assert.deepEqual(chunkText('   \n\n  '), [])
})

test('short text fits in a single chunk', () => {
  const text = 'A short paragraph about embeddings.'
  assert.deepEqual(chunkText(text), [text])
})

test('long text splits into chunks no larger than maxChars', () => {
  const text = Array.from({ length: 500 }, (_, i) => `word${String(i).padStart(4, '0')}`).join(' ')
  const chunks = chunkText(text, { maxChars: 400, overlapChars: 50 })
  assert.ok(chunks.length > 1, 'expected multiple chunks')
  for (const c of chunks) {
    assert.ok(c.length <= 400, `chunk exceeds maxChars: ${c.length}`)
  }
})

test('consecutive chunks overlap', () => {
  const text = Array.from({ length: 500 }, (_, i) => `word${String(i).padStart(4, '0')}`).join(' ')
  const chunks = chunkText(text, { maxChars: 400, overlapChars: 50 })
  for (let i = 0; i + 1 < chunks.length; i++) {
    const nextHead = chunks[i + 1].slice(0, 8)
    const prevTail = chunks[i].slice(-70)
    assert.ok(
      prevTail.includes(nextHead),
      `chunk ${i + 1} should start inside the tail of chunk ${i}`
    )
  }
})

test('no content is lost between chunks', () => {
  const words = Array.from({ length: 500 }, (_, i) => `word${String(i).padStart(4, '0')}`)
  const chunks = chunkText(words.join(' '), { maxChars: 400, overlapChars: 50 })
  const joined = chunks.join(' ')
  for (const w of words) {
    assert.ok(joined.includes(w), `lost word: ${w}`)
  }
})

test('prefers paragraph boundaries when available', () => {
  const para = 'Sentence one of the paragraph. Sentence two of the paragraph.'
  const text = Array.from({ length: 20 }, () => para).join('\n\n')
  const chunks = chunkText(text, { maxChars: 300, overlapChars: 40 })
  // With paragraph breaks available, most chunks should end at a sentence end.
  const clean = chunks.filter((c) => c.endsWith('.'))
  assert.ok(clean.length >= chunks.length - 1, 'chunks should cut at boundaries')
})
