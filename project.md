# AI Research Agent — Project Brief

> **Paste-and-go:** This file is the single source of truth for the project. If you're an AI assistant reading this for the first time, read it top to bottom before writing any code, then start at **§14 First Session**. This is a fresh, empty repo — you (the assistant) will scaffold everything from scratch.

## 1. How to collaborate with me (READ FIRST)

I'm a **3rd-year B.Tech CS student (AI specialization)** building this to **learn**, not just to ship. I have ~**5–8 hours/week**. I already know React, Node/Express, MongoDB, Supabase basics, and have called the Gemini API before. I have **not** built agents, RAG, or evaluation systems — that's the whole point of this project.

So, when we work together:
- **Teach as you build.** Before writing a new concept (embeddings, vector search, an agent loop, LLM-as-judge), explain in 3–5 sentences *what it is and why we're using it here*. I want to be able to defend every part of this in an interview.
- **Small, reviewable steps.** One concept per step. Don't scaffold the whole app at once. After each step, tell me what to run and what I should see.
- **Explain the "why" behind choices**, not just the "what."
- **Don't over-engineer.** Simplest thing that works and teaches the concept. No premature abstractions.
- **When I'm about to do something the wrong way, tell me** — I'd rather learn the right pattern.
- Prefer readable, conventional code over clever code.

## 2. What we're building

**An AI Research Agent.** The user gives it a research question (and optionally uploads their own PDFs/notes). The agent:
1. **Plans** the question into sub-questions.
2. **Retrieves** relevant information — from the user's uploaded documents (via RAG) *and* from the web.
3. **Reasons** across the gathered sources.
4. **Writes a structured, cited report** answering the question.

There is also an **evaluation harness** that scores how factual and well-grounded the agent's answers are on a fixed test set — this is a first-class part of the project, not an afterthought.

**One-line pitch for the resume:** *"An agentic RAG system that plans research, retrieves from user documents and the web, and produces cited reports — with an automated evaluation harness measuring retrieval accuracy and answer faithfulness."*

## 3. Why this project (so you optimize for the right thing)

It's chosen to make me touch **the entire modern AI-engineering stack** in one coherent build: prompting → structured output → embeddings → vector search → retrieval → **agentic tool use** → **evaluation** → deployment. Optimize every decision for *learning value and interview defensibility*, not for maximum features or production hardening.

## 4. Non-goals / scope guardrails

