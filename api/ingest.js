// POST /api/ingest { filename, contentBase64 } -> { documentId, title, chunks }
// The RAG write path (§9): extract text -> chunk -> embed -> store in pgvector.
// The file arrives base64-encoded in JSON (simple + works within Vercel's
// ~4.5MB body limit; fine for a learning project, not for production uploads).
import { ingestText } from '../lib/ingest.js'
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
    const result = await ingestText(filename, text)
    res.status(200).json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
