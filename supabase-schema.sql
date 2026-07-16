-- supabase-schema.sql — run this once in the Supabase SQL Editor (§8).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE everywhere.

-- pgvector: adds the `vector` column type and distance operators to Postgres.
create extension if not exists vector;

-- Documents the user uploaded.
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text,
  source text,               -- filename or URL (shown in citations)
  created_at timestamptz default now()
);

-- Chunks with embeddings. Dimension 768 must match EMBEDDING_DIM in lib/llm.js.
create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  content text not null,
  embedding vector(768),
  chunk_index int
);

-- Approximate-nearest-neighbour index. HNSW, not ivfflat: ivfflat computes
-- its cluster centers when the index is CREATED, so building it on an empty
-- table (like this script does) leaves garbage centers and queries silently
-- return partial results. HNSW builds incrementally and has no such trap.
drop index if exists chunks_embedding_idx;
create index if not exists chunks_embedding_hnsw_idx
  on chunks using hnsw (embedding vector_cosine_ops);

-- Evaluation test set (§11).
create table if not exists eval_cases (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  expected_facts text[],     -- key facts a correct answer must contain
  notes text,
  created_at timestamptz default now()
);

-- Retrieval as a SQL function, called from the API via supabase.rpc().
-- `<=>` is pgvector's cosine DISTANCE (0 = identical, 2 = opposite), so
-- similarity = 1 - distance, and ORDER BY distance ASC = most similar first.
create or replace function match_chunks(
  query_embedding vector(768),
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  source text,
  title text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    d.source,
    d.title,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
