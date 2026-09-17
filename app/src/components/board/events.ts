import type { AnswerMode } from "@/lib/answerMode";
/**
 * The board vocabulary as data — every primitive, every event, every
 * argument shape, exactly as docs/design/board-vocabulary.md specifies
 * and as docs/storyboard/*.json records them. This file has no React in
 * it so a script can import it: scripts/board-coverage.ts checks the
 * storyboard's events against IMPLEMENTED below.
 */

export type Place = "දසදා" | "දා" | "සි" | "ද" | "එ";

/** What a pointer or highlight aims at. */
export type Target =
  | { number: number }
  | { rod: number }
  | { column: number }
  | { card: number; place?: Place }
  | { cell: { row: number; field: string } }
  | { part: number }
  | { digit: number }
  | { text: string; place?: Place };

export type Filler = "child" | "tutor";

export type BoardEvent =
  | { primitive: "abacus"; event: "show"; args: { digits: number[]; startEmpty?: boolean; animate?: boolean } }
  | { primitive: "abacus"; event: "bead_add"; args: { rod: number; count: number } }
  | { primitive: "abacus"; event: "rod_glow"; args: { rod: number; rods?: number[] } }
  | { primitive: "abacus"; event: "child_answer_overlay"; args: { text: string } }
  | { primitive: "abacus"; event: "clear_overlay"; args?: undefined }
  | { primitive: "placeValueStrip"; event: "show"; args: { digits?: Array<number | null> } }
  | { primitive: "placeValueStrip"; event: "digit_drop"; args: { column: number; digit: number } }
  | { primitive: "placeValueStrip"; event: "column_glow"; args: { column: number } }
  | { primitive: "expansion"; event: "show"; args: { number: number; parts: Array<number | string | null> } }
  | { primitive: "expansion"; event: "part_reveal"; args: { index: number; value: number | string } }
  | { primitive: "expansion"; event: "part_fly"; args: { fromRod: number; index: number } }
  | { primitive: "digitPicker"; event: "show"; args: { pool: number[] } }
  | { primitive: "digitPicker"; event: "tap"; args: { digit: number } }
  | { primitive: "digitPicker"; event: "built_number"; args: { digits: string; name: string; by?: Filler } }
  | { primitive: "digitPicker"; event: "clear_built"; args?: undefined }
  | { primitive: "numberCards"; event: "show"; args: { values: number[] } }
  | { primitive: "numberCards"; event: "highlight_ring"; args: { value: number } }
  | { primitive: "numberCards"; event: "ring_off"; args?: undefined }
  | { primitive: "chalkText"; event: "write"; args: { text: string; append?: string } }
  | { primitive: "chalkText"; event: "erase"; args?: undefined }
  | { primitive: "pointer"; event: "move_to"; args: { target: Target } }
  | { primitive: "pointer"; event: "pulse"; args?: undefined }
  | { primitive: "pointer"; event: "hide"; args?: undefined }
  | { primitive: "highlight"; event: "circle"; args: { target: Target } }
  | { primitive: "highlight"; event: "underline"; args: { target: Target } }
  | { primitive: "highlight"; event: "off"; args?: undefined }
  | { primitive: "money"; event: "show"; args: { items: Array<{ denomination: number; count: number }> } }
  | { primitive: "money"; event: "count"; args: { step: number } }
  | { primitive: "titleCard"; event: "show"; args: { title: string; emoji?: string } }
  | { primitive: "textCard"; event: "show"; args: { text: string } }
  | { primitive: "blankTable"; event: "show"; args: { rows: unknown[] } }
  | { primitive: "blankTable"; event: "row_activate"; args: { row: number; field: string } }
  | { primitive: "blankTable"; event: "cell_fill"; args: { row: number; field: string; value: string | number; by: Filler } }
  | { primitive: "choiceChips"; event: "show"; args: { options: string[]; correctIndex: number } }
  | { primitive: "choiceChips"; event: "clear"; args?: undefined }
  | { primitive: "turn"; event: "your_turn"; args: { answerMode: AnswerMode; surface: TurnSurface } }
  | { primitive: "turn"; event: "over"; args?: undefined }
  | { primitive: "turn"; event: "pause"; args: { ms: number } }
  | { primitive: "turn"; event: "read_back"; args: { number: number } }
  | { primitive: "turn"; event: "retry"; args?: undefined };

