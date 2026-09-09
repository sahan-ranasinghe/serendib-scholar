/**
 * The storyboard: what the board does while each line is spoken.
 *
 *   npm run storyboard
 *
 * Writes, for lesson 1 session 1:
 *   docs/storyboard/maths-5-1-session-1.json   the plan, machine-readable
 *   docs/storyboard/maths-5-1-session-1.md     the same, for reading
 *   docs/storyboard/script-notes.md            where the words and the
 *                                              picture do not fit
 *
 * NO MODEL. The bookkeeping is mechanical — sentence splitting, carrying
 * board state within a concept the way the runtime does, finding the
 * numbers, places and terms a sentence names — and the rules that turn
 * those into events are the ones written at the top of this file. The
 * judgment (which primitive, which wording to suggest) is authored: the
 * rules here, the vocabulary in docs/design/board-vocabulary.md, and every
 * suggested line in docs/storyboard/script-note-suggestions.json.
 *
 * THE RULES
 *   1. Every sentence that names a number, a place or a vocabulary term
 *      gets a visual event.
 *   2. The pointer goes to whatever she is talking about.
 *   3. At most two events per sentence.
 *   4. Board state carries within a concept; a beat with no board intent
 *      inherits.
 *   5. A beat's own board intent (show / reveal / bead_add / row_activate /
 *      built_number) lands on its first sentence.
 *   6. Cards are cards. A text intent that is a row of digits — labelled
 *      ("කාඩ්පත්: 0, 1, …") or bare ("1, 3, 8, 6") — is numberCards, and a
 *      line that says කාඩ්පත් while the board shows chalk is a board note.
 *
 * A NOTE is raised — never a change made — when the line and the plan do
 * not fit: a referent with nothing to point at, "බලන්න" with nothing
 * appearing, a number spoken while the board shows another, a child
 * asked to act on a board that offers no way to act, or a sentence with
 * nothing to show.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseAuthoredScript, type AuthoredBeat, type AuthoredBoardIntent } from "../src/lib/authoredScript";
import { renderNumberMarkers, sinhalaNumberName } from "../src/lib/sinhalaNumber";
import { sentencesOf } from "../src/lib/scriptDistance";
import { parseAnswerPredicate } from "../src/lib/answerCheck";
import { resolveAddress } from "../src/lib/addressToken";
import { PLACE_PATTERNS } from "../src/lib/choreography";

const ROOT = process.cwd();
const SCRIPT_PATH = path.join(ROOT, "src/data/lessons/authored/maths-5-1.json");
const OUT_DIR = path.join(ROOT, "..", "docs", "storyboard");
/** The runtime's copy — the choreography imports it from inside the app tree. */
const APP_COPY = path.join(ROOT, "src", "data", "storyboard", "maths-5-1-session-1.json");
const SUGGESTIONS_PATH = path.join(OUT_DIR, "script-note-suggestions.json");

// --- what the lesson's two content_bank exercises show ---------------------
// The script stages these by id; their contents live in the database. They
// are pinned here so the storyboard can be produced offline and so a
// reviewer can see what is on the board without a query.
const KNOWN_ITEMS: Record<string, { primitive: "digitPicker" | "blankTable"; summary: string; pool?: number[]; numbers?: number[] }> = {
  "7daf0141": {
    primitive: "digitPicker",
    summary: "the textbook's digit-card puzzle (make five four-digit numbers from the printed digits)",
  },
  "7b58e436": {
    primitive: "blankTable",
    summary: "the place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003",
    numbers: [2348, 2, 1000, 2000, 6572, 6, 5024, 4, 8700, 700, 9605, 7003],
  },
  "4c2aa078": {
    primitive: "blankTable",
    summary: "the numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015",
    numbers: [6528, 2430, 3100, 5060, 1008, 9015],
  },
};

// --- vocabulary ---------------------------------------------------------------
type Primitive =
  | "abacus" | "placeValueStrip" | "expansion" | "digitPicker" | "numberCards"
  | "chalkText" | "pointer" | "highlight" | "money" | "titleCard" | "textCard" | "blankTable";

interface Event {
  sentenceIndex: number;
  primitive: Primitive;
  event: string;
  args?: Record<string, unknown>;
}

/** Rod index by place name — the runtime's abacus_add numbering (0 = දා … 3 = එ). */
const ROD_LABELS = ["දා", "සි", "ද", "එ"] as const;
/** The place names per rod — shared with the runtime's checks (src/lib/choreography.ts). */
const PLACE_TO_ROD = PLACE_PATTERNS;

/** Guide vocabulary that gets WRITTEN on the board the first time it is said in a concept. */
const TERMS = ["සංඛ්‍යා නාමය", "ස්ථානීය අගය", "ගණක රාමුව", "විහිදුවා"];

