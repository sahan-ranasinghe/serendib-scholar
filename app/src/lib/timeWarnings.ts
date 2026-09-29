/**
 * TWO WARNINGS BEFORE A LIMIT (29 Sep 2026). Pure: no clock, no audio.
 *
 * The ✋ chat and the lesson's daily limit used to stop at the limit and say
 * nothing before it. Now Zara says two things first:
 *
 *   soon   five minutes left — the heads-up
 *   last   one minute left  — the last question / the last bit
 *
 * and only then does the chat close (after she finishes what she is saying) or
 * the sitting end (after the exercise it is in). The words are in
 * src/lib/authoredLines.ts; useLiveChat and useLessonRuntime say them.
 *
 * The rule, for a countdown that began with `startedWith` seconds left:
 *   - "last" is due once at most one minute is left — including when the
 *     countdown began with a minute or less, or the limit has already passed
 *     unannounced (a limit lowered mid-sitting): never a close without it.
 *   - "soon" is due once at most five minutes are left, but only when the
 *     countdown began above five minutes (a chat opened with three minutes
 *     left is not told it has "a little more" and then, moments later, that
 *     this is the last question) and only while "last" is not yet due.
 *   - each is said at most once.
 */

/** The heads-up: this many seconds left. */
export const WARN_SOON_SECONDS = 5 * 60;
/** The last call: this many seconds left. */
export const WARN_LAST_SECONDS = 60;

export type TimeWarning = "soon" | "last";

export interface CountdownState {
  /** Seconds left when the countdown began (a chat's opening, a sitting's start, a changed limit). */
  startedWith: number;
  /** The warnings already said. */
  said: readonly TimeWarning[];
}

/** The warning to say now, if any. `remainingSeconds` may be negative (the limit already passed); Infinity is no limit. */
export function warningDue(remainingSeconds: number, state: CountdownState): TimeWarning | null {
  if (!Number.isFinite(remainingSeconds) || Number.isNaN(remainingSeconds)) return null;
  if (state.said.includes("last")) return null;
  if (remainingSeconds <= WARN_LAST_SECONDS) return "last";
  if (!state.said.includes("soon") && remainingSeconds <= WARN_SOON_SECONDS && state.startedWith > WARN_SOON_SECONDS) return "soon";
  return null;
}
