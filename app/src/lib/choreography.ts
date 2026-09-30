/**
 * The choreography: the storyboard's events turned into board state.
 *
 * docs/storyboard/maths-5-1-session-1.json says, per beat and per
 * sentence, what the board does while she speaks. This module is the
 * pure half of running it:
 *
 *   - StageState       what is on the board right now, in the vocabulary's
 *                      own terms (an abacus, a card row, chalk lines, the
 *                      pointer, a highlight, a feedback burst)
 *   - reduceStage      one storyboard event applied to that state — board
 *                      state carries within a concept exactly as the
 *                      storyboard assumed when it was generated
 *   - stageFromLegacy  the runtime's older BoardContent (content-bank
 *                      items, sessions the storyboard does not cover)
 *                      mapped onto the same stage so one board draws both
 *   - alignSpans       the clip's stored sentence spans, or an estimate
 *                      from sentence lengths when a clip is missing
 *   - answerSurfaceFor which primitive on the board is the child's answer
 *                      surface when their turn comes
 *
 * No React here: the dry run and the session harness import it too.
 */
import type { AnswerMode } from "@/lib/answerMode";
import type { BoardContent } from "@/lib/board";
import type { LessonComponent, PlaceValueBreakdownRow, PlaceValueNumberNameRow } from "@/data/lessons/lesson1-numbers";
import type { Target, TurnSurface } from "@/components/board/events";
import { VOCABULARY } from "@/components/board/events";
import { sinhalaNumberName } from "@/lib/sinhalaNumber";
import { t, type CopyKey } from "@/lib/appCopy";

// --- the storyboard file ----------------------------------------------------

export interface StoryboardEvent {
  sentenceIndex: number;
  primitive: string;
  event: string;
  args: Record<string, unknown> | null;
  /** Where in the sentence it fires, 0–1 (cluster E: same-sentence events fire in sequence, by estimated word position). Absent = as the sentence starts. */
  at?: number;
}

export interface StoryboardBeat {
  id: string;
  concept: string;
  type: string;
  pause: string | null;
  line: string;
  sentences: string[];
  boardAtStart: string;
  events: StoryboardEvent[];
  child: { kind: string; via: string; expects?: string; answerMode?: string; surface?: string } | null;
  sees: string;
}

export interface Storyboard {
  lesson: string;
  session: number;
  beats: StoryboardBeat[];
}

export function eventKey(event: Pick<StoryboardEvent, "primitive" | "event">): string {
  return `${event.primitive}.${event.event}`;
}

/** Whether the board library has a primitive and event for this storyboard event. */
export function isKnownEvent(event: Pick<StoryboardEvent, "primitive" | "event">): boolean {
  const events = (VOCABULARY as Record<string, readonly string[]>)[event.primitive];
  return Boolean(events && events.includes(event.event));
}

// --- places ----------------------------------------------------------------

/** The place names, rod by rod (0 = දහසස්ථානය … 3 = එකස්ථානය); the generator and the checks share these. */
export const PLACE_PATTERNS: Array<[RegExp, number]> = [
  [/දස දහසස්ථාන/u, -1],
  [/දහසස්ථාන/u, 0],
  [/සියයස්ථාන|සියයේ තැන|සියයේ කූර/u, 1],
  [/දහයස්ථාන|දසස්ථාන|දහයේ තැන|දහයේ කූර/u, 2],
  [/එකස්ථාන|එකේ තැන|එකේ කූර|දකුණු පැත්තේ මුල්ම කූර|අවසාන කූර|අන්තිම කූර/u, 3],
];

/** Every rod a sentence names, in order of mention. */
export function rodsNamedIn(sentence: string): number[] {
  const rods: number[] = [];
  for (const [pattern, rod] of PLACE_PATTERNS) if (pattern.test(sentence) && rod >= 0 && !rods.includes(rod)) rods.push(rod);
  return rods;
}

/** "rod:1" / "number:5421" / "text:…/place:ද" back into a Target — the chat's tools speak in these. */
export function parseTargetKey(key: string): Target | null {
  const trimmed = key.trim();
  const place = trimmed.match(/\/place:(.+)$/u);
  const bare = place ? trimmed.slice(0, trimmed.length - place[0].length) : trimmed;
  const colon = bare.indexOf(":");
  if (colon < 0) return null;
  const kind = bare.slice(0, colon);
  const value = bare.slice(colon + 1);
  const placeValue = place?.[1] as Target extends { place?: infer P } ? P : never;
  switch (kind) {
    case "rod":
      return { rod: Number(value) };
    case "column":
      return { column: Number(value) };
    case "number":
      return { number: Number(value.replace(/\s/gu, "")) };
    case "card":
      return place ? { card: Number(value), place: placeValue } : { card: Number(value) };
    case "part":
      return { part: Number(value) };
    case "digit":
      return { digit: Number(value) };
    case "cell": {
      const [row, field] = value.split("/");
      return { cell: { row: Number(row), field: field ?? "" } };
    }
    case "text":
      return place ? { text: value, place: placeValue } : { text: value };
    default:
      return null;
  }
}

// --- the stage -------------------------------------------------------------

export interface ChalkLine {
  key: number;
  text: string;
  append?: string;
}

export interface ExpansionState {
  number: number;
  parts: Array<string | null>;
  fly: { fromRod: number; index: number; key: number } | null;
  /** The parts the CHILD wrote (judged right): drawn in green with a ✓, and they stand when her confirmation reveals the same part. */
  answered?: Array<string | null>;
}

