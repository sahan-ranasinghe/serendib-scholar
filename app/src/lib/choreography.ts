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
import type { BoardContent } from "@/lib/board";
import type { LessonComponent, PlaceValueBreakdownRow, PlaceValueNumberNameRow } from "@/data/lessons/lesson1-numbers";
import type { Target } from "@/components/board/events";
import { VOCABULARY } from "@/components/board/events";
import { sinhalaNumberName } from "@/lib/sinhalaNumber";

// --- the storyboard file ----------------------------------------------------

export interface StoryboardEvent {
  sentenceIndex: number;
  primitive: string;
  event: string;
  args: Record<string, unknown> | null;
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
  child: { kind: string; via: string; expects?: string } | null;
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
      glowRod: number | null;
      childAnswer: string | null;
      /** The expanded form, staged BENEATH the abacus. */
      expansion: ExpansionState | null;
    }
  | { kind: "numberCards"; values: number[]; ringed: number | null }
  | { kind: "chalk"; lines: ChalkLine[] }
  | { kind: "textCard"; text: string }
  | { kind: "titleCard"; title: string; emoji?: string }
  | {
      kind: "digitPicker";
      pool: number[];
      /** The number written beneath the tiles, if any. */
      built: string | null;
      builtName: string | null;
      builtBy: "child" | "tutor";
      itemId?: string;
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

/** A chalk line that is a term — a word or two, no digits — is written beside the board, not instead of it. */
function isTermNote(text: string): boolean {
  return !/\d/u.test(text) && text.trim().split(/\s+/u).length <= 3;
}

/** A base change clears what was drawn around the old one. */
function withBase(state: StageState, base: StageBase, pointer: Target | null): StageState {
  return { ...state, base, notes: [], highlight: null, pointer, seq: state.seq + 1 };
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
        { kind: "abacus", digits, shown, animate: Boolean(args.animate), glowRod: null, childAnswer: null, expansion: null },
        { text: "abacus" },
      );
    }
    case "abacus.bead_add": {
      if (state.base?.kind !== "abacus") return state;
      const rod = Number(args.rod);
      const count = Number(args.count);
      const shown = state.base.shown.map((n, i) => (i === rod ? Math.min(state.base!.kind === "abacus" ? state.base.digits[i]! : 9, n + count) : n));
      return { ...state, base: { ...state.base, shown }, pointer: { rod }, seq };
    }
    case "abacus.rod_glow": {
      if (state.base?.kind !== "abacus") return state;
      const rod = Number(args.rod);
      return { ...state, base: { ...state.base, glowRod: rod }, pointer: { rod }, seq };
    }
    case "abacus.child_answer_overlay": {
      if (state.base?.kind !== "abacus") return state;
      return { ...state, base: { ...state.base, childAnswer: String(args.text ?? "") }, seq };
    }
    case "abacus.clear_overlay": {
      if (state.base?.kind !== "abacus") return state;
      return { ...state, base: { ...state.base, childAnswer: null }, seq };
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
      if (state.base?.kind === "abacus") return { ...state, base: { ...state.base, expansion }, pointer: { number }, highlight: null, seq };
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
      if (state.base?.kind === "abacus" && state.base.expansion) return { ...state, base: { ...state.base, expansion: { ...state.base.expansion, fly }, glowRod: fromRod }, pointer: { part: index }, seq };
      if (state.base?.kind === "expansion") return { ...state, base: { ...state.base, expansion: { ...state.base.expansion, fly } }, pointer: { part: index }, seq };
      return state;
    }
    // --- digit picker ---
    case "digitPicker.show": {
      const pool = Array.isArray(args.pool) ? asNumberArray(args.pool) : ctx.legacy?.kind === "digitPicker" ? ctx.legacy.pool : [];
      const itemId = ctx.legacy?.kind === "digitPicker" ? ctx.legacy.itemId : undefined;
      const same = state.base?.kind === "digitPicker" && state.base.pool.join() === pool.join();
      if (same) return { ...state, pointer: { text: "picker" }, seq };
      return withBase(state, { kind: "digitPicker", pool, built: null, builtName: null, builtBy: "child", itemId }, { text: "picker" });
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
      return { ...state, base: { ...state.base, built: digits, builtName: name, builtBy: by }, pointer: { number: Number(digits) }, seq };
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
      if (state.base !== null && isTermNote(text)) {
        return { ...state, notes: [...state.notes, line], pointer: { text }, seq };
      }
      return withBase(state, { kind: "chalk", lines: [line] }, { text });
    }
    case "chalkText.erase":
      return { ...state, base: null, notes: [], highlight: null, pointer: null, wipe: state.wipe + 1, seq };
    // --- pointer / highlight ---
    case "pointer.move_to":
      return { ...state, pointer: (args.target as Target) ?? null, seq };
    case "pointer.pulse":
      return { ...state, pointerPulse: state.pointerPulse + 1, seq };
    case "pointer.hide":
      return { ...state, pointer: null, seq };
    case "highlight.circle":
    case "highlight.underline": {
      const target = (args.target as Target) ?? null;
      return { ...state, highlight: target ? { kind: event.event as "circle" | "underline", target } : null, pointer: target ?? state.pointer, seq };
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
      return withBase(state, { kind: "titleCard", title, emoji: typeof args.emoji === "string" ? args.emoji : undefined }, { text: title });
    }
    case "textCard.show": {
      const text = String(args.text ?? "");
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
      return { ...state, base: { ...state.base, activeBlank: cell }, pointer: { cell }, seq };
    }
    case "blankTable.cell_fill": {
      if (state.base?.kind !== "blankTable") return state;
      const fill: TableFill = { row: Number(args.row), field: String(args.field), value: String(args.value ?? ""), by: args.by === "child" ? "child" : "tutor" };
      const filled = [...state.base.filled.filter((f) => !(f.row === fill.row && f.field === fill.field)), fill];
      return { ...state, base: { ...state.base, filled, activeBlank: null }, pointer: { cell: { row: fill.row, field: fill.field } }, seq };
    }
    default:
      return state;
  }
}

