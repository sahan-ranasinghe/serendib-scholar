/**
 * Three options for a question, made deterministically — never by a model.
 *
 *   number names   from sinhalaNumberName: two digits swapped, a zero
 *                  dropped or added, the number shifted one place
 *                  (5 421 → 5 412 · 5 241 · 4 521)
 *   values/places  the adjacent place's value, the digit instead of the
 *                  value (the 5 in 5 421 → 5000 ✓ · 500 · 5)
 *   bead counts    one more, one fewer (or a neighbouring rod's count)
 *   digits         the other digits of the same number
 *   place names    the neighbouring places
 *   findings       the beat's phrase rubric: its correct finding and two
 *                  wrong ones
 *
 * validateChoices holds every set to the rule: three options, all
 * distinct, exactly one correct, and no distractor that is the right
 * number wearing a different label.
 */
import { answersMatch, normalizeAnswer } from "@/lib/answerCheck";
import { sinhalaNumberName } from "@/lib/sinhalaNumber";
import type { PhraseRubric } from "@/lib/authoredScript";
import { judgePhraseLocally } from "@/lib/phraseJudge";
import { valueOfAnswer } from "@/lib/answerMode";

export interface ChoiceSet {
  options: string[];
  correctIndex: number;
}

export const PLACE_NAMES = ["එකස්ථානය", "දහයස්ථානය", "සියයස්ථානය", "දහසස්ථානය", "දසදහසස්ථානය"] as const;

// ---- a small deterministic shuffle ------------------------------------

