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
