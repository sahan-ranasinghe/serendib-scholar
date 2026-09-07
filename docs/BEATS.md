# Beats — the unit of a lesson

A lesson script is a flat, ordered list of **beats**. One beat = one board
action by the app + one turn of the voice model's speech. Most beats carry
`spokenText` — the teacher's own cleaned verbatim Sinhala (or a short fixed
line) — and `next_beat()` returns `{ say }`: the model says exactly that,
nothing more. FEEDBACK returns `{ say_one_of: [a, b] }`. Only ASK, CONFIRM,
RECAP, RETEACH, CLOSE_SESSION and the chat beats remain free-form
`{ instruction }`. The orchestrator (`app/src/lib/lessonOrchestrator.ts`)
walks the list; the model never chooses what comes next — or, for spoken
beats, what to say.

Spoken text addresses the child through the `{address}` token (authored
lines and cleaned transcripts never hard-code පුතේ/දුවේ): resolved per
child at serve time from `children.gender` — boy → පුතේ, girl → දුවේ,
unspecified → the word is dropped and the sentence tidied. See
`app/src/lib/addressToken.ts` and `app/src/lib/authoredLines.ts` (the one
file holding every developer-authored line, printed by each dry run).

Turn-taking is natural (the API's voice-activity detection): the mic is
always captured but nothing is SENT while Zara's audio plays or for 400ms
after, so teaching beats can't be barged into; the two chat beats allow
barge-in; a parent mute stops sending entirely.

## The registry

Everything type-specific lives in **one entry per beat type** in
`app/src/lib/beatRegistry.ts`:

```ts
EXPLAIN: {
  estimateSeconds: 25,        // session packing & break placement
  onChildResponse: "none",    // what the runtime owes the child afterwards
  boardAction: (beat) => beat.board,   // what the app stages before speech
  buildDirectorText: null,    // null = the standard clause format
},
```

- **`estimateSeconds`** — rough planning estimate. Sessions are cut at
  ~20-25 estimated minutes and the mid-session `BREAK_CHAT` is placed after
  ~12 minutes of teaching, both summed from these.
- **`onChildResponse`** — `"judge"` (planner + feedback + mastery),
  `"chat"` (free conversation until the estimate is spent), `"acknowledge"`
  (a reply is invited but not judged), `"none"` (grace pause, continue).
- **`boardAction`** — what the app does to the board *before* the model
  speaks. Default: the action the script builder attached to the beat.
- **`buildDirectorText`** — override for types whose director line isn't
  the standard `Board shows / Goal / limit / end-by` shape (chat beats,
  `CLOSE_SESSION` with its per-sitting summary).

The orchestrator core, the session packer and the runtime all *look up*
this table — none of them switch on beat type. `advance()` counts mastery
wherever `onChildResponse === "judge"`, the packer sums `estimateSeconds`,
the runtime dispatches on the response mode.

## Current types

| type | est. | response | role |
|---|---|---|---|
| `SESSION_START` | 8s | none | ONE authored greeting line for a RETURNING sitting (the first sitting opens with her own recorded welcome instead) |
| `LESSON_GOALS` | 60s | none | first sitting only — her COMPLETE recorded opening (segment 0), ~11 beats |
| `RECAP` | 120s | none | later sittings — placeholder the runtime expands into review ASKs (weakest mastery first, from `child_progress`) |
| `HOOK` | 30s | acknowledge | the teacher's everyday example before a concept's first EXPLAIN (only where her data has one) |
| `EXPLAIN` | ~len/9s | none | 2-3 of her verbatim sentences (cleaned for one child) — `spokenText`, said exactly |
| `CHECK_IN` | 20s | acknowledge | her own question to the child, verbatim — she asks, waits, any answer advances |
| `SHOW_BOARD` | 15s | none | stage a content_bank item |
| `REVEAL_PART` | 15s | none | tutor works one part (cell fill or verbal step) |
| `ASK` | 40s | judge | child answers; planner decides advance/reteach/another_example/simplify |
| `WAIT` | 10s | acknowledge | runtime-inserted check-in after 8s silence — never repeats the question |
| `CONFIRM` | 15s | acknowledge | runtime-inserted "ඔයා කිව්වේ 2311 නේද?" when the planner flags a doubtful number hearing — never judged wrong unconfirmed |
| `RETEACH` | 30s | none | runtime-inserted after repeated misses: re-explains ONLY the missed sub-skill, from an explanation angle not yet used this session, followed by a fresh MODE 1 demo of a different item, then the missed item retries. Never rewinds before the concept's first practice item |
| `FEEDBACK` | 10s | none | runtime-inserted reaction to a judged answer |
| `CHECKPOINT` | 60s | acknowledge | "still with me?" between items |
| `BREAK_CHAT` | 60s | chat | mid-sitting OFFER ("පොඩි කතාවක් කරමුද?") — only a yes opens the live chat |
| `TRANSITION` | 15s | none | one-sentence wrap of a concept |
| `CLOSE_SESSION` | 45s | none | warm close (authored line) |
| `CHECK_MY_WORK` | 45s | judge | Zara works a problem with ONE deliberate plausible error; the child must find it (the guide's peer-check step, translated for one child) |

## How a beat is spoken and heard

Since the audio split, no model sits in the lesson loop:

* **Speaking** — every beat carries the words it says (`spokenText`, or
  `sayCandidates` for the two-way feedback lines). Those words are rendered
  once in the pinned voice, slowed to 0.88× with 1.2s between sentences
  (1.0s at a `…`), and stored as a clip keyed by the text itself
  (`src/lib/audioCache.ts`). The runtime plays the clip and lands board
  changes on sentence boundaries. `RETEACH` is the one type with no fixed
  words: its line is written at runtime and rendered on demand, then cached
  like any other.
* **Hearing** — at an `ASK`/`SOFT_CHECK` window the app records the child
  (1.5s of quiet ends it, 8s hard cap, or the ✓ on the answer pad) and
  posts the clip to `/api/hear`, which returns the transcript and any
  number in it. The planner judges that exactly as before.
* **Live** — a full-duplex voice session exists only for conversation the
  child asks for (the ✋ button, or accepting the `BREAK_CHAT` offer).

## Adding a type — worked example: `STORY`

Say a future lesson wants the tutor to tell a short curriculum story
before practice.

**1. Add the registry entry** (`app/src/lib/beatRegistry.ts`):

```ts
STORY: spec(90, "acknowledge", (beat) =>
  `[DIRECTOR] Tell the child this short story, in your own warm Sinhala, ` +
  `slowly: ${beat.goal} End by asking what they think happens next. Then stop.`,
),
```

**2. Build beats of that type** where your script builder decides one
belongs (`app/src/lib/lessonScriptBuilder.ts`):

```ts
beats.push({
  ...baseBeat(conceptTag, beats.length, "story"),
  type: "STORY",
  conceptTag,
  mode: null,
  itemId: null,
  segmentIndex: -1,
  goal: storyTextFromContentBank,   // real, verified content — never invented
  maxSentences: 6,
  boardDescription: "nothing (a listening moment)",
  board: { kind: "none" },
  endBy: "asking",
});
```

That's it. `BeatType` is derived from the registry's keys, so the compiler
walks you to any place that must know the new type (in practice: nothing —
estimates, response handling, board staging and director text all come from
your entry). The orchestrator core, session packer, runtime loop, session
log and dry run pick `STORY` up unchanged.

**What you must not do:** add a `switch (beat.type)` anywhere. If a new
type seems to need one, the behaviour belongs in the registry entry — add a
field to `BeatTypeSpec` instead so every type declares it.

## Sessions

`buildScriptFromRows` cuts the beat list into sittings of 20-25 estimated
minutes, each framed `SESSION_START → (LESSON_GOALS | RECAP) → work →
BREAK_CHAT → work → CLOSE_SESSION`, with boundaries stored on the script
(`script.sessions`). A concept may span sittings. A child counts as RETURNING
only when `session_log` holds a completed `CLOSE_SESSION` beat for them —
the runtime resumes at the beat after that close (the next sitting's
opener). Rows without a close (a crashed sitting, test traffic) never
trigger a resume or a recap; `npm run reset:child` wipes the dev child's
state entirely.

Preview any lesson offline with `npm run dry-run:lesson` (in `app/`) —
it prints the session plan, the per-concept blueprint (hand-editable via
`src/data/lessons/blueprints/<subject>-<grade>-<lesson>.json`), one
session's full beat list, and a simulated run.
