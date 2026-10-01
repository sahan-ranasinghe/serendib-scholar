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
- Colours, shadows and springs from `tokens.ts` only (`BOARD`, `SHADOW`,
  `SPRING`, `SPRING_BOUNCY`) — every value is a `var(--…)` from the design's
  `src/app/(app)/tokens.css`; nothing may resolve to a colour that is not a token.
  Sinhala words through `WriteOn` (Gemunu Libre 700, never under 28 px on
  the board), numbers through `HandNumber` (the design's StrokeNum glyphs,
  `HandGlyphs.ts`; every number in a string registers as a `number:<n>`
  target on its own glyphs). Copy the primitive's markup from
  `docs/design/export/handoff/…/components.dc.html` — don't reinterpret it.
- Any stroke you animate with `pathLength` must be drawn in the SVG's own
  pixel space — never `viewBox` + `preserveAspectRatio="none"`. The stroke
  audit fails a non-uniform stroke.
- Register everything a line can point at with `useTargetRef(keys)`:
  the component root as `component:<name>` (and `text:<name>` if the
  storyboard says `{text:"<name>"}`), and each part under the vocabulary's
  key (`tick:3`, `cell:2/field`).
- Touch: every interactive target ≥ 56 px (`TOUCH_MIN`), pointer events
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

## 5. Show every state — `src/app/(app)/admin/board-gallery/Gallery.tsx`

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

## The design is the look

The session screen and every primitive follow the Claude Design export in
`docs/design/export/handoff/design_handoff_serendib_scholar/` (README.md,
DESIGN.md rules 1–9 and a–h, `components.dc.html`, `Session*.dc.html`,
`Zara.dc.html`, `Lena.dc.html`, `StrokeNum.dc.html`, `Abacus.dc.html`).
The runtime decides what happens; the export decides how it looks.

- `src/app/(app)/tokens.css` is the export's file verbatim; `src/app/(app)/fonts.css`
  points its `--font-*` names at the `next/font` faces (Gemunu Libre,
  Abhaya Libre, Yaldevi; Inter for parent-zone English; Noto Sans Sinhala
  only as the fallback).
- The shell (`SessionShell.tsx`, `board.css`): strip 28 px teal with the
  title in Yaldevi 20, eight concept stops, ⏸ ↺ ⏹ (48×28 cells whose hit
  areas reach 56 px into the frame) and the සි caption toggle; wood frame
  10, tray 22, board `--color-board` with a 32 px grid; content inset
  L94 / R82 / T22 / B64 from the frame (B124 with chips, B190 with a
  docked pad or word bank — docked inputs render into the Whiteboard's
  `dock` and announce themselves with `noteDock`); chips and docks span
  L94 → R130; ✋ 56 px at R12 / B76; Zara 64 px at L10 / B6; Lena 48 px at
  R14 / B16; the retry note 56 px at R82 / T22; the caption in Gemunu 20
  at B26. The ✋ chat and the first-time mic explanation are sheets over
  the board dimmed to 38 % with Zara at 160 px.
- Rule (b), persistent board: the reducer keeps the abacus, a text card,
  the picker, the expansion and the tables while chalk is written beside
  them (`stage.notes`, a stack of three, older lines at 60 %); a title card
  or a card row gives way to a sum. Four cards drawn from the ten-card row
  lift out of it (`drawn`). Read-aloud practice is the three step cards
  (`stage.practice`).
- The abacus's number expanded ("5 421 = 5000 + …", "7000 + 0 + 60") is
  the expansion primitive beneath the persisting abacus: the storyboard
  generator turns such a text intent into `expansion.show` plus a
  `part_fly` + `part_reveal` per value (a bare rod's 0 is written under a
  `rod_glow`), and the reducer keeps the abacus (M8, M9; storyboard fixes
  B2/B3). Rule b is for chalk events only.
- Box model: the export's pages have no CSS reset, so inside the session
  screen and the design gallery every box is `content-box` (a 56 px chip
  with a 2 px border is drawn 60 px); buttons keep Chromium's `border-box`;
  `border-box` is set inline only where the export writes it.
- One glow (or one glow group) at a time; siblings veil to 38 %; motion
  ≤ 600 ms on `cubic-bezier(.34,1.3,.64,1)`; correct = ✓ + saffron sparkle;
  wrong = wobble ±6 px / ±3° + the retry note; never red.

```
npm run design:check -- http://localhost:3001            # manifest · numbers · SSIM · rules
npm run design:check -- http://localhost:3001 --only=M7  # one frame
```

