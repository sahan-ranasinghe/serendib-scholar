/**
 * Deterministic answer comparison, shared by the check_answer tool route and
 * the orchestrator's planner.
 *
 * Kept in one place because the two must agree: if the planner judged an
 * answer correct but check_answer would have called it wrong (or the other
 * way round), the child would be praised and corrected for the same words.
 */

/**
 * Real numbers in this lesson are sometimes written with a thousands
 * separator space (e.g. "10 000", matching the source textbook's own
 * formatting) — strip whitespace/commas before comparing so that formatting
 * alone never counts as a wrong answer.
 */
import { sinhalaNumberName } from "@/lib/sinhalaNumber";

export function normalizeAnswer(value: string | number): string {
  return String(value).replace(/[\s,]/g, "").toLowerCase();
}

export function answersMatch(expected: string | number, given: string | number): boolean {
  const predicate = parseAnswerPredicate(expected);
  if (predicate) return predicateMatches(predicate, given);
  if (normalizeAnswer(expected) === normalizeAnswer(given)) return true;
  // The question wants a number's NAME ("අසූ හතර") and the child tapped the
  // number itself (84) — on the board, the pad, a card. Same answer.
  const digits = String(given).replace(/[\s,]/g, "");
  if (/^\d{1,6}$/.test(digits) && Number(digits) <= 100_000) {
    return normalizeAnswer(sinhalaNumberName(Number(digits))) === normalizeAnswer(expected);
  }
  return false;
}

/**
 * Whether a spoken answer contains the expected value somewhere inside it.
 *
 * A child rarely answers a voice tutor with a bare number — they say "ammm,
 * dahasa hayai neda?" and the transcript carries all of it. An exact match
 * is the confident case; this is the "probably right, but ask the planner"
 * case, never used on its own to mark an answer correct.
 */
export function answerContains(expected: string | number, given: string | number): boolean {
  const normalizedExpected = normalizeAnswer(expected);
  if (normalizedExpected.length === 0) return false;
  return normalizeAnswer(given).includes(normalizedExpected);
}


/**
 * PREDICATE ANSWERS — for a question with more than one right answer.
 *
 * "Make any four-digit number from 1, 3, 6 and 4" has 24 correct answers.
 * Storing one of them as expectedAnswer marked the other 23 wrong and sent
 * the child into a reteach for succeeding, so those beats had to be
 * softened into un-judged checks. A predicate lets them be real questions
 * again: the answer is whatever satisfies the rule.
 *
 * Serialised as JSON in expectedAnswer so nothing about the beat's shape
 * has to change — a plain string is still a plain string.
 */
export interface PermutationPredicate {
  kind: "permutationOf";
  digits: number[];
  length: number;
}

export type AnswerPredicate = PermutationPredicate;

export function parseAnswerPredicate(expected: string | number | undefined | null): AnswerPredicate | null {
  if (typeof expected !== "string" || !expected.trimStart().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(expected) as AnswerPredicate;
    return parsed?.kind === "permutationOf" && Array.isArray(parsed.digits) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Does this answer satisfy the predicate? Digits only — the child taps or
 * says a number, and every digit must come from the allowed set, used no
 * more often than it appears there.
 */
export function predicateMatches(predicate: AnswerPredicate, given: string | number): boolean {
  const digits = normalizeAnswer(given).replace(/\D/gu, "");
  if (digits.length !== predicate.length) return false;
  const pool = [...predicate.digits.map(String)];
  for (const digit of digits) {
    const at = pool.indexOf(digit);
    if (at === -1) return false;
    pool.splice(at, 1);
  }
  return true;
}

/**
 * One answer that would be judged correct — the harnesses' "correct child"
 * says this. For a plain answer it is the answer; for a predicate it is
 * the digits in their given order (1364 for [1,3,6,4]), because saying the
 * predicate's JSON back would be judged WRONG and the simulated child
 * would be reteached for a bug in the simulator.
 */
export function exampleAnswerFor(expected: string | number | undefined | null): string {
  const predicate = parseAnswerPredicate(expected);
  if (predicate) return predicate.digits.join("");
  return expected === undefined || expected === null ? "" : String(expected);
}