export interface TableColumn {
  key: string;
  label: string;
}

export interface TableFill {
  row: number;
  field: string;
  value: string | number;
  by: "child" | "tutor";
}

export type StageBase =
  | {
      kind: "abacus";
      digits: number[];
      shown: number[];
      animate: boolean;
      /** The rods glowing now: the ones named in the same sentence, together; otherwise one. */
      glowRods: number[];
      childAnswer: string | null;
      /** The rod the child's answer belongs to: it sits under that rod and leaves when another rod is asked (null: a whole number). */
      answerRod?: number | null;
      /** The expanded form, staged BENEATH the abacus. */
      expansion: ExpansionState | null;
    }
  | { kind: "numberCards"; values: number[]; ringed: number | null; /** Cards drawn from a ten-card row (they lift; the row veils) — rule d. */ drawn?: number[]; /** The number the drawn cards make, shown beside them (G3: "3 0 5 8 → 3058"). */ made?: string }
  | { kind: "chalk"; lines: ChalkLine[] }
  | { kind: "textCard"; text: string }
  | { kind: "titleCard"; title: string; emoji?: string; /** Text cards shown beside the (dimmed) title card — G1: the title persists, the cards stack beside it. */ cards?: string[] }
  | {
      kind: "digitPicker";
      pool: number[];
      /** The number written beneath the tiles, if any. */
      built: string | null;
      builtName: string | null;
      builtBy: "child" | "tutor";
      itemId?: string;
      /** The five-number puzzle's ledger: every number the child has built from this pool, in order. */
      ledger: string[];
      /** The textbook's digit puzzle (item 7daf0141): the ledger of five is on the board. */
      puzzle?: boolean;
    }
  | { kind: "expansion"; expansion: ExpansionState }
  | {
      kind: "blankTable";
      columns: TableColumn[];
      rows: Array<Record<string, string | number | null>>;
      filled: TableFill[];
      activeBlank: { row: number; field: string } | null;
      itemId?: string;
    }
  | { kind: "placeValueStrip"; digits: Array<number | null>; glowColumn: number | null }
  | { kind: "money"; items: Array<{ denomination: number; count: number }>; counted: number }
  /** A board the new library does not draw yet (page image, data table): TeachingBoard renders it. */
  | { kind: "legacy"; content: BoardContent }
  | null;

export type FeedbackKind = "correct" | "wrong" | "celebrate";

export interface StageState {
  base: StageBase;
  /** Chalk written beside the base — a term she names, a note. */
  notes: ChalkLine[];
  pointer: Target | null;
  pointerPulse: number;
  /** The pointer is parked (the child's turn): out of the way, still there. */
  parked: boolean;
  highlight: { kind: "circle" | "underline"; target: Target } | null;
  /** Bumped by chalkText.erase — the felt sweeps. */
  wipe: number;
  feedback: { kind: FeedbackKind; at: Target | null; nonce: number };
  /** Three tappable options, dealt for the child's turn (choiceChips.show). */
  chips: { options: string[]; correctIndex: number } | null;
  /** The child's turn is open: which surface leads, so the glow lands there (turn.your_turn). */
  turn: { answerMode: AnswerMode; surface: TurnSurface } | null;
  /** A short pause with nothing to answer — a soft check while she reacts (turn.pause). Nothing is drawn: a pause is a dwell, not a cue. */
  pause: { ms: number } | null;
  /** A wrong answer's visible way back: the "ආයෙත් උත්සාහ කරන්න" paper button, top-right (turn.retry). */
  retry: boolean;
  /**
   * What the child has just entered, shown on the surface the instant it is entered — BEFORE the judge
   * (enterAnswer), then marked right or wrong (judgeEntry). It leaves when the turn reopens or the base changes.
   */
  entry: { value: string; verdict: "pending" | "correct" | "wrong" } | null;
  /** The puzzle ledgers, by hand of digits (sorted): what the child built from each, so a hand dealt again finds its ledger. */
  pickerLedgers: Record<string, string[]>;
  /** Monotonic counter for keys. */
  seq: number;
}

export function initialStage(): StageState {
  return {
    base: null,
    notes: [],
    pointer: null,
    pointerPulse: 0,
    parked: false,
    highlight: null,
    wipe: 0,
    feedback: { kind: "correct", at: null, nonce: 0 },
    chips: null,
    turn: null,
    pause: null,
    retry: false,
    entry: null,
    pickerLedgers: {},
    seq: 1,
  };
}

/** What the reducer may need from the runtime for an event the storyboard left open. */
export interface ReduceContext {
  /** The content-bank item the runtime fetched for this beat, already mapped. */
  legacy?: StageBase;
  /** The number the child last built on the picker. */
  lastBuilt?: number | null;
}

const asNumberArray = (value: unknown): number[] => (Array.isArray(value) ? value.map(Number) : []);

/** Bases that persist while chalk is written beside them (design rule b); a title card or a card row gives way to a sum. */
const PERSISTENT_BASES = new Set<StageBase extends infer B ? (B extends { kind: infer K } ? K : never) : never>(["abacus", "textCard", "digitPicker", "expansion", "blankTable", "placeValueStrip", "money"]);

/** A chalk line that is a term — a word or two, no digits — is written beside the board, not instead of it. */
function isTermNote(text: string): boolean {
  return !/\d/u.test(text) && text.trim().split(/\s+/u).length <= 3;
}

