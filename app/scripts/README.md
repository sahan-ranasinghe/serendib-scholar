# scripts/

## ingest-syllabus.ts

Reads every PDF in `docs/syllabus/`, `docs/teacher-guides/`,
`docs/past-papers/`, and `docs/original-content/` (repo root, i.e. a sibling
of `app/`), extracts text, chunks it into ~200-500 word pieces (breaking on
detected headings where possible), embeds each chunk with Gemini's
`gemini-embedding-001`, and writes the result into Supabase's
`syllabus_chunks` table.

Text extraction differs by medium: `english` PDFs use direct text-layer
extraction (fast, and these PDFs have a normal Unicode text layer).
`sinhala`/`tamil` PDFs go through Gemini vision-based transcription instead
— see "Vision-based transcription" below for why and how. (This used to be
local Tesseract OCR; see that section for why it was replaced.)

### Prerequisites

1. **Run `supabase/schema.sql` in the Supabase SQL editor first.** The
   ingestion script only reads/writes rows over the Supabase REST API (via
   the service-role key) — it can't run DDL, so the `syllabus_chunks` table
   (including its `page_number`/`image_url` columns — see "The board" below),
   its indexes, the `match_syllabus_chunks`/`available_syllabus_subjects`
   functions, and the `textbook-images` Storage bucket must already exist.
   If you set this up before "the board" feature, re-run schema.sql to pick
   up the new columns/bucket.
2. Env vars (in `.env.local`, same as the rest of the app):
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. **For sinhala/tamil PDFs**, install `poppler-utils` (provides
   `pdftoppm`, used to rasterize pages before sending them to Gemini — not
   needed for english-only ingestion):
   ```bash
   sudo apt-get install poppler-utils
   ```
   No local OCR engine is needed — transcription happens via the Gemini
   API using the same `GEMINI_API_KEY` as embedding (see env vars above).
4. Name your PDFs `<subject>_<grade>_<medium>[_<label>].pdf`, e.g.:
   - `maths_5_sinhala.pdf`
   - `environmental-studies_5_english_water-cycle.pdf`
   - `science_5_tamil.pdf`

   `subject` is kebab-case (converted to Title Case for storage), `grade` is
   a number, and `medium` is one of `sinhala` / `tamil` / `english`. Files
   that don't match this pattern are skipped with a warning — nothing is
   guessed. The same convention applies in all four folders.

### Run it

```bash
npx tsx scripts/ingest-syllabus.ts
```

(from the `app/` directory, same place you run `npm run dev`). Or:

```bash
npm run ingest:syllabus
```

### What success looks like

```
Found 2 PDF(s) under /path/to/serendib-scholar/docs

syllabus/maths_5_sinhala.pdf
  40 pages ~ 10.0 minutes, 40 API calls (~$0.14 estimated)
  Transcribing page 1/40...
  Transcribing page 2/40...
  ...
  Transcribing page 40/40...
  Maths · Grade 5 · sinhala — 14 chunk(s) extracted
  [1/14] inserted (312 words) — topic: 1. Fractions
  [2/14] inserted (287 words) — topic: 1. Fractions
  ...

teacher-guides/science_5_english.pdf
  Science · Grade 5 · english — 9 chunk(s) extracted
  [1/9] inserted (401 words) — topic: 2. The Water Cycle
  ...

Done. 2 file(s) processed, 23 chunk(s) inserted, 0 chunk(s) already up to date, 0 chunk(s) skipped (low-quality transcription), 0 chunk failure(s), 0 file(s) skipped.
```

A per-chunk `FAILED` line (e.g. an embedding call error survives retries)
doesn't stop the run — the script keeps going and reports a nonzero failure
count at the end, along with a nonzero exit code so it's CI/script-friendly.

### Rate limiting and transient errors

`embedContent` calls are paced `EMBED_CALL_DELAY_MS` (1500ms) apart, and
vision `generateContent` calls (for sinhala/tamil transcription) are paced
`VISION_CALL_DELAY_MS` (1000ms) apart — though in practice each vision call
already takes several seconds on its own, so that pacing is a light safety
margin more than the primary throttle. If either kind of call comes back
`429 RESOURCE_EXHAUSTED` (rate limit) or `503 UNAVAILABLE`/deadline-exceeded
(a transient server-side timeout, not a quota problem — see
`classifyRetryableApiError` near the bottom of the file), the script
retries it with the same exponential backoff (5s, then 10s, then 20s —
`RETRY_MAX_ATTEMPTS` / `RETRY_BASE_DELAY_MS` near the top of the file)
before giving up — marking the chunk `FAILED` for an embedding call, or
failing the whole file for a transcription call. Each retry logs a `rate
limited, retrying in Ns...` or `transient server error, retrying in Ns...`
line so a paused run is visible, not silent. Tune the constants if you're
still seeing these or want a faster run.