const DEICTIC = /(^|[\s,(])(මෙන්න|මේක|මේකේ|මේකෙ|මේවා|මේ|අර|ඔය|මෙතන|මෙතැන|එතන|එතැන|එහි|ඒක|ඒවා)([\s,.!?]|$)/u;
const LOOK = /බලන්න|බලන්නකෝ|බලමු|බලලා|බලාගෙන/u;
/** Imperatives that ask the child to DO something on the board (not "we write it as…"). */
const BOARD_ACT = /හදලා මට කියන්න|හදන්න පුළුවන්ද|හදලා|හදමුද|තියලා මට|පුරවන්න|පුරවමු/u;
const POWERS_OF_TEN = new Set([10, 100, 1000, 10_000, 100_000]);

// --- board state, carried the way the runtime carries it --------------------
interface BoardState {
  primitive: Primitive | null;
  /** Human description of what is up. */
  description: string;
  /** Numbers a child can see, including what an abacus/expansion implies. */
  visible: Set<string>;
  digits: number[] | null; // abacus / expansion digits, by rod
  terms: Set<string>; // written this concept
  interactive: boolean; // picker or table up
  pool: number[] | null;
  cards: number[] | null;
  ringed: number | null;
  chalk: string | null;
  /** Beads currently on each rod, for an abacus built up rod by rod. */
  shown: number[] | null;
  /** An abacus this concept had up until a chalk card replaced it — rods she may still be talking about. */
  abacusLost: number[] | null;
  /** Set when the runtime re-stages an already-built abacus with animate. */
  reanimated: boolean;
  focus: string | null; // what the pointer would rest on
}

function emptyState(): BoardState {
  return { primitive: null, description: "nothing", visible: new Set(), digits: null, terms: new Set(), interactive: false, pool: null, cards: null, ringed: null, chalk: null, shown: null, abacusLost: null, reanimated: false, focus: null };
}

function derive(digits: number[]): Set<string> {
  const out = new Set<string>();
  out.add(digits.join(""));
  digits.forEach((d, i) => {
    out.add(String(d));
    out.add(String(d * 10 ** (digits.length - 1 - i)));
  });
  return out;
}

function numbersInText(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.replace(/(\d)\s(?=\d{3}(?!\d))/gu, "$1").matchAll(/\d+/gu)) out.add(m[0]);
  return out;
}

function textbook(n: number): string {
  const s = String(n);
  return s.length > 3 ? `${s.slice(0, -3)} ${s.slice(-3)}` : s;
}

/**
 * Applies a beat's board intent to the carried state and returns the
 * event(s) the intent itself produces (on sentence 0 by rule 5).
 */
