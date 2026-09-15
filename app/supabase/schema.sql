-- Serendib Scholar — starter schema. Run this in the Supabase SQL editor
-- (or let scripts/ingest-syllabus.ts's prerequisites doc point you here —
-- the script itself only reads/writes rows, it doesn't run DDL).

create extension if not exists vector;
create extension if not exists pgcrypto;

-- If you ran an earlier version of this schema, syllabus_chunks already
-- exists with an incompatible shape (bigint id, no grade/medium/
-- source_reference columns) — it was always documented as an unpopulated
-- placeholder, so this drop should be safe. If you've since ingested real
-- data you care about, back it up before running this file.
drop table if exists syllabus_chunks;

-- syllabus_chunks: populated by scripts/ingest-syllabus.ts. Each row is one
-- retrievable excerpt of syllabus content, embedded with Gemini's
-- gemini-embedding-001 (truncated to 768 dimensions) for semantic search
-- via search_syllabus (src/app/api/tools/search-syllabus/route.ts).
create table if not exists syllabus_chunks (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  grade int not null,
  topic text not null,
  medium text not null check (medium in ('sinhala', 'tamil', 'english')),
  content text not null,
  source_reference text not null,
  -- Null for a worksheet-only chunk (see scripts/ingest-syllabus.ts —
  -- isWorksheetOnlyChunk): there's no real prose to embed, but the row is
  -- still kept (with page_number/image_url) so the page stays findable via
  -- show_page_image. match_syllabus_chunks excludes these from semantic
  -- search results.
  embedding vector(768),
  -- The page this chunk's content was extracted/transcribed from (always
  -- known — see the Chunk.pageNumber threading through
  -- scripts/ingest-syllabus.ts). Used with source_reference by
  -- show_page_image (src/app/api/tools/show-page-image/route.ts) to look up
  -- image_url for a specific page within a merged multi-chunk passage.
  page_number int not null,
  -- The page number printed in the textbook's own footer (e.g. "66"), which
  -- differs from page_number (the raw PDF page index) once front matter —
  -- cover, foreword, contents — precedes the numbered pages. Parsed from
  -- the transcribed text near the recurring footer phrase (see
  -- extractPrintedPageNumber in scripts/ingest-syllabus.ts); null where it
  -- couldn't be confidently found (e.g. front-matter pages, or any english
  -- chunk — this is only ever parsed from sinhala/tamil vision output).
  -- Shown to the child (e.g. show_page_image's "Page 66") in place of the
  -- raw page_number when present; internal image lookups always use
  -- page_number, which is unaffected by this column.
  printed_page_number int,
  -- True when printed_page_number was NOT read from this row's own
  -- transcribed footer, but back-filled by scripts/infer-printed-page-numbers.ts
  -- from the file's dominant (page_number - printed_page_number) offset —
  -- a one-time post-processing pass run manually after ingestion, not part
  -- of ingest-syllabus.ts itself. Lets a real transcription miss be told
  -- apart from an inferred value later, in case something needs
  -- re-checking. Always false for a row whose printed_page_number came
  -- directly from extractPrintedPageNumber.
  printed_page_number_inferred boolean not null default false,
  -- Public URL of the real rasterized page image for page_number, stored in
  -- the "textbook-images" Storage bucket (see below). Populated for every
  -- sinhala/tamil chunk (every page is uploaded, not just ones with a
  -- diagram); always null for english chunks (no rasterization happens for
  -- those — see scripts/ingest-syllabus.ts file header comment).
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists syllabus_chunks_subject_idx
  on syllabus_chunks (subject);

create index if not exists syllabus_chunks_source_reference_idx
  on syllabus_chunks (source_reference);

-- HNSW over ivfflat: builds incrementally and doesn't need a representative
-- row count up front to tune list size, which suits a syllabus corpus that
-- starts small and grows via repeated ingestion runs. vector_cosine_ops
-- matches the cosine-distance query in match_syllabus_chunks below.
create index if not exists syllabus_chunks_embedding_idx
  on syllabus_chunks using hnsw (embedding vector_cosine_ops);

-- Similarity search RPC used by search-syllabus/route.ts via
-- supabaseAdmin.rpc('match_syllabus_chunks', { query_embedding, ... }).
-- Subject filtering is case-insensitive exact match; if the model's subject
-- string doesn't line up with what's stored, pass match_subject as null to
-- fall back to an unfiltered semantic search. Worksheet-only chunks (null
-- embedding — see syllabus_chunks.embedding comment above) are excluded:
-- there's nothing meaningful to match against, and they'd otherwise sort
-- arbitrarily since `<=>` against a null embedding is null.
create or replace function match_syllabus_chunks(
  query_embedding vector(768),
  match_subject text default null,
  match_count int default 5
)
returns table (
  id uuid,
  subject text,
  grade int,
  topic text,
  medium text,
  content text,
  source_reference text,
  page_number int,
  printed_page_number int,
  image_url text,
  similarity float
)
language sql stable
as $$
  select
    syllabus_chunks.id,
    syllabus_chunks.subject,
    syllabus_chunks.grade,
    syllabus_chunks.topic,
    syllabus_chunks.medium,
    syllabus_chunks.content,
    syllabus_chunks.source_reference,
    syllabus_chunks.page_number,
    syllabus_chunks.printed_page_number,
    syllabus_chunks.image_url,
    1 - (syllabus_chunks.embedding <=> query_embedding) as similarity
  from syllabus_chunks
  where syllabus_chunks.embedding is not null
    and (match_subject is null or lower(syllabus_chunks.subject) = lower(match_subject))
  order by syllabus_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- Distinct (subject, grade, medium) combinations currently ingested. Used
-- by src/lib/availableSubjects.ts, called once per session before the
-- ephemeral Gemini token is minted (src/app/api/gemini-session/route.ts) so
-- the system prompt only ever claims the subject coverage that actually
-- exists — never more. A plain `select distinct` computed in Postgres
-- rather than a PostgREST `.select()` deduped in JS, since the latter is
-- subject to PostgREST's default row cap and could silently miss subjects
-- once syllabus_chunks grows past it.
create or replace function available_syllabus_subjects()
returns table (
  subject text,
  grade int,
  medium text
)
language sql stable
as $$
  select distinct subject, grade, medium
  from syllabus_chunks
  order by subject, grade, medium;
$$;

-- Public bucket for the real, already-rasterized textbook page images saved
-- during vision transcription — every sinhala/tamil page, not just ones
-- with a diagram (see scripts/ingest-syllabus.ts and image_url above).
-- Public because these are non-sensitive textbook page scans referenced by
-- public image_url values — the service-role key ingestion uses bypasses
-- RLS for uploads regardless, and marking the bucket public is what makes
-- those URLs work for reads from the browser (via show_page_image) without
-- needing a signing step.
insert into storage.buckets (id, name, public)
values ('textbook-images', 'textbook-images', true)
on conflict (id) do nothing;

-- One row per child using the tutor. Created directly in Supabase by the
-- project owner; recorded here so this file stays the full schema. The
-- active child is resolved server-side from DEV_CHILD_ID for now (see
-- src/lib/activeChild.ts) until a real login/onboarding flow replaces it.
create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  grade int not null,
  medium text not null,
  parent_contact text,
  consent_given_at timestamptz
);

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

