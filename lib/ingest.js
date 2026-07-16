// lib/ingest.js — shared ingestion core: text -> chunks -> embeddings -> DB.
// Used by /api/ingest (uploads) and scripts/seed-docs.js (eval fixtures).
import { chunkText } from './chunk.js'
import { embed } from './llm.js'
import { supabase } from './db.js'

export async function ingestText(filename, text) {
  if (!text?.trim()) throw new Error('No text to ingest')

  const chunks = chunkText(text)
  const vectors = await embed(chunks, { taskType: 'RETRIEVAL_DOCUMENT' })

  const db = supabase()
  // Re-ingesting the same source replaces it (chunks cascade-delete).
  await db.from('documents').delete().eq('source', filename)
  const { data: doc, error: docErr } = await db
    .from('documents')
    .insert({ title: filename, source: filename })
    .select('id')
    .single()
  if (docErr) throw new Error(`insert document failed: ${docErr.message}`)

  const rows = chunks.map((content, i) => ({
    document_id: doc.id,
    content,
    embedding: vectors[i],
    chunk_index: i,
  }))
  const { error: chunkErr } = await db.from('chunks').insert(rows)
  if (chunkErr) throw new Error(`insert chunks failed: ${chunkErr.message}`)

  return { documentId: doc.id, title: filename, chunks: chunks.length }
}