- **Not** a multi-user SaaS. Auth is optional and comes last. No billing, no teams, no roles.
- **Not** aiming for real users or scale. Correctness and clarity over performance.
- **No** fine-tuning or training models (that's a possible *future* project).
- Keep infra minimal: one frontend, a few serverless functions, one Postgres DB.
- Don't add features not in §2 without asking me.

## 5. Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + Vite** | I know it; fast iteration. |
| Backend | **Node.js serverless functions** (Vercel `/api`) | I know this pattern; keeps API keys server-side. |
| Database + vectors | **Supabase (Postgres + `pgvector`)** | I know Supabase; `pgvector` lets me learn real vector search in SQL instead of a black-box vector DB. |
| Embeddings | See §6 | — |
| LLM | See §6 (provider adapter) | — |
| Web search tool | Start with a free/simple search API (e.g. Tavily free tier, or Brave Search API) — pick in Phase 3 | Teaches tool integration. |
| Deploy | **Vercel** | I know it; free tier. |

Keep pure logic (chunking, retrieval math, eval scoring) in plain, testable Node modules with **no** framework imports, so I can unit-test them and understand them in isolation.

## 6. LLM provider strategy (important)

**All LLM and embedding calls go through a thin adapter module (`/lib/llm.js`) — never call a provider SDK directly from feature code.** This teaches provider abstraction (a real skill) and lets me swap providers in one file.

The adapter exposes exactly:
```
llm.complete({ system, messages, tools?, responseSchema? })  // one chat/agent turn
llm.embed(texts[]) -> vectors[]                               // batch embeddings
```

**Default provider: Google Gemini (free tier).** I already have a `GEMINI_API_KEY`, it's free, and it works on my locked-down campus network. Use `gemini-2.5-flash` for chat and Gemini's embedding model. This keeps the whole project at **zero cost** while I learn.

**Recommended upgrade (optional, my choice): Anthropic Claude** for the agent phases (§10), because Claude's tool-use is best-in-class and the best thing to learn agents on. Because everything is behind the adapter, this is a **one-line swap** and I only pay if I opt in. Accurate details if/when I switch:
- Chat/agent model: **`claude-opus-4-8`** (most capable) — $5 / $25 per 1M input/output tokens. For cheaper iteration: **`claude-haiku-4-5`** — $1 / $5 per 1M, 200K context.
- Use **adaptive thinking** (`thinking: {type: "adaptive"}`) for the planning/reasoning steps; do **not** use a fixed `budget_tokens` (removed on current models).
- Claude has **no free embeddings** — keep embeddings on Gemini (or a local model) even if chat moves to Claude. The adapter makes this mix trivial.

Whichever provider: **the API key lives only in the serverless function's environment**, never in frontend code.

## 7. Architecture

```
┌─────────────┐     ┌──────────────────── Vercel serverless (/api) ────────────────────┐
│ React (Vite)│────▶│  /api/ingest   → chunk + embed uploaded docs → store in pgvector  │
│  browser UI │     │  /api/research → THE AGENT LOOP (plan→retrieve→reason→write)       │
│             │◀────│  /api/eval     → run the evaluation harness over the test set      │
└─────────────┘     └──────────┬───────────────────────────┬────────────────────────────┘
                               │                            │
                        ┌──────▼──────┐            ┌────────▼────────┐
                        │  Supabase   │            │  LLM adapter    │
                        │  Postgres + │            │  (Gemini/Claude)│
                        │  pgvector   │            │  + web search   │
                        └─────────────┘            └─────────────────┘
```

The **agent loop** lives server-side in `/api/research`. Its tools (`search_documents`, `web_search`, `fetch_url`) are plain functions the loop can call; the LLM decides which to call and when.

## 8. Data model (Supabase)

Enable `pgvector`, then:
```sql
-- documents the user uploaded
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text,
  source text,               -- filename or URL
  created_at timestamptz default now()
);

-- chunks with embeddings (dimension depends on the embedding model)
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  content text not null,
  embedding vector(768),     -- set to the embedding model's dimension
  chunk_index int
);
create index on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- evaluation test set (see §11)
create table eval_cases (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  expected_facts text[],     -- key facts a correct answer must contain
  notes text
);
```
Retrieval is a SQL function using cosine distance (`<=>`) — we'll write it together in Phase 2 so I learn how vector search actually works.

## 9. RAG design (Phase 2)

- **Ingestion** (`/api/ingest`): extract text from an uploaded PDF (use `pdf-parse` or similar) → **chunk** it (start simple: ~500-token chunks with ~50-token overlap; we'll discuss why overlap matters) → **embed** each chunk via `llm.embed` → insert into `chunks`.
- **Retrieval**: embed the query → cosine-similarity search in `pgvector` → return top-k chunks with their `source` for citations.
- **Concepts to teach me along the way:** what an embedding is, why we chunk, what "top-k" and cosine similarity mean, why we store `source` (for citations), and the tradeoffs of chunk size.

## 10. Agent design (Phases 3–4)

The agent is a **tool-calling loop** in `/api/research`:
1. **Plan:** ask the LLM to break the question into 3–5 sub-questions (structured JSON output).
2. **Act loop:** give the LLM these tools and let it call them until it has enough:
   - `search_documents(query)` → RAG over uploaded docs (§9)
   - `web_search(query)` → external search API
   - `fetch_url(url)` → pull a page's text
3. **Synthesize:** the LLM writes a structured report with inline citations mapping each claim to a source.

Teach me: what "tool/function calling" is, why the loop needs a stop condition (and how to cap iterations so it can't run forever), and how to keep the growing context manageable.

Prompts live in a dedicated `/lib/prompts.js` so they're easy to iterate on.

## 11. Evaluation design (Phase 6 — the differentiator)

Build `/api/eval` + a small script that:
- Loads the `eval_cases` test set (10–20 questions with `expected_facts`).
- Runs the agent on each question.
- Scores two things:
  1. **Retrieval quality** — did the retrieved chunks actually contain the needed facts? (hit-rate / recall@k)
  2. **Answer faithfulness** — is every claim in the report grounded in a retrieved source, and does the answer contain the `expected_facts`? Use **LLM-as-judge**: a second LLM call that scores the answer against the expected facts and flags unsupported claims.
- Prints a report (per-case + aggregate scores) so I can see improvement when I change chunking or prompts.

Teach me: why evaluation matters, what "LLM-as-judge" is and its limitations, and how to read the metrics to actually improve the system.

## 12. Repo structure (target)

```
/api
  ingest.js        # PDF → chunks → embeddings → DB
  research.js      # the agent loop
  eval.js          # run the eval harness
/lib
  llm.js           # provider adapter (Gemini default, Claude optional)
  chunk.js         # pure chunking logic (unit-tested)
  retrieve.js      # embed query + pgvector search
  tools.js         # search_documents / web_search / fetch_url
  prompts.js       # all prompts in one place
  eval-score.js    # pure scoring logic (unit-tested)
/src               # React + Vite frontend
  App.jsx, components...
/scripts
  seed-eval.js     # load the eval test set
  run-eval.js      # CLI to run + print eval results
/tests             # unit tests for pure modules
supabase-schema.sql
.env.example
project.md         # this file
```

## 13. Environment variables (`.env.example`)

```
# LLM (default provider)
GEMINI_API_KEY=
LLM_PROVIDER=gemini          # gemini | anthropic
# Optional upgrade
ANTHROPIC_API_KEY=

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-only, never in frontend

# Web search tool (chosen in Phase 3)
SEARCH_API_KEY=
```
Keys are used **only** inside `/api` functions. `.env` is gitignored.

## 14. First Session (Phase 0 — do this first)

Do these in order, teaching me at each step, and stop for me to run/confirm after each:
1. Confirm my Node version and that `npm create vite@latest` works. Scaffold a minimal React + Vite app with one page: a text box + "Research" button + an empty results area. Nothing wired yet.
2. Add a `/api/ping.js` serverless function returning `{ ok: true }`; wire the button to call it and show the response. (Teaches the frontend↔serverless round-trip we'll build everything on.)
3. Create `/lib/llm.js` with the adapter interface from §6, implement the **Gemini** path only, and add a `/api/echo.js` that sends my text to the LLM and returns the reply. Show me a working end-to-end LLM call.
4. Commit. Then we move to Phase 1.

Don't jump ahead to RAG or the agent yet — get this loop solid first.

## 15. Roadmap (≈7 weeks at 5–8 hrs/week)

Each phase ends with something runnable and a git commit. Each becomes a resume bullet.
- **Phase 0 — Foundation (Wk 1):** §14. Learn: serverless round-trip, the LLM adapter.
- **Phase 1 — LLM core (Wk 1):** structured JSON output + streaming a response to the UI. Learn: prompt engineering, structured outputs.
- **Phase 2 — RAG (Wk 2–3):** ingestion + `pgvector` retrieval with citations (§9). Learn: embeddings, chunking, vector search.
- **Phase 3 — Tools + agent loop (Wk 4):** `search_documents` + `web_search` + `fetch_url`, wired into a tool-calling loop (§10). Learn: agentic AI, tool use.
- **Phase 4 — Planning + synthesis (Wk 5):** plan→act→write producing a cited report. Learn: multi-step reasoning, citation grounding.
- **Phase 5 — Evaluation (Wk 6):** the eval harness (§11). Learn: LLM evaluation.
- **Phase 6 — Ship (Wk 7):** polish UI, deploy to Vercel, write a strong README + short demo. Learn: shipping a real system.

## 16. Definition of done ("impressive" bar)

- Deployed, working demo I can link on my resume.
- A README that explains the architecture and shows an eval-score before/after (e.g. "improved retrieval recall@5 from 0.62 → 0.81 by tuning chunking").
- I can whiteboard the whole pipeline and explain every design choice in an interview.

## 17. Glossary (fill in as we go)

Embedding · Chunking · Vector / cosine similarity · top-k retrieval · RAG · Tool/function calling · Agent loop · LLM-as-judge · Faithfulness · recall@k. *(Keep short definitions here as we cover each — my study notes.)*
