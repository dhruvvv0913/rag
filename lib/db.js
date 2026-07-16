// lib/db.js — the Supabase client (server-side only).
// Uses the service role key, which bypasses row-level security — it must only
// ever be read inside /api functions or scripts, never shipped to the browser.
import { createClient } from '@supabase/supabase-js'

let client

export function supabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set (add them to .env)')
    }
    client = createClient(url, key, { auth: { persistSession: false } })
  }
  return client
}
