# The board — adding a primitive for lesson 2

The board is a small design system (`src/components/board/`) driven by a
storyboard (`docs/storyboard/*.json`) through a pure reducer
(`src/lib/choreography.ts`). Lesson 2 will need things lesson 1 did not — a
number line, a hundred square, a balance. Each is one primitive, added in
the order below. Nothing ships until the gallery and the checks agree.

## 1. Say what it does — `docs/design/board-vocabulary.md`

Add the primitive to the vocabulary first: its props, its events, each
event's duration (≤ 600 ms), and what a target on it is called
(`{cell:…}`, `{tick:…}`). This is the contract everything else implements;
the storyboard generator refuses events that are not here.

## 2. Register the events — `src/components/board/events.ts`

- Add the event shapes to the `BoardEvent` union.
- Add the primitive to `VOCABULARY` and every event's ceiling to `DURATION_MS`.
- `IMPLEMENTED` is derived; mark an event `partial` with a note only if it
  is approximated.

`npm run board:coverage` now counts the storyboard's use of it.

## 3. Draw it — `src/components/board/<Name>.tsx`

Follow `Abacus.tsx` / `NumberCards.tsx`:

- A `"use client"` component whose props ARE the vocabulary's state
  (`digits`, `ringed`, `glowRod` …). Events are state changes the parent
  makes; a transient event (a fly, a pulse) is a `key`/nonce prop.
- Colours and springs from `theme.ts` only (`BOARD`, `SPRING`,
  `SPRING_BOUNCY`); Sinhala words through `WriteOn`, numbers through
  `HandNumber` (stroke-drawn glyphs; every number in a string registers as a
  `number:<n>` target on its own glyphs).
- Any stroke you animate with `pathLength` must be drawn in the SVG's own
  pixel space — never `viewBox` + `preserveAspectRatio="none"`. The stroke
  audit fails a non-uniform stroke.
- Register everything a line can point at with `useTargetRef(keys)`:
  the component root as `component:<name>` (and `text:<name>` if the
  storyboard says `{text:"<name>"}`), and each part under the vocabulary's
  key (`tick:3`, `cell:2/field`).
- Touch: every interactive target ≥ 48 px (`TOUCH_MIN`), pointer events
  via `useDrag` for drags, `onClick` for taps; no long-press, no double-tap.
  Interactive only when `interactive` is true — the runtime turns it on
  for the child's turn.
- Export it from `index.ts`.

## 4. Put it on the stage — `src/lib/choreography.ts`

- Add a `StageBase` variant for it.
- Add a `reduceStage` case per event: what changes, and where the pointer
  goes (`pointer` follows every event's target).
- If the old runtime has a `BoardContent` for it, map it in
  `stageFromLegacy` so both paths draw the same board.
- If the child can answer on it, teach `answerSurfaceFor` which target the
  feedback lands on, and `BoardStage.tsx` how a touch becomes an answer
  (`onAnswer(text)` — the same judge as voice).
- `serializeStage` (`src/lib/chatContext.ts`) should say it in Sinhala for
  the ✋ chat.

## 5. Show every state — `src/app/admin/board-gallery/Gallery.tsx`

A section per primitive: a button per event (with `data-event`), one
`data-action="animate-in"` button for the state to photograph, one
`data-action="reset"`. Then:

```
npm run board:check            # screenshots, touch, 48 px, stroke audit
```

Add a `STROKE_PROBES` entry (`scripts/lib/strokeAudit.ts`) for any chalk
stroke it draws.

## 6. Let the storyboard use it — `scripts/storyboard.ts`

Map the authored board intent (`src/lib/authoredScript.ts` →
`AuthoredBoardIntent`) to the primitive's events in `applyIntent`, keep the
board-state model in step (`emptyState`, `describe`), and add any rule the
line needs (which sentence, which target). Then:

```
npm run storyboard             # regenerates docs/storyboard + src/data/storyboard
npm run dry-run:lesson         # storyboard ↔ script, every event reduces, rods glow
npm run session:check          # a real run, every beat photographed
```

## A phone held sideways

The content area under the 28 px strip is about 290 px tall at 844×390 and
260 px at 800×360. `BoardStage` measures it (`COMPACT_BELOW_PX`, 340) and
passes `compact` to the primitives that have a compact form (the abacus,
the digit picker); a new primitive that stacks anything under itself (a
readout, the child's answer, a note) needs one too, or the session check
flags it `cut-off`. Rows a child cannot tap may be shorter than 48 px
(`BlankTable` keeps 48 px only on the row with a blank); no text under
16 px.

```
npm run session:check -- http://localhost:3001 --viewport=800x360 --scheme=dark
npm run session:check -- http://localhost:3001 --viewport=844x390 --drills --wrong=readWrite4Digit:8
```

The first photographs every beat at the smallest phone we ship for; the
second walks the four failure modes (a tap while she talks, a rotation, a
backgrounded tab, a clip that cannot be fetched) and the retry ladder on
one question. Run them against a production build — a dev server reloads
the page on every source edit.

## What the runtime does for you

- Events fire on the clip's sentence spans (`useLessonRuntime.speak`);
  a missing clip runs the choreography on estimated spans and shows the
  caption.
- Pause freezes events; ↺ replays from the beat's snapshot; ✋ hides the
  pointer and leaves the board.
- The child's turn: the primitive breathes, the pointer parks, the pad is
  the fallback; touch and voice meet in `judgeAnswer`.
- Feedback: `FeedbackFX` at the answered target; the character celebrates
  or encourages; the strip fills; a star lands on mastery.