/** A base change clears what was drawn around the old one. */
function withBase(state: StageState, base: StageBase, pointer: Target | null): StageState {
  return { ...state, base, notes: [], highlight: null, pointer, entry: null, seq: state.seq + 1 };
}

/** Only the rod under discussion carries a value: the child's answer leaves when attention moves to another rod (or to the whole number). */
function withoutStaleRodAnswer<B extends Extract<NonNullable<StageBase>, { kind: "abacus" }>>(base: B, rods: number[] | null): B {
  if (base.childAnswer === null) return base;
  if (rods !== null && base.answerRod !== null && base.answerRod !== undefined && rods.includes(base.answerRod)) return base;
  return { ...base, childAnswer: null, answerRod: null };
}

/**
 * The child has entered a value (a pad commit, a word-bank commit, a build, a rod, a chip): it is ON the
 * surface before anything judges it. The abacus writes it under the rod asked about; every other surface
 * reads `entry` (the active cell, the blank part, the slot row, the chalk "?").
 */
export function enterAnswer(state: StageState, value: string): StageState {
  const seq = state.seq + 1;
  const entry = { value, verdict: "pending" as const };
  if (state.base?.kind === "abacus" && !state.base.expansion && /^[\d\s]+$/u.test(value)) {
    const rod = state.base.glowRods[0] ?? (state.pointer && "rod" in state.pointer ? state.pointer.rod : null);
    return { ...state, entry, base: { ...state.base, childAnswer: value.replace(/\s/gu, "").slice(0, 24), answerRod: rod ?? null }, seq };
  }
  return { ...state, entry, seq };
}

/** The judge's verdict on the entry: a right cell becomes the child's own fill (green ✓, it stands); a right part is written; a wrong one stays to wobble. */
export function judgeEntry(state: StageState, correct: boolean): StageState {
  if (!state.entry) return state;
  const seq = state.seq + 1;
  const entry = { ...state.entry, verdict: correct ? ("correct" as const) : ("wrong" as const) };
  if (!correct) return { ...state, entry, seq };
  if (state.base?.kind === "blankTable" && state.base.activeBlank) {
    const { row, field } = state.base.activeBlank;
    const filled = [...state.base.filled.filter((f) => !(f.row === row && f.field === field)), { row, field, value: entry.value, by: "child" as const }];
    return { ...state, entry: null, base: { ...state.base, filled, activeBlank: null }, seq };
  }
  const expansion = state.base?.kind === "expansion" ? state.base.expansion : state.base?.kind === "abacus" ? state.base.expansion : null;
  if (expansion && /^\d+$/u.test(entry.value)) {
    const index = expansion.parts.findIndex((part) => part === null);
    if (index >= 0) {
      const next = { ...expansion, parts: expansion.parts.map((part, i) => (i === index ? entry.value : part)), answered: expansion.parts.map((_, i) => (i === index ? entry.value : (expansion.answered?.[i] ?? null))) };
      if (state.base?.kind === "expansion") return { ...state, entry: null, base: { ...state.base, expansion: next }, seq };
      if (state.base?.kind === "abacus") return { ...state, entry: null, base: { ...state.base, expansion: next }, seq };
    }
  }
  return { ...state, entry, seq };
}

/**
 * One storyboard event, applied. Unknown events leave the state as it is
 * (the caller logs them); every vocabulary event has a case here.
 */