### Re-running

Safe to re-run any time, including after a run that stopped partway through
(e.g. a rate limit or transient error exhausted its retries) or after
editing a PDF.

**Whole-file check, before any transcription/extraction happens:** if
`syllabus_chunks` already has any rows under a file's `<folder>/<filename>#`
prefix, that file is treated as already fully ingested and skipped
entirely — logged as `already ingested (N chunks), skipping`. This is
deliberately simple (any rows = done, zero rows = not done, fully
reprocess) rather than trying to detect a partially-ingested file, because
the expensive part (Gemini vision transcription for sinhala/tamil) happens
for *every* page before any chunk is ever inserted — so a run that fails
during transcription (the common case) always leaves zero rows behind,
which is exactly what should trigger a full redo. It does not distinguish
that from a file that inserted some rows before being interrupted
mid-insertion (e.g. the process was killed) — that rarer case would be
wrongly treated as done; delete that file's rows manually to force a redo
if it happens.

**Per-chunk check, once transcription/extraction has (re-)happened:** the
script fetches which `source_reference` values already exist under that
file's prefix (e.g. `teacher-guides/maths_5_sinhala.pdf#chunk-12`) and
skips re-embedding any chunk index already present — so a run that got 38
chunks in before failing (per-chunk embedding failures don't stop the
run — see "Rate limiting and transient errors" above) will skip those 38
and pick up at chunk 39, not redo or duplicate them. Rows under the prefix
that no longer correspond to a current chunk index (e.g. the file's content
shrank) are deleted. There's no cross-file deduplication — each file owns
its own `source_reference` namespace, keyed by which of the four folders it
lives in plus its filename.

