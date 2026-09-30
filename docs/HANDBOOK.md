# Serendib Scholar — handbook

_Read this first. Last reviewed: 23 Sep 2026. Paths are relative to the repo
root; the app lives in `app/`._

## 1. What this is

Serendib Scholar is a phone web app that tutors a Sri Lankan Grade 5 child
for the Scholarship Exam in spoken Sinhala. A teacher character, Zara, talks
through a lesson while a whiteboard on screen moves in step with her words.
The child answers by tapping the board, and the phone judges the answer
itself. Every word Zara says is written, reviewed and recorded before a
child hears it, so no AI invents the lesson while it runs. The only live AI
feature is the ✋ chat, where the child can ask Zara a question out loud.

## 2. How it is built

There are four layers, and each one relies only on the layers below it.

**Engine.** Runs a lesson, judges answers and tracks mastery (which concepts
the child has shown they know).
- `app/src/lib/lessonOrchestrator.ts` decides the next **beat** (one spoken
  line plus one board action), how many tries a question gets, and when a
  concept is mastered.
- `app/src/hooks/useLessonRuntime.ts` and `directorRuntime.ts` play the
  audio, time the board and log each sitting.
- `answerCheck.ts` judges answers on the phone.
- `buildLessonScript.ts` packs a lesson into sessions.
- `paidCalls.ts` blocks every paid AI call except the ✋ chat.
- Background: [BEATS.md](BEATS.md).

**Board primitives.** These are the whiteboard's building blocks, such as
the abacus, number cards, chalk text, tables, the pointer and answer chips.
Each has its own file in `app/src/components/board/`. `choreography.ts` turns
storyboard events into what the board shows, and `layout.ts` makes sure
nothing overlaps. To add a primitive, see
[app/docs/BOARD.md](../app/docs/BOARD.md).

**Content as data.** A lesson is data files, not code.
- The **content bank** is a database table of textbook items. A person must
  mark each one `verified` before it is used.
- The **script** (`app/src/data/lessons/authored/maths-5-1.json`) holds
  Zara's words.
- The **storyboard** (`app/src/data/storyboard/`) says what the board does
  on each sentence.

**Design system.** `app/src/app/tokens.css` holds the tokens (named colours,
sizes and fonts that every screen reuses). The screens are in
`app/src/components/app/`. Both follow the designer's handoff in
`docs/design/export/handoff/`, and that handoff's `DESIGN.md` is the
rulebook.

## 3. How a lesson is made

1. **Sources.** Three sources are kept separate:
   - the MOE teacher's guide (Ministry of Education), which says *what* to
     teach ([transcribed](design/maths-5-1-teacher-guide.md));
   - the textbook, which says *what the child sees* (loaded with
     `npm run populate:content-bank`);
   - a recorded lesson by a human teacher, used only for *how* to teach.
     Its style is described, never quoted.
2. **Design extraction.** `npm run extract:design` writes
   `docs/design/maths-5-1.json`, plus a denylist of the example numbers the
   recorded teacher made up herself.
3. **AI drafting.** `npm run author:script` drafts Zara's lines from that
   file and the [style card](design/style-card.md).
4. **Validators.** `authorGuards.ts`, `scriptDistance.ts` and
   `speechRules.ts` check every line automatically, and any line that fails
   is drafted again. The checks:
   - number words come only from the Sinhala number generator;
   - no denylisted numbers are used;
   - no sentence is over 14 words;
   - no term is used before it has been introduced;
   - no sentence is close to the recorded teacher's wording.
5. **Native-speaker review rounds.** Each round's corrections are saved in
   its own file in `docs/review/`. `npm run apply:review-edits` applies them
   without calling any AI.
6. **Storyboard.** `npm run storyboard` works out the board, sentence by
   sentence, without AI. Where the words and the picture don't fit, it
   raises [script notes](storyboard/script-notes.md).
7. **Recording portal.** The voice actor records each line at `/portal`
   ([RECORDING.md](RECORDING.md)).
   - `npm run portal:process` cleans the recordings on a laptop, because
     Vercel lacks ffmpeg, the audio tool it needs.
   - `npm run portal:coverage` lists the lines still to record.
   - Until a line is recorded, it plays as an AI-rendered clip.
8. **Approval gate.** Nothing reaches a child until the script file says
   `"approved": true` and its content-bank rows are `verified`.
9. **Qualified teacher's sign-off.** *Not in place yet.* It belongs between
   steps 6 and 8. A Grade 5 teacher should check the final script and
   storyboard against the guide. Their corrections go in as one more
   review round, and approval waits for their signature.

## 4. How to run it locally

