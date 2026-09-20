# Board vocabulary

The only language the storyboard may use. Every visual thing that happens
in a lesson is one of these primitives firing one of its events; a beat
whose visual plan cannot be written in this vocabulary is a beat that
needs a new primitive, not a looser storyboard.

Conventions used throughout:

- **Duration** is the animation's length, never more than 600 ms — the
  line keeps moving and the board keeps up. Events that land on a
  sentence fire when that sentence starts.
- **Target** is one of `{number:N}`, `{rod:0-3}`, `{column:0-4}`,
  `{card:N}`, `{cell:row,field}`, `{part:i}`, `{digit:d}`, `{text:"…"}`.
  A card or text target may add `place:"දා"|"සි"|"ද"|"එ"` to mean one
  digit of that number — "the tens place of 101" is `{card:101, place:"ද"}`.
- **Rods** (abacus, four-digit lesson) are indexed left→right as the
  runtime's `abacus_add` already does: `0 = දා` (දහසස්ථානය),
  `1 = සි` (සියයස්ථානය), `2 = ද` (දහයස්ථානය), `3 = එ` (එකස්ථානය).
  The five-column `placeValueStrip` adds `දසදා` (දස දහසස්ථානය) at
  column 0 and shifts the rest right.
- **Board state carries** within a concept: a beat that fires no `show`
  leaves whatever is up. Only `chalkText.erase` (the runtime's
  `{kind:"clear"}`) blanks the board on purpose.

## Reconciliation with the component library

`app/src/components/board/` implements this vocabulary as a component
library (gallery: `/admin/board-gallery`; coverage:
`npm run board:coverage`; screenshots: `npm run board:check`). Every
primitive has an explicit props API and every event is a state change
on it; `events.ts` carries the vocabulary as data (`VOCABULARY`,
`DURATION_MS`, `IMPLEMENTED`) so scripts can check against it.

