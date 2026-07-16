// scripts/seed-docs.js — ingest the eval fixture documents into Supabase.
// Run with: npm run seed   (or: node --env-file=.env scripts/seed-docs.js)
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { ingestText } from '../lib/ingest.js'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

const files = (await readdir(fixturesDir)).filter((f) => f.endsWith('.md'))
for (const file of files) {
  const text = await readFile(path.join(fixturesDir, file), 'utf8')
  const result = await ingestText(file, text)
  console.log(`ingested ${file}: ${result.chunks} chunks`)
}
console.log('done.')
