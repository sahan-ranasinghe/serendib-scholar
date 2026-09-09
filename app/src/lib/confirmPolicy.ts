/**
 * When to read a heard number back before judging it — and WHAT to read.
 *
 * A CONFIRM ("ඔයා කිව්වේ 2311 නේද?") exists because Sinhala number words
 * mistranscribe; it must only ever echo what was HEARD, and only when the
 * hearing was doubtful. It must never carry the expected answer: after a
 * wrong answer to 999 + 1 the app once asked "you said 1000, didn't you?"
 * — the planner's best guess had been the answer key, and reading it back
 * both leaked the answer and made no sense.
 *
 * The rule, in order:
 *   - no number heard, or a confident hearing  → judge as heard, no CONFIRM
 *   - a doubtful hearing (confidence below the threshold, or the planner
 *     flagged it) → echo the heard number
 *   - a value that equals the expected answer is echoed ONLY if the child's
 *     own words contain it (digits or name) — otherwise it is the key, not
 *     the child
 *   - after CONFIRM_LIMIT doubtful hearings on one question, no more
 *     confirms: the pad/choices take over and the answer is judged as heard
 */
import { sinhalaNumberName } from "@/lib/sinhalaNumber";
import { normalizeAnswer } from "@/lib/answerCheck";

/** Below this the hearing is doubtful. */
export const CONFIRM_BELOW_CONFIDENCE = 0.75;
/** Doubtful hearings on one question before the pad replaces "say it again". */
export const CONFIRM_LIMIT = 2;

export interface Hearing {
  transcript: string;
  /** Digits the hearing extracted, if any. */
  number: string | null;
  /** 0..1, when the hearing reported one. */
  confidence: number | null;
}

/** Whether the child's own words contain this value — as digits or as its Sinhala name. */
export function transcriptContains(transcript: string, value: string): boolean {
  const said = normalizeAnswer(transcript);
  const digits = value.replace(/\D/g, "");
  if (digits && said.includes(digits)) return true;
  if (digits && Number(digits) <= 100_000) {
    try {
      if (said.includes(normalizeAnswer(sinhalaNumberName(Number(digits))))) return true;
    } catch {
      /* not a nameable number */
    }
  }
  return !digits && value.trim() !== "" && said.includes(normalizeAnswer(value));
}

export interface ConfirmInput {
  hearing: Hearing;
  expected: string | null | undefined;
  /** The planner's `ambiguousNumber`, if it set one. */
  plannerGuess: string | null | undefined;
  /** Doubtful hearings already confirmed on this question. */
  confirmsSoFar: number;
}

/**
 * The value to read back, or null to judge without a CONFIRM. Never the
 * expected answer unless the child said it.
 */
export function confirmValueFor({ hearing, expected, plannerGuess, confirmsSoFar }: ConfirmInput): string | null {
  if (confirmsSoFar >= CONFIRM_LIMIT) return null;
  const doubtful = hearing.confidence !== null && hearing.confidence < CONFIRM_BELOW_CONFIDENCE;
  const guess = plannerGuess && /^\d+$/.test(plannerGuess.trim()) ? plannerGuess.trim() : null;
  // The number the hearing itself extracted IS what was heard — echoing it
  // is honest even when it happens to be the key — but only when the
  // hearing was doubtful or the planner flagged it.
  if (hearing.number) {
    const flagged = guess !== null && normalizeAnswer(guess) === normalizeAnswer(hearing.number);
    return doubtful || flagged ? hearing.number : null;
  }
  // No number heard: the planner's guess is echoed only if the child's own
  // words support it, and never when it is the answer key.
  if (!guess) return null;
  const isTheKey = expected !== null && expected !== undefined && normalizeAnswer(guess) === normalizeAnswer(expected);
  if (isTheKey) return null;
  return transcriptContains(hearing.transcript, guess) ? guess : null;
}