function applyIntent(state: BoardState, intent: AuthoredBoardIntent): Event[] {
  const previous: BoardState = { ...state, visible: new Set(state.visible), terms: state.terms };
  const at0 = (primitive: Primitive, event: string, args?: Record<string, unknown>): Event => ({ sentenceIndex: 0, primitive, event, args });
  switch (intent.kind) {
    case "none":
      return [];
    case "clear":
      Object.assign(state, emptyState(), { terms: state.terms });
      return [at0("chalkText", "erase")];
    case "title":
      Object.assign(state, emptyState(), { terms: state.terms, primitive: "titleCard", description: `title card "${intent.title}"`, focus: intent.title });
      return [at0("titleCard", "show", { title: intent.title })];
    case "text": {
      // Rule 6, the example: a number made from the picker's own digits is
      // built on the picker, not written beside it in chalk.
      const example = previous.primitive === "digitPicker" && previous.pool ? exampleOnPicker(intent.text, previous.pool) : null;
      if (example !== null) {
        state.visible.add(String(example));
        state.focus = "the built number";
        state.description = `the digit picker ${previous.pool!.join(" · ")} showing ${textbook(example)}`;
        return [at0("digitPicker", "built_number", { digits: String(example), name: sinhalaNumberName(example), by: "tutor" })];
      }
      // A chalk card about the SAME number the abacus showed (its parts, its
      // expansion) is the abacus pushed off mid-run; a card about a different
      // number is a new topic, and the rods are no longer being talked about.
      const candidate = previous.primitive === "abacus" ? previous.digits : previous.abacusLost;
      const stillAbout = candidate !== null && [...numbersInText(intent.text)].some((n) => derive(candidate).has(n));
      const lostAbacus = stillAbout ? candidate : null;
      const cards = rowOfCards(intent.text);
      Object.assign(state, emptyState(), { terms: state.terms, abacusLost: lostAbacus });
      state.visible = numbersInText(intent.text);
      state.chalk = intent.text;
      if (cards) {
        // The runtime re-stages the card as a whole to move the ring; on
        // the board the same row is simply still up, so only the ring moves.
        const sameRow = previous.primitive === "numberCards" && previous.cards?.join() === cards.join();
        const previousRing = previous.ringed;
        state.primitive = "numberCards";
        state.cards = cards;
        state.ringed = intent.highlight ? Number(intent.highlight) : null;
        state.description = `number cards ${cards.join(" · ")}${state.ringed ? ` (ring on ${state.ringed})` : ""}`;
        state.focus = intent.highlight ?? String(cards[0]);
        const events: Event[] = sameRow ? [] : [at0("numberCards", "show", { values: cards })];
        if (state.ringed && (!sameRow || previousRing !== state.ringed)) events.push(at0("numberCards", "highlight_ring", { value: state.ringed }));
        return events;
      }
      state.primitive = intent.text.length <= 14 && !/[=+]/u.test(intent.text) ? "textCard" : "chalkText";
      state.description = `${state.primitive === "textCard" ? "card" : "chalk"} "${intent.text.replace(/\n/g, " / ")}"`;
      state.focus = intent.highlight ?? intent.text;
      // The same chalk re-staged is not rewritten; a longer line that
      // starts with what is already up is the expansion GROWING.
      const sameText = previous.chalk === intent.text;
      const grows = previous.chalk !== null && intent.text.startsWith(previous.chalk) && !sameText;
      const events: Event[] = sameText
        ? []
        : [at0(state.primitive, state.primitive === "textCard" ? "show" : "write", grows ? { text: intent.text, append: intent.text.slice(previous.chalk!.length).trim() } : { text: intent.text })];
      if (intent.highlight) events.push(at0("highlight", "circle", { target: { text: intent.highlight } }));
      return events;
    }
    case "abacus": {
      const built = previous.primitive === "abacus" && previous.shown !== null && previous.shown.some((n) => n > 0);
      const same = previous.primitive === "abacus" && previous.digits?.join() === intent.digits.join();
      if (built && intent.animate && previous.shown && intent.digits.every((d, rod) => d >= (previous.shown?.[rod] ?? 0))) {
        // The runtime re-stages the whole abacus with animate; on the
        // board, rods already carrying beads keep them and the beads land
        // on the rods still bare — one bead_add per remaining rod.
        const events: Event[] = [];
        intent.digits.forEach((d, rod) => {
          if (d > (previous.shown?.[rod] ?? 0)) events.push(at0("abacus", "bead_add", { rod, count: d - (previous.shown?.[rod] ?? 0) }));
        });
        state.digits = intent.digits;
        state.shown = [...intent.digits];
        state.visible = derive(intent.digits);
        state.description = `the abacus showing ${textbook(Number(intent.digits.join("")))}`;
        state.focus = "abacus";
        state.reanimated = true;
        return events;
      }
      if (same && !intent.animate && !intent.startEmpty) {
        state.description = `the abacus showing ${textbook(Number(intent.digits.join("")))}`;
        state.focus = "abacus";
        return []; // already up
      }
      Object.assign(state, emptyState(), { terms: state.terms });
      state.primitive = "abacus";
      state.digits = intent.digits;
      state.shown = intent.startEmpty ? intent.digits.map(() => 0) : [...intent.digits];
      state.visible = intent.startEmpty ? new Set() : derive(intent.digits);
      state.description = intent.startEmpty ? "the abacus, rods bare" : `the abacus showing ${textbook(Number(intent.digits.join("")))}`;
      state.focus = "abacus";
      return [at0("abacus", "show", { digits: intent.digits, startEmpty: intent.startEmpty ?? false, animate: intent.animate ?? false })];
    }
    case "abacus_add": {
      const adds = intent.adds ?? [{ rod: intent.rod, count: intent.count }];
      for (const { rod, count } of adds) {
        if (state.digits && state.shown) {
          state.shown[rod] = (state.shown[rod] ?? 0) + count;
          // The rod now shows its digit; the number becomes readable rod by rod.
          state.visible.add(String(count));
          state.visible.add(String(count * 10 ** (3 - rod)));
        }
      }
      if (state.shown && state.shown.every((n, i) => n === (adds.find((a) => a.rod === i)?.count ?? n))) {
        /* description below */
      }
      state.focus = `rod ${ROD_LABELS[adds[adds.length - 1]!.rod]}`;
      if (state.shown && state.shown.some((n) => n > 0)) {
        state.description = state.shown.every((n) => n > 0) || state.shown.filter((n) => n > 0).length >= 3
          ? `the abacus showing ${textbook(Number(state.shown.join("")))}`
          : `the abacus, ${state.shown.map((n, i) => (n > 0 ? `${ROD_LABELS[i]} ${n}` : null)).filter(Boolean).join(", ")}`;
      }
      return adds.map(({ rod, count }) => at0("abacus", "bead_add", { rod, count }));
    }
    case "exercise": {
      const known = KNOWN_ITEMS[intent.itemId.slice(0, 8)];
      Object.assign(state, emptyState(), { terms: state.terms });
      // The numbers printed on the item are on the board from here on.
      for (const n of known?.numbers ?? []) state.visible.add(String(n));
      state.primitive = known?.primitive ?? "blankTable";
      state.interactive = true;
      state.description = known?.summary ?? `exercise ${intent.itemId.slice(0, 8)}`;
      // (the numbers printed on the item were added above, from KNOWN_ITEMS)
      state.focus = state.primitive;
      return [at0(state.primitive, "show", state.primitive === "digitPicker" ? { pool: "as printed", item: intent.itemId.slice(0, 8) } : { item: intent.itemId.slice(0, 8) })];
    }
    case "blank":
      state.interactive = true;
      state.focus = `row ${intent.rowIndex} ${intent.field}`;
      return [at0("blankTable", "row_activate", { row: intent.rowIndex, field: intent.field })];
    case "digitPicker":
      Object.assign(state, emptyState(), { terms: state.terms });
      state.primitive = "digitPicker";
      state.pool = intent.digits;
      state.interactive = true;
      state.visible = new Set(intent.digits.map(String));
      state.description = `the digit picker ${intent.digits.join(" · ")}`;
      state.focus = "picker";
      return [at0("digitPicker", "show", { pool: intent.digits })];
    case "builtNumber":
      state.focus = "the built number";
      return [at0("digitPicker", "built_number", { digits: "the child's number", name: "sinhalaNumberName(N)" })];
    case "expansion":
      Object.assign(state, emptyState(), { terms: state.terms });
      state.primitive = "expansion";
      state.digits = [...String(intent.number)].map(Number);
      state.visible = new Set([String(intent.number), ...state.digits.map(String)]);
      state.description = `${textbook(intent.number)} = ${intent.answers.map(() => "▢").join(" + ")}`;
      state.focus = "expansion";
      return [at0("expansion", "show", { number: intent.number, parts: intent.answers.map(() => null) })];
    case "reveal": {
      state.visible.add(intent.value);
      if (intent.itemId.startsWith("expansion:")) {
        const index = Number(intent.field.replace(/\D/gu, "")) || 0;
        state.description = state.description.replace("▢", intent.value);
        state.focus = `part ${index}`;
        return [at0("expansion", "part_reveal", { index, value: intent.value })];
      }
      state.focus = `row ${intent.rowIndex} ${intent.field}`;
      return [at0("blankTable", "cell_fill", { row: intent.rowIndex, field: intent.field, value: intent.value, by: "tutor" })];
    }
  }
}

