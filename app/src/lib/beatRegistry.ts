/**
 * The beat registry: everything type-specific about a beat lives here, in
 * one entry per beat type. The orchestrator core (lessonOrchestrator.ts),
 * the script builder and the runtime all look behaviour up in this table
 * instead of switching on beat type — so adding a beat type for a future
 * lesson (ACTIVITY, DRAW, SORT, STORY, GAME…) means adding one entry here
 * and building beats of that type, with no orchestrator changes.
 *
 * See docs/BEATS.md for the worked example of adding a type.
 */

import type { Beat, BeatBoardAction } from "@/lib/lessonOrchestrator";

/**
 * What the runtime owes the child after the model delivers a beat:
 * - "judge":       an answer is expected; run the planner on it, give
 *                  feedback, count it toward mastery.
 * - "chat":        free conversation; let the child and model go back and
 *                  forth until the beat's estimated time is spent, then
 *                  move on. Never judged.
 * - "acknowledge": a reply is invited (a check-in question) but not
 *                  judged — once the child responds, or stays quiet, the
 *                  lesson simply continues.
 * - "none":        nothing owed; a short grace pause, then continue.
 */
export type ChildResponseHandling = "judge" | "chat" | "acknowledge" | "none";

export interface DirectorContext {
  /** For CLOSE_SESSION: what actually happened this sitting, so the close can be specific. */
  sessionSummary?: { conceptsWorked: string[]; correctAnswers: number; totalAsked: number };
  /** For RECAP intros: which concepts the review questions will touch. */
  recapConcepts?: string[];
}

export interface BeatTypeSpec {
  /** Rough planning estimate, used to pack sessions and place breaks. */
  estimateSeconds: number;
  /** How the child's reply is handled at runtime. */
  onChildResponse: ChildResponseHandling;
  /**
   * What the app does to the board before the model speaks. Default: the
   * action the script builder attached to the beat instance. A future type
   * that computes its board from context overrides this.
   */
  boardAction: (beat: Beat) => BeatBoardAction;
  /**
   * The [DIRECTOR] line for this beat. Default (null) uses the standard
   * clause format in buildDirectorLine; a type needing a different shape
   * (or runtime context, like CLOSE_SESSION's session summary) overrides.
   */
  buildDirectorText: ((beat: Beat, context: DirectorContext) => string) | null;
}

const ownBoard = (beat: Beat): BeatBoardAction => beat.board;

/** Estimates from the session-planning spec; the rest are consistent guesses in the same spirit. */
const spec = (
  estimateSeconds: number,
  onChildResponse: ChildResponseHandling,
  buildDirectorText: BeatTypeSpec["buildDirectorText"] = null,
): BeatTypeSpec => ({ estimateSeconds, onChildResponse, boardAction: ownBoard, buildDirectorText });

export const BEAT_REGISTRY = {
  // --- lesson content ---------------------------------------------------
  EXPLAIN: spec(25, "none"),
  SHOW_BOARD: spec(15, "none"),
  REVEAL_PART: spec(15, "none"),
  ASK: spec(40, "judge"), // includes thinking/wait time
  /** Her own question to the child, verbatim: she asks, waits, and ANY answer advances. */
  CHECK_IN: spec(20, "acknowledge"),
  WAIT: spec(10, "acknowledge"),
  FEEDBACK: spec(10, "none"),
  CHECKPOINT: spec(60, "acknowledge"),
  TRANSITION: spec(15, "none"),

  // --- session framing --------------------------------------------------
  CHAT_OPENER: spec(
    150,
    "chat",
    (beat) =>
      `[DIRECTOR] Open the session with a couple of minutes of free, everyday conversation — ` +
      `${beat.goal} No lesson content yet, no questions about maths. Just talk warmly, in Sinhala, ` +
      `like you're glad to see them. Keep each turn short and let the child do most of the talking. ` +
      `When you have nothing to add, pause and wait.`,
  ),
  LESSON_GOALS: spec(60, "none"),
  HOOK: spec(30, "acknowledge"),
  RECAP: spec(120, "none"),
  BREAK_CHAT: spec(
    120,
    "chat",
    (beat) =>
      `[DIRECTOR] Time for a little break — the child has been working hard. ${beat.goal} ` +
      `A minute or two of free chat in Sinhala, nothing about the lesson unless the child brings it up. ` +
      `Keep it light. When you have nothing to add, pause and wait.`,
  ),
  CONFIRM: spec(15, "acknowledge"),
  RETEACH: spec(30, "none"),
  CLOSE_SESSION: spec(
    45,
    "none",
    (beat, context) => {
      const summary = context.sessionSummary;
      const didWell =
        summary && summary.totalAsked > 0
          ? `They answered ${summary.correctAnswers} of ${summary.totalAsked} questions right, working on ${summary.conceptsWorked.join(", ")}.`
          : "";
      return (
        `[DIRECTOR] The session is ending. ${didWell} Close warmly in Sinhala: name ONE specific thing ` +
        `the child did well today (a real one from this session, not generic praise), then one line about ` +
        `what you'll look at together next time. ${beat.goal} Speak at most 3 sentences. Then say goodbye and stop.`
      );
    },
  ),
} as const satisfies Record<string, BeatTypeSpec>;

export type BeatType = keyof typeof BEAT_REGISTRY;

export function beatSpec(type: BeatType): BeatTypeSpec {
  return BEAT_REGISTRY[type];
}

/** ~9 chars of verbatim Sinhala per second of speech (calibrated on her 3-min segments). */
const SPOKEN_CHARS_PER_SECOND = 9;

/**
 * Planning estimate for one beat: exact-words beats are estimated from
 * their actual text length; free-form beats from the per-type figure.
 */
export function estimateBeatSeconds(beat: { type: BeatType; spokenText?: string }): number {
  if (beat.spokenText) {
    return Math.min(30, Math.max(8, Math.round(beat.spokenText.length / SPOKEN_CHARS_PER_SECOND)));
  }
  return BEAT_REGISTRY[beat.type].estimateSeconds;
}

/** Planning estimate for a run of beats — how sessions get sized and breaks get placed. */
export function estimateSeconds(beats: { type: BeatType; spokenText?: string }[]): number {
  return beats.reduce((sum, beat) => sum + estimateBeatSeconds(beat), 0);
}
