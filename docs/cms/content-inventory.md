# Content inventory — what a non-developer should be able to edit

29 Sep 2026 · the state of `master` at 32720c6 · no code changed to produce this.

Every piece of data in Serendib Scholar that a teacher, a copy editor or an admin should be able to change, where it
lives today, what shape it has, who should own it, what it must pass before it reaches a child, and how it gets into
the running app. It is the starting point for a CMS: what to move out of the code, and in what order.

**The one-line state of things.** Apart from a child's own settings (the daily limit and the chat minutes, which a
parent changes in the parent zone), nothing can be changed without a developer. Every string, list and rule is
compiled into the app or read from a file in the repository, so a change means an edit, a rebuild and a redeploy. The
database holds the content bank, the syllabus, the built-script cache, the voice actor's takes and the children.

## How to read the tables

- **Lives in today** starts with the kind of place:
  - **file**: a JSON or Markdown file in the repository.
  - **table**: a Supabase table.
  - **storage**: a Supabase storage bucket.
  - **env**: an environment variable, set in Vercel.
  - **hard-coded**: a TypeScript constant or a literal inside a component.

  Paths are relative to the repository root.
- **Editor** is who should own the item. The first name listed is the owner; a second one after "+" helps.
  - **Teacher**: what is taught and how (pedagogy, answers, order).
  - **Copy editor**: the Sinhala wording, a native speaker.
  - **Admin**: operational settings and accounts.
  - **Developer**: structure and code.
  - **Generated**: produced by a script; never edited by hand.
- **Validators before live** starts with **Yes**, **Partly** or **No**, then names the checks and where they live.
  - "Recording" means a changed spoken line has no clip until it is re-recorded or re-rendered.
  - Until then the child reads it on the board instead of hearing it.
- **Reaches the app** says what a change needs.
  - **build**: imported at build time, so it needs a rebuild and a redeploy.
  - **file at runtime**: read from the deployed files, so it needs a redeploy.
  - **database**: read live.
  - **script cache**: baked into the `lesson_scripts` row, so the script must be rebuilt.
  - **offline**: only feeds a script that writes other files.
  - **env**: needs a redeploy on Vercel; `NEXT_PUBLIC_*` values are inlined at build.
- Which tests run in CI matters here. CI (`.github/workflows/ci.yml`) runs typecheck, lint, 12 test files, the dry run
  and crawl:check. The dry run and crawl:check run only when the secrets are present.
  - **Not in CI:** `appCopy.test`, `authoredLines.test`, `chatBudgetRules.test`, `timeWarnings.test`,
    `confirmPolicy.test`, `speechRules.test`, `distractors.test`, `phraseJudge.test`, `answerMode.test`,
    `authorGuards.test`, `chatContext.test`.
  - **Manual:** `design:check`, `board:check`, `session:check`.

---

## 1. The lesson script and its review rounds

One lesson (Maths, grade 5, lesson 1) is written today: 167 beats in session 1, of which 43 are questions. Two of the
eight design concepts are authored beat by beat. The other six are spoken from the content bank's transcripts
(section 4).

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 1 | Beat wording: what Zara says, with `{number:N}` and `{address}` markers | **file** · `app/src/data/lessons/authored/maths-5-1.json` (`sourceText`; `spokenText`, `numbers` and `maxSimilarity` are derived) | JSON, a string per beat | Copy editor + Teacher | **Yes**:<br>• `apply-review-edits` checks: renders cleanly, no bare digit, ≤ 14 words a sentence, vocabulary in guide order, unique ids (`app/scripts/apply-review-edits.ts:988-1081`)<br>• speech rules (`:837-861`)<br>• dry-run gates (`app/scripts/dry-run-lesson.ts`)<br>• storyboard regenerated<br>• recording | file at runtime → script cache (fingerprinted); its storyboard is a build import, so rebuild |
| 2 | Beat structure: type, pause, guide step, order, concept | same file | JSON fields | Teacher | **Yes**:<br>• apply-review-edits asserts<br>• dry run: a mode per question, answer mode and touch surface, ITEM LEDGER, exercise units, tutor turns, tables, builds, packer contract, no yes/no questions (`dry-run-lesson.ts:524-970`) | as #1 |
| 3 | Answers: `expectedAnswer` (a value or a predicate such as `permutationOf`), `answerChoices` | same file | string or JSON | Teacher | **Yes**:<br>• every question has one, with no marker (`apply-review-edits.ts:1006-1016`)<br>• `validateChoices`: 3 options, distinct, exactly one correct (`app/src/lib/distractors.ts:145-162`) | as #1 |
| 4 | Board intents: what the board shows per beat (title, text card, abacus, exercise, blank, reveal …). The card text is Sinhala. | same file (`boardIntent`, types at `app/src/lib/authoredScript.ts:32-93`) | JSON | Teacher + Copy editor | **Yes**:<br>• no beat loses its board (`apply-review-edits.ts:1018-1024`)<br>• dry-run board gates (`:365-639`)<br>• `board:check --only=overlap` (manual) | as #1 |
| 5 | Phrase rubrics for spoken or tapped phrases: accepted forms, Sinhala explanation, choices | **file** · `docs/review/session-1-corrections.json` → `phraseRubrics`, applied into the script | JSON | Teacher + Copy editor | **Yes**:<br>• beat must exist<br>• `validateChoices` with `judgePhraseLocally` (`dry-run-lesson.ts:570-581`) | as #1 |
| 6 | The script's sign-off flag `approved` | top of the script file | boolean | Teacher | **Partly**:<br>• today it only means "zero speech-rule hits" (`apply-review-edits.ts:868`), not a human sign-off<br>• `false` makes the builder skip the file (`app/src/lib/lessonScriptBuilder.ts:1079-1091`) | as #1 |
| 7 | Hook candidates and analogies | top of the script file (`hookCandidates`, `analogies`) | JSON | Teacher | **No** | review document only |
| 8 | Review round 1: opening beats, hook swap, replacements, address policy | **file** · `docs/review/session-1-edits.json` (+ its `.md` twin) | JSON keyed by beat id | Copy editor | **Yes**: apply-review-edits (unknown ids fail) | offline → the script file |
| 9 | Review round 2 decisions (accepted, accepted with change, rejected) | **file** · `docs/review/gemini-review-decisions.json` | JSON | Copy editor | **Yes**: a rejected beat must not be rewritten (`apply-review-edits.ts:766-769`) | offline |
| 10 | Corrections, rounds 3 onward | **file** · `docs/review/session-1-corrections.json`: 26 sections (20 applied, the rest record-only notes) | JSON: rewrite / insert / remove per beat id | Teacher + Copy editor | **Yes**:<br>• the same asserts<br>• a **new section needs code**: a type and a loop in `apply-review-edits.ts:106-750`, applied in a fixed order | offline → the script file |
| 11 | Wording fixes written inside the applier: 3 beats and a pause | **hard-coded** · `applyExtraFixes`, `app/scripts/apply-review-edits.ts:895-970` | TS | Copy editor (today a developer) | **Yes**: the same asserts | offline |
| 12 | The voice actor's re-wordings ("say it your way") | **table** · `actor_lines` (beat_id, original_text, actor_text, note, status) | rows | Copy editor + Admin | **Partly**:<br>• a number check and a model intent check (`app/src/app/api/portal/submit/route.ts`, needs `PORTAL_TRANSCRIBE=on`)<br>• an accepted re-wording **skips** the speech rules, the 14-word rule, the vocabulary order and storyboard alignment | database overlay on the script (`app/src/lib/buildLessonScript.ts:93-95, 185-194`); `npm run portal:export-lines -- --write` makes it permanent |
| 13 | Script-note suggestions from the storyboard | **file** · `docs/storyboard/script-note-suggestions.json` | JSON keyed `beatId#kind` | Copy editor + Teacher | **No**: it only fills `script-notes.md`; an accepted note is copied by hand into the corrections | offline |
| 14 | The review document of the whole script | **file** · `docs/review/session-1-original.md` | Markdown | Generated (by `apply-review-edits` via `app/src/lib/reviewDoc.ts`) | n/a | not read by the app |