// --- per-sentence analysis ----------------------------------------------------
interface SentenceFacts {
  index: number;
  spoken: string;
  numbers: number[];
  rods: number[];
  terms: string[];
  deictic: string | null;
  looks: boolean;
  boardAct: boolean;
}

function analyse(sourceSentence: string, index: number): SentenceFacts {
  const { spoken, numbers } = renderNumberMarkers(resolveAddress(sourceSentence, "unspecified"));
  const rods: number[] = [];
  for (const [pattern, rod] of PLACE_TO_ROD) if (pattern.test(spoken) && rod >= 0 && !rods.includes(rod)) rods.push(rod);
  const terms = TERMS.filter((t) => spoken.includes(t));
  const deictic = DEICTIC.exec(spoken)?.[2] ?? null;
  return { index, spoken, numbers, rods, terms, deictic, looks: LOOK.test(spoken), boardAct: BOARD_ACT.test(spoken) };
}

interface NoteCandidate {
  beatId: string;
  kind: "referent" | "look" | "number-mismatch" | "no-way-to-act" | "nothing-to-show" | "too-much-to-show" | "board-abacus-gone" | "board-reanimate" | "board-cards-as-chalk";
  sentenceIndex: number;
  line: string;
  problem: string;
}

interface StoryboardBeat {
  id: string;
  concept: string;
  type: string;
  pause: string | null;
  line: string;
  sentences: string[];
  boardAtStart: string;
  events: Event[];
  child: { kind: string; via: string; expects?: string } | null;
  sees: string;
}

/**
 * A text intent that is a row of digits is a row of CARDS, never chalk:
 * "84   101   528   997", "1, 3, 8, 6", or labelled — "කාඩ්පත්: 0, 1, 2, …",
 * "තෝරාගත් ඉලක්කම්: 3, 0, 5, 8". Returns the card values, or null.
 */
function rowOfCards(text: string): number[] | null {
  const body = text.replace(/^[^\d:=+]+:\s*/u, "");
  const joined = body.replace(/(\d)\s(?=\d{3}(?!\d))/gu, "$1"); // "6 831" is one number, not two cards
  if (!/^[\d\s,]+$/u.test(joined) || joined.includes("=")) return null;
  const values = (joined.match(/\d+/gu) ?? []).map(Number);
  return values.length >= 2 ? values : null;
}

/**
 * "1, 3, 6, 4   →   1 364" while the picker holds those very digits is an
 * example built ON the picker — the tiles stay, the number and its name
 * appear beneath, in Zara's colour. Returns the number, or null.
 */
function exampleOnPicker(text: string, pool: number[]): number | null {
  const match = text.match(/^\s*([\d\s,]+?)\s*→\s*([\d\s]+?)\s*$/u);
  if (!match) return null;
  const digits = (match[1]!.match(/\d/gu) ?? []).map(Number).sort();
  if (digits.join() !== [...pool].sort().join()) return null;
  const number = Number(match[2]!.replace(/\s/gu, ""));
  return [...String(number)].map(Number).sort().join() === digits.join() ? number : null;
}