You need Node 20 and the Vercel CLI (Vercel's command-line tool).

```bash
git clone https://github.com/sahan-ranasinghe/serendib-scholar.git
cd serendib-scholar/app
npm install
vercel link                 # once; pick the serendib-scholar project
vercel env pull .env.local  # copies the settings down; git ignores this file
npm run dev                 # http://localhost:3000
```

Environment variables are named settings the app reads when it starts.
Names only:

| Group | Variables |
|---|---|
| Required | `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ACCESS_CODE`, `SESSION_SECRET`, `PORTAL_PASSWORD` |
| Optional | `ZARA_VOICE`, `GEMINI_LIVE_MODEL`, `GEMINI_AUTHOR_MODEL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `HARNESS_TOKEN` |
| Development only | `DEV_MODE`, `DEV_CHILD_ID`, `DEV_ONBOARDING` |
| Paid-call switches (off unless set to `on`) | `CLIP_RENDER`, `VOICE_ASSESSMENT`, `INTEREST_EXTRACT`, `SYLLABUS_SEARCH`, `PORTAL_TRANSCRIBE` |

## 5. How to make a change safely

**Branches.** Branch from `master` and open a pull request. CI (GitHub
Actions: automatic checks, set up in `.github/workflows/ci.yml`) runs on
every push, and you merge only when it passes. So far most work has gone
straight to `master`.

**Checks.** The browser checks need a production build, never
`npm run dev`, and must run one at a time. Unset `DEV_CHILD_ID` first:

```bash
rm -rf .next && npx next build > build.log
CLIP_RENDER=off DEV_ONBOARDING=stub DEV_MODE=on npx next start -p 3001
```

| Check | What it catches |
|---|---|
| typecheck, lint, unit tests (in CI) | Code errors and broken logic |
| `npm run dry-run:lesson` (in CI) | A broken lesson plan, found by walking it offline with a pretend child |
| Coverage ledger (part of the dry run, in CI) | A textbook exercise blank that is never asked, shown or deferred |
| `npm run session:check -- <url>` | A full lesson on a headless phone: stalls, overlaps, pause/restart/stop (`--drills`), answers judged before they appear, and any money spent |
| `npm run board:check` | Mis-drawn primitives or strokes. `--only=overlap` checks every beat (about 10 min) |
| `npm run design:check` | Drift from the design export (pixel comparison), DESIGN.md rules, and install/offline behaviour |
| `npm run crawl:check` (in CI) | A button anywhere that does nothing |
| `npm run latency:check` | A tap that takes over 100 ms to respond, or a screen over 500 ms to appear, on a throttled phone (run alone) |
| `npm run audio:check -- <url>` | Two clips playing at once: ⏸ → ⏮ (once or five times) → ▶, forty times on Slow 3G and 4× CPU, measured from the browser's own audio API, not the app's (run alone, about 25 min) |
| `npm run build:check` | A phone stuck on an old version after a deploy |

Without the Supabase secrets, CI skips the dry run and the crawl with a
warning. Don't run `chat:check` (without `--offline`), `chat:live-check`,
`simulate:lesson --model` or `render:audio` unless you mean to spend money.
[qa/session1-triage.md](qa/session1-triage.md) explains why each check
exists.

**Deploy.** Vercel deploys from GitHub: `master` goes to production and
other branches get preview links (confirm this in the Vercel project
settings). You can also deploy by hand with `vercel --prod` from `app/`.

**Build stamp.** Every build records its git commit and build time, with
`+dirty` if it included uncommitted changes. The stamp appears on the splash
footer, in the debug overlay and at `/api/build`. A phone running an older
build than the server shows an update banner.

## 6. Accounts and services

| Service | Role | Env vars | Cost |
|---|---|---|---|
| GitHub | Code and CI | CI secrets: the Supabase vars, `ACCESS_CODE`, `PORTAL_PASSWORD` | Free at this size |
| Vercel | Hosting | Stores the production values; `BUILD_SHA` and `BUILD_TIME` optional | Hobby plan is free but not for commercial use; Pro is about US$20 per member per month |
| Supabase | Database and private audio storage | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Free tier pauses when idle; Pro is about US$25 per month |
| Google AI Studio | Gemini: ✋ chat, drafting, voice, PDF reading | `GEMINI_API_KEY`, `GEMINI_*_MODEL`, `ZARA_VOICE` | Charged per use |

Gemini is the only cost that grows with usage:
- Playing a lesson costs nothing.
- The ✋ chat costs roughly cents per minute and is capped per child per day
  at 30 minutes by default (the parent zone offers 15, 30 or 60). It is
  charged by the connected second: at least 15 seconds and at most 10
  minutes per opening (`src/lib/chatBudgetRules.ts`). Zara warns five
  minutes and one minute before a chat has to close, then finishes her
  sentence and closes it; the lesson's daily limit warns the same way
  (`src/lib/timeWarnings.ts`).
- One-off jobs are small. Reading a 40-page PDF costs about US$0.14, and
  drafting or rendering a session costs a few dollars.

These prices are list prices and estimates. Check each dashboard for the
actual plan and spend. Spending caps are described in
[SECURITY.md](SECURITY.md).

## 7. Current state and known gaps

**What works.** Grade 5 Maths, Lesson 1 (Numbers), Session 1 runs from
start to finish on a real phone, with a script reviewed twice, a storyboard
and rendered voice. The app screens, parent zone, progress, rewards and
install-as-app all work. On 20 Sep these checks passed:
- session: 22 of 22 drills, no overlaps, no money spent;
- crawl: 134 controls, none dead;
- latency.

**Known gaps:**
- **Content.** One fully built session exists, out of about 35 lessons.
  Lesson 1's later sessions lack storyboards. Other subjects and languages
  are locked.
- **Review.** No qualified teacher has reviewed anything. So far the only
  reviews are the owner's (as a native speaker) and an AI second pass.
- **Voice.** Zara's voice is AI-rendered. `portal:coverage` shows how much
  the actor has recorded — distinct lines the lesson can speak, recorded and
  approved; only takes approved on `/portal/status` reach a child.
- **Accounts and payments.** There is one shared access code and no parent
  logins. The phone code check (OTP) and PayHere billing are stand-ins. The
  privacy-policy link is empty.
- **Art and copy.** Art slots are placeholders
  ([art-needed.md](design/art-needed.md)). Of the 357 app strings, 79
  await a native sign-off (76 moved into the sheet from the code with their
  words unchanged, 3 drafted) and none are missing
  ([app-copy.md](review/app-copy.md)).
- **Script.** Two script notes are still open.
- **Checks.** CI runs every unit test file, the lesson dry run and one
  browser check; the other browser checks are run by hand.
- **Unconfirmed in production.** Rate limits only work once the
  `api_rate_limits` table exists, and branch protection on `master` hasn't
  been confirmed. Check both.
- **Out-of-date files.** `app/README.md` and `app/.env.example` describe the
  first, always-live prototype.
- **Rights.** The rights to the recorded teacher's lesson are not recorded
  anywhere in the repo.

## 8. Index of docs/

- [BEATS.md](BEATS.md): beat types, the building blocks of a lesson.
- [RECORDING.md](RECORDING.md): the voice actor's guide.
- [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md): the security
  setup, and what is stored about a child.
- [../app/docs/BOARD.md](../app/docs/BOARD.md): how to add a board primitive.
- `PROJECT-PLAN.docx`: the August 2026 business and technical plan (its
  architecture is out of date).
- [design/serendib-scholar-design-brief.md](design/serendib-scholar-design-brief.md):
  the brief given to the designer.
- `design/export/`: the designer's handoff (start with its `README.md` and
  `DESIGN.md`). `design/reference/` holds about 110 frame images.
- [design/board-vocabulary.md](design/board-vocabulary.md): the only terms a
  storyboard may use.
- [design/style-card.md](design/style-card.md): how Zara speaks.
- [design/maths-5-1-teacher-guide.md](design/maths-5-1-teacher-guide.md): the
  MOE guide for Lesson 1, transcribed.
- `design/maths-5-1.json`: the extracted lesson design (the `.checkpoint`
  file lets a run resume).
- [design/art-needed.md](design/art-needed.md): the illustrator's brief.
- [review/session-1-original.md](review/session-1-original.md): the drafted
  script with its review marks.
- `review/session-1-edits.*`, `gemini-review-decisions.json`,
  `session-1-corrections.json`: review rounds 1 to 4.
- [review/session-1-final-script.md](review/session-1-final-script.md): the
  final Session 1 script.
- [review/model-comparison.md](review/model-comparison.md): a blind
  comparison of drafting models.
- [review/app-copy.md](review/app-copy.md): every app string and its
  sign-off status.
- `storyboard/maths-5-1-session-1.{json,md}`: the board plan, sentence by
  sentence.
- [storyboard/script-notes.md](storyboard/script-notes.md) and
  `script-note-suggestions.json`: places where the words and the picture
  don't fit.
- [qa/session1-triage.md](qa/session1-triage.md): 25 phone-test issues and
  the checks that now guard them.
- `session1-audio-render.log`: output from the Session 1 voice render.
- `syllabus/`: the Grade 5 Maths textbook PDF. `teacher-guides/`,
  `past-papers/` and `original-content/` are empty drop folders for
  `npm run ingest:syllabus`. `_paused/` holds a Buddhism textbook set aside
  for later.
