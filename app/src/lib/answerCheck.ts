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
export function normalizeAnswer(value: string | number): string {
  return String(value).replace(/[\s,]/g, "").toLowerCase();
}

export function answersMatch(expected: string | number, given: string | number): boolean {
  return normalizeAnswer(expected) === normalizeAnswer(given);
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