/** Where the child's turn lands on the board — the glow goes there. Every surface is a touch; the microphone is not one. */
export type TurnSurface = "picker" | "beads" | "pad" | "cell" | "rod" | "column" | "chips";

export type Primitive = BoardEvent["primitive"];
export type EventName = `${Primitive}.${string}`;

/** The vocabulary, primitive by primitive, in the order the doc lists them. */
export const VOCABULARY: Record<Primitive, readonly string[]> = {
  abacus: ["show", "bead_add", "rod_glow", "child_answer_overlay", "clear_overlay"],
  placeValueStrip: ["show", "digit_drop", "column_glow"],
  expansion: ["show", "part_reveal", "part_fly"],
  digitPicker: ["show", "tap", "built_number", "clear_built"],
  numberCards: ["show", "highlight_ring", "ring_off"],
  chalkText: ["write", "erase"],
  pointer: ["move_to", "pulse", "hide"],
  highlight: ["circle", "underline", "off"],
  money: ["show", "count"],
  titleCard: ["show"],
  textCard: ["show"],
  blankTable: ["show", "row_activate", "cell_fill"],
  choiceChips: ["show", "clear"],
  turn: ["your_turn", "over", "pause", "read_back", "retry"],
};

/** The doc's duration ceiling per event, in ms — the gallery asserts against these. */
export const DURATION_MS: Record<EventName, number> = {
  "abacus.show": 400,
  "abacus.bead_add": 600,
  "abacus.rod_glow": 300,
  "abacus.child_answer_overlay": 250,
  "abacus.clear_overlay": 150,
  "placeValueStrip.show": 300,
  "placeValueStrip.digit_drop": 400,
  "placeValueStrip.column_glow": 300,
  "expansion.show": 300,
  "expansion.part_reveal": 350,
  "expansion.part_fly": 600,
  "digitPicker.show": 300,
  "digitPicker.tap": 100,
  "digitPicker.built_number": 400,
  "digitPicker.clear_built": 150,
  "numberCards.show": 400,
  "numberCards.highlight_ring": 250,
  "numberCards.ring_off": 150,
  "chalkText.write": 600,
  "chalkText.erase": 200,
  "pointer.move_to": 300,
  "pointer.pulse": 200,
  "pointer.hide": 150,
  "highlight.circle": 250,
  "highlight.underline": 250,
  "highlight.off": 150,
  "money.show": 500,
  "money.count": 600,
  "titleCard.show": 300,
  "textCard.show": 300,
  "blankTable.show": 400,
  "blankTable.row_activate": 250,
  "blankTable.cell_fill": 300,
  "choiceChips.show": 300,
  "choiceChips.clear": 150,
  "turn.your_turn": 300,
  "turn.over": 150,
  "turn.pause": 3000,
  "turn.read_back": 400,
  "turn.retry": 300,
};

export type Support = "implemented" | "partial";

/**
 * What src/components/board can produce today. Every vocabulary event is
 * listed; "partial" carries a note saying exactly what is approximated,
 * so nobody has to open a component to find out.
 */
export const IMPLEMENTED: Record<EventName, { support: Support; note?: string }> = Object.fromEntries(
  Object.entries(VOCABULARY).flatMap(([primitive, events]) =>
    events.map((event) => [`${primitive}.${event}`, { support: "implemented" as Support }]),
  ),
) as Record<EventName, { support: Support; note?: string }>;
IMPLEMENTED["blankTable.show"] = {
  support: "partial",
  note: "takes columns + rows as data; the storyboard names a content-bank item id, which the lesson wiring will resolve to rows",
};
IMPLEMENTED["digitPicker.show"] = {
  support: "partial",
  note: "pool must be a digit array; the storyboard's 'as printed' pool for a textbook item is resolved by the lesson wiring",
};

/** The vocabulary's target kinds, and which primitives can be aimed at. */
export const TARGET_KINDS = ["number", "rod", "column", "card", "cell", "part", "digit", "text"] as const;

export function eventName(event: Pick<BoardEvent, "primitive" | "event">): EventName {
  return `${event.primitive}.${event.event}`;
}
