-- Serendib Scholar — starter schema. Run this in the Supabase SQL editor.
-- The syllabus_chunks table isn't populated yet (that's handled separately);
-- search_syllabus falls back to a plain text match until embeddings exist.

create extension if not exists vector;

create table if not exists syllabus_chunks (
  id bigint generated always as identity primary key,
  subject text not null,
  topic text not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists syllabus_chunks_subject_topic_idx
  on syllabus_chunks (subject, topic);

-- Once syllabus_chunks.embedding is populated, switch search_syllabus (in
-- src/app/api/tools/search-syllabus/route.ts) to a similarity query, e.g.:
--
-- create or replace function match_syllabus_chunks(
--   query_embedding vector(768),
--   match_subject text,
--   match_count int default 3
-- ) returns setof syllabus_chunks
-- language sql stable as $$
--   select * from syllabus_chunks
--   where subject = match_subject
--   order by embedding <-> query_embedding
--   limit match_count;
-- $$;

create table if not exists child_progress (
  id bigint generated always as identity primary key,
  child_id text not null,
  topic text not null,
  correct boolean not null,
  "timestamp" timestamptz not null default now()
);

create index if not exists child_progress_child_id_idx on child_progress (child_id);

create table if not exists child_weaknesses (
  id bigint generated always as identity primary key,
  child_id text not null,
  topic text not null,
  flagged_at timestamptz not null default now()
);

create table if not exists teacher_review_flags (
  id bigint generated always as identity primary key,
  child_id text not null,
  reason text not null,
  flagged_at timestamptz not null default now(),
  resolved boolean not null default false
);