export function reduceStage(state: StageState, event: Pick<StoryboardEvent, "primitive" | "event" | "args">, ctx: ReduceContext = {}): StageState {
  const args = event.args ?? {};
  const seq = state.seq + 1;
  switch (eventKey(event)) {
    // --- abacus ---
    case "abacus.show": {
      const digits = asNumberArray(args.digits);
      const bare = Boolean(args.startEmpty) || Boolean(args.animate);
      const previous = state.base?.kind === "abacus" ? state.base : null;
      const sameNumber = previous !== null && previous.digits.join() === digits.join();
      const shown = sameNumber ? previous.shown : digits.map((d) => (bare ? 0 : d));
      return withBase(
        state,
        { kind: "abacus", digits, shown, animate: Boolean(args.animate), glowRods: [], childAnswer: null, answerRod: null, expansion: null },
        { text: "abacus" },
      );
    }
    case "abacus.bead_add": {
      if (state.base?.kind !== "abacus") return state;
      const rod = Number(args.rod);
      const count = Number(args.count);
      const shown = state.base.shown.map((n, i) => (i === rod ? Math.min(state.base!.kind === "abacus" ? state.base.digits[i]! : 9, n + count) : n));
      // Beads landing on a rod ARE the attention: the rod she is filling
      // glows, so the hundreds rod lights when she names it and fills it.
      return { ...state, base: { ...withoutStaleRodAnswer(state.base, [rod]), shown, glowRods: [rod] }, pointer: { rod }, seq };
    }
    case "abacus.rod_glow": {
      if (state.base?.kind !== "abacus") return state;
      const rod = Number(args.rod);
      // A group named in one sentence glows together; otherwise one glow only.
      const rods = Array.isArray(args.rods) && (args.rods as unknown[]).length ? asNumberArray(args.rods) : [rod];
      // One glow at a time: a chalk ring still on the board gives way to the rod's glow.
      return { ...state, base: { ...withoutStaleRodAnswer(state.base, rods), glowRods: rods }, pointer: { rod: rods[0] ?? rod }, highlight: null, seq };
    }
    case "abacus.child_answer_overlay": {
      if (state.base?.kind !== "abacus") return state;
      // The answer belongs to the rod under discussion (the glow, else the pointer): it is drawn under that rod.
      const answerRod = args.rod !== undefined && args.rod !== null ? Number(args.rod) : (state.base.glowRods[0] ?? (state.pointer && "rod" in state.pointer ? state.pointer.rod : null));
      return { ...state, base: { ...state.base, childAnswer: String(args.text ?? ""), answerRod: answerRod ?? null }, seq };
    }
    case "abacus.clear_overlay": {
      if (state.base?.kind !== "abacus") return state;
      return { ...state, base: { ...state.base, childAnswer: null, answerRod: null }, seq };
    }
    // --- place-value strip ---
    case "placeValueStrip.show": {
      const digits = Array.isArray(args.digits) ? (args.digits as Array<number | null>) : [null, null, null, null, null];
      return withBase(state, { kind: "placeValueStrip", digits, glowColumn: null }, { column: 0 });
    }
    case "placeValueStrip.digit_drop": {
      if (state.base?.kind !== "placeValueStrip") return state;
      const column = Number(args.column);
      const digits = state.base.digits.map((d, i) => (i === column ? Number(args.digit) : d));
      return { ...state, base: { ...state.base, digits }, pointer: { column }, seq };
    }
    case "placeValueStrip.column_glow": {
      if (state.base?.kind !== "placeValueStrip") return state;
      const column = Number(args.column);
      return { ...state, base: { ...state.base, glowColumn: column }, pointer: { column }, seq };
    }
    // --- expansion (beneath an abacus when one is up) ---
    case "expansion.show": {
      const number = Number(args.number);
      const parts = (Array.isArray(args.parts) ? args.parts : [null, null, null, null]).map((p) => (p === null || p === undefined ? null : String(p)));
      const expansion: ExpansionState = { number, parts, fly: null };
      // The expansion is where the values are written from here on: a rod's answer still under the rods gives way to it.
      if (state.base?.kind === "abacus") return { ...state, base: { ...state.base, childAnswer: null, answerRod: null, expansion }, notes: state.notes.filter((n) => /\d/u.test(n.text)), pointer: { number }, highlight: null, seq };
      return withBase(state, { kind: "expansion", expansion }, { number });
    }
    case "expansion.part_reveal": {
      const index = Number(args.index);
      const value = String(args.value ?? "");
      const update = (e: ExpansionState): ExpansionState => ({ ...e, parts: e.parts.map((p, i) => (i === index ? value : p)) });
      if (state.base?.kind === "abacus" && state.base.expansion) return { ...state, base: { ...state.base, expansion: update(state.base.expansion) }, pointer: { part: index }, seq };
      if (state.base?.kind === "expansion") return { ...state, base: { ...state.base, expansion: update(state.base.expansion) }, pointer: { part: index }, seq };
      return state;
    }
    case "expansion.part_fly": {
      const index = Number(args.index);
      const fromRod = Number(args.fromRod);
      const fly = { fromRod, index, key: seq };
      // The flight is the attention (M8: no glow while 5000 flies from its rod); a bare rod's 0 is written under a rod_glow instead (M9).
      if (state.base?.kind === "abacus" && state.base.expansion) return { ...state, base: { ...state.base, expansion: { ...state.base.expansion, fly }, glowRods: [] }, pointer: { part: index }, seq };
      if (state.base?.kind === "expansion") return { ...state, base: { ...state.base, expansion: { ...state.base.expansion, fly } }, pointer: { part: index }, seq };
      return state;
    }
    // --- digit picker ---
    case "digitPicker.show": {
      const pool = Array.isArray(args.pool) ? asNumberArray(args.pool) : ctx.legacy?.kind === "digitPicker" ? ctx.legacy.pool : [];
      const itemId = ctx.legacy?.kind === "digitPicker" ? ctx.legacy.itemId : undefined;
      const same = state.base?.kind === "digitPicker" && state.base.pool.join() === pool.join();
      // The same hand dealt again is a NEW build (the example, or the last build, must not sit in the slots): cleared slots, the ledger kept.
      if (same && state.base?.kind === "digitPicker") return { ...state, base: { ...state.base, built: null, builtName: null, builtBy: "child" }, pointer: { text: "picker" }, seq };
      // A hand dealt again — whatever came between — finds the ledger of what the child built from it.
      // The puzzle: the printed pool (an item), and every hand dealt while it is on the board.
      const puzzle = Boolean(itemId) || (state.base?.kind === "digitPicker" && Boolean(state.base.puzzle));
      return withBase(state, { kind: "digitPicker", pool, built: null, builtName: null, builtBy: "child", itemId, ledger: state.pickerLedgers[handKey(pool)] ?? [], puzzle }, { text: "picker" });
    }
    case "digitPicker.tap": {
      if (state.base?.kind !== "digitPicker") return state;
      const built = `${state.base.built ?? ""}${Number(args.digit)}`;
      return { ...state, base: { ...state.base, built, builtName: null }, pointer: { digit: Number(args.digit) }, seq };
    }
    case "digitPicker.built_number": {
      if (state.base?.kind !== "digitPicker") return state;
      const literal = typeof args.digits === "string" && /^\d+$/u.test(args.digits) ? args.digits : null;
      const digits = literal ?? (ctx.lastBuilt !== null && ctx.lastBuilt !== undefined ? String(ctx.lastBuilt) : null);
      if (!digits) return state; // the child never built one — the picker stays as it is
      const name = literal && typeof args.name === "string" && !args.name.includes("(") ? args.name : safeName(Number(digits));
      const by = args.by === "tutor" ? "tutor" : "child";
      // The puzzle's ledger: every number the child builds from this hand, once — kept on the stage, by hand.
      const ledger = by === "child" && !state.base.ledger.includes(digits) ? [...state.base.ledger, digits] : state.base.ledger;
      const pickerLedgers = by === "child" ? { ...state.pickerLedgers, [handKey(state.base.pool)]: ledger } : state.pickerLedgers;
      return { ...state, base: { ...state.base, built: digits, builtName: name, builtBy: by, ledger }, pickerLedgers, pointer: { number: Number(digits) }, seq };
    }
    case "digitPicker.clear_built": {
      if (state.base?.kind !== "digitPicker") return state;
      return { ...state, base: { ...state.base, built: null, builtName: null }, seq };
    }
    // --- number cards ---
    case "numberCards.show": {
      const values = asNumberArray(args.values);
      const same = state.base?.kind === "numberCards" && state.base.values.join() === values.join();
      if (same) return { ...state, pointer: { card: values[0]! }, seq };
      // Four cards drawn from the ten-card row lift out of it (rule d): the row stays, veiled.
      if (state.base?.kind === "numberCards" && state.base.values.length === 10 && values.length > 0 && values.length < 10 && values.every((v) => state.base!.kind === "numberCards" && state.base.values.includes(v))) {
        return { ...state, base: { ...state.base, drawn: values, ringed: null }, pointer: { card: values[0]! }, highlight: null, seq };
      }
      return withBase(state, { kind: "numberCards", values, ringed: null }, values.length ? { card: values[0]! } : null);
    }
    case "numberCards.highlight_ring": {
      if (state.base?.kind !== "numberCards") return state;
      const value = Number(args.value);
      return { ...state, base: { ...state.base, ringed: value }, pointer: { card: value }, seq };
    }
    case "numberCards.ring_off": {
      if (state.base?.kind !== "numberCards") return state;
      return { ...state, base: { ...state.base, ringed: null }, seq };
    }
    // --- chalk ---
    case "chalkText.write": {
      const text = String(args.text ?? "");
      const append = typeof args.append === "string" ? args.append : undefined;
      const line: ChalkLine = { key: seq, text, append };
      if (state.base?.kind === "chalk") {
        // Growing the last line ("5 421 = 5000 +" → "… + 400 +") writes only the tail.
        const last = state.base.lines[state.base.lines.length - 1];
        const lines = append && last && text.startsWith(last.text) ? [...state.base.lines.slice(0, -1), { ...line, key: last.key + 0.5 }] : [...state.base.lines, line];
        return { ...state, base: { kind: "chalk", lines }, pointer: { text }, seq };
      }
      // A table carries its own labels: a term written beside it has nowhere to sit (the table spans the inset), so only the pointer moves.
      if (state.base?.kind === "blankTable" && isTermNote(text)) return { ...state, pointer: { text: "table" }, seq };
      if (state.base !== null && (isTermNote(text) || PERSISTENT_BASES.has(state.base.kind))) {
        // Rule (b): the abacus, a card, the picker, the expansion and the
        // tables stay while chalk is written beside them — the lines stack
        // (an append grows the last one); a term is always a note.
        const last = state.notes[state.notes.length - 1];
        // A sum beneath the base stands with the other sums; her term labels step aside for it (G10).
        const kept = isTermNote(text) ? state.notes : state.notes.filter((n) => !isTermNote(n.text));
        const lastKept = kept[kept.length - 1];
        const notes = append && last && text.startsWith(last.text) ? [...kept.filter((n) => n !== last), { ...line, key: last.key + 0.5 }] : lastKept && text.startsWith(lastKept.text) && append ? [...kept.slice(0, -1), { ...line, key: lastKept.key + 0.5 }] : [...kept, line];
        return { ...state, notes, pointer: { text }, seq };
      }
      return withBase(state, { kind: "chalk", lines: [line] }, { text });
    }
    case "chalkText.erase":
      return { ...state, base: null, notes: [], highlight: null, pointer: null, wipe: state.wipe + 1, seq };
    // --- pointer / highlight ---
    case "pointer.move_to": {
      const target = (args.target as Target) ?? null;
      // The hand moving to another rod, or to the whole number, takes the last rod's answer off the board.
      const base = state.base?.kind === "abacus" && target && ("rod" in target || "number" in target) ? withoutStaleRodAnswer(state.base, "rod" in target ? [target.rod] : null) : state.base;
      return { ...state, base, pointer: target, seq };
    }
    case "pointer.pulse":
      return { ...state, pointerPulse: state.pointerPulse + 1, seq };
    case "pointer.hide":
      return { ...state, pointer: null, seq };
    case "highlight.circle":
    case "highlight.underline": {
      const target = (args.target as Target) ?? null;
      // One glow at a time: a saffron ring on the board takes the rods' glow with it.
      // A ring is about the whole number: no rod is under discussion, so no rod's answer stays (one value at a time).
      const base = target && state.base?.kind === "abacus" ? { ...withoutStaleRodAnswer(state.base, null), glowRods: [] } : state.base;
      return { ...state, base, highlight: target ? { kind: event.event as "circle" | "underline", target } : null, pointer: target ?? state.pointer, seq };
    }
    case "highlight.off":
      return { ...state, highlight: null, seq };
    // --- money ---
    case "money.show":
      return withBase(state, { kind: "money", items: (args.items as Array<{ denomination: number; count: number }>) ?? [], counted: 0 }, null);
    case "money.count": {
      if (state.base?.kind !== "money") return state;
      return { ...state, base: { ...state.base, counted: Number(args.step) }, seq };
    }
    // --- cards ---
    case "titleCard.show": {
      const title = String(args.title ?? "");
      // The design's title card carries no pointer (M1, M2).
      return withBase(state, { kind: "titleCard", title, emoji: typeof args.emoji === "string" ? args.emoji : undefined }, null);
    }
    case "textCard.show": {
      const text = String(args.text ?? "");
      // A text card beside the title card: the title stays, dimmed, and the cards stack beside it (G1, rule b).
      if (state.base?.kind === "titleCard") {
        // A term card stacks behind the number card and leaves the hand on the number (G1: pointer on 100 000).
        const pointer = /\d/u.test(text) || !state.pointer ? { text } : state.pointer;
        return { ...state, base: { ...state.base, cards: [...(state.base.cards ?? []), text].slice(-2) }, pointer, highlight: null, seq };
      }
      // The number the drawn cards make joins the row (G3: "3 0 5 8 → 3058") instead of replacing it; the arrow is the eye, no hand.
      if (state.base?.kind === "numberCards" && state.base.drawn?.length && state.base.drawn.join("") === text.replace(/\s/gu, "")) {
        return { ...state, base: { ...state.base, made: text }, pointer: null, highlight: null, seq };
      }
      return withBase(state, { kind: "textCard", text }, { text });
    }
    // --- table ---
    case "blankTable.show": {
      const legacy = ctx.legacy?.kind === "blankTable" ? ctx.legacy : null;
      if (state.base?.kind === "blankTable" && (!legacy || state.base.itemId === legacy.itemId)) return { ...state, pointer: { text: "table" }, seq };
      if (!legacy) return state;
      return withBase(state, legacy, { text: "table" });
    }
    case "blankTable.row_activate": {
      if (state.base?.kind !== "blankTable") return state;
      const cell = { row: Number(args.row), field: String(args.field) };
      // The hand rests on the row's number (M10, G13: "pointer on 6572").
      const numberCell = { row: cell.row, field: state.base.columns[0]?.key ?? cell.field };
      return { ...state, base: { ...state.base, activeBlank: cell }, pointer: { cell: numberCell }, entry: null, seq };
    }
    case "blankTable.cell_fill": {
      if (state.base?.kind !== "blankTable") return state;
      const fill: TableFill = { row: Number(args.row), field: String(args.field), value: String(args.value ?? ""), by: args.by === "child" ? "child" : "tutor" };
      // The child's own answer stands: a confirmation that writes the same
      // cell afterwards must not turn their green into her blue.
      if (fill.by === "tutor" && state.base.filled.some((f) => f.row === fill.row && f.field === fill.field && f.by === "child")) return state;
      const filled = [...state.base.filled.filter((f) => !(f.row === fill.row && f.field === fill.field)), fill];
      // Filling the outlined cell closes it; a fill elsewhere (her worked row) leaves the child's cell outlined.
      const activeBlank = state.base.activeBlank && state.base.activeBlank.row === fill.row && state.base.activeBlank.field === fill.field ? null : state.base.activeBlank;
      // Her own fill (a demonstration, a neutral confirmation) is pointed at where it lands; the child's keeps the pointer on the row's number (M10).
      const pointer = fill.by === "tutor" ? { cell: { row: fill.row, field: fill.field } } : { cell: { row: fill.row, field: state.base.columns[0]?.key ?? fill.field } };
      return { ...state, base: { ...state.base, filled, activeBlank }, pointer, seq };
    }
    case "choiceChips.show": {
      const options = Array.isArray(args.options) ? (args.options as unknown[]).map(String) : [];
      if (options.length === 0) return state;
      return { ...state, chips: { options, correctIndex: Number(args.correctIndex ?? 0) }, seq };
    }
    case "choiceChips.clear":
      return state.chips ? { ...state, chips: null, seq } : state;
    case "turn.your_turn": {
      const answerMode = String(args.answerMode) as AnswerMode;
      // The child's turn: her term labels beside the surface step aside (M7, S2 show the abacus without "ගණක රාමුව"); a sum stays.
      const notes = state.notes.filter((n) => /\d/u.test(n.text));
      // A new question starts clean: the last entry leaves, and so does the answer under the last rod asked.
      const base = state.base?.kind === "abacus" ? withoutStaleRodAnswer(state.base, null) : state.base;
      return { ...state, base, turn: { answerMode, surface: String(args.surface) as TurnSurface }, pause: null, retry: false, entry: null, notes, seq };
    }
    case "turn.over":
      // The window closing on a tap keeps the chips up: the tapped one is the child's entry, and it is about to be marked ✓ or wobble.
      if (state.entry?.verdict === "pending") return { ...state, turn: null, pause: null, retry: false, seq };
      return state.turn || state.chips || state.pause || state.retry ? { ...state, turn: null, chips: null, pause: null, retry: false, seq } : state;
    case "turn.retry":
      return { ...state, retry: true, turn: null, seq };
    case "turn.pause":
      // A soft check: she pauses for the child to chime in. Nothing is drawn — the pause is time, not a cue.
      return { ...state, pause: { ms: Number(args.ms ?? 0) }, turn: null, chips: null, seq };
    default:
      return state;
  }
}