function safeName(value: number): string {
  try {
    return sinhalaNumberName(value);
  } catch {
    return "";
  }
}

// --- the runtime's older boards, on the same stage ------------------------

const BREAKDOWN_COLUMNS: TableColumn[] = [
  { key: "number", label: "සංඛ්‍යාව" },
  { key: "digit", label: "ඉලක්කම" },
  { key: "place", label: "ස්ථානය" },
  { key: "placeValue", label: "ස්ථානීය අගය" },
  { key: "valueRepresented", label: "අගය" },
];
const NUMBER_NAME_COLUMNS: TableColumn[] = [
  { key: "number", label: "සංඛ්‍යාව" },
  { key: "numberName", label: "සංඛ්‍යා නාමය" },
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
      return { kind: "abacus", digits: content.digits, shown: content.shown, animate: content.selfAnimate, glowRod: null, childAnswer: content.childAnswer, expansion: null };
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
          return { kind: "digitPicker", pool: component!.props.availableDigits, built, builtName: content.builtNumber?.name ?? null, builtBy: "child", itemId: content.itemId };
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
          return { kind: "abacus", digits: component!.props.digits, shown: component!.props.digits, animate: false, glowRod: null, childAnswer: null, expansion: null };
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
        text = `picker ${base.pool.join("·")}${base.built ? ` built ${base.built}` : ""}`;
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
export const CONCEPT_TITLES: Record<string, string> = {
  lessonOpening: "පාඩම පටන් ගමු",
  readWrite4Digit: "සංඛ්‍යා කියවමු, ලියමු",
  placeValue4Digit: "ස්ථානීය අගය",
  abacusRepresentation: "ගණක රාමුව",
  expandedForm: "විහිදුවා ලිවීම",
  compareNumbers: "සංඛ්‍යා සසඳමු",
  orderNumbers: "පිළිවෙළට තබමු",
  numberNames: "සංඛ්‍යා නාම",
  fiveDigit: "ඉලක්කම් පහේ සංඛ්‍යා",
};

export function conceptTitle(tag: string, fallback?: string | null): string {
  return CONCEPT_TITLES[tag] ?? fallback ?? tag;
}