-- content_bank: verified teaching material the tutor SELECTS from, rather
-- than inventing a practice problem itself (see find_teaching_content,
-- src/app/api/tools/find-teaching-content/route.ts, and prompt.ts's rule
-- that every problem shown must come from this bank).
--
-- Populated by scripts/populate-content-bank.ts from sources we've already
-- extracted — the Lesson 1 textbook steps and the DP Education lesson
-- recording — so `source` always points at where a row actually came from.
-- Rows land with verified=false: a human checks them before the tutor is
-- allowed to teach from them (find_teaching_content only ever returns
-- verified rows).
create table if not exists content_bank (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  grade int not null,
  lesson int,
  -- Matches the conceptTag values in src/data/lessons/lesson1-numbers.ts,
  -- so bank material lines up with the lesson's own concepts.
  concept_tag text not null,
  difficulty text not null check (difficulty in ('intro', 'standard', 'challenge')),
  -- Which board component renders this, and the real props for it — same
  -- shapes as LessonComponent in src/data/lessons/lesson1-numbers.ts.
  component_type text not null,
  component_props jsonb not null,
  -- The verified correct answer(s), where they're known. Null where the
  -- source doesn't state one and it can't be derived deterministically
  -- (e.g. a Sinhala number name, or an open-ended "write any number" task).
  answer jsonb,
  -- For a component_type of 'explanation': how the teacher actually taught
  -- this concept, rather than a problem she set. Holds her teachingSequence,
  -- explanationDetail and realWorldExamplesUsed (the structural summary from
  -- the 15-minute extraction), plus transcriptExcerpt — her own verbatim
  -- Sinhala for that stretch, so the tutor can model her wording rather than
  -- improvise. Null on practice-problem rows.
  explanation jsonb,
  -- Provenance, e.g. 'textbook:maths_5_sinhala:step-3' or 'dp-video:01:23:40'.
  source text not null,
  verified boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists content_bank_subject_grade_concept_idx
  on content_bank (subject, grade, concept_tag);

create index if not exists content_bank_concept_tag_idx
  on content_bank (concept_tag);

-- The lesson orchestrator's cached beat lists (see src/lib/buildLessonScript.ts).
-- One row per lesson. `content_fingerprint` is a hash of the verified
-- content_bank row ids the script was built from, so verifying more rows (or
-- repopulating the bank) invalidates the cache automatically instead of
-- serving a lesson that ignores the new material.
create table if not exists lesson_scripts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  grade int not null,
  lesson int not null,
  -- The full LessonScript: concepts, each with its ordered beat list.
  script jsonb not null,
  content_fingerprint text not null,
  built_at timestamptz not null default now(),
  unique (subject, grade, lesson)
);