/** A hand of digits, order-free. */
function handKey(pool: number[]): string {
  return [...pool].sort((a, b) => a - b).join("");
}

function safeName(value: number): string {
  try {
    return sinhalaNumberName(value);
  } catch {
    return "";
  }
}

// --- the runtime's older boards, on the same stage ------------------------

// The columns' names are copy (board.col.*): shorter than the textbook's own headings on purpose (the quiz uses those).
const BREAKDOWN_COLUMNS: TableColumn[] = [
  { key: "number", label: t("board.col.number") },
  { key: "digit", label: t("board.col.digit") },
  { key: "place", label: t("board.col.place") },
  { key: "placeValue", label: t("board.col.placeValue") },
  { key: "valueRepresented", label: t("board.col.value") },
];
const NUMBER_NAME_COLUMNS: TableColumn[] = [
  { key: "number", label: t("board.col.number") },
  { key: "numberName", label: t("board.col.numberName") },
];

/** A text card that is a row of numbers is a row of cards, never chalk. */
export function rowOfCards(text: string): number[] | null {
  const body = text.replace(/^[^\d:=+]+:\s*/u, "");
  const joined = body.replace(/(\d)\s(?=\d{3}(?!\d))/gu, "$1");
  if (!/^[\d\s,]+$/u.test(joined) || joined.includes("=")) return null;
  const values = (joined.match(/\d+/gu) ?? []).map(Number);
  return values.length >= 2 ? values : null;
}

