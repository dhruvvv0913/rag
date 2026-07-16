// POST /api/ingest { filename, contentBase64 } -> { documentId, title, chunks }
// The RAG write path (§9): extract text -> chunk -> embed -> store in pgvector.
// The file arrives base64-encoded in JSON (simple + works within Vercel's
// ~4.5MB body limit; fine for a learning project, not for production uploads).
import { chunkText } from '../lib/chunk.js'
import { embed } from '../lib/llm.js'
import { supabase } from '../lib/db.js'
import { extractText, getDocumentProxy } from 'unpdf'

async function extractFromFile(filename, buf) {
  if (/\.pdf$/i.test(filename)) {
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  }
  // .txt / .md and anything else that is plain text
  return buf.toString('utf8')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }
  const { filename, contentBase64 } = req.body ?? {}
  if (!filename || !contentBase64) {
    return res.status(400).json({ error: 'Body must be JSON with "filename" and "contentBase64"' })
  }

  try {
    const buf = Buffer.from(contentBase64, 'base64')
    const text = await extractFromFile(filename, buf)
    if (!text?.trim()) {
      return res.status(400).json({ error: 'No text could be extracted from this file' })
    }

    const chunks = chunkText(text)
    const vectors = await embed(chunks, { taskType: 'RETRIEVAL_DOCUMENT' })

    const db = supabase()
    // Re-uploading the same filename replaces it (chunks cascade-delete).
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

    res.status(200).json({ documentId: doc.id, title: filename, chunks: chunks.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