Note: since skipping is by chunk index, not content, editing a chunk's text
without changing the file's total chunk count won't cause it to be
re-embedded on the next run — delete that row (or all of the file's rows)
manually first if you need to force a re-embed.

### Vision-based transcription (sinhala/tamil only)

These sinhala/tamil textbook PDFs are legacy-font scans: their embedded text
layer, if read directly, decodes to garbled Latin keystrokes rather than
real Sinhala/Tamil (the font's glyph-to-codepoint mapping isn't Unicode).
Reading the *rendered page image* instead sidesteps this, so for
`medium: sinhala` / `medium: tamil` the script:

1. Rasterizes each page to a PNG at 300 DPI with `pdftoppm`, into a temp
   directory.
2. Sends each page image to Gemini (`VISION_MODEL`, currently
   `gemini-3.6-flash`) with a prompt asking it to transcribe the page,
   render any tables as markdown tables, describe diagrams/illustrations
   in a labeled `[Diagram: ...]` section, and mark blank fill-in-the-blank
   worksheets as `[Worksheet - not transcribable]` instead of guessing —
   logging progress as `Transcribing page N/total...`.
3. Uploads that same page's real image to Supabase Storage (see "The
   board" below), then hands the page's transcribed text — tagged with
   its page number — to the transcription quality filter and normal
   chunking pipeline.
4. Deletes the temp page images once the file is done (success or failure)
   — they're already durably stored in Supabase by this point.

`medium: english` PDFs skip all of this and use direct text-layer
extraction as before — their text layer is normal Unicode, and vision
transcription would only add cost and latency for no benefit.

**Why not Tesseract (this pipeline's original approach)?** Local OCR was
fast and free, but flattened tables and diagrams into garbage — mangled
cell contents with no structure, and no attempt at describing an
illustration. A curious child asking about a diagram, or the assistant
needing an exact figure from a data table, got nothing usable. Gemini
actually understands page structure: it renders real markdown tables and
describes what a diagram is teaching, at the cost of a real (much slower,
non-free) API call per page instead of near-instant local OCR — see "Rate
limiting" above and the cost/time estimate below.

**Cost and time**: before transcribing a file, the script logs an
estimate — e.g. `128 pages ~ 32.0 minutes, 128 API calls (~$0.45
estimated)` — from `VISION_SECONDS_PER_PAGE_ESTIMATE` and the per-page
token/pricing constants near the top of the file. This is a rough,
order-of-magnitude estimate (not tied to real per-call usage), based on
empirical testing against real textbook pages; re-check it against
[current Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
if it starts looking stale.

### Transcription quality filtering (sinhala/tamil only)

Kept as a safety net even though Gemini rarely produces the
repeated-garbage-character artifacts Tesseract did on tables/worksheets
(e.g. repeated ෴) — it's now expected to trigger far less often than it
did under Tesseract.

Dots and underscores are treated as **legitimate content, not noise**:
real exercises in these textbooks routinely ask the child to fill in a
blank represented by a run of dots (`....................`), sometimes
making up over half a page's characters. An earlier version of this filter
rejected dozens of accurate, content-rich pages purely for containing long
dot-runs — see `scripts/skipped-chunks.log` if that ever recurs, and
recheck real ratios (a quick Python pass over the log's raw text is enough)
before tightening these back up.

Before chunking, each transcribed page of a sinhala/tamil file is checked
and dropped from that file's text (never chunked, embedded, or inserted) if
any of these hold, tunable via the constants near the top of the file:

- `OCR_MAX_REPEATED_CHAR_RUN` (default 5) — any single character *other
  than* markdown table syntax (`-`, `|`, `:`) or blank-fill dots/underscores
  repeats more than this many times in a row (e.g. ෴ repeating is still
  caught; a long run of answer-blank dots is not).
- `OCR_MAX_BLANK_FILL_RATIO` (default 0.8) — dots/underscores make up more
  than this share of the *whole* chunk's non-whitespace characters —
  i.e. the page is basically nothing but blanks, not a page that merely
  contains some.
- `OCR_MIN_REAL_CHAR_RATIO` (default 0.6) — real Sinhala/Tamil-letter +
  digit + table-pipe density falls below this share, measured against the
  chunk's content **with blank-fill dots/underscores excluded** — a
  worksheet's answer blanks shouldn't count against how "real" the actual
  transcribed prose around them is.

A markdown table's separator row (e.g. `| :--- | :---: |`) is pure
structural syntax with no informational content, so it's stripped before
any of the above run — otherwise a legitimately well-transcribed table's
dashes/pipes/colons could skew the real-character ratio and trigger a false
rejection.

Rejected pages are logged with their raw text and page number to
`scripts/skipped-chunks.log` (recreated fresh at the start of each run) for
manual review, and the run prints a summary line — e.g. `12 chunk(s)
skipped due to low-quality transcription — see scripts/skipped-chunks.log
for details` — plus a matching count in the final `Done.` line.

### The board (page images + worksheet-only chunks)

"The board" is the visual teaching area alongside the app's voice UI (see
`src/components/TeachingBoard.tsx`) — it displays real textbook page images,
tables, and exercises via the model's `show_page_image`/`show_table`/
`show_exercise`/`show_vocabulary_card` tool calls. This ingestion pipeline
is what makes the "real page image" half of that possible:

- **Every** sinhala/tamil page's rasterized PNG is uploaded to the public
  `textbook-images` Storage bucket (real images only — never cropped, never
  AI-generated), not just pages with a diagram. A blank fill-in worksheet's
  image is just as worth keeping as a diagram's: the child benefits from
  seeing the real blank grid while the assistant walks through it verbally,
  even though the blank content itself isn't transcribable text.
- Every chunk (english included) carries the `page_number` it was
  extracted/transcribed from — this threads through chunking itself (see
  `Paragraph`/`Chunk` in the script), not a best-effort guess after the
  fact. `image_url` is populated from that page's uploaded image for
  sinhala/tamil chunks, and always null for english (no rasterization
  happens for those).
- `page_number` is the raw PDF page index, which usually isn't what's
  printed in the textbook's own footer — front matter (cover, foreword,
  contents) shifts every numbered page's raw index away from its printed
  number (e.g. raw page 76 might print "66"). `printed_page_number`
  (nullable) is `extractPrintedPageNumber`'s best-effort parse of the
  transcribed text near the recurring footer phrase "නොමිලේ බෙදාහැරීම
  සඳහා" (see the constant/function of the same name); null where it isn't
  confidently found (front-matter pages, or any english chunk — this is
  only ever parsed from sinhala/tamil vision output). Shown to the child in
  place of `page_number` when present; internal image lookups always use
  the raw `page_number`, which this doesn't affect.
- A chunk whose content is essentially just the `[Worksheet - not
  transcribable]` label (see `isWorksheetOnlyChunk`,
  `WORKSHEET_CHUNK_MAX_REMAINING_WORDS`) has no real prose worth
  embedding — it's still inserted (so the page stays findable via
  `page_number`/`image_url`), just with a **null embedding** instead of
  spending an API call on it. `match_syllabus_chunks` excludes these from
  semantic search results.
- `src/app/api/tools/show-page-image/route.ts` looks a page up by
  `source_reference` (prefix-matched, so it works for both a single chunk
  and a merged multi-chunk passage — see `search-syllabus/route.ts`) plus
  `page_number`.

## infer-printed-page-numbers.ts

A one-time post-processing pass, run manually after ingestion — not part
of `ingest-syllabus.ts` itself. Back-fills `printed_page_number` for rows
where `extractPrintedPageNumber` found nothing (a real transcription miss,
not a wrong value), by sequential inference from the file's dominant
`(page_number - printed_page_number)` offset.

```bash
npx tsx scripts/infer-printed-page-numbers.ts
```

Per file (grouped by the `source_reference` prefix before `#chunk-`): it
only infers if there are at least 10 confirmed (real, non-inferred)
non-null rows and at least 90% of them agree on one dominant offset, and
even then only for a null row whose `page_number` falls strictly between
the lowest and highest confirmed `page_number` for that file — never at
the very start or end of the book, where "no printed number" may be
genuinely true (front/back matter) rather than a missed transcription.

Inferred rows are marked `printed_page_number_inferred = true` (needs the
column from `supabase/schema.sql` — run the `alter table` there first if
upgrading an existing database) so a real transcription can always be told
apart from a back-filled guess later. Idempotent: re-running only ever
fills rows still null, and only ever anchors its offset/bounds on
non-inferred rows, so it can't compound drift across repeated runs.

### Known limitation

Chunking works at the granularity of visual PDF lines: headings are
detected reliably (short lines, numbered like "1.2 Fractions", ALL CAPS,
etc.), but two paragraphs on the same page with no heading or page break
between them may get merged into one block before being re-split by word
count. This mostly affects paragraph-level granularity, not correctness —
oversized blocks still get cleanly split on sentence boundaries, and content
is never dropped.


## extract-lesson-plan.ts

Extracts the **complete verbatim Sinhala transcript** of a recorded lesson —
how the teacher actually speaks — into a reviewable JSON file.

`ingest-syllabus.ts` gives us the textbook *content*: the numbers, tables and
exercises. What it can't give us is how a lesson is *taught*, and in
particular how the teacher *talks*: her exact phrasing, her register with
children, the encouragement she repeats, where she slows down, the questions
she puts to the class. This script captures that word for word.

**It deliberately does not summarize.** An earlier version compressed
15-minute windows into a few English bullets, which threw away exactly the
thing that makes the output useful. Segments are therefore short (3 minutes),
so one request only ever has to render a few minutes of speech in full, and
every field except the JSON keys comes back in Sinhala.

### Content source and permission

The lesson videos processed here are **DP Education** recordings, used
**with permission**. Every generated file carries that attribution in its own
`source` field. Don't add videos to `lesson-videos.json` that aren't covered
by that permission (or an equivalent one you've secured).

### Run it

```bash
npm run extract:lesson-plan
```

(from the `app/` directory). That npm script runs the file through
`node --env-file=.env.local` because plain `tsx` does **not** load
`.env.local`, and this needs `GEMINI_API_KEY`.

Flags:

```bash
# Extract only the first segment, print it in full, and stop — for eyeballing
# transcript quality before committing to a long paid run. The segment is
# checkpointed, so a normal run afterwards continues from segment 2.
npm run extract:lesson-plan -- --first-segment-only

# Ignore any checkpoint and re-extract from scratch.
npm run extract:lesson-plan -- --force
```

### Adding a video

Add an entry to `scripts/lesson-videos.json`:

```json
[
  {
    "subject": "maths",
    "grade": 5,
    "lesson": 1,
    "medium": "sinhala",
    "youtubeUrl": "https://www.youtube.com/watch?v=aZLI3SIPZPc",
    "durationMinutes": 125
  }
]
```

`durationMinutes` is **optional but recommended**:

- **With it**, the script knows exactly how many segments to run, prints a
  real cost estimate up front, and keeps going past a failed segment (so one
  hiccup near the end doesn't cost you the rest of the run). Set it close to
  the video's real length — overshooting means the tail segments are past the
  end of the video and each burns three retries and a billed call before
  being reported as failures.
- **Without it**, the script walks forward until it runs off the end of the
  video, capped at `MAX_MINUTES_WITHOUT_DURATION` (4 hours) as a guard
  against an unbounded paid run.

  Note what "running off the end" actually looks like: asking for a window
  past the end of a video does **not** return an empty response — the API
  returns a persistent `500 INTERNAL` that survives all three retries
  (confirmed on a real run). So once at least one segment has been captured,
  a segment that fails after retries is treated as the end of the video and
  the run finishes cleanly. A failure *before* anything has been captured is
  treated as a real failure instead. Either way the script says which it
  concluded — if it calls "end of video" on a video you know is longer, set
  `durationMinutes` to force it onward.

Output goes to `src/data/lessons/lesson<N>-teaching-plan-full.json`. The
filename keys on lesson number alone, so two entries with the same lesson
number would collide — the script refuses to run in that case rather than
silently overwriting.

### What it extracts

Per 3-minute segment:

- `fullTranscript` — the complete verbatim Sinhala transcript, word for word,
  including repetitions, encouragement and asides. Not summarized, not
  translated, not shortened.
- `boardContent` — everything written on the whiteboard in that window, in
  Sinhala, layout preserved (markdown for tables). The board carries digits
  and worked steps the audio never states out loud.
- `teachingNotes` — `toneAndManner` and `pacingNotes` (both in Sinhala),
  plus `phrasesUsed`, `questionsAsked`, `examplesUsed`, and `problemsWorked`
  (with ordered `stepsShown`), all verbatim Sinhala.

### How it works

- The YouTube URL is handed **straight to Gemini** (`fileData.fileUri`) —
  nothing is downloaded, transcoded or stored locally.
- The video is processed in 3-minute windows using the API's own video
  offsets (`videoMetadata.startOffset` / `endOffset`) rather than by
  splitting a file, then merged in segment order.
- The prompt requires reading **both** the spoken audio and the **visual
  whiteboard**, and states explicitly: do not summarize, do not translate,
  do not shorten; every field in Sinhala except the JSON keys.
- Structured output is enforced with `responseJsonSchema`.
- Rate limits and transient 5xx errors retry with the same backoff as the
  ingestion pipeline, shared via `scripts/lib/geminiRetry.ts`.
- Uses `gemini-3.6-flash`, same model as ingestion.

### Guards against silently-bad output

The whole value here is completeness, so a few checks run automatically:

- **Truncation is a hard error.** `maxOutputTokens` is set generously
  (`MAX_OUTPUT_TOKENS`), and if a response still comes back with
  `finishReason: MAX_TOKENS` the segment fails loudly rather than
  checkpointing a transcript that's been cut off mid-sentence. Retrying
  wouldn't help, so it's deliberately not treated as a retryable error —
  lower `SEGMENT_MINUTES` or raise the ceiling.
- **Non-Sinhala output warns.** A transcript containing no Sinhala
  characters means it probably got translated.
- **Suspiciously short output warns.** Under ~5 characters per second of
  video usually means it summarised instead of transcribing.

These print as `(warning)` lines rather than discarding work — they're
judgement calls for a human, not automatic failures.

### Cost, time, and resumability

Before processing, the script prints an estimate, e.g.:

```
maths grade 5 lesson 1 (sinhala)
  https://www.youtube.com/watch?v=aZLI3SIPZPc
  42 segment(s) of 3 min ~ 31.5 minutes, 42 API call(s) (~$2.49 estimated)
```

Video is expensive to tokenize (roughly 300 tokens per second of footage at
1 fps), so a 2-hour lesson is a couple of dollars, not cents. `VIDEO_FPS` is
deliberately left at the 1.0 default: dropping it would cut cost sharply but
risks missing whiteboard content that was only on screen briefly.

Every segment is written to a `lesson<N>-teaching-plan-full.partial.json`
checkpoint **the moment it completes**, so a crash, a rate-limit wall, or
Ctrl-C partway through a long paid run never loses finished work — re-run and
it skips straight to what's missing. The checkpoint is kept after a
successful run too, so a re-run is nearly free; use `--force` to genuinely
redo the extraction.

For testing without touching the real config or output, override
`LESSON_VIDEOS_CONFIG` and `LESSON_PLAN_OUT_DIR` (same idea as
`CONTENT_ROOT` for the ingestion script).

### Not wired into teaching yet

This script only **produces** the transcript. Nothing reads
`lesson<N>-teaching-plan-full.json` at runtime — the tutoring flow is
untouched.