/** The runtime's BoardContent as a stage base — the same board draws both. */
export function stageFromLegacy(content: BoardContent | null): StageBase {
  if (!content || content.type === "empty") return null;
  switch (content.type) {
    case "abacus":
      return { kind: "abacus", digits: content.digits, shown: content.shown, animate: content.selfAnimate, glowRods: [], childAnswer: content.childAnswer, expansion: null };
    case "title_card":
      return { kind: "titleCard", title: content.title, emoji: content.emoji };
    case "text_card": {
      const cards = rowOfCards(content.text);
      if (cards) return { kind: "numberCards", values: cards, ringed: content.highlight ? Number(content.highlight) : null };
      const lines = content.text.split("\n").filter(Boolean);
      if (lines.length === 1 && content.text.length <= 14 && !/[=+]/u.test(content.text)) return { kind: "textCard", text: content.text };
      return { kind: "chalk", lines: lines.map((text, i) => ({ key: i + 1, text })) };
    }
    case "lesson_content": {
      const components = content.components as LessonComponent[];
      if (components.length === 1) {
        const [component] = components;
        if (component!.type === "DigitPickerPuzzle") {
          const built = content.builtNumber?.digits ?? null;
          return { kind: "digitPicker", pool: component!.props.availableDigits, built, builtName: content.builtNumber?.name ?? null, builtBy: "child", itemId: content.itemId , ledger: [] };
        }
        if (component!.type === "PlaceValueTable") {
          const props = component!.props;
          const rows: Array<Record<string, string | number | null>> =
            props.variant === "breakdown"
              ? (props.rows as PlaceValueBreakdownRow[]).map((r) => ({ number: r.number, digit: r.digit, place: r.place, placeValue: r.placeValue, valueRepresented: r.valueRepresented }))
              : (props.rows as PlaceValueNumberNameRow[]).map((r) => ({ number: r.number, numberName: r.numberName }));
          return {
            kind: "blankTable",
            columns: props.variant === "breakdown" ? BREAKDOWN_COLUMNS : NUMBER_NAME_COLUMNS,
            rows,
            filled: content.filledAnswers.map((f) => ({ row: f.rowIndex, field: f.field, value: f.value, by: f.source === "tutor" ? "tutor" : "child" })),
            activeBlank: content.activeBlank ? { row: content.activeBlank.rowIndex, field: content.activeBlank.field } : null,
            itemId: content.itemId,
          };
        }
        if (component!.type === "AbacusDiagram") {
          return { kind: "abacus", digits: component!.props.digits, shown: component!.props.digits, animate: false, glowRods: [], childAnswer: null, expansion: null };
        }
      }
      return { kind: "legacy", content };
    }
    default:
      return { kind: "legacy", content };
  }
}