function hash(seed: string): number {
  let h = 2166136261;
  for (const char of seed) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** The same seed always gives the same order. */
export function shuffleBySeed<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let h = hash(seed) || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function assemble(correct: string, distractors: string[], seed: string): ChoiceSet | null {
  const picked = distractors.filter((d, i) => d !== correct && distractors.indexOf(d) === i).slice(0, 2);
  if (picked.length < 2) return null;
  const options = shuffleBySeed([correct, ...picked], seed);
  return { options, correctIndex: options.indexOf(correct) };
}

// ---- number names -----------------------------------------------------

/** Near-miss numbers a child confuses with n, most plausible first. */
export function numberDistractors(n: number): number[] {
  const digits = String(n).split("");
  const out: number[] = [];
  const push = (candidate: number) => {
    if (candidate !== n && candidate >= 0 && candidate <= 100_000 && !out.includes(candidate)) out.push(candidate);
  };
  // two adjacent digits swapped, from the right (the child's usual slip)
  for (let i = digits.length - 2; i >= 0; i -= 1) {
    if (digits[i] === digits[i + 1]) continue;
    const swapped = [...digits];
    [swapped[i], swapped[i + 1]] = [swapped[i + 1]!, swapped[i]!];
    if (swapped[0] !== "0") push(Number(swapped.join("")));
  }
  // a zero dropped, or one added after the first digit
  const zeroAt = digits.indexOf("0", 1);
  if (zeroAt > 0) push(Number(digits.filter((_, i) => i !== zeroAt).join("")));
  if (digits.length >= 2 && digits.length <= 4) push(Number([digits[0], "0", ...digits.slice(1)].join("")));
  // off by one place
  if (n <= 9_999) push(n * 10);
  if (n >= 10) push(Math.floor(n / 10));
  // the first and last digit swapped
  if (digits.length >= 3 && digits[0] !== digits[digits.length - 1] && digits[digits.length - 1] !== "0") {
    const swapped = [...digits];
    [swapped[0], swapped[swapped.length - 1]] = [swapped[swapped.length - 1]!, swapped[0]!];
    push(Number(swapped.join("")));
  }
  return out;
}

/** Three numbers, as names ("අසූ හතර") or digits ("84"). */
export function numberChoices(n: number, seed: string, render: "name" | "digits"): ChoiceSet | null {
  const show = (v: number) => (render === "name" ? sinhalaNumberName(v) : String(v));
  // Distractors must not collapse onto the same name (e.g. 5 and 50 never do, but be safe).
  return assemble(show(n), numberDistractors(n).map(show).filter((s) => normalizeAnswer(s) !== normalizeAnswer(show(n))), seed);
}

// ---- values, counts, digits, places -----------------------------------

/** The value one digit shows at a place (the 5 in 5 421 → 5000): the adjacent place's value, and the digit itself. */
export function valueChoices(digit: number, placeExponent: number, seed: string): ChoiceSet | null {
  const value = digit * 10 ** placeExponent;
  const adjacent = placeExponent > 0 ? digit * 10 ** (placeExponent - 1) : digit * 10;
  const other = placeExponent > 0 ? digit : digit * 100;
  const distractors = digit === 0 ? [10 ** placeExponent, 10 ** Math.max(0, placeExponent - 1)] : [adjacent, other, digit * 10 ** (placeExponent + 1)];
  return assemble(String(value), distractors.map(String), seed);
}

/** How many beads on a rod: one more, one fewer, then a neighbouring rod's count. */
export function countChoices(count: number, seed: string, neighbours: number[] = []): ChoiceSet | null {
  const candidates = [count + 1, count - 1, ...neighbours, count + 2].filter((c) => c >= 0 && c <= 9);
  return assemble(String(count), candidates.map(String), seed);
}

/** Which digit sits at a place: the number's other digits, then the neighbours of the digit. */
export function digitChoices(digit: number, otherDigits: number[], seed: string): ChoiceSet | null {
  const candidates = [...otherDigits, digit + 1, digit - 1, digit + 2].filter((d) => d >= 0 && d <= 9);
  return assemble(String(digit), candidates.map(String), seed);
}

/** A place name: its neighbours first. */
export function placeChoices(place: string, seed: string): ChoiceSet | null {
  const index = PLACE_NAMES.findIndex((p) => normalizeAnswer(p) === normalizeAnswer(place));
  if (index < 0) return null;
  const order = [index + 1, index - 1, index + 2, index - 2].filter((i) => i >= 0 && i < PLACE_NAMES.length);
  return assemble(PLACE_NAMES[index]!, order.map((i) => PLACE_NAMES[i]!), seed);
}

/** A phrase question: the rubric's findings, the correct one found by the same judge that hears the child. */
export function findingChoices(rubric: PhraseRubric, seed: string): ChoiceSet | null {
  const findings = rubric.choices ?? [];
  if (findings.length < 3) return null;
  const correct = findings.filter((f) => judgePhraseLocally(f, rubric).accepted);
  if (correct.length !== 1) return null;
  const options = shuffleBySeed(findings.slice(0, 3), seed);
  return { options, correctIndex: options.indexOf(correct[0]!) };
}

// ---- the validator ----------------------------------------------------

/** Problems with a set — empty when it passes. */
export function validateChoices(set: ChoiceSet | null, expected: string, isCorrect: (option: string) => boolean = (o) => answersMatch(expected, o)): string[] {
  if (!set) return ["no options"];
  const problems: string[] = [];
  if (set.options.length !== 3) problems.push(`${set.options.length} options, not 3`);
  if (new Set(set.options.map((o) => normalizeAnswer(o))).size !== set.options.length) problems.push("options not distinct");
  const correct = set.options.filter(isCorrect);
  if (correct.length !== 1) problems.push(`${correct.length} correct options, not 1`);
  if (set.options[set.correctIndex] === undefined || !isCorrect(set.options[set.correctIndex]!)) problems.push("correctIndex does not point at the correct option");
  // A distractor that is the right number under another label (5000 vs පන්දහස) is no distractor.
  const expectedValue = valueOfAnswer(expected);
  if (expectedValue !== null) {
    for (const [i, option] of set.options.entries()) {
      if (i !== set.correctIndex && valueOfAnswer(option) === expectedValue) problems.push(`"${option}" is the answer with a different label`);
    }
  }
  if (set.options.some((o) => !o.trim())) problems.push("an empty option");
  return problems;
}

// ---- one question → its three options ---------------------------------

export interface QuestionForChoices {
  /** Seeds the shuffle, so the same question always deals the same order. */
  id: string;
  answerMode: import("@/lib/answerMode").AnswerMode;
  expectedAnswer?: string | null;
  rubric?: PhraseRubric | null;
  /** Every number the line speaks — the source of "the other digits". */
  numbers?: number[];
  line?: string;
  /** A table cell's field (number, numberName, digit, place, placeValue, valueRepresented). */
  field?: string | null;
}

/** The three options for a question, or null when none can be made honestly (an open build has no single answer). */
export function choicesForQuestion(q: QuestionForChoices): ChoiceSet | null {
  const seed = q.id;
  const expected = q.expectedAnswer ?? null;
  const value = valueOfAnswer(expected);
  const nameLike = expected !== null && !/\d/u.test(expected);
  switch (q.answerMode) {
    case "why":
      return q.rubric ? findingChoices(q.rubric, seed) : null;
    case "readAloud":
      return value === null ? null : numberChoices(value, seed, "name");
    case "build":
      if (value === null) return null;
      return numberChoices(value, seed, nameLike ? "name" : "digits");
    case "cell":
      return cellChoices(q, value, nameLike, seed);
    case "valueOrPlace":
      return partChoices(q, value, seed);
  }
}

function cellChoices(q: QuestionForChoices, value: number | null, nameLike: boolean, seed: string): ChoiceSet | null {
  const expected = q.expectedAnswer ?? "";
  switch (q.field) {
    case "place":
      return placeChoices(expected, seed);
    case "digit":
      return value === null ? null : digitChoices(value, otherDigits(q.numbers ?? [], value), seed);
    case "placeValue":
    case "valueRepresented":
      return value === null ? null : partChoices(q, value, seed);
    default:
      return value === null ? null : numberChoices(value, seed, nameLike ? "name" : "digits");
  }
}

/** A part of a number: a bead count, a digit, a place name, or one digit's value. */
function partChoices(q: QuestionForChoices, value: number | null, seed: string): ChoiceSet | null {
  const expected = q.expectedAnswer ?? "";
  if (value === null) return PLACE_NAMES.some((p) => normalizeAnswer(p) === normalizeAnswer(expected)) ? placeChoices(expected, seed) : null;
  if (value < 10) {
    if (/පබළු/u.test(q.line ?? "")) return countChoices(value, seed);
    return digitChoices(value, otherDigits(q.numbers ?? [], value), seed);
  }
  const text = String(value);
  if (!/^[1-9]0*$/u.test(text)) return numberChoices(value, seed, "digits");
  return valueChoices(Number(text[0]), text.length - 1, seed);
}

function otherDigits(numbers: number[], except: number): number[] {
  const out: number[] = [];
  for (const n of numbers) for (const d of String(n)) if (Number(d) !== except && !out.includes(Number(d))) out.push(Number(d));
  return out;
}

// ---- the Sinhala word bank for a number-name cell -----------------------

/** The word for digit d at place 10^k, in the form it takes at that position of a longer name (combining), or standing last (terminal). */
function nameWord(d: number, k: number, terminal: boolean): string | null {
  if (d <= 0 || d > 9) return null;
  const value = d * 10 ** k;
  if (terminal || k === 0) return sinhalaNumberName(value);
  // A composite ending in 1 gives the combining form as its first word ("පන්සිය එක" → "පන්සිය").
  const first = sinhalaNumberName(value + 1).split(" ")[0] ?? null;
  // Teens are one word ("එකොළහ"): no combining tens word exists for 1.
  return k === 1 && d === 1 ? null : first;
}

export interface WordBank {
  /** The tiles, shuffled: the answer's words plus two distractors. */
  tiles: string[];
  /** The answer's words, in order. */
  answer: string[];
}

/**
 * The tiles for writing n's Sinhala name: its own words (3-4 for a
 * four-digit number) plus two distractors — a digit's word at the
 * adjacent place (හයදහස් → හයසිය), and an off-by-one value at the same
 * place (අට → නවය, තිහ → හතළිහ) — deterministic from the seed.
 */
export function nameWordBank(n: number, seed: string): WordBank | null {
  if (!Number.isInteger(n) || n < 0 || n > 99_999) return null;
  const answer = sinhalaNumberName(n).split(" ");
  const digits = String(n).split("").map(Number);
  const places = digits.map((d, i) => ({ d, k: digits.length - 1 - i })).filter((p) => p.d > 0);
  const lastPlace = places[places.length - 1];
  const candidates: string[] = [];
  const push = (word: string | null) => {
    if (word && !answer.includes(word) && !candidates.includes(word)) candidates.push(word);
  };
  // 1. the leading digit one place down (combining, since it would not stand last)
  const lead = places[0];
  if (lead && lead.k >= 1) push(nameWord(lead.d, lead.k - 1, false));
  // 2. the last word off by one, in its terminal form
  if (lastPlace) push(nameWord(lastPlace.d === 9 ? 8 : lastPlace.d + 1, lastPlace.k, true));
  // 3. every other digit, one place down; then off-by-one at the same place
  for (const p of places.slice(1)) if (p.k >= 1) push(nameWord(p.d, p.k - 1, p === lastPlace));
  for (const p of places) push(nameWord(p.d === 9 ? 8 : p.d + 1, p.k, p === lastPlace));
  const distractors = candidates.slice(0, 2);
  if (distractors.length < 2) return null;
  return { tiles: shuffleBySeed([...answer, ...distractors], seed), answer };
}
