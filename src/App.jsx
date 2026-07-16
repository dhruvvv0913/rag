import { useState } from 'react'

export default function App() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleResearch(e) {
    e.preventDefault()
    if (!question.trim() || loading) return
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setResult(data)
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <h1>AI Research Agent</h1>
      <p className="tagline">Ask a research question. The agent will plan, retrieve, and write a cited report.</p>

      <form className="query-row" onSubmit={handleResearch}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What are the tradeoffs of RAG vs fine-tuning?"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Thinking…' : 'Research'}
        </button>
      </form>

      <section className="results">
        {error && <p className="error">{error}</p>}
        {result?.subQuestions && (
          <>
            <h2>Research plan</h2>
            <ol className="plan">
              {result.subQuestions.map((sq) => (
                <li key={sq}>{sq}</li>
              ))}
            </ol>
          </>
        )}
        {!error && !result && <p className="placeholder">Results will appear here.</p>}
      </section>
    </main>
  )
}