function planBeat(beat: AuthoredBeat, state: BoardState, upcoming: AuthoredBoardIntent[]): { plan: StoryboardBeat; notes: NoteCandidate[] } {
  const boardAtStart = state.description;
  /** Will the board acquire this number within the next few beats? Announcing a number before building it is how a demonstration starts. */
  const arrivesSoon = (n: number): boolean =>
    upcoming.some((i) => {
      if (i.kind === "abacus") return derive(i.digits).has(String(n));
      // Beads landing on a bare abacus whose target is this number ARE the
      // number arriving, rod by rod ("ඔන්න අපි 5 421 මේ රාමුවට දාමු").
      if (i.kind === "abacus_add") return state.primitive === "abacus" && state.digits?.join("") === String(n);
      if (i.kind === "text") return numbersInText(i.text).has(String(n));
      if (i.kind === "expansion") return String(i.number) === String(n);
      if (i.kind === "reveal") return i.value === String(n);
      return false;
    });
  const intentEvents = applyIntent(state, beat.boardIntent);
  const introducesSomething = intentEvents.length > 0;

  const sourceSentences = sentencesOf(beat.sourceText);
  const facts = sourceSentences.map(analyse);
  const notes: NoteCandidate[] = [];
  const events: Event[] = [];
  const spokenLine = facts.map((f) => f.spoken).join(" ");

  /** "This" / "these" — the ringed card or the first card of a row, else the chalk in focus. */
  const focusTarget = (): Record<string, unknown> => {
    if (state.primitive === "numberCards" && state.cards) return { card: state.ringed ?? state.cards[0] };
    const cell = state.primitive === "blankTable" ? state.focus?.match(/^row (\d+) (\w+)$/u) : null;
    if (cell) return { cell: { row: Number(cell[1]), field: cell[2] } };
    return { text: state.focus ?? state.description };
  };

  facts.forEach((f) => {
    const mine: Event[] = f.index === 0 ? [...intentEvents] : [];
    let pointed = false;
    const point = (target: Record<string, unknown>) => {
      if (!pointed) mine.push({ sentenceIndex: f.index, primitive: "pointer", event: "move_to", args: { target } });
      pointed = true;
    };

    // Numbers she names. A card row dealt in THIS sentence already shows
    // each value as it lands — naming them is the deal, not four more rings.
    const dealt = mine.find((e) => e.primitive === "numberCards" && e.event === "show");
    const dealtValues = new Set(((dealt?.args?.values as number[] | undefined) ?? []).map(String));
    for (const n of f.numbers) {
      const key = String(n);
      if (dealtValues.has(key)) { pointed = true; continue; }
      if (state.primitive === "abacus" && state.digits) {
        const whole = Number(state.digits.join(""));
        if (n === whole) { point({ number: n }); continue; }
        const rod = state.digits.findIndex((d, i) => d * 10 ** (3 - i) === n && d !== 0);
        if (rod >= 0) { mine.push({ sentenceIndex: f.index, primitive: "abacus", event: "rod_glow", args: { rod } }); continue; }
        if (POWERS_OF_TEN.has(n)) { const r = 3 - Math.log10(n); if (r >= 0 && r <= 3) point({ rod: r }); continue; }
        if (n < 10 && state.digits.includes(n)) { point({ rod: state.digits.indexOf(n) }); continue; }
      }
      if (state.visible.has(key)) {
        if (state.primitive === "numberCards") mine.push({ sentenceIndex: f.index, primitive: "numberCards", event: "highlight_ring", args: { value: n } });
        else if (state.primitive === "expansion" && n !== Number(state.digits?.join(""))) point({ part: state.digits ? state.digits.findIndex((d, i) => d * 10 ** (3 - i) === n) : 0 });
        else point({ number: n });
        continue;
      }
      if (POWERS_OF_TEN.has(n) || n < 10) continue; // a unit or a count, not a thing on the board
      if (arrivesSoon(n)) { point(focusTarget()); continue; } // announced, then built
      notes.push({
        beatId: beat.id,
        kind: "number-mismatch",
        sentenceIndex: f.index,
        line: f.spoken,
        problem: `says ${textbook(n)} (${sinhalaNumberName(n)}) while the board shows ${state.description}`,
      });
    }

    // Places she names. A rod whose beads land in this sentence glows too —
    // the glow is the eye, the beads are the hands; without it the hundreds
    // rod stayed dark while she said its name and filled it (:40).
    for (const rod of f.rods) {
      if (state.primitive === "abacus") mine.push({ sentenceIndex: f.index, primitive: "abacus", event: "rod_glow", args: { rod } });
      else if (state.primitive === "expansion") point({ part: rod });
      else if (state.primitive === "blankTable") point({ column: ROD_LABELS[rod] });
      else if (state.primitive === "numberCards" && state.ringed !== null) point({ card: state.ringed, place: ROD_LABELS[rod] });
      else if ((state.primitive === "chalkText" || state.primitive === "textCard") && state.abacusLost)
        notes.push({ beatId: beat.id, kind: "board-abacus-gone", sentenceIndex: f.index, line: f.spoken, problem: `names rod ${ROD_LABELS[rod]} but the abacus (${textbook(Number(state.abacusLost.join("")))}) was replaced by ${state.description}` });
      else if (state.primitive === "chalkText" || state.primitive === "textCard") point({ text: state.focus ?? state.chalk ?? "", place: ROD_LABELS[rod] });
      else notes.push({ beatId: beat.id, kind: "referent", sentenceIndex: f.index, line: f.spoken, problem: `names a place (rod ${ROD_LABELS[rod]}) with no abacus, strip or table on the board (${state.description})` });
    }

    // Terms she names: written the first time, pointed at after.
    for (const term of f.terms) {
      if (!state.terms.has(term)) {
        state.terms.add(term);
        mine.push({ sentenceIndex: f.index, primitive: "chalkText", event: "write", args: { text: term } });
      } else point({ text: term });
    }

    // Referents.
    if (f.deictic) {
      if (state.primitive === null) {
        notes.push({ beatId: beat.id, kind: "referent", sentenceIndex: f.index, line: f.spoken, problem: `"${f.deictic}" with nothing on the board to point at` });
      } else if (!pointed && mine.length === 0) point(focusTarget());
    }

    // "බලන්න" with nothing new. A chalk mark on what is already there
    // satisfies it when there is a thing to mark (the whole number on the
    // abacus, the ringed card); a bare transition does not.
    if (f.looks && mine.filter((e) => e.primitive !== "pointer").length === 0 && !introducesSomething) {
      if (state.primitive === "abacus" && state.digits) {
        mine.push({ sentenceIndex: f.index, primitive: "highlight", event: "circle", args: { target: { number: Number(state.digits.join("")) } } });
      } else if (state.primitive === "numberCards" && state.ringed !== null) {
        mine.push({ sentenceIndex: f.index, primitive: "pointer", event: "pulse" });
      } else if (state.primitive === "digitPicker" || state.primitive === "blankTable" || state.primitive === "expansion") {
        mine.push({ sentenceIndex: f.index, primitive: "highlight", event: "circle", args: { target: { text: state.focus ?? state.description } } });
      } else if (state.abacusLost && f.rods.length > 0) {
        /* already raised as a board note above */
      } else {
        notes.push({ beatId: beat.id, kind: "look", sentenceIndex: f.index, line: f.spoken, problem: `"බලන්න" but nothing new appears — the board still shows ${state.description}` });
      }
    }

    // Rule 3: at most two. The same event twice is one; the pointer is
    // elastic and is the first to go, so only REAL animations count
    // against the cap.
    const seen = new Set<string>();
    const unique = mine.filter((e) => {
      const key = `${e.primitive}.${e.event}.${JSON.stringify(e.args ?? {})}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // A glow on a rod whose beads land in the same sentence is the same
    // thing as the beads — it is kept, and it does not count against the cap.
    const beadRods = new Set(unique.filter((e) => e.event === "bead_add").map((e) => e.args?.rod));
    const animations = unique.filter((e) => e.primitive !== "pointer");
    const counted = animations.filter((e) => !(e.event === "rod_glow" && beadRods.has(e.args?.rod)));
    const pointers = unique.filter((e) => e.primitive === "pointer");
    if (counted.length > 2) {
      notes.push({ beatId: beat.id, kind: "too-much-to-show", sentenceIndex: f.index, line: f.spoken, problem: `${counted.length} things to show in one sentence (${counted.map((e) => `${e.primitive}.${e.event}${e.args && "rod" in e.args ? ` ${ROD_LABELS[e.args.rod as number]}` : ""}`).join(", ")}) — only two fit` });
    }
    const kept = [...animations, ...pointers].slice(0, 2 + (animations.length - counted.length));
    events.push(...kept);

    const coveredByBoardNote = notes.some((n) => n.beatId === beat.id && n.sentenceIndex === f.index && n.kind.startsWith("board-"));
    if ((f.numbers.length > 0 || f.rods.length > 0 || f.terms.length > 0) && unique.length === 0 && !coveredByBoardNote) {
      notes.push({ beatId: beat.id, kind: "nothing-to-show", sentenceIndex: f.index, line: f.spoken, problem: "names a number, place or term but nothing on the board can show it" });
    }
  });

  // The child.
  let child: StoryboardBeat["child"] = null;
  const expects = beat.expectedAnswer ?? undefined;
  if (beat.type === "ASK" || beat.type === "CHECK_MY_WORK") {
    const predicate = parseAnswerPredicate(expects);
    const via = predicate
      ? "tap digits on the picker, or say the number"
      : beat.boardIntent.kind === "blank"
        ? "the number pad into the active cell, or say it"
        : /^[\d\s,]+$/u.test(expects ?? "")
          ? "number pad or voice"
          : "voice";
    child = { kind: beat.type === "CHECK_MY_WORK" ? "find the mistake" : "answer", via, expects: predicate ? `any arrangement of ${predicate.digits.join(",")}` : expects };
  } else if (beat.type === "SOFT_CHECK" || beat.pauseType === "SOFT_CHECK") {
    child = { kind: "soft check", via: "mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on" };
  }
  if (state.reanimated) {
    state.reanimated = false;
    notes.push({ beatId: beat.id, kind: "board-reanimate", sentenceIndex: 0, line: spokenLine, problem: "the runtime re-stages the whole abacus with animate; rods that already hold beads would land them again" });
  }
  // Rule 6: cards are cards. The line says කාඩ්පත් while the board shows
  // chalk, and no card row or picker is about to deal.
  if (/කාඩ්පත්/u.test(beat.sourceText)) {
    const cardsUp = state.primitive === "numberCards" || state.primitive === "digitPicker";
    const cardsSoon = upcoming.slice(0, 2).some((i) => i.kind === "digitPicker" || (i.kind === "text" && rowOfCards(i.text) !== null) || (i.kind === "exercise" && KNOWN_ITEMS[i.itemId.slice(0, 8)]?.primitive === "digitPicker"));
    if (!cardsUp && !cardsSoon) {
      notes.push({ beatId: beat.id, kind: "board-cards-as-chalk", sentenceIndex: 0, line: spokenLine, problem: `says කාඩ්පත් but the board shows ${state.description} — cards are numberCards or digitPicker, never chalk` });
    }
  }
  const asksToAct = facts.some((f) => f.boardAct) && beat.type === "ASK";
  if (asksToAct && !state.interactive) {
    notes.push({ beatId: beat.id, kind: "no-way-to-act", sentenceIndex: 0, line: spokenLine, problem: `asks the child to make/place/fill something, but the board (${state.description}) offers nothing to act on` });
  }

  // After a question on a table cell, the answer is in the cell (the child
  // wrote it, or Zara did at the bottom of the ladder) — visible from here.
  if (beat.type === "ASK" && beat.boardIntent.kind === "blank" && /^[\d\s,]+$/u.test(expects ?? "")) {
    state.visible.add((expects ?? "").replace(/[\s,]/gu, ""));
  }

  const seesEvents = events.filter((e) => e.primitive !== "pointer").map(describeEvent);
  const sees = [state.description[0].toUpperCase() + state.description.slice(1), ...seesEvents].join("; ") + (child ? ` — ${child.kind === "soft check" ? "the mic opens briefly" : `they answer via ${child.via}`}.` : ".");

  return {
    plan: {
      id: beat.id,
      concept: beat.conceptTag,
      type: beat.type,
      pause: beat.pauseType,
      line: spokenLine,
      sentences: facts.map((f) => f.spoken),
      boardAtStart,
      events,
      child,
      sees,
    },
    notes,
  };
}

function describeEvent(e: Event): string {
  const a = e.args ?? {};
  switch (`${e.primitive}.${e.event}`) {
    case "abacus.show": return (a.startEmpty ? "bare rods appear" : `the abacus shows ${textbook(Number((a.digits as number[]).join("")))}`) + (a.animate ? " (beads landing on their own)" : "");
    case "abacus.bead_add": return `${a.count} bead(s) drop onto the ${ROD_LABELS[a.rod as number]} rod`;
    case "abacus.rod_glow": return `the ${ROD_LABELS[a.rod as number]} rod glows`;
    case "numberCards.show": return `cards ${((a.values as number[]) ?? []).join(" · ")} deal in`;
    case "numberCards.highlight_ring": return `a ring around ${a.value}`;
    case "chalkText.write": return a.append ? `"${a.append}" is written on, making "${String(a.text).replace(/\n/g, " / ")}"` : `"${String(a.text).replace(/\n/g, " / ")}" is written`;
    case "highlight.circle": return `a chalk ring around ${"number" in (a.target as object) ? textbook((a.target as { number: number }).number) : JSON.stringify(a.target)}`;
    case "pointer.pulse": return "the pointer taps the ringed card";
    case "chalkText.erase": return "the board wipes";
    case "textCard.show": return `card "${a.text}"`;
    case "titleCard.show": return `title "${a.title}"`;
    case "digitPicker.show": return Array.isArray(a.pool) ? `digit tiles ${(a.pool as number[]).join(" · ")}` : "the textbook's digit tiles";
    case "digitPicker.built_number": return a.by === "tutor" ? `Zara's example ${a.digits} and its name appear under the tiles` : "their number and its name appear under the tiles";
    case "expansion.show": return `${textbook(a.number as number)} = ▢ + ▢ + ▢ + ▢`;
    case "expansion.part_reveal": return `${a.value} is written into slot ${a.index}`;
    case "blankTable.show": return "the place-value table";
    case "blankTable.row_activate": return `row ${a.row}'s ${a.field} cell is outlined`;
    case "blankTable.cell_fill": return `${a.value} written into row ${a.row}`;
    default: return `${e.primitive}.${e.event}`;
  }
}

// --- output ---------------------------------------------------------------------
async function main(): Promise<void> {
  const file = parseAuthoredScript(await readFile(SCRIPT_PATH, "utf8"));
  if (!file) throw new Error("no authored script");
  let suggestions: Record<string, { suggested: string; note?: string }> = {};
  try {
    suggestions = JSON.parse(await readFile(SUGGESTIONS_PATH, "utf8"));
  } catch {
    suggestions = {};
  }

  const plans: StoryboardBeat[] = [];
  const notes: NoteCandidate[] = [];
  let state = emptyState();
  let concept: string | null = null;
  for (const beat of file.beats) {
    if (beat.conceptTag !== concept) {
      concept = beat.conceptTag;
      // The runtime does not blank the board at a concept boundary — only a
      // title card or a clear does — so a title staged on the last beat of
      // one concept is what the next concept opens on. Written terms are
      // per concept, though: the next concept introduces its own.
      state = { ...state, terms: new Set() };
    }
    const index = file.beats.indexOf(beat);
    const upcoming = file.beats.slice(index + 1, index + 4).filter((b) => b.conceptTag === beat.conceptTag).map((b) => b.boardIntent);
    const { plan, notes: beatNotes } = planBeat(beat, state, upcoming);
    plans.push(plan);
    notes.push(...beatNotes);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const storyboardJson = `${JSON.stringify({ lesson: "maths-5-1", session: 1, vocabulary: "docs/design/board-vocabulary.md", beats: plans }, null, 2)}\n`;
  await writeFile(path.join(OUT_DIR, "maths-5-1-session-1.json"), storyboardJson, "utf8");
  // The runtime's copy, inside the app tree, so the choreography can import it.
  await mkdir(path.dirname(APP_COPY), { recursive: true });
  await writeFile(APP_COPY, storyboardJson, "utf8");

  // Markdown.
  const md: string[] = [];
  md.push("# Storyboard — Maths 5, Lesson 1, Session 1", "");
  md.push(`${plans.length} beats. Vocabulary: \`docs/design/board-vocabulary.md\`. Events are written \`primitive.event {args}\`; an event with no sentence index prefix lands on the sentence shown above it.`, "");
  md.push("Rods: 0 = දා (දහසස්ථානය), 1 = සි, 2 = ද, 3 = එ.", "");
  let current: string | null = null;
  for (const p of plans) {
    if (p.concept !== current) {
      current = p.concept;
      md.push(`## ${current}`, "");
    }
    md.push(`### \`${p.id.replace("authored:", "")}\` · ${p.type}${p.pause ? ` · pause ${p.pause}` : ""}`, "");
    md.push(`Board at line start: ${p.boardAtStart}`, "");
    p.sentences.forEach((s, i) => {
      md.push(`${i + 1}. > ${s}`);
      const evs = p.events.filter((e) => e.sentenceIndex === i);
      if (evs.length === 0) md.push("   - _(no event)_");
      for (const e of evs) md.push(`   - \`${e.primitive}.${e.event}\`${e.args ? ` \`${JSON.stringify(e.args)}\`` : ""}`);
    });
    if (p.child) md.push("", `Child: **${p.child.kind}** — ${p.child.via}${p.child.expects ? ` · expects **${p.child.expects}**` : ""}`);
    md.push("", `_Sees:_ ${p.sees}`, "");
  }
  await writeFile(path.join(OUT_DIR, "maths-5-1-session-1.md"), `${md.join("\n")}\n`, "utf8");

  // Notes.
  const order = new Map(file.beats.map((b, i) => [b.id, i]));
  notes.sort((a, b) => (order.get(a.beatId) ?? 0) - (order.get(b.beatId) ?? 0) || a.sentenceIndex - b.sentenceIndex);
  const isBoard = (n: NoteCandidate) => n.kind.startsWith("board-");
  const scriptNotes = notes.filter((n) => !isBoard(n));
  const boardNotes = notes.filter(isBoard);
  const nm: string[] = [];
  nm.push("# Script notes — Maths 5, Lesson 1, Session 1", "");
  nm.push("Where the spoken line and the visual plan do not fit, in beat order. The script is unchanged; each note carries the current line, the problem, and a suggested line for review. Suggestions are authored in `script-note-suggestions.json`.", "");
  nm.push(`${scriptNotes.length} script notes; ${boardNotes.length} board notes in the appendix (the words are fine, the board plan is not).`, "");
  scriptNotes.forEach((n, i) => {
    const key = `${n.beatId}#${n.kind}#${n.sentenceIndex}`;
    const s = suggestions[key] ?? suggestions[`${n.beatId}#${n.kind}`];
    nm.push(`## ${i + 1}. \`${n.beatId.replace("authored:", "")}\` — ${n.kind}`, "");
    nm.push(`**Current line:** ${n.line}`, "");
    nm.push(`**Problem:** ${n.problem}`, "");
    nm.push(`**Suggested line:** ${s ? s.suggested : "_(pending)_"}`);
    if (s?.note) nm.push("", `_${s.note}_`);
    nm.push("");
  });
  if (boardNotes.length > 0) {
    nm.push("---", "", "## Appendix — board notes (not wording)", "");
    nm.push("The line is right; what the board does under it is not. These need a board-intent change, not a rewrite, and are listed separately so they are not mistaken for script edits.", "");
    // Group a run of the same kind into one entry.
    let i = 0;
    let n = 1;
    while (i < boardNotes.length) {
      let j = i;
      while (j + 1 < boardNotes.length && boardNotes[j + 1]!.kind === boardNotes[i]!.kind && (order.get(boardNotes[j + 1]!.beatId) ?? 0) - (order.get(boardNotes[j]!.beatId) ?? 0) <= 3) j += 1;
      const run = boardNotes.slice(i, j + 1);
      const ids = [...new Set(run.map((x) => x.beatId.replace("authored:", "")))];
      const s = run.map((x) => suggestions[`${x.beatId}#${x.kind}`]).find(Boolean);
      nm.push(`### B${n}. \`${ids.join("`, `")}\` — ${run[0]!.kind}`, "");
      for (const x of run) nm.push(`- \`${x.beatId.replace("authored:", "")}\`: ${x.problem}`, `  > ${x.line}`);
      nm.push("", `**Board fix:** ${s ? s.suggested : "_(pending)_"}`);
      if (s?.note) nm.push("", `_${s.note}_`);
      nm.push("");
      i = j + 1;
      n += 1;
    }
  }
  await writeFile(path.join(OUT_DIR, "script-notes.md"), `${nm.join("\n")}\n`, "utf8");

  // Console summary.
  const withEvents = plans.filter((p) => p.events.length > 0);
  const without = plans.filter((p) => p.events.length === 0);
  const why = (p: StoryboardBeat): string => {
    const beat = file.beats.find((b) => b.id === p.id)!;
    const f = sentencesOf(beat.sourceText).map(analyse);
    if (f.every((x) => x.numbers.length === 0 && x.rods.length === 0 && x.terms.length === 0)) return "names nothing showable; board inherited";
    return "named things the board cannot show (see notes)";
  };
  console.log(`beats: ${plans.length} · with ≥1 event: ${withEvents.length} · none: ${without.length}`);
  const byWhy = new Map<string, string[]>();
  for (const p of without) {
    const w = why(p);
    byWhy.set(w, [...(byWhy.get(w) ?? []), p.id.replace("authored:", "")]);
  }
  for (const [w, ids] of byWhy) console.log(`  none — ${w} (${ids.length}): ${ids.join(", ")}`);
  // A board run shares one fix, keyed on any beat in it; count what is
  // actually unanswered, not one gap per beat of a run.
  const pendingScript = scriptNotes.filter((n) => !suggestions[`${n.beatId}#${n.kind}#${n.sentenceIndex}`] && !suggestions[`${n.beatId}#${n.kind}`]);
  const boardRuns: NoteCandidate[][] = [];
  for (const n of boardNotes) {
    const last = boardRuns[boardRuns.length - 1];
    if (last && last[0]!.kind === n.kind && (order.get(n.beatId) ?? 0) - (order.get(last[last.length - 1]!.beatId) ?? 0) <= 3) last.push(n);
    else boardRuns.push([n]);
  }
  const pendingBoard = boardRuns.filter((run) => !run.some((x) => suggestions[`${x.beatId}#${x.kind}`]));
  console.log(`script notes: ${scriptNotes.length} (${pendingScript.length} without a suggestion) · board notes: ${boardRuns.length} run(s) over ${boardNotes.length} beat-sentence(s) (${pendingBoard.length} without a fix)`);
  const kinds = new Map<string, number>();
  for (const n of notes) kinds.set(n.kind, (kinds.get(n.kind) ?? 0) + 1);
  console.log(`  by kind: ${[...kinds].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`\nwrote ${path.relative(ROOT, OUT_DIR)}/{maths-5-1-session-1.json,maths-5-1-session-1.md,script-notes.md}`);
  if (process.argv.includes("--list-notes")) {
    for (const n of notes) console.log(`${n.beatId.replace("authored:", "").padEnd(22)} ${n.kind.padEnd(16)} s${n.sentenceIndex} ${n.problem}\n${" ".repeat(24)}> ${n.line}`);
  }
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
