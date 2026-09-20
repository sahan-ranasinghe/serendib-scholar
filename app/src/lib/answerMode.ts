/**
 * Every question has a way to answer it by touch; speech is offered on all
 * and required on none. The answerMode says which surface LEADS:
 *
 *   build        the picker, the beads, the pad          (touch primary)
 *   cell         tap the table cell, then the pad        (touch primary)
 *   valueOrPlace tap the rod / column, or three chips    (touch primary)
 *   why          three chips from the start              (touch primary)
 *   readAloud    reading PRACTICE, unjudged: a 3 s "කියන්න බලන්න" pause
 *                with a subtle 🎤 cue (nothing recorded), then Zara reads
 *                the number herself; the judged step is three name-chips
 *                                                        (touch primary)
 *
 * Every judged answer is a touch. The microphone opens only in the ✋ chat.
 *
 * The mode is derived at build time from what the beat expects and what
 * the concept's objective says the skill is — never stored by hand, so a
 * new beat cannot arrive without one (the dry run asserts it).
 */
import { normalizeAnswer, parseAnswerPredicate } from "@/lib/answerCheck";
import { sinhalaNumberName } from "@/lib/sinhalaNumber";

export type AnswerMode = "build" | "cell" | "valueOrPlace" | "why" | "readAloud";
export const ANSWER_MODES: readonly AnswerMode[] = ["build", "cell", "valueOrPlace", "why", "readAloud"];

/** The touch surface each mode leads with — what the dry run asserts is there. */
export const TOUCH_SURFACE: Record<AnswerMode, string> = {
  build: "picker / beads / pad",
  cell: "tap the cell + pad",
  valueOrPlace: "tap the rod or column, or 3 chips",
  why: "3 chips from the start",
  readAloud: "3 name-chips with the question — judged on the tap, feedback at once (no invitation, no read-back)",
};

/** Which modes are JUDGED by speech: none — speech is practice (readAloud's pause) or the ✋ chat, never an answer. */
export const SPEECH_PRIMARY: Record<AnswerMode, boolean> = { build: false, cell: false, valueOrPlace: false, why: false, readAloud: false };
/** Reading practice: the child reads a number. Since 17 Sep nothing precedes the chips — they are the question; she reads it back after the judge. */
export const READING_PRACTICE: Record<AnswerMode, boolean> = { build: false, cell: false, valueOrPlace: false, why: false, readAloud: true };

/** The skill a concept's objective names — the tie-breaker for a bare number. */
export type ConceptSkill = "readWrite" | "placeValue";

export function conceptSkill(conceptTag: string, objective?: string | null): ConceptSkill {
  if (objective && /ස්ථානීය අගය|place value/iu.test(objective)) return "placeValue";
  if (/placeValue|expandedForm/iu.test(conceptTag)) return "placeValue";
  return "readWrite";
}

// ---- number names → values -------------------------------------------

let nameValues: Map<string, number> | null = null;
function nameTable(): Map<string, number> {
  if (nameValues) return nameValues;
  nameValues = new Map();
  for (let n = 0; n <= 10_000; n += 1) nameValues.set(normalizeAnswer(sinhalaNumberName(n)), n);
  for (let n = 11_000; n <= 100_000; n += 1_000) nameValues.set(normalizeAnswer(sinhalaNumberName(n)), n);
  return nameValues;
}

/** The value an expected answer stands for: digits, or a Sinhala number name; null for anything else. */
export function valueOfAnswer(expected: string | null | undefined): number | null {
  if (!expected) return null;
  const digits = expected.replace(/[\s,]/gu, "");
  if (/^\d{1,6}$/u.test(digits)) return Number(digits);
  return nameTable().get(normalizeAnswer(expected)) ?? null;
}

/** A single digit, a bead count, or one digit at a place (20, 5000): a PART of a number, not a number to read. */
export function isPartValue(n: number): boolean {
  return n < 10 || /^[1-9]0+$/u.test(String(n));
}

export interface ModeInput {
  type: string;
  expectedAnswer?: string | null;
  /** The authored board intent's kind ("blank" is a table cell). */
  boardKind?: string | null;
  hasRubric?: boolean;
  skill: ConceptSkill;
  /** The nearest earlier judged question's mode in the same concept — a soft check with no expected answer checks that skill. */
  precedingMode?: AnswerMode | null;
}

export function deriveAnswerMode(input: ModeInput): AnswerMode {
  if (input.hasRubric || input.type === "CHECK_MY_WORK") return "why";
  const expected = input.expectedAnswer ?? null;
  if (parseAnswerPredicate(expected)) return "build";
  if (input.boardKind === "blank") return "cell";
  const value = valueOfAnswer(expected);
  if (value === null) return input.precedingMode ?? (input.skill === "placeValue" ? "valueOrPlace" : "readAloud");
  if (input.skill === "placeValue") return isPartValue(value) ? "valueOrPlace" : "readAloud";
  return /^[\d\s,]+$/u.test(expected ?? "") ? "build" : "readAloud";
}