-- Every beat the orchestrator ran, for the simulator and the later parent
-- report (see src/lib/lessonOrchestrator.ts's BeatLogEntry). Append-only:
-- one row per beat, written as the beat ends.
create table if not exists session_log (
  id uuid primary key default gen_random_uuid(),
  -- Groups one sitting. Generated client-side when a session starts.
  session_id uuid not null,
  -- The child this sitting belongs to — resolved server-side (see
  -- src/lib/activeChild.ts), never client-supplied.
  child_id uuid not null references children (id),
  -- Position within the session, so a trace can be replayed in order even
  -- if two beats share a timestamp.
  sequence int not null,
  beat_id text not null,
  beat_type text not null,
  concept_tag text,
  mode int,
  -- What was on the board when the beat ran (the BoardContent, trimmed).
  board_state jsonb,
  -- The exact [DIRECTOR] line sent to the voice model.
  director_text text,
  -- Real playback duration of the model's speech for this beat, in ms.
  output_audio_ms int,
  child_transcript text,
  -- { understood, next, reason } from the planner, on ASK beats.
  planner_decision jsonb,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists session_log_session_idx on session_log (session_id, sequence);
create index if not exists session_log_child_idx on session_log (child_id, created_at desc);

-- What we know about each child outside the maths: interests gleaned from
-- chat (see /api/extract-interest), which opener topics were used recently
-- (so CHAT_OPENER never repeats the last three — stored newest-first as a
-- comma-separated list of opener ids), and free-form notes.
create table if not exists child_profile (
  child_id uuid primary key references children (id),
  interests jsonb not null default '[]'::jsonb,
  last_opener_topic text,
  notes text
);

-- Child address forms (පුතේ/දුවේ) resolve from this — collected by
-- onboarding later; 'unspecified' drops the address word entirely.
alter table children
  add column if not exists gender text not null default 'unspecified'
  check (gender in ('boy', 'girl', 'unspecified'));

-- Phone-test diagnostics: the debug overlay's "send diagnostics" button
-- posts its panel snapshot plus the last 30 session_log rows here.
create table if not exists debug_reports (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children (id),
  panel jsonb not null,
  recent_log jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lesson audio clips (STORAGE, not a table)
--
-- Since the audio split, every line the tutor speaks is pre-rendered in the
-- pinned voice and stored in the public Storage bucket `lesson-audio`:
--
--   <audio version>/<hash of resolved text + voice>.wav   the clip
--   <audio version>/<hash>.json                           duration + sentence spans
--
-- The bucket is created by the renderer itself (scripts/render-lesson-audio.ts
-- → ensureAudioBucket), so there is nothing to run here. It is public because
-- clips are lesson content, never child data. Bumping AUDIO_FORMAT_VERSION in
-- src/lib/audioCache.ts changes the prefix and so invalidates every clip.

-- ---------------------------------------------------------------------------
-- API rate limiting (see src/lib/rateLimit.ts and proxy.ts)
--
-- One row per bucket: a window start and a count. The server reads,
-- checks, and upserts; when the window has passed the row resets. Until
-- this table exists the limiters FAIL OPEN and log an error on every
-- check — run this to activate them.
create table if not exists api_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  count integer not null default 0
);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — deny-all for anon/authenticated on every table.
--
-- The app talks to Postgres exclusively through the SERVICE ROLE key from
-- server code (src/lib/supabaseAdmin.ts; the browser holds no Supabase
-- key at all), and service role bypasses RLS by design. Enabling RLS with
-- NO policies therefore changes nothing for the app and closes the door
-- on anyone who finds the project URL and tries the anon key: every
-- select/insert/update/delete is denied.
alter table children             enable row level security;
alter table child_profile        enable row level security;
alter table child_progress       enable row level security;
alter table child_weaknesses     enable row level security;
alter table content_bank         enable row level security;
alter table syllabus_chunks      enable row level security;
alter table lesson_scripts       enable row level security;
alter table session_log          enable row level security;
alter table teacher_review_flags enable row level security;
alter table api_rate_limits      enable row level security;
-- debug_reports may not exist yet (its DDL is earlier in this file):
alter table if exists debug_reports enable row level security;
-- Deliberately NO create policy statements: no policies = deny-all for
-- anon and authenticated. Service role is unaffected.

-- ---------------------------------------------------------------------------
-- THE VOICE ACTOR'S PORTAL (/portal)
--
-- The actor records from wherever she is, on a laptop or a phone, and none
-- of her work may live only in her browser. Two tables and one storage
-- prefix carry the whole session, so a dropped connection, a closed tab or
-- a switch from laptop to phone loses nothing and resumes exactly.
--
-- Why the database and not the repo: the portal used to write her wording
-- straight into src/data/lessons/authored/maths-5-1.json, which meant it
-- only worked where the filesystem was writable — it refused to run in
-- production. Her edits now live here and survive a deploy; the build reads
-- them when composing the script, and scripts/export-actor-lines.ts folds
-- them back into the authored JSON when a human accepts the wording.

-- Her words: one row per beat she has said something about. actor_text is
-- her re-wording ("say it your way"), note is her message to the author
-- ("this sentence is awkward"); either may be present without the other.
create table if not exists actor_lines (
  beat_id       text primary key,
  original_text text not null,
  actor_text    text,
  note          text,
  -- pending: recorded, not yet judged · accepted: her wording is canonical
  -- rejected: numbers or intent drifted (details in the portal)
  -- note_only:  she left a comment, did not re-word the line
  status        text not null default 'pending',
  updated_at    timestamptz not null default now()
);

-- Her takes: one KEPT take per beat. A take is inserted the moment the
-- upload starts and only reaches 'saved' once the audio is actually in
-- Storage — the portal refuses to call a line done before that, so
-- "recorded" in the UI and "recorded" in the bucket cannot disagree.
create table if not exists actor_takes (
  beat_id        text primary key,
  lesson         text not null,
  -- The clip cache key for the text she actually spoke: the human clip is
  -- looked up by exactly the same key scheme as the AI one, so the runtime
  -- can prefer hers without knowing anything about the portal.
  clip_key       text,
  raw_path       text,
  clip_path      text,
  opus_path      text,
  duration_ms    integer,
  -- Sentence spans, as the board timing needs them; the actor can drag
  -- these markers in the portal.
  sentences      jsonb,
  trim_start_ms  integer not null default 0,
  trim_end_ms    integer,
  -- uploading → saved (audio in Storage, playable)
  -- pending_processing: raw is safe, ffmpeg has not run yet
  -- failed: upload or processing errored; the portal retries
  status         text not null default 'uploading',
  peak_dbfs      real,
  noise_dbfs     real,
  updated_at     timestamptz not null default now()
);

create index if not exists actor_takes_lesson_idx on actor_takes (lesson);
create index if not exists actor_takes_status_idx on actor_takes (status);

alter table actor_lines enable row level security;
alter table actor_takes enable row level security;
-- As everywhere else in this file: no policies = deny-all for anon and
-- authenticated. The portal reaches these only through the service role.

-- ---------------------------------------------------------------------
-- App shell (Integration C): the parent zone and the child profile.
--
-- avatar          the onboarding avatar slot the parent picked (a key from
--                 the design's eight — the art is pending, see
--                 docs/design/art-needed.md)
-- parent_pin_hash PBKDF2-SHA256 of the parent's 4-digit PIN, salted with the
--                 child id (src/lib/childStore.ts); null until the parent
--                 sets one from the parent zone
-- settings        { captions: bool, sound: bool, dailyLimitMinutes: 15|20|30 }
--                 — captions default ON for a child (the design shows them
--                 on), the daily limit is enforced by the lesson runtime
--
-- Until this ALTER has run on a database, src/lib/childStore.ts keeps the
-- same three fields in a private storage object per child and says so in
-- its provenance — nothing is faked, and nothing breaks.
alter table children
  add column if not exists avatar text,
  add column if not exists parent_pin_hash text,
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- Onboarding step 1 stores the parent's phone as UNVERIFIED until an SMS
-- gateway confirms it (src/lib/sms.ts); without a gateway the flag stays
-- false and the step says so on screen.
alter table children
  add column if not exists parent_contact_verified boolean not null default false;
