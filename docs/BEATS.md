# Beats — the unit of a lesson

A lesson script is a flat, ordered list of **beats**. One beat = one board
action by the app + one turn of the voice model's speech, directed by a
`[DIRECTOR]` line with an explicit sentence budget. The orchestrator
(`app/src/lib/lessonOrchestrator.ts`) walks the list; the model never
chooses what comes next.

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
| `CHAT_OPENER` | 150s | chat | free everyday talk to open a sitting |
| `LESSON_GOALS` | 60s | none | first sitting only — what this lesson is, from the video's own opening |
| `RECAP` | 120s | none | later sittings — placeholder the runtime expands into review ASKs (weakest mastery first, from `child_progress`) |
| `HOOK` | 30s | acknowledge | the teacher's everyday example before a concept's first EXPLAIN (only where her data has one) |
| `EXPLAIN` | 25s | none | one teachingSequence entry, in her order |
| `SHOW_BOARD` | 15s | none | stage a content_bank item |
| `REVEAL_PART` | 15s | none | tutor works one part (cell fill or verbal step) |
| `ASK` | 40s | judge | child answers; planner decides advance/reteach/another_example/simplify |
| `WAIT` | 10s | acknowledge | runtime-inserted check-in after 8s silence — never repeats the question |
| `CONFIRM` | 15s | acknowledge | runtime-inserted "ඔයා කිව්වේ 2311 නේද?" when the planner flags a doubtful number hearing — never judged wrong unconfirmed |
| `RETEACH` | 30s | none | runtime-inserted after repeated misses: re-explains ONLY the missed sub-skill, from an explanation angle not yet used this session, followed by a fresh MODE 1 demo of a different item, then the missed item retries. Never rewinds before the concept's first practice item |
| `FEEDBACK` | 10s | none | runtime-inserted reaction to a judged answer |
| `CHECKPOINT` | 60s | acknowledge | "still with me?" between items |
| `BREAK_CHAT` | 120s | chat | mid-sitting breather after ~12 min of teaching |
| `TRANSITION` | 15s | none | one-sentence wrap of a concept |
| `CLOSE_SESSION` | 45s | none | warm close: one specific thing done well + next-time preview |

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
minutes, each framed `CHAT_OPENER → (LESSON_GOALS | RECAP) → work →
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