// --- sentence spans -------------------------------------------------------

export interface AlignedSpans {
  list: Array<{ startMs: number; endMs: number }>;
  /** True when the clip's own spans did not fit the storyboard's sentences. */
  estimated: boolean;
}

/**
 * The clip's stored spans when they match the storyboard's sentence count,
 * else spans estimated from each sentence's share of the characters —
 * a clip rendered on demand, or missing, still gets its events in order.
 */
export function alignSpans(meta: { durationMs: number; sentences: Array<{ startMs: number; endMs: number }> } | null, sentences: string[]): AlignedSpans {
  if (meta && meta.sentences.length === sentences.length && sentences.length > 0) return { list: meta.sentences, estimated: false };
  const durationMs = meta?.durationMs ?? sentences.join(" ").length * 110;
  const weights = sentences.map((s) => Math.max(1, s.replace(/\s/gu, "").length));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const list = weights.map((w) => {
    const startMs = Math.round(cursor);
    cursor += (w / total) * durationMs;
    return { startMs, endMs: Math.round(cursor) };
  });
  return { list, estimated: true };
}

// --- the child's turn -----------------------------------------------------

export type AnswerSurface = "abacus" | "digitPicker" | "blankTable" | "expansion" | "numberCards";

export interface SurfaceInfo {
  surface: AnswerSurface;
  /** Where feedback lands and the pointer parks near. */
  target: Target | null;
  /** The number an abacus currently shows (a reading question needs no beads moved). */
  shownNumber: string | null;
}

