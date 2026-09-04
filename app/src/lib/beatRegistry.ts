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
  /**
   * A substantive question she answers herself moments later: the mic
   * opens for a short window; any child speech earns one authored
   * acknowledgement, silence just flows on. Never judged, never waited on
   * beyond the window.
   */
  SOFT_CHECK: spec(8, "acknowledge"),
  WAIT: spec(10, "acknowledge"),
  FEEDBACK: spec(10, "none"),
  TRANSITION: spec(15, "none"),

  // --- session framing --------------------------------------------------
  /** ONE greeting line (say_exactly), then straight into content. Chat only if the child starts it. */
  SESSION_START: spec(8, "none"),
  /** Legacy type: no longer emitted by the builder (sessions open with SESSION_START now). */
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
    60,
    "chat",
    (beat) =>
      `[DIRECTOR] A short breather — the child has been working hard. Ask ONE light question in Sinhala — ` +
      `${beat.goal} — then respond warmly to whatever they say, ONCE, and stop. One question, not an ` +
      `interview; no lesson content unless the child brings it up.`,
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
    // min 4s: the pause split produces genuinely short beats (a lone soft
    // question); an 8s floor inflated totals by ~10%.
    return Math.min(30, Math.max(4, Math.round(beat.spokenText.length / SPOKEN_CHARS_PER_SECOND)));
  }
  return BEAT_REGISTRY[beat.type].estimateSeconds;
}

/** Planning estimate for a run of beats — how sessions get sized and breaks get placed. */
export function estimateSeconds(beats: { type: BeatType; spokenText?: string }[]): number {
  return beats.reduce((sum, beat) => sum + estimateBeatSeconds(beat), 0);
}
