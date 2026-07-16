import { useState } from 'react'
import Markdown from 'react-markdown'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

const TOOL_LABELS = {
  search_documents: 'Searching your documents',
  web_search: 'Searching the web',
  fetch_url: 'Reading page',
}

export default function App() {
  // --- document upload state ---
  const [file, setFile] = useState(null)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [uploading, setUploading] = useState(false)

  // --- research state ---
  const [question, setQuestion] = useState('')
  const [phase, setPhase] = useState('idle') // idle | planning | researching | writing | done
  const [plan, setPlan] = useState(null)
  const [activity, setActivity] = useState([])
  const [report, setReport] = useState('')
  const [sources, setSources] = useState([])
  const [error, setError] = useState(null)

  async function handleUpload() {
    if (!file || uploading) return
    setUploading(true)
    setUploadStatus(null)
    try {
      if (file.size > 3 * 1024 * 1024) {
        throw new Error('File too large (max ~3 MB for this demo)')
      }
      const contentBase64 = await fileToBase64(file)
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentBase64 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setUploadStatus({ ok: true, text: `Indexed "${data.title}" — ${data.chunks} chunks` })
    } catch (err) {
      setUploadStatus({ ok: false, text: err.message })
    } finally {
      setUploading(false)
    }
  }

  async function handleResearch(e) {
    e.preventDefault()
    if (!question.trim() || (phase !== 'idle' && phase !== 'done')) return
    setError(null)
    setPlan(null)
    setActivity([])
    setReport('')
    setSources([])
    setPhase('planning')

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      // The response is NDJSON: one JSON event per line, streamed.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (line) handleEvent(JSON.parse(line))
        }
      }
      setPhase('done')
    } catch (err) {
      setError(err.message ?? String(err))
      setPhase('idle')
    }
  }

  function handleEvent(ev) {
    if (ev.type === 'plan') {
      setPlan(ev.subQuestions)
      setPhase('researching')
    } else if (ev.type === 'tool') {
      const arg = ev.args?.query ?? ev.args?.url ?? ''
      setActivity((a) => [...a, `${TOOL_LABELS[ev.name] ?? ev.name}: “${arg}”`])
    } else if (ev.type === 'report') {
      setPhase('writing')
      setReport((r) => r + ev.delta)
    } else if (ev.type === 'sources') {
      setSources(ev.sources)
    } else if (ev.type === 'error') {
      setError(ev.message)
    }
  }

  const busy = phase !== 'idle' && phase !== 'done'

  return (
    <main className="app">
      <h1>AI Research Agent</h1>
      <p className="tagline">
        Ask a research question. The agent plans, searches your documents and the web, and writes a
        cited report.
      </p>

      <section className="card">
        <h2>Your documents (optional)</h2>
        <p className="hint">Upload a PDF, .md or .txt — the agent will search it for answers.</p>
        <div className="upload-row">
          <input
            type="file"
            accept=".pdf,.txt,.md"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? 'Indexing…' : 'Upload'}
          </button>
        </div>
        {uploadStatus && (
          <p className={uploadStatus.ok ? 'status-ok' : 'error'}>{uploadStatus.text}</p>
        )}
      </section>

      <form className="query-row" onSubmit={handleResearch}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What are the tradeoffs of RAG vs fine-tuning?"
        />
        <button type="submit" disabled={busy}>
          {phase === 'planning'
            ? 'Planning…'
            : phase === 'researching'
              ? 'Researching…'
              : phase === 'writing'
                ? 'Writing…'
                : 'Research'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {plan && (
        <section className="card">
          <h2>Research plan</h2>
          <ol className="plan">
            {plan.map((sq) => (
              <li key={sq}>{sq}</li>
            ))}
          </ol>
          {activity.length > 0 && (
            <ul className="activity">
              {activity.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
              {phase === 'researching' && <li className="pulse">…</li>}
            </ul>
          )}
        </section>
      )}

      {report && (
        <section className="card report">
          <h2>Report</h2>
          <Markdown>{report}</Markdown>
          {sources.length > 0 && (
            <>
              <h3>Sources</h3>
              <ul className="sources">
                {sources.map((s) => (
                  <li key={s.id}>
                    <strong>[{s.id}]</strong>{' '}
                    {s.type === 'web' ? (
                      <a href={s.source} target="_blank" rel="noreferrer">
                        {s.title || s.source}
                      </a>
                    ) : (
                      <span>
                        {s.title} <em>(your document)</em>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {phase === 'idle' && !error && !report && (
        <section className="results">
          <p className="placeholder">Results will appear here.</p>
        </section>
      )}
    </main>
  )
}
