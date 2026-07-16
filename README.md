# AI Research Agent

An agentic RAG system that plans research, retrieves from user documents and the web,
and produces cited reports — with an automated evaluation harness measuring retrieval
accuracy and answer faithfulness.

Give it a research question (optionally upload your own PDFs/notes first). The agent:

1. **Plans** — breaks the question into 3–5 focused sub-questions (structured JSON output).
2. **Acts** — a tool-calling loop where the LLM decides when to search your documents
   (pgvector similarity search), search the web, or fetch a page.
3. **Writes** — a Markdown report where every claim carries an inline citation (`[S3]`)
   mapping to a real retrieved source, streamed to the UI as it is written.

## Architecture

```
┌─────────────┐     ┌──────────────────── Vercel serverless (/api) ────────────────────┐
│ React (Vite)│────▶│  /api/ingest    chunk + embed uploaded docs → store in pgvector  │
│  browser UI │     │  /api/research  the agent loop (plan → retrieve → reason → write)│
│             │◀────│  /api/eval      run the evaluation harness over the test set     │
└─────────────┘     └──────────┬───────────────────────────┬──────────────────────────┘
                               │                           │
                        ┌──────▼──────┐           ┌────────▼────────┐
                        │  Supabase   │           │  LLM adapter    │
                        │  Postgres + │           │  (Gemini, swap- │
                        │  pgvector   │           │  able) + Tavily │
                        └─────────────┘           └─────────────────┘
```

Design decisions worth knowing:

- **Provider adapter** ([lib/llm.js](lib/llm.js)): every LLM/embedding call goes through
  one neutral interface — `complete()`, `stream()`, `embed()`. Feature code never touches
  a provider SDK, so swapping Gemini for Claude is a one-file change. Provider quirks
  (role names, schema dialects, Gemini 3.x thought signatures) stay quarantined here.
- **Pure logic stays pure**: chunking ([lib/chunk.js](lib/chunk.js)) and eval scoring
  ([lib/eval-score.js](lib/eval-score.js)) have zero imports and are unit-tested
  (`npm test`).
- **The agent is a capped tool loop** ([lib/agent.js](lib/agent.js)): the model calls
  tools until it decides it has enough evidence, with a hard `MAX_STEPS` stop. Tool
  errors are returned to the model as text so it can adapt (e.g. fall back to web
  search when no documents are indexed).
- **Citations are grounded mechanically**: every tool result is registered in a source
  ledger with an id (`[S1]`, `[S2]`…) before the writer ever sees it; the writer may
  only cite ids from that ledger.

## Evaluation (the interesting part)

`npm run eval` runs every question in the `eval_cases` table through the full agent and
scores, per case and aggregate:

| Metric | How | What it tells you |
|---|---|---|
| **recall@5** | mechanical substring check of expected facts against the top-5 retrieved chunks | is retrieval finding the right chunks? |
| **fact coverage** | LLM-as-judge compares the report against expected facts (paraphrase allowed) | did the answer actually contain the facts? |
| **faithfulness** | LLM-as-judge flags claims not grounded in any retrieved source | is the report hallucinating? |

The test set uses **fictional case-study documents** ([scripts/fixtures/](scripts/fixtures/))
so the expected facts cannot come from the model's training data or the web — if the
agent answers correctly, retrieval worked, by construction.

Baseline results: _run `npm run eval` after seeding; numbers land in `eval-results/`._

## Stack

React + Vite · Vercel serverless functions · Supabase (Postgres + pgvector) ·
Gemini (`gemini-3.1-flash-lite` chat, `gemini-embedding-001` @ 768 dims) · Tavily search

## Run it yourself

```bash
npm install
cp .env.example .env        # fill in the values (see below)
```

1. **Gemini**: get a free API key at aistudio.google.com → `GEMINI_API_KEY`.
2. **Supabase**: create a free project, open the SQL Editor, run
   [supabase-schema.sql](supabase-schema.sql), then copy Settings → API →
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. **Tavily** (optional, enables web search): free key at tavily.com → `SEARCH_API_KEY`.

```bash
npx vercel dev              # runs frontend + /api functions on :3000
npm test                    # unit tests (chunking, scoring)
npm run seed                # ingest fixture docs + load the eval test set
npm run eval                # run the full eval harness, print the report
```

Note: `vercel dev` reads env vars from `.env` (not `.env.local`).

## Repo map

```
/api      serverless endpoints: ingest, research (NDJSON stream), eval, echo, ping, plan
/lib      llm.js (adapter) · agent.js (loop) · tools.js · retrieve.js · ingest.js
          chunk.js + eval-score.js (pure, tested) · prompts.js · evaluate.js · db.js
/scripts  seed-docs.js · seed-eval.js · run-eval.js · fixtures/
/src      React UI
/tests    unit tests (node --test)
```

## Honest limitations

Single-user learning project by design: no auth, no rate limiting on my endpoints,
`fetch_url` is not SSRF-hardened, and uploads are capped ~3 MB by the base64-in-JSON
transport. The eval judge is itself an LLM and can misjudge — which is exactly why the
mechanical recall@5 metric sits next to it.