| Primitive | Component | Status |
|---|---|---|
| `abacus.show / bead_add / rod_glow / child_answer_overlay / clear_overlay` | `Abacus` — `digits`, `shown`, `animate`, `glowRods` (a group named together glows together), `childAnswer`; touch: tray-to-rod drag, tap to remove, or tap a rod to answer | implemented |
| `placeValueStrip.show / digit_drop / column_glow` | `PlaceValueStrip` — `digits`, `glowColumn`; touch: tap a column, digit pad | implemented |
| `expansion.show / part_reveal / part_fly` | `Expansion` — `number`, `parts`, `fly`; sits beneath an `Abacus` on the same board and flies from its registered rod | implemented |
| `digitPicker.show / tap / built_number / clear_built` | `DigitPicker` — `pool`, `built`, `builtName`, `ledger` (the five-number puzzle: builds done with a ✓, the current row glowing); touch: tap in/out, drag to reorder | implemented (`pool` must be digits — the storyboard's "as printed" pool is resolved by the lesson wiring) |
| `numberCards.show / highlight_ring / ring_off` | `NumberCards` — `values`, `ringed`; a real dealt row; touch: tap to select, drag to order | implemented |
| `chalkText.write / erase` | `ChalkText` — `text`, `append` (progressive, ≤ 600 ms); erase is the `Whiteboard`'s `wipeKey` | implemented |
| `pointer.move_to / pulse / hide` | `Pointer` — `at: Target`, `pulseKey`; resolves rod, column, card, cell, part, digit, text span and `{number}` through the board's target registry | implemented |
| `highlight.circle / underline / off` | `Highlight` — `kind`, `target`; drawn as a chalk-yellow stroke | implemented |
| `money.show / count` | `Money` — `items`, `counted` | implemented (stylised notes and coins, not replicas) |
| `titleCard.show` | `TitleCard` | implemented |
| `textCard.show` | `TextCard` | implemented |
| `blankTable.show / row_activate / cell_fill` | `BlankTable` — `columns`, `rows`, `filled`, `activeBlank`; touch: tap a blank, number pad | implemented (takes rows as data — the storyboard names a content-bank item, resolved by the lesson wiring) |
| feedback (not a vocabulary primitive) | `FeedbackFX` — `correct` / `wrong` / `celebrate` at a `Target` | implemented |

Targets: `{card:N, place}` and `{text:"…", place}` resolve to the digit
glyph itself — `HandNumber` registers each digit of a number under its
place. `{text:"abacus"}` / `{text:"picker"}` resolve to the component.

Still open: the LESSON WIRING — the runtime's `BeatBoardAction` →
`stageBeatBoard` path still renders `TeachingBoard`/`AnimatedAbacus`;
nothing routes a storyboard event to these components yet. `abacus.show
{animate:true}` lands beads at 120 ms each, so a full four-rod landing
runs past 600 ms in total (each rod stays within its `bead_add` budget);
the session-1 storyboard no longer stages it.

---

## The look

Every primitive's look is the Claude Design export's (`docs/design/export/handoff/…/components.dc.html`): paper on board (radius 12, 2 px ink-18 border, the paper shadow), wood for anything structural, 3 px round-capped chalk strokes, Zara in marker blue with a ✎ badge, the child in green with a ✓, one saffron glow at a time with siblings veiled to 38 %, Yaldevi 20 px labels beneath, StrokeNum glyphs for every numeral. `npm run design:check` diffs each state against the export's reference PNGs (see `app/docs/BOARD.md`, "The design is the look").

## Primitives

### `abacus`
The four-rod bead abacus (`AnimatedAbacus.tsx`).

- **props** `{ digits: number[4], shown: number[4], animate: boolean }` —
  `digits` is the target per rod, `shown` how many beads are up.
- **events**
  - `show { digits, startEmpty?, animate? }` — 400 ms. Rods appear;
    with `startEmpty` they are bare and wait for `bead_add`; with
    `animate` the beads land on their own, rod by rod.
  - `bead_add { rod, count }` — 120 ms per bead, ≤ 600 ms. Beads drop
    onto one rod one at a time; the line counting them ("එක, දෙක…") is
    what they are counted to.
  - `rod_glow { rod, rods? }` — 300 ms. The named rod brightens; the others dim.
    Rods named in the same sentence glow together (`rods: [...]`); otherwise
    one glow only
    slightly. Fires whenever a place is named while the abacus is up.
  - `child_answer_overlay { text }` — 250 ms. The child's spoken or
    typed number written in a second colour beneath the rods.
  - `clear_overlay` — 150 ms.

### `placeValueStrip`
Five labelled columns (දසදා · දා · සි · ද · එ) with one digit slot each —
the place-value chart the textbook prints above a number.

- **props** `{ columns: 5, digits: (number|null)[5] }`
- **events**
  - `show { digits? }` — 300 ms.
  - `digit_drop { column, digit }` — 400 ms. A digit falls into its column
    from above.
  - `column_glow { column }` — 300 ms.

### `expansion`
A number and its expanded form: `5 421 = ▢ + ▢ + ▢ + ▢`.

- **props** `{ number, parts: (number|null)[] }` — every part starts
  blank; the answer key is never displayed.
- **events**
  - `show { number, parts: blank }` — 300 ms.
  - `part_reveal { index, value }` — 350 ms. Zara writes one part in
    (blue pen, ✎).
  - `part_fly { fromRod, index }` — 600 ms. The value floats from the
    abacus rod it came from into its slot. Pairs with `part_reveal`.

### `digitPicker`
A pool of digit tiles the child builds a number from.

- **props** `{ pool: number[], built: string|null }`
- **events**
  - `show { pool }` — 300 ms.
  - `tap { digit }` — 100 ms (child). The tile lifts into the answer row.
  - `built_number { digits, name, by? }` — 400 ms. The child's number, with
    `sinhalaNumberName(N)` beneath it, drawn under the pool — on top of
    the picker, not instead of it. `by:"tutor"` is an example Zara builds
    from the same tiles, in her marker colour.
  - `clear_built` — 150 ms. Ready for the next build.

### `numberCards`
A row of numbers on cards ("84 · 101 · 528 · 997").

- **props** `{ values: number[], ringed: number|null }`
- **events**
  - `show { values }` — 400 ms. Cards deal in left to right.
  - `highlight_ring { value }` — 250 ms. A chalk ring around one card;
    any previous ring fades.
  - `ring_off` — 150 ms.

### `chalkText`
Verbatim chalk writing — a sum, a sentence, a term.

- **props** `{ text }`
- **events**
  - `write { text }` — up to 600 ms. Appears as if written, left to right.
  - `erase` — 200 ms. The board wipes to blank. This is the runtime's
    `clear`, and the only deliberate blank there is.

### `pointer`
Zara's hand/chalk pointer. It is on the board whenever she is talking
about something on the board.

- **props** `{ at: Target|null }`
- **events**
  - `move_to { target }` — 300 ms.
  - `pulse` — 200 ms. A small emphasis at the current target.
  - `hide` — 150 ms.

### `highlight`
A chalk mark on something already on the board.

- **events**
  - `circle { target }` — 250 ms.
  - `underline { target }` — 250 ms.
  - `off` — 150 ms.

### `money`
Notes and coins, for the hooks and the "coins in a till" analogy.

- **props** `{ items: Array<{ denomination, count }> }`
- **events**
  - `show { items }` — 500 ms.
  - `count { step }` — ≤ 600 ms. One item slides aside per step, so a
    total can be counted aloud.

### `titleCard`
A big friendly card: one heading, one emoji.

- **events** `show { title, emoji? }` — 300 ms.

### `textCard`
A plain card with short text ("100 000", "ලොකු සංඛ්‍යා") — a chalk card
without the write animation.

- **events** `show { text }` — 300 ms.

### `blankTable`
The textbook's place-value table (`PlaceValueTable`) with blanks to fill.

- **props** `{ rows, filled: FilledAnswer[], activeBlank: {row,field}|null }`
- **touch** a tapped blank opens the number pad — or, for a `numberName`
  cell, the Sinhala **word bank** (`WordBank`): the name's own words plus
  two distractors from `nameWordBank` (a digit's word at the adjacent
  place, an off-by-one value), 56 px tiles tapped in order into the cell,
  used tiles veiled, ⌫ takes the last back.
- **events**
  - `show { rows }` — 400 ms.
  - `row_activate { row, field }` — 250 ms. That cell is outlined and the
    number pad points at it.
  - `cell_fill { row, field, value, by: "child"|"tutor" }` — 300 ms.
    Green tick for the child, blue pen for Zara.

### `choiceChips`
Three tappable options along the foot of the board — a phrase's findings,
three number names, three values — made by the distractor engine
(`src/lib/distractors.ts`), never by a model. The correct one is not
marked; the judge decides. On a readAloud question the chips ARE the
question — they come up with it, and Zara reads the number back only after
one is judged right (17 Sep: the 🎤 invitation that used to precede them is
gone, with its cue and its step cards).

- **props** `{ options: string[], correctIndex, interactive }`
- **events**
  - `show { options, correctIndex }` — 300 ms. The chips deal in.
  - `clear` — 150 ms.
- **targets** `{ text: "chips" }`

### `turn`
Not drawn; it says where the child's turn lands, so the glow goes there
and nowhere else (a soft check glows nothing).

- **events**
  - `your_turn { answerMode, surface }` — 300 ms. `answerMode` is one of
    build · cell · valueOrPlace · why · readAloud (`src/lib/answerMode.ts`);
    `surface` one of picker · beads · pad · cell · rod · column · chips · mic.
    Rods become buttons on `rod`; the picker breathes on `picker`; the
    chips breathe on `chips`.
  - `pause { ms }` — up to 3000 ms. A soft check: she pauses for the child
    to chime in. Nothing is drawn — a pause is time, not a cue. Clears any
    chips.
  - (`read_back` was removed on 18 Sep 2026 — the device walk: a tap is
    judged, the feedback plays, the lesson continues. No read-back beat, no
    frame line, no composed number on the answer path.)
  - `retry` — 300 ms. A wrong answer's visible way back: the paper button
    "ආයෙත් උත්සාහ කරන්න" top-right; a tap reopens the surface.
  - `over` — 150 ms. The glow, the chips and the retry button go.
