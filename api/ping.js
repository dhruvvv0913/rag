// GET /api/ping -> { ok: true, time: ... }
// Runs server-side on Vercel's Node runtime, never in the browser.
export default function handler(req, res) {
  res.status(200).json({ ok: true, time: new Date().toISOString() })
}