export function answerSurfaceFor(stage: StageState): SurfaceInfo | null {
  const base = stage.base;
  if (!base) return null;
  switch (base.kind) {
    case "abacus":
      if (base.expansion) {
        const index = base.expansion.parts.findIndex((p) => p === null);
        return { surface: "expansion", target: { part: Math.max(0, index) }, shownNumber: null };
      }
      return { surface: "abacus", target: { text: "abacus" }, shownNumber: base.shown.join("") };
    case "digitPicker":
      return { surface: "digitPicker", target: { text: "picker" }, shownNumber: null };
    case "blankTable":
      return { surface: "blankTable", target: base.activeBlank ? { cell: base.activeBlank } : { text: "table" }, shownNumber: null };
    case "expansion": {
      const index = base.expansion.parts.findIndex((p) => p === null);
      return { surface: "expansion", target: { part: Math.max(0, index) }, shownNumber: null };
    }
    case "numberCards":
      return { surface: "numberCards", target: { card: base.ringed ?? base.values[0]! }, shownNumber: null };
    default:
      return null;
  }
}

/** One line for logs, data attributes and the session trace. */
export function describeStage(stage: StageState): string {
  return describeBase(stage) + (stage.chips ? ` · chips ${stage.chips.options.join(" | ")}` : "") + (stage.turn ? ` · your turn: ${stage.turn.answerMode} on ${stage.turn.surface}` : "") + (stage.pause ? ` · pause ${stage.pause.ms}ms` : "") + (stage.retry ? " · retry button" : "");
}

function describeBase(stage: StageState): string {
  const base = stage.base;
  let text = "nothing";
  if (base) {
    switch (base.kind) {
      case "abacus":
        text = `abacus ${base.digits.join("")} (beads ${base.shown.join("")})${base.expansion ? ` + expansion ${base.expansion.number}` : ""}`;
        break;
      case "numberCards":
        text = `cards ${base.values.join("·")}${base.ringed !== null ? ` ring ${base.ringed}` : ""}`;
        break;
      case "chalk":
        text = `chalk "${base.lines.map((l) => l.text).join(" / ")}"`;
        break;
      case "textCard":
        text = `card "${base.text}"`;
        break;
      case "titleCard":
        text = `title "${base.title}"`;
        break;
      case "digitPicker":
        text = `picker ${base.pool.join("·")}${base.built ? ` built ${base.built}` : ""}${base.ledger.length ? ` ledger ${base.ledger.join(",")}` : ""}`;
        break;
      case "expansion":
        text = `expansion ${base.expansion.number}`;
        break;
      case "blankTable":
        text = `table ${base.rows.length} rows${base.activeBlank ? ` active ${base.activeBlank.row}/${base.activeBlank.field}` : ""}`;
        break;
      case "placeValueStrip":
        text = `strip ${base.digits.map((d) => d ?? "_").join("")}`;
        break;
      case "money":
        text = `money ${base.items.length} kinds`;
        break;
      case "legacy":
        text = `legacy ${base.content.type}`;
        break;
    }
  }
  const notes = stage.notes.length ? ` · notes ${stage.notes.map((n) => n.text).join(", ")}` : "";
  const pointer = stage.pointer ? ` · pointer ${JSON.stringify(stage.pointer)}` : "";
  return `${text}${notes}${pointer}`;
}

// --- concepts, in the child's language -----------------------------------

/** Sinhala titles for the progress strip and the session card. */
/** The concepts' names on the board, the cards and the certificate — copy (concept.<tag>), one per concept tag. */
const CONCEPT_TAGS_WITH_TITLES = ["lessonOpening", "readWrite4Digit", "placeValue4Digit", "abacusRepresentation", "expandedForm", "compareNumbers", "orderNumbers", "numberNames", "fiveDigit", "expandedForm4Digit", "beyond9999", "digitGroupingRule", "tenThousandsPlace", "placeValueTable5Digit", "expandedForm5Digit"] as const;
export const CONCEPT_TITLES: Record<string, string> = Object.fromEntries(CONCEPT_TAGS_WITH_TITLES.map((tag) => [tag, t(`concept.${tag}` as CopyKey)]));

export function conceptTitle(tag: string, fallback?: string | null): string {
  return CONCEPT_TITLES[tag] ?? fallback ?? tag;
}

/** The textbook exercises a session works, by content_bank id prefix — named on the session's close card and the lesson detail. */
export const ITEM_TITLES: Record<string, string> = Object.fromEntries(["7b58e436", "4c2aa078", "7daf0141"].map((prefix) => [prefix, t(`item.${prefix}` as CopyKey)]));

export function itemTitle(itemId: string): string | null {
  return ITEM_TITLES[itemId.slice(0, 8)] ?? null;
}
