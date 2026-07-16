// lib/retrieve.js — the "R" in RAG: embed the query, cosine-search pgvector,
// return the top-k chunks with their sources (needed for citations).
import { embed } from './llm.js'
import { supabase } from './db.js'

export async function searchDocuments(query, k = 5) {
  // Queries and documents are embedded with different task types — Gemini
  // tunes the vector for "find me documents" vs "be findable".
  const [queryEmbedding] = await embed([query], { taskType: 'RETRIEVAL_QUERY' })

  const { data, error } = await supabase().rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_count: k,
  })
  if (error) throw new Error(`pgvector search failed: ${error.message}`)
  return data // [{ id, document_id, content, chunk_index, source, title, similarity }]
}