`/admin/design-preview?frame=<id>` stages any frame of
`src/lib/designFrames.ts` (the storyboard replayed to its beat, then the
frame's own turn); `/admin/design-gallery` mirrors `components.html`
section for section. The harness serves the export over http (support.js
loads StrokeNum, Zara and Lena; the export's Google Fonts link is answered
with the app's own font files), renders every frame of Session*.dc.html
and every section of components.dc.html in the same Chromium at 1× and
the frame's own size, checks each render is whole (no placeholder boxes,
no template text, strokes present — else the frame's PNG in
`docs/design/reference/` stands in, and the report says which), measures
the shell against the README numbers (±1 px, CSS sizes), diffs every
frame and section against its reference at full resolution with nothing
masked (SSIM ≥ 0.90 or an explanation per frame, diffs and renders in
`.design-check/`), and asserts the rules on every staged frame.

## A phone held sideways

The design's one layout is 844×390; the frame stretches to the phone and
the content inset stays as above. A primitive that stacks anything under
itself (a readout, the child's answer, a note) must fit the 216 px the
inset leaves under the chips (150 px over a dock), or the session check
flags it `cut-off`. Table cells are 30 px (34 in the name table) as the
design draws them; the child taps a cell, then answers on the docked pad
or word bank. No child-facing Sinhala under 20 px.

```
npm run session:check -- http://localhost:3001 --viewport=800x360 --scheme=dark
npm run session:check -- http://localhost:3001 --viewport=844x390 --drills --wrong=readWrite4Digit:8
```

The first photographs every beat at the smallest phone we ship for; the
second walks the four failure modes (a tap while she talks, a rotation, a
backgrounded tab, a clip that cannot be fetched) and the retry ladder on
one question. Run them against a production build — a dev server reloads
the page on every source edit.

## Answering: every question has a touch surface

Each ASK / SOFT_CHECK / CHECK_MY_WORK carries an `answerMode`, derived at
build time (`src/lib/answerMode.ts`) from what it expects and the
concept's skill — never typed by hand:

| mode | leads with | chips |
|---|---|---|
| build | the picker, the beads, the pad | after a miss (never for an open build) |
| cell | tap the cell, then the pad | after a miss |
| valueOrPlace | tap the rod or column, or 3 chips | from the start |
| why | 3 chips (the rubric's findings) | from the start |
| readAloud | the chips ARE the question, dealt as she asks (no invitation, no 🎤 cue; since 18 Sep no read-back either — a tap is judged, the feedback plays, the lesson continues) | 3 name-chips from the first word |

The three options come from `src/lib/distractors.ts` (deterministic:
swapped digits, a zero dropped or added, one place off; the adjacent
place's value, the digit instead of the value; the rubric's findings) and
every set passes `validateChoices`. Every judged answer is a touch, judged
on the device (`answersMatch`, or the rubric's token match for a finding);
the microphone opens only in the ✋ chat. A surface with no tap gets one
recorded nudge at 12 s and, at 25 s, her demonstration. The storyboard emits `turn.your_turn
{answerMode, surface}` and, for the chip modes, `choiceChips.show` on the
question's last sentence; the runtime does the same for beats the
storyboard does not know (a recap, a retry). A tapped answer is never
read back (CONFIRM is for hearings); a soft check has no chips and no
glow. `npm run dry-run:lesson` prints the mode table, the speech-primary
share and every question's options, and fails on a question with no mode
or no surface.

## Touch inputs the primitives own

- **Word bank** (`WordBank`, opened by `BlankTable` for a `numberName`
  cell): the name's own words plus two distractors from `nameWordBank`
  (a digit's word at the adjacent place, an off-by-one value), 56 px
  tiles tapped in order, used tiles veiled, ⌫ takes the last back, ✓
  commits the line — judged by `answersMatch` like any other answer.
- **Ledger** (`DigitPicker` `ledger`): the five-number puzzle's builds so
  far with a ✓, the current row glowing; `digitPicker.built_number` by the
  child appends, and a re-deal of the same hand keeps it.
- **Glow groups** (`Abacus` `glowRods`): rods named in one sentence glow
  together (`rod_glow { rods }`); otherwise one glow only.
- **Retry** (`turn.retry`): the "ආයෙත් උත්සාහ කරන්න" paper button, top-right,
  after a miss; the surface reopens on its tap or on its own after 12 s.
- The strip's ⏸ ↺ ⏹ keep their small pills but their hit areas reach 56 px
  down into the board frame (`.strip-control::after`); the session check
  probes this.

## Nothing overlaps, and an entry is shown before it is judged (18 Sep 2026)

Two rules every primitive now lives under — both are asserted, not hoped for.

**Nothing overlaps, ever.** `src/components/board/layout.ts` is the one probe:
every visible text node's own glyph run, plus every stroke-drawn number
(`data-readable`, glyph by glyph), is a readable box. `npm run board:check`
stages EVERY storyboard beat (`/admin/design-preview?beat=<id>&moment=end|turn|answered`,
`stageStoryboardBeat` in `src/lib/designFrames.ts`) at 800×360 and 844×390 and fails a frame
where two readable boxes intersect, a ring or underline crosses its target's box or any
text, or the pointer rests on anything readable; `session:check` asks the same probe
(`window.__boardLayout()`) at every beat of the live session. What keeps frames clean:

- a ring is a chalk LASSO outside its target's box (`strokes.lassoPath`, `Highlight.RING_PAD`
  14; drawn in closer, never under 6, beside glyphs on the same line); an underline hangs 3 px
  below its target;
- the pointer takes the first side of its target where the hand covers nothing readable —
  below, above, beside, then the small hand; a table cell's row is pointed at from outside
  the table when the cell is boxed in (`Pointer.tsx`);
- the content scales down to the room it has (`BoardStage` fit: the inset stops short of the
  chips, the dock and a wrapped caption — `--wb-foot`, `--wb-cap` — and the ring's pad is
  room too), never below 60 %;
- a docked table draws only the rows that fit above the dock, the active row last.

A new primitive gets this for free if its numbers are `HandNumber`s and its labels are
text; give decoration that is MEANT to sit on something `data-layout-ignore`.

**An entry is on the surface before the judge.** A tap goes through
`enterAnswer(stage, value)` in the tap itself (the runtime's `submitTypedAnswer`), one frame
is painted, and only then is it judged (`judgeEntry(stage, correct)`): right → the cell /
part becomes the child's own (green ✓, it stands against her later confirmation); wrong →
it stays to wobble until the retry reopens the surface. A surface shows `stage.entry` in
its active slot and marks the element `data-entry` / `data-entry-verdict` — `session:check`
reads those as the judge begins and prints the trace per surface. On the abacus the answer
is written under the rod it answers (`answerRod`) and leaves when another rod comes under
discussion: only the rod being talked about carries a value.

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