## 2. The storyboard

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 15 | Storyboard plan: what the board does on each sentence (167 beats, 363 events) | **file** · `docs/storyboard/maths-5-1-session-1.json`, copied to `app/src/data/storyboard/maths-5-1-session-1.json`; readable `maths-5-1-session-1.md` and `script-notes.md` | JSON | Generated by `npm run storyboard` from the script (no model) | **Yes**:<br>• the generator refuses shared abacus timestamps<br>• dry run: storyboard ↔ script, dark rods, same-sentence<br>• `board:check`, `session:check` (manual) | build (`app/src/hooks/useLessonRuntime.ts:13`): any wording change → `npm run storyboard` + rebuild |

## 3. Lesson design, concepts, titles and sources

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 16 | Lesson design, per concept: objective, vocabulary introduced, guide steps, textbook content, examples, misconceptions, analogy slot, time weight … (+ a hand-added `vocabularyNotSpoken`) | **file** · `docs/design/maths-5-1.json` (8 concepts) | JSON | Teacher | **Yes**, at extraction: no quoting, the number denylist, examples drawn from the sources (`app/scripts/extract-lesson-design.ts`). `authoredLines.test` reads it. | offline and tests only; the app never reads it |
| 17 | Concept list and order | **hard-coded** · `DESIGN_CONCEPTS`, `app/src/lib/lessonDesign.ts:17-26` | list (8) | Teacher | **Yes**: typecheck, the builder | build |
| 18 | Concept → teacher's-guide activity | **hard-coded** · `CONCEPT_ACTIVITY`, `lessonDesign.ts:31-40` | map (8) | Teacher | **No** | build / offline |
| 19 | Vocabulary order: which concept introduces each term | **hard-coded** · `VOCABULARY_INTRODUCED_BY`, `lessonDesign.ts:55-66` (10 terms; the design file keeps a second copy) | map | Teacher | **Yes**:<br>• author guards (`app/src/lib/authorGuards.ts`)<br>• the vocabulary check in apply-review-edits<br>• also feeds the chat prompt | build |
| 20 | Textbook step → concept, old-tag remap | **hard-coded** · `TEXTBOOK_STEP_CONCEPT`, `OLD_TAG_CONCEPT`, `lessonDesign.ts:73-99` | maps | Teacher + Developer | **No** | offline (re-map script) |
| 21 | Concept titles the child sees (progress strip, cards, certificate, close card) | **hard-coded** · `CONCEPT_TITLES`, `app/src/lib/choreography.ts:795-812` (15, including legacy tags) | map | Copy editor | **No** validator | build, and script cache for the close card |
| 22 | Exercise titles | **hard-coded** · `ITEM_TITLES`, `choreography.ts:819-823` (3, keyed by content-bank id prefix) | map | Copy editor | **No** | build / script cache |
| 23 | Concept descriptions (English, for the chat and the summaries) | **hard-coded** · `LESSON_1_NUMBERS_STEPS[].conceptDescription`, `app/src/data/lessons/lesson1-numbers.ts:192-497` | strings | Teacher | **No**: keyed by the *old* concept tags, so every design concept gets an empty description today | build |
| 24 | Lesson title on title cards | **hard-coded** · `LESSON_1_NUMBERS_TITLE`, `lesson1-numbers.ts:190` | string | Copy editor | **No** | build / script cache |
| 25 | Column labels of the lesson's own tables | **hard-coded** · `BREAKDOWN_COLUMNS`, `NUMBER_NAME_COLUMNS`, `choreography.ts:608-618` | lists | Copy editor + Teacher | **No**. They are deliberately short ("අගය"); the quiz uses the textbook's headings (#81). | build |
| 26 | Textbook exercises, hand-transcribed: components, props, answers | **hard-coded** · `LESSON_1_NUMBERS_STEPS`, `lesson1-numbers.ts` | TS | Teacher | **Yes**, once in the content bank (#31) | offline → `content_bank` via `populate-content-bank` (`--replace` makes new ids; see gaps) |
| 27 | Teacher's-guide transcription (source A) | **file** · `docs/design/maths-5-1-teacher-guide.md` | Markdown | Teacher | **No** | offline (`extract:design`) |
| 28 | Chat style guide: address forms, openings, encouragement | **file** · `app/src/data/lessons/teaching-style-guide.json` (generated by `extract-teaching-style`, then kept) | JSON | Copy editor + Teacher | **No** | build (the ✋ chat's system prompt) |
| 29 | Recorded-lesson transcript (42 segments) | **file** · `app/src/data/lessons/lesson1-teaching-plan-full.json` | JSON | Generated (`extract-lesson-plan`); source material, never edited | n/a | offline and the distance check |
| 30 | Lesson video list | **file** · `app/scripts/lesson-videos.json` | JSON | Admin | **No** | offline |
| 31 | Syllabus corpus and page images | **table** · `syllabus_chunks` + **storage** · `textbook-images` (from `docs/syllabus`, `docs/teacher-guides`, `docs/past-papers`, `docs/original-content`) | rows | Admin | **Yes**:<br>• the ingest's transcription filter<br>• `ingest-syllabus.test` (CI) | database (search only with `SYLLABUS_SEARCH=on`; the page-image tool) |

## 4. The content bank

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 32 | Content-bank items: every exercise, its props, answer and explanation. `explanation.spokenTranscript` holds the exact words for the six non-authored concepts. | **table** · `content_bank` (`app/supabase/schema.sql:210-244`) | rows, JSON columns | Teacher + Copy editor (spoken transcript, number names) | **Yes**:<br>• only `verified = true` rows are read<br>• dry run: every exercise staged, ITEM LEDGER 0 not covered (CI), tables are practice, abacus staging<br>• recording | database → script cache. **An edit inside a row does not invalidate the cache** (the fingerprint is id + type only), so it needs `force_rebuild` |
| 33 | Verifying an item | **table** · `content_bank.verified` | boolean | Teacher | **No UI**: a manual SQL update today (`app/scripts/populate-content-bank.ts:551`) | database |
| 34 | The built lesson script | **table** · `lesson_scripts` (script JSON + content fingerprint) | row | Generated. Admin lever: `POST /api/lesson-script {force_rebuild:true}`; developer lever: `SCRIPT_FORMAT_VERSION` | n/a | database |

## 5. Questions, answers and mastery

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 35 | Place names used to build wrong options | **hard-coded** · `PLACE_NAMES`, `app/src/lib/distractors.ts:30` | list | Copy editor | **Yes**: `validateChoices`, run in the dry run and by the review quiz (`app/src/lib/recapBeat.ts:55`) | build |
| 36 | Review-quiz size and pick | **hard-coded** · 5 per concept (`app/src/app/api/recap/route.ts:28`, and `slice(0,5)` in `QuizClient.tsx:43`); up to 40 candidates; weakest concept first | numbers | Teacher + Admin | **No** | build |
| 37 | Mastery thresholds for the app's rings, stars and certificates | **hard-coded** · `MASTERY_PCT` 85, `MASTERY_MIN_ANSWERS` 3, `GOOD_PCT` 60, `BEST_PCT` 95 (`app/src/lib/appData.ts:28-31`; 85 is repeated in `PracticeHub.tsx:23` and `Progress.tsx:20`) | numbers | Teacher | **No** tests | build |
| 38 | Stars and streak | **hard-coded** · `appData.ts:201-211, 287-292, 412` (stars = share of concepts mastered; streak = consecutive Colombo days) | formulas + numbers | Admin (the numbers) | **No** | build |
| 39 | When the lesson advances or re-teaches | **hard-coded** · `UNAIDED_CORRECT_TO_ADVANCE` 2, `MISSES_BEFORE_RETEACH` 2 (`app/src/lib/lessonOrchestrator.ts:259-262`) | numbers | Teacher | **Yes**: `lessonOrchestrator.test` (CI), `session:check` | build |
| 40 | Which guide steps are "on your own" (mode 3, the ones that count for mastery) | **hard-coded** · `assignModes`, `authoredScript.ts:387-411` (the last 2 guide steps) | rule parameter | Teacher | **Yes**: dry run | build |
| 41 | When to read an answer back to confirm it (voice assessment only) | **hard-coded** · `CONFIRM_BELOW_CONFIDENCE` 0.75, `CONFIRM_LIMIT` 2 (`app/src/lib/confirmPolicy.ts:25-27`) | numbers | Admin | **Partly**: `confirmPolicy.test` (not in CI). Only with `VOICE_ASSESSMENT=on`. | build |

## 6. Session packing

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 42 | Session length and breaks:<br>• teaching target 1320 s, break after 720 s, minimum 720 s<br>• ≤ 12 questions a session<br>• per-item caps, sentence budget | **hard-coded** · `app/src/lib/lessonScriptBuilder.ts:45-94, 624` | numbers | Teacher + Admin | **Yes**:<br>• dry run packer contract (`dry-run-lesson.ts:958-970`)<br>• the dry run keeps its own copy (`ASK_CEILING`, `FLOOR_SECONDS`, `:919-920`) | script cache, **not fingerprinted**: bump `SCRIPT_FORMAT_VERSION` |
| 43 | Pace estimates used for packing and the daily limit: 9 characters a second, 8 s a child turn, 3 s a soft check | **hard-coded** · `app/src/lib/beatRegistry.ts:147-166` | numbers | Developer | **Yes**: dry run | build / script cache |
| 44 | Framing cards: lesson goals, the close card "අද ✓ … / ඊළඟ පාර: … / පාඩම ඉවරයි 🌟", emojis | **hard-coded** · `lessonScriptBuilder.ts:742-815` | strings | Copy editor | **No** | script cache |
| 45 | Per-concept blueprint override (video minutes, explanation beats, hook, items per mode) for the non-authored concepts | **file** · `app/src/data/lessons/blueprints/<subject>-<grade>-<lesson>.json`. **It doesn't exist today**; the builder reads it if present. | JSON | Teacher | **Partly**: the dry run prints it; unmatched concept tags warn | file at runtime, fingerprinted |

## 7. Speech rules and vocabulary lists

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 46 | Words Zara must not say, and what to say instead | **hard-coded** · `BANNED_IN_SPEECH`, `app/src/lib/speechRules.ts:129-142` | list | Copy editor | **Yes**: it *is* the check (`checkSpeechRules`, which sets `approved`), applied to authored beats only | offline gate |
| 47 | Other speech-rule word lists: rhetorical tags, verdict words, example frames, term paraphrases, pointing phrases, activity phrases | **hard-coded** · `speechRules.ts` (lines 85, 190-200, 257-258, 298-301, 336, 507) | lists | Copy editor + Teacher | **Yes**: the same check; `speechRules.test` (not in CI) | offline gate |
| 48 | Transcript pause classifiers: which transcript questions pause for the child | **hard-coded** · `lessonScriptBuilder.ts:859-863` | regexes | Copy editor | **No** | script cache |
| 49 | Instruction vocabulary Zara must never read aloud ("… සම්පූර්ණ කරන්න") and the yes/no question pattern | **hard-coded** · `FORBIDDEN_IN_SPEECH`, `app/scripts/dry-run-lesson.ts:966-981` | list, regex | Copy editor | **Yes**: it is a dry-run gate over all spoken text, transcripts included | offline gate |
| 50 | Frames exempt from the "don't copy the teacher" distance check | **hard-coded** · `CANONICAL_FRAMES`, `app/src/lib/scriptDistance.ts:37-56` | list | Copy editor | **Partly**: enforced while authoring; apply-review-edits only warns | offline |
| 51 | The word Zara addresses the child with (පුතේ / දුවේ) | **hard-coded** · `ADDRESS_WORD`, `app/src/lib/addressToken.ts:30` | string | Copy editor | **Yes**: `addressToken.test` (CI). **Changing it re-keys every clip.** | build |
| 52 | Sinhala number words (units, tens, hundreds, thousands and their joiners) | **hard-coded** · `app/src/lib/sinhalaNumber.ts:31-70` | tables | Copy editor (review) + Developer (change) | **Yes**: `sinhalaNumber.test` (CI). A change re-renders every number line and every number clip. | build |

## 8. Fixed spoken lines outside the script

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 53 | `AUTHORED_LINES`: feedback, nudges, the mic ask, the close, the time warnings, question frames … | **hard-coded** · `app/src/lib/authoredLines.ts:15-91` (32 keys, 35 lines) | map of strings | Copy editor | **Partly**:<br>• no automated register check (the speech rules skip them)<br>• the dry run prints them<br>• the wording of `tutorTurn` and `showBoardMode1/2` drives a dry-run gate (`announcesTutorTurn`)<br>• recording | build, and several are baked into the script cache |
| 54 | Drafted spoken lines awaiting sign-off | **hard-coded** · `LESSON_TIME_DRAFTS` (2), plus **file** · `docs/review/app-copy-corrections.json` → `spokenDrafts` (1: `placeValue4Digit:102t`); listed in `docs/review/app-copy.md` | list | Copy editor | **Yes**: native sign-off, then recording | build |
| 55 | Re-teach lines, one per concept | **hard-coded** · `RETEACH_LINES`, `authoredLines.ts:132-149` (8) | map | Teacher + Copy editor | **Yes**:<br>• `authoredLines.test`: ≤ 14 words, no English or digits, no later vocabulary (not in CI)<br>• recording | build |
| 56 | Number-word clips' list (77 words, derived from #52) | **hard-coded** (derived by `numberWordLexemes`, `app/src/lib/composeNumberAudio.ts:32-34`) | list | Generated | **Yes**: `composeNumberAudio.test` (77 words); recording | build |
| 57 | Number frames ("ඔයා කිව්වේ … නේද?" etc.) | **hard-coded** · `NUMBER_FRAMES`, `composeNumberAudio.ts:129-136` (5 fragments; one is never played) | strings | Copy editor | **Partly**: recording | build |
| 58 | Spoken lines written inline, outside `AUTHORED_LINES`: the rubric reveal prefix and the give-up line | **hard-coded** · `app/src/hooks/useLessonRuntime.ts:1902`, `lessonOrchestrator.ts:542` | strings | Copy editor | **No**: not in the review sheet or the render batch | build |

## 9. Audio: the clips and their recording status

A clip is found by a hash of its exact words and the voice. Any change to the words, the address word or the voice
(`ZARA_VOICE`) means the line has no clip until it is recorded again or re-rendered.

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 59 | AI clips | **storage** · `lesson-audio`, `a2/<key>.wav` + `.json` (duration, sentence spans, text, voice) | WAV + JSON | Admin (renders with `CLIP_RENDER=on npm run render:audio`, a paid call) | **Partly**: the paid-call switch and a minimum length; no content check | database (`/api/clip`, signed URLs) |
| 60 | The voice actor's clips | **storage** · `lesson-audio`, `human/h1/<key>.wav\|.opus\|.json`; raw takes `human/raw/<beatId>/…` (never deleted) | WAV / Opus + JSON | Voice actor (through `/portal`) | **Partly**:<br>• advisory warnings while recording (clipping, room noise)<br>• processing: trim, denoise, −16 LUFS<br>• a take marked `saved` goes live as soon as `VOICE_PROFILE=human`, with **no reviewer approval** | database |
| 61 | The takes | **table** · `actor_takes`: one kept take per beat id; status uploading / saved / pending_processing / failed; trim, sentence spans, peak and noise levels | rows | Voice actor + Admin (`npm run portal:process`) | **Partly**: as #60 | not read at runtime (storage is the truth) |
| 62 | The list of lines to record: script beats, right/wrong branch rows, re-teach lines, number words, number frames | computed by `/api/portal/beats` (`app/src/app/api/portal/beats/route.ts`) from the script, `AUTHORED_LINES`, `RETEACH_LINES` and the number words | about 343 rows, about 230 distinct clips (167 beats + 86 branch rows + 8 re-teach + 77 number words + 5 frames) | Admin | n/a | database |
| 63 | Recording status views | **computed**, and they count different things:<br>• `/portal` "☰ Lines": per row<br>• `/portal/status`: out of the 167 beats<br>• `npm run portal:coverage` and the dry run's VOICE COVERAGE: the 167 beat texts only<br>• `npm run render:audio` without `CLIP_RENDER`: AI cached vs missing | reports | Admin | n/a | n/a |

## 10. UI strings

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 64 | The app's copy table: every screen string in Sinhala and English, including the 7 accessible names (`a11y.*`) | **hard-coded** · `COPY`, `app/src/lib/appCopy.ts:33-361` (296 entries on 24 screens: 179 child-facing, 117 parent-facing) | `{screen, si, en}` per key | Copy editor. The `screen` field decides whether English may reach a child, so it stays with a developer. | **Yes**:<br>• `appCopy.test` (7 tests: nothing missing, no child-facing English beyond Wi-Fi / ඩේටා / PIN / SMS, ආයෙත් only, 12 months, වෙනි සැසිය, සාරා not Zara, Sinhala control names; not in CI)<br>• `crawl:check` width check at 390 px<br>• `design:check` (≥ 0.9 or an explained gap; child Sinhala ≥ 20 px)<br>• sign-off in the review sheet | build |
| 65 | The review sheet | **file** · `docs/review/app-copy.md`, from `npx tsx scripts/extract-copy.ts` | Markdown | Generated | n/a | not read by the app |
| 66 | The review rulings | **file** · `docs/review/app-copy-corrections.json` (39 rulings) and the reviewer's table `docs/review/app-copy-gemini.md` | JSON, Markdown | Copy editor | drives the sheet's statuses | offline |
| 67 | Session hints and errors written inline:<br>• the daily-limit card line<br>• mic declined / refused<br>• the access-code error<br>• rotate / background / "සාරා කතා කරනවා…" hints<br>• the proxy's and the daily limit's refusal messages | **hard-coded** · `useLessonRuntime.ts:1551, 1981, 1990, 2344, 2575, 2582`; `app/src/proxy.ts:123`; `app/src/lib/rateLimit.ts:79` | strings | Copy editor | **No**: outside the sheet and its tests | build |
| 68 | Session-screen labels written inline:<br>• strip controls<br>• the mic-permission sheet (differs from `edge.mic.*`)<br>• chat-panel labels<br>• the access gate (duplicates `gate.*`)<br>• progress-strip names | **hard-coded** · `app/src/components/SessionShell.tsx` (137-388), `LessonScreen.tsx:428-433`, `ProgressStrip.tsx:20,46` | strings | Copy editor | **No** | build |
| 69 | Board labels: rod and place names, "පබළු", money, digit picker, "හරි ✓", "👆 ඔබන්න", "↺ ආයෙත් උත්සාහ කරන්න" | **hard-coded** · `app/src/components/board/` (`tokens.ts:57-59`, `PlaceValueStrip.tsx:26`, `Abacus.tsx:289`, `Money.tsx:57-69`, `DigitPicker.tsx:104,191`, `BoardStage.tsx:380-406`) | strings | Teacher + Copy editor | **Partly**: visual checks only (`board:check`, `design:check`) | build |
| 70 | The certificate's sentence | **hard-coded** · `app/src/components/app/screens/Certificate.tsx:29` (duplicates `cert.body`, which is never used) | string | Copy editor | **No** | build |
| 71 | App name, tagline, install text | **hard-coded** · `APP_NAME_SI`, `APP_NAME_EN` (`appCopy.ts:29-30`); `app/src/app/manifest.ts:13-26` and `app/src/app/layout.tsx:21-34` (the description repeats `splash.tagline`) | strings | Copy editor (text) + Developer (colours, icons) | **Partly**: `design:check` PWA checks | build |

## 11. Catalogues

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 72 | Lesson names | **hard-coded** · `lesson.1`–`lesson.6` in `COPY` → `LESSON_NAMES` (6). The lesson list comes from `lesson_scripts` (Maths, grade 5), drawn on 6 fixed map slots. | list | Teacher + Copy editor | **Partly**: the copy tests | build (names), database (which lessons exist) |
| 73 | Avatars | **hard-coded** · `avatar.1`–`avatar.8` → `AVATARS` (8). Stored on the child **by display text** (`children.avatar`, checked by `AVATARS.includes` in `app/src/app/api/onboarding/profile/route.ts:17`). | list | Copy editor (names) + Developer (stable ids first) | **Partly**: renaming one breaks existing children | build |
| 74 | Stickers / badges | **hard-coded** · `rewards.sticker.1`–`8` → `STICKERS` (8); the Nth mastered concept earns sticker N; `STICKER_SLOTS` 12 (`appCopy.ts:392`, and again in `Home.tsx:117`) | list | Copy editor + Admin (slots) | **No** | build |
| 75 | Outfits for Lena | **hard-coded** · `OUTFITS`, `appCopy.ts:387-391` (3: name + hat colour); one unlocks per 3 stickers (`appData.ts:449` and `OutfitsGrid.tsx:19`); the art isn't made yet | list | Copy editor + Developer (colours) | **No** | build |
| 76 | Certificate parts: title, labels, date format, the placeholder seal | **hard-coded** · `cert.*` (11 keys); seal SVG `Certificate.tsx:41-43`; long month name only for September | strings | Copy editor + Developer (seal) | **Partly**: the copy tests | build |
| 77 | Weekday letters and month names | **hard-coded** · `report.day.1`–`7`, `month.names` (12) | strings | Copy editor | **Yes**: `appCopy.test` (12 months, January first) | build |
| 78 | Subjects and which are locked: Maths opens; Sinhala is shown but not linked; a third tile is 🔒 "ළඟදීම"; Tamil "soon" on the splash | **hard-coded** · `app/src/components/app/screens/Home.tsx:102-110`, `splash.tamilSoon`. The subjects RPC (`available_syllabus_subjects()`) feeds only the chat. | layout + strings | Admin | **No** | build |
| 79 | Practice hub: rows (runtime: concepts worked on with verified items); "3 minutes" (three places); past papers and challenge locked | computed in `appData.ts:420-436`; **hard-coded** · `practice.*`, `Home.tsx:92`, `PracticeHub.tsx:43-48` | rows + strings | Admin + Teacher | **No** | database (rows), build (the rest) |
| 80 | Home's "today" goal and badge count | **hard-coded** · `Home.tsx:92, 117` | numbers | Admin | **No** | build |
| 81 | Quiz column labels: the textbook's own headings, kept on purpose | **hard-coded** · `quiz.col*` (5) in `COPY`, mapped at `QuizClient.tsx:100` | strings | Teacher | **Partly**: the copy tests; the lesson names the term (beat `placeValue4Digit:102t`) | build |

## 12. Settings and product rules

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 82 | Daily lesson limit: the choices (15 / 20 / 30 min) and the default (30) | **hard-coded** in seven places:<br>• `app/src/lib/childStore.ts:20, 35, 46`<br>• the settings route `app/src/app/api/parent/settings/route.ts:14`<br>• `ParentClients.tsx:44`<br>• `parent.row.limitSub`<br>• fallbacks at `useLessonRuntime.ts:419, 2334` | numbers | Admin | **Yes**: the route's whitelist, `normaliseSettings`, the type | build |
| 83 | A child's daily limit and chat minutes (the values) | **table** · `children.settings` JSON (fallback: the `child-extras` bucket) | JSON | Parent, in the parent zone. **The one thing editable today.** | **Yes**: the same whitelist | database |
| 84 | Chat budget: the choices (15 / 30 / 60 min a day), the default (30), a chat's cap (10 min) | **hard-coded** · `app/src/lib/chatBudgetRules.ts:26-38` (the choices repeat in `isChatMinutes` and `ParentClients.tsx:55-56`); the day's use in **table** · `api_rate_limits` | numbers | Admin (choices, default, cap) + Developer (charge rules) | **Yes**: `chatBudgetRules.test` (not in CI), `isChatMinutes`, the session-check chat drills | build (rules), database (use) |
| 85 | Time warnings before a limit (5 min, 1 min) | **hard-coded** · `app/src/lib/timeWarnings.ts:26-28` | numbers | Admin | **Yes**: `timeWarnings.test` (not in CI), session-check drills | build |
| 86 | Pricing tiers: one child රු. 1,000 and two children රු. 1,600 a month; first week free; PayHere; the SMS two days before the trial ends | **hard-coded** · copy only: `onb.4.*` (15 keys) and `sub.*` (8). **No billing behind it.** PayHere, the reminder SMS and plans are not built. | strings | Admin (with the owner and a legal review) | **Partly**: the copy tests; nothing checks that the copy matches a real price | build |
| 87 | Onboarding rules: OTP resend after 30 s and valid for 10 min, a 4-digit PIN, grades 4–5 only, the privacy-policy link (today "#") | **hard-coded** · `OnboardingClient.tsx:13`, `app/src/lib/sms.ts`, `childStore.ts:108`, `onboarding/profile/route.ts:16`, `Onboarding.tsx:192` | numbers, URL | Admin (grades, privacy URL) + Developer (OTP, PIN) | **No** | build |
| 88 | Ladder timings: a nudge after 12 s and the answer shown at 25 s on a touch question; the voice ladder at 8 / 12 / 10 s; soft-check pauses; read-aloud pause; the chat's 20 s quiet close and 30 s finish grace | **hard-coded** · `lessonOrchestrator.ts:278-310`, `app/src/hooks/useLiveChat.ts:58-84` | numbers | Teacher (to review). **Stays code**; see section 15 | **Yes**: `lessonOrchestrator.test` (CI), session-check drills | build |
| 89 | Finishing a sitting at the limit: a sitting with under 3 minutes left is finished; the limit never cuts an exercise | **hard-coded** · `useLessonRuntime.ts:2187-2218` | rule | Teacher (to review). **Stays code.** | **Yes**: the session-check close drill | build |

## 13. Environment variables (admin, on Vercel)

38 variables in all: 28 read by the app, 10 read only by scripts. A change needs a redeploy.

| # | Group | Variables | Editor | Notes |
|---|---|---|---|---|
| 90 | Access and secrets | `ACCESS_CODE`, `SESSION_SECRET`, `PORTAL_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` | Admin | `SESSION_SECRET` also salts PIN hashes and OTPs: rotating it logs everyone out and resets PINs |
| 91 | Models | `GEMINI_LIVE_MODEL`, `GEMINI_HEAR_MODEL`, `GEMINI_TEXT_MODEL`; scripts: `GEMINI_AUTHOR_MODEL`, `GEMINI_DESIGN_MODEL` | Admin + Developer | the live model is not part of a clip's key, so changing it mixes voices silently |
| 92 | Voice | `ZARA_VOICE` (default Aoede), `VOICE_PROFILE` (`ai` or `human`) | Admin (owner decides) | changing `ZARA_VOICE` orphans every clip, the actor's included |
| 93 | Paid-call switches, all off unless `on` | `CLIP_RENDER`, `VOICE_ASSESSMENT`, `INTEREST_EXTRACT`, `SYLLABUS_SEARCH`, `PORTAL_TRANSCRIBE` (`app/src/lib/paidCalls.ts`) | Admin | each one spends money |
| 94 | Contact and providers | `NEXT_PUBLIC_WHATSAPP_NUMBER` (inlined at build; unset shows ළඟදීම), `SMS_PROVIDER` (the real providers are not wired yet) | Admin | |
| 95 | Development, build, tools | `DEV_MODE`, `DEV_CHILD_ID`, `DEV_ONBOARDING`, `HARNESS_TOKEN`, `FFMPEG_PATH`, `BUILD_SHA`, `BUILD_TIME` (+ `SS_BUILD_*` fallbacks), `NODE_ENV` | Developer / CI | never set `DEV_*` in production |
| 96 | Script-only | `CONTENT_ROOT`, `LESSON_PLAN_OUT_DIR`, `LESSON_VIDEOS_CONFIG`, `TEACHING_TRANSCRIPT`, `TEACHING_STYLE_OUT`, `STYLE_MAX_CHARS_PER_BATCH`, `CDP_TIMEOUT_MS`, `VERIFY_ACCESS_CODE` | Developer | |

`docs/HANDBOOK.md` lists most of them. It omits `GEMINI_HEAR_MODEL`, `GEMINI_TEXT_MODEL`, `GEMINI_DESIGN_MODEL`,
`SMS_PROVIDER`, `VOICE_PROFILE` and `FFMPEG_PATH`.

## 14. The ✋ chat's instructions

| # | Item | Lives in today | Shape | Editor | Validators before live | Reaches the app |
|---|---|---|---|---|---|---|
| 97 | The chat's system prompt: rules, register, what it may not do; includes the style guide (#28). A lesson-1 test section is marked temporary. | **hard-coded** · `app/src/lib/prompt.ts` | long strings | Developer (owner reviews) | **Yes**:<br>• `chatContext.test` checks the rule headings are present (not in CI)<br>• `npm run chat:check -- --offline` | build |
| 98 | Chat context: the teaching instructions and the board described in Sinhala | **hard-coded** · `app/src/lib/chatContext.ts:100-338` | strings | Developer (owner reviews) | **Yes**: `chatContext.test` | build |
| 99 | The chat's opening instruction (English, two variants) | **hard-coded** · `app/src/hooks/useLiveChat.ts` (the `sendTextInput` opener) | strings | Developer (owner reviews) | **No** | build |
| 100 | Unused opener data: 9 opening lines, 13 Poya days of 2026, 3 school holiday ranges | **hard-coded** · `app/src/app/api/opener/route.ts:30-51`. Nothing calls this route. | lists | Admin (if the route is revived) | **No** | unused |

---

## 15. What stays code, and why

These are logic, contracts or safety limits. Their *numbers* may one day become settings, but the rules themselves
belong with a developer and their tests.

1. **Clip identity:** the clip key (a hash of the words and the voice), the storage paths and versions (`a2`, `h1`),
   and the clip metadata shape (`app/src/lib/audioCache.ts`, `app/src/lib/humanClips.ts`). They are the audio
   cache's contract: change one and every recording is lost. A text edit must therefore go through a
   record-or-render workflow, never a free-text field that silently orphans the audio.
2. **Number grammar:** `sinhalaNumberName`, `renderNumberMarkers`, and the frame splitting. These are deterministic
   and tested in CI. A native speaker reviews the word tables (#52), and a developer changes them.
3. **Answer handling:** answer modes, teaching-mode assignment, answer predicates, the distractor generators,
   `validateChoices`, the phrase judge, the read-back rule. They are rules; only their word lists and thresholds are
   content.
4. **Packing:** the session assembler, exercise units that are never split, the beat-length estimate, the content
   fingerprint and `SCRIPT_FORMAT_VERSION`. The budgets (#42) can become settings; the algorithm stays.
5. **The lesson's behaviour in real time:** the ladder timings (#88), the soft-check windows, "finish a sitting with
   under 3 minutes left" (#89), never cutting an exercise, the time-warning rule, and pause and navigation. These
   were tuned on device walks and are pinned by tests and the `session:check` drills.
6. **The checkers themselves:** the speech-rule functions, the author guards, the distance thresholds (0.35 / 0.88),
   every dry-run assertion, the storyboard planner, the board's event vocabulary and timings, and
   `announcesTutorTurn`. Their *word lists* (#46-#50) can move out; the checks stay.
7. **How review rounds are applied** (`apply-review-edits`): its fixed round order and merge rules. It should become
   generic edit operations (rewrite / insert / remove / rubric per beat), so that a new round no longer needs code
   (#10).
8. **Safety and money limits:** the per-IP rate limit (60 a minute), the hearing and rendering budgets, the chat's
   charging rules (15 s minimum, 5 s slack), the paid-call switches' behaviour, failing open, and token lifetimes.
9. **Auth and crypto:** PIN hashing (PBKDF2, 100 000 rounds), OTP signing, cookie names and lifetimes.
10. **Structural keys and policies:** copy keys and the `screen` field (#64), the list of screens where English is
    allowed and the four English words a child may see, concept tags, the map's six slots and geometry, and the
    shape of `children.settings`.
11. **Model plumbing:** the chat's tool declarations, context limits and sanitising.
12. **Audio processing:** the ffmpeg chain, −16 LUFS, the sentence-gap detection, the speech rate and pauses, and
    the recorder's thresholds.
13. **Design fixtures:** `app/src/lib/appFixtures.ts` (15 fixtures), `app/src/lib/designFrames.ts` (about 31
    frames) and `app/src/lib/appRoutes.ts`. They are QA data that must match the design export, and never reach a
    real screen.

## 16. Gaps found while taking the inventory

Marked ✔ where I re-checked the code for this document; the others come from reading the code, with the line
cited.

**Content and review**

- ✔ `approved` on the script is not a human sign-off. It means "zero speech-rule hits"
  (`apply-review-edits.ts:868`).
- ✔ The script cache's fingerprint covers only a content-bank row's id and type (`buildLessonScript.ts`
  `fingerprintRows`). Editing a row's props, answer or spoken transcript in place, or any packing number, reaches
  children only after a forced rebuild.
- The storyboard is a build import while the script is read at runtime, so any wording change needs
  `npm run storyboard` and a rebuild. The dry run asserts the two agree.
- An accepted voice-actor re-wording (#12) bypasses every wording check, and the dry run does not apply it.
- Content-bank ids are copied into code (`ITEM_TITLES`, the storyboard's `KNOWN_ITEMS`, the dry run) and into the
  design and script files. `populate-content-bank --replace` makes new ids and clears `verified`, which breaks them
  all.
- ✔ The concept descriptions are keyed by old tags (#23), so the design concepts' descriptions are empty.
- The vocabulary order is defined twice: the TS map (#19) and the design file (#16).
- ✔ The blueprint override (#45) is read but no file exists.
- Everything is wired to one lesson, `maths-5-1`: the applier, the storyboard, the dry run, the portal, the actor
  store, and the Maths/grade-5 lesson list.
- There is no admin screen for content. Verifying a content-bank row is a SQL update.

**Copy**

- On-screen Sinhala outside the copy table (#67-#70) escapes the review sheet and its tests. Several items
  duplicate a sheet string:
  - the access gate duplicates `gate.*`;
  - the wrong-code error duplicates `parent.pinWrong`;
  - the certificate sentence duplicates `cert.body`;
  - the mic sheet duplicates `edge.mic.*`.
- ✔ 16 copy keys are never rendered: `brand.zara`, `brand.abacus`, `common.back`, `cert.body`,
  `progress.concept.1`–`11`, `parent.row.chatLimitSub`.
- Values that can drift because they are written in several places:
  - daily-limit choices: 7 places;
  - chat choices: 3 places;
  - the 85 % mastery mark: 3 places;
  - "3 minutes" of practice: 3 places;
  - the tagline: 3 places;
  - the sticker total: 2 places;
  - the outfit rule: 2 places.
- Avatars are stored by their display text (#73), so renaming one breaks existing children.
- Two harnesses embed copy text: `session-check.ts` (`chat.outOfTime`) and `design-check.ts`
  (`edge.offline.title`). A CMS edit to those strings fails them.
- Stale documentation:
  - `docs/HANDBOOK.md` says 233 strings await sign-off and 16 are missing (now 3 drafted, 0 missing);
  - `app/src/lib/appRoutes.ts` says only two months have names (now 12);
  - the schema comment on `children.settings` omits `chatMinutes`.
- ✔ Most content tests are not in CI (see "How to read the tables").

**Audio**

- Recording status is computed three ways that disagree (#63).
- About 25 runtime lines cannot be recorded in the portal at all, because it lists only lines found in the script.
  Among them:
  - the mic ask, the touch nudge, the four time warnings and the daily-limit close;
  - "concept done", the tutor-turn frame, the check-in, and the second feedback variants;
  - wait, offer help, the soft acknowledgement, and the session start and close.
- ✔ A re-worded line loses its recording. The portal stores the take under the *original* text's clip key while
  saving the re-worded text (`app/src/app/portal/page.tsx:115-116`); the child hears the re-wording, whose key is
  different.
- ✔ Saving a note resets a line's status to `note_only` (`app/src/app/api/portal/note/route.ts:23`), which cancels
  an accepted re-wording.
- ✔ The actor's clips are processed at 48 kHz (`app/src/lib/actorAudio.ts:37`), but the number splicer stamps its
  result 24 kHz (`app/src/lib/composeNumberAudio.ts`). Human number words would play at the wrong speed once
  `VOICE_PROFILE=human`.
- One clip can sit behind many portal rows: 43 "if right" rows share one clip, and 17 beats share the "your turn"
  line. The last take wins, and deleting any one of those rows deletes it for all.
- No one approves a take before children hear it (#60).

---

## Counts

**Inventory (sections 1-14): 100 items.** Counted from the tables above.

| Editor (owner) | Items |
|---|---|
| Copy editor | 35 |
| Teacher | 29 |
| Admin | 21 |
| Developer | 6 |
| Generated (not edited by hand) | 6 |
| Voice actor | 2 |
| Parent (in the app) | 1 |

| Lives in today | Items |
|---|---|
| hard-coded | 60 |
| file | 21 |
| table | 7 |
| env | 7 groups (38 variables) |
| computed (the portal's line list, the status views, the practice rows) | 3 |
| storage | 2 |

| Must pass validators before live | Items |
|---|---|
| Yes | 39 |
| Partly | 17 |
| No | 30 |
| n/a (generated items, reports, environment variables) | 14 |

**Stays code (section 15):** 13 groups. **Gaps (section 16):** 24, of which 9 were re-checked for this document.

**The data itself:**

| | Count |
|---|---|
| Lessons written | 1 (Maths, grade 5, lesson 1 — session 1) |
| Script beats | 167 (43 questions) |
| Storyboard events | 363 |
| Correction sections | 26 |
| Design concepts | 8 (2 authored, 6 from transcripts) |
| Copy strings | 296 (179 child-facing, 117 parent-facing; 3 drafted, 0 missing) |
| Fixed spoken lines | 35 in `AUTHORED_LINES` + 8 re-teach + 5 number frames + 77 number words |
| Lines to record in the portal | about 343 rows, about 230 distinct clips |
| Supabase tables | 13 |
| Storage buckets | 3 (`lesson-audio`, `textbook-images`, `child-extras`) |
| Environment variables | 38 |
