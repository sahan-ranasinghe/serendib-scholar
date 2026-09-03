/**
 * The lesson orchestrator — the teacher's brain.
 *
 * Pacing and sequencing live here, in ordinary deterministic code, and the
 * voice model is handed one beat at a time with an explicit sentence budget
 * (see buildDirectorLine). The app stages the board before each beat, so
 * what is on screen and what is being said cannot drift apart.
 *
 * A lesson script is a FLAT, ordered list of beats, pre-partitioned into
 * sittings of 20-25 estimated minutes (see SessionPlan): each session opens
 * with free chat, then lesson goals (first session) or a recap (later
 * ones), works through concepts, takes a mid-session break, and closes
 * warmly. Concepts may span sessions.
 *
 * Everything type-specific — time estimates, how the child's reply is
 * handled, special director text — lives in beatRegistry.ts, so new beat
 * types don't touch this file. This module stays pure: no fetch, no
 * Supabase, no React. Every transition is a function of (script, state,
 * decision), which is what makes scripts/dry-run-lesson.ts possible without
 * spending a token.
 */

import { BEAT_REGISTRY, beatSpec, type BeatType, type DirectorContext } from "@/lib/beatRegistry";

export type { BeatType, DirectorContext };
export { BEAT_REGISTRY, beatSpec };

/** Which of the three teaching modes a beat belongs to. Null for beats outside them. */
export type TeachingMode = 1 | 2 | 3;

/** conceptTag used by session-framing beats (chat, goals, recap, breaks, close) — never a real concept. */
export const FRAMING_CONCEPT = "";

/** What the app does to the board before the model speaks this beat. */
export type BeatBoardAction =
  | { kind: "stage_item"; itemId: string }
  | { kind: "reveal_part"; itemId: string; rowIndex: number; field: string; value: string }
  | { kind: "set_active_blank"; itemId: string; rowIndex: number; field: string }
  // A big friendly card (see board.ts) — used so no non-chat beat ever
  // runs against an empty board.
  | { kind: "title_card"; title: string; emoji?: string }
  | { kind: "none" };

export interface Beat {
  /** Stable within a script — the session_log key and the resume anchor. */
  id: string;
  type: BeatType;
  /** FRAMING_CONCEPT ("") for session-framing beats. */
  conceptTag: string;
  /** Which sitting this beat belongs to (index into script.sessions). */
  sessionIndex: number;
  /** Null for beats outside the mode progression. */
  mode: TeachingMode | null;
  /** Which content_bank item drives this beat, if any. */
  itemId: string | null;
  /**
   * Groups the beats of one worked item, so jumps can find "the next item
   * at this mode". -1 for everything that isn't an item segment.
   */
  segmentIndex: number;
  /** English instruction to the model — never spoken as-is. */
  goal: string;
  /** Hard ceiling on sentences of speech, enforced in the director line. */
  maxSentences: number;
  /** One line for the director's "Board shows:" clause. */
  boardDescription: string;
  board: BeatBoardAction;
  /** ≤300 chars of the real teacher's Sinhala, as a register model — never read out. */
  referenceWording?: string;
  /** The answer an ASK beat is looking for, for the planner's deterministic check. */
  expectedAnswer?: string;
  /** Whether the model ends by putting a question to the child or by pausing. */
  endBy: "asking" | "pausing";
}

/** One sitting of 20-25 estimated minutes. Boundaries are stored, not recomputed. */
export interface SessionPlan {
  index: number;
  /** Inclusive range into script.beats. */
  firstBeat: number;
  lastBeat: number;
  estimatedSeconds: number;
  /** The real concepts worked in this sitting, in order. */
  conceptTags: string[];
}

/** Where one concept's beats live in the flat list — the jump table for reteach/another_example/simplify. */
export interface ConceptSummary {
  conceptTag: string;
  description: string | null;
  firstBeat: number;
  lastBeat: number;
  /**
   * The concept's first practice item (its first SHOW_BOARD). After a miss
   * the lesson NEVER moves before this — re-hearing the concept
   * introduction after one wrong answer feels like the lesson restarting.
   */
  firstPracticeBeat: number;
  /**
   * Alternate ways this concept was explained in the recording, beyond the
   * primary explain run — one per additional explanation segment. A
   * RETEACH beat draws an angle NOT yet used this session, so a struggling
   * child hears the idea differently instead of again.
   */
  reteachAngles: string[];
}

/**
 * The reviewed/reviewable derivation of each concept's shape from the video
 * data — how many explain beats, how much practice per mode, what hook.
 * Stored alongside the script precisely so a human can read or hand-edit it
 * per concept (see blueprintOverrides in lessonScriptBuilder.ts).
 */
export interface ConceptBlueprint {
  conceptTag: string;
  /** 3 minutes per verified explanation segment — the proxy for how long the teacher spent. */
  videoMinutes: number;
  explainBeats: number;
  /** The everyday example she opened with, where the extraction recorded one. Null = no HOOK beat. */
  hookExample: string | null;
  items: { mode1: number; mode2: number; mode3: number };
}

export interface LessonBlueprint {
  derivedFrom: string;
  concepts: ConceptBlueprint[];
  /** Concept tags whose derived entries were changed by the override file. */
  overriddenConcepts?: string[];
  /** Override entries naming a concept that doesn't exist — almost always a typo. */
  unmatchedOverrideTags?: string[];
}

/**
 * The hand-edited override file's shape
 * (src/data/lessons/blueprints/<subject>-<grade>-<lesson>.json): each entry
 * names a concept and only the fields to change — everything omitted keeps
 * its derived value, so `{ "conceptTag": "x", "hookExample": "..." }` is a
 * complete, valid override.
 */
export interface LessonBlueprintOverride {
  concepts: Array<Partial<ConceptBlueprint> & { conceptTag: string }>;
}

export interface LessonScript {
  subject: string;
  grade: number;
  lesson: number;
  /** Every beat of the lesson, in play order, across all sessions. */
  beats: Beat[];
  sessions: SessionPlan[];
  concepts: ConceptSummary[];
  blueprint: LessonBlueprint;
  builtAt?: string;
}

/** What the planner decided to do after a child's answer. */
export type PlannerNext = "advance" | "reteach" | "another_example" | "simplify";

export interface PlannerDecision {
  understood: boolean;
  next: PlannerNext;
  /** Why — recorded in the log, never spoken. */
  reason?: string;
  /**
   * Set when the transcript probably contains a number but the hearing is
   * doubtful (Sinhala numbers mistranscribe easily): the best-guess number.
   * The runtime then CONFIRMs with the child before judging — a doubtful
   * hearing is never marked wrong.
   */
  ambiguousNumber?: string | null;
}

export interface BeatLogEntry {
  beatId: string;
  beatType: BeatType;
  conceptTag: string;
  mode: TeachingMode | null;
  directorText: string;
  boardDescription: string;
  childTranscript: string | null;
  plannerDecision: PlannerDecision | null;
  startedAt: string;
  endedAt: string | null;
  outputAudioMs: number | null;
}

export interface OrchestratorState {
  /** Index into script.beats — global, so sessions and concepts need no separate cursor. */
  beatIndex: number;
  /** The real concept currently being worked (FRAMING_CONCEPT between concepts). */
  conceptTag: string;
  mode: TeachingMode;
  currentItemId: string | null;
  /** Correct answers given with no help on the current concept. Two advances it. */
  unaidedCorrect: number;
  /** Consecutive wrong/unclear answers on the current concept. */
  recentMisses: number;
  log: BeatLogEntry[];
}

/** Two unaided correct answers finishes a concept. */
export const UNAIDED_CORRECT_TO_ADVANCE = 2;

/** After this many consecutive misses, stop offering more of the same and re-teach. */
export const MISSES_BEFORE_RETEACH = 2;

/** How long to wait for a child to start answering an ASK before a gentle check-in. */
export const ASK_SILENCE_TIMEOUT_MS = 8000;

export function createInitialState(startBeat = 0): OrchestratorState {
  return {
    beatIndex: startBeat,
    conceptTag: FRAMING_CONCEPT,
    mode: 1,
    currentItemId: null,
    unaidedCorrect: 0,
    recentMisses: 0,
    log: [],
  };
}

export function currentBeat(script: LessonScript, state: OrchestratorState): Beat | null {
  return script.beats[state.beatIndex] ?? null;
}

export function isLessonComplete(script: LessonScript, state: OrchestratorState): boolean {
  return state.beatIndex >= script.beats.length;
}

export function conceptSummary(script: LessonScript, conceptTag: string): ConceptSummary | null {
  return script.concepts.find((concept) => concept.conceptTag === conceptTag) ?? null;
}

export function sessionForBeat(script: LessonScript, beatIndex: number): SessionPlan | null {
  return script.sessions.find((s) => beatIndex >= s.firstBeat && beatIndex <= s.lastBeat) ?? null;
}

// ---------------------------------------------------------------------------
// Runtime-inserted beats (never in the script)
// ---------------------------------------------------------------------------

/**
 * The gentle check-in when a child goes quiet on an ASK. Deliberately NOT a
 * repeat of the question: a child who is thinking hears a repeat as
 * pressure, and one who is stuck needs a different way in.
 */
export function buildWaitBeat(asked: Beat): Beat {
  return {
    ...asked,
    id: `${asked.id}:wait`,
    type: "WAIT",
    goal:
      "The child has gone quiet. Check in warmly and briefly — ask if they'd like a hint or want to think a " +
      "little longer. Do NOT repeat the question and do NOT give the answer.",
    maxSentences: 1,
    board: { kind: "none" },
    expectedAnswer: undefined,
    endBy: "pausing",
  };
}

export function buildFeedbackBeat(
  asked: Beat,
  correct: boolean,
  expected?: string,
  options: { reteachFollows?: boolean } = {},
): Beat {
  return {
    ...asked,
    id: `${asked.id}:feedback`,
    type: "FEEDBACK",
    goal: correct
      ? "The child got it right. Praise the effort specifically and briefly, then pause."
      : options.reteachFollows
        ? "The child's answer wasn't right, and you're about to look at the idea together again. Say ONE warm, " +
          "no-blame sentence — do NOT give the answer, do NOT ask anything."
        : `The child's answer wasn't right${expected ? ` (the answer is ${expected})` : ""}. Do NOT give the ` +
          "answer yet. Say something warm, then ask one guiding question that points at the next step.",
    maxSentences: correct ? 1 : options.reteachFollows ? 1 : 2,
    board: { kind: "none" },
    expectedAnswer: undefined,
    endBy: correct || options.reteachFollows ? "pausing" : "asking",
  };
}

/**
 * Asks the child to confirm a doubtfully-heard number before it is judged
 * ("ඔයා කිව්වේ 2311 නේද?"). Sinhala number recognition mishears; a wrong
 * mark on a mishearing teaches the child the tutor doesn't listen.
 */
export function buildConfirmBeat(asked: Beat, heardNumber: string): Beat {
  return {
    ...asked,
    id: `${asked.id}:confirm`,
    type: "CONFIRM",
    goal:
      `You may have misheard the child's answer. Ask them, warmly and briefly, to confirm: did they say ` +
      `${heardNumber}? (For example: "ඔයා කිව්වේ ${heardNumber} නේද?") Do not say whether it is right or wrong.`,
    maxSentences: 1,
    board: { kind: "none" },
    expectedAnswer: undefined,
    endBy: "asking",
  };
}

/**
 * The targeted re-teaching sequence inserted after a reteach decision, run
 * BEFORE the missed item comes around again:
 *   1. a RETEACH beat aimed at the specific sub-skill the child missed,
 *      explained from an angle not yet used this session;
 *   2. a fresh MODE 1 demonstration of a DIFFERENT item (copied from the
 *      concept's own demo beats, checkpoint dropped);
 * then the script — already rewound to the missed item's SHOW_BOARD by
 * advance() — retries the missed item itself.
 *
 * Pure, so the simulation harness runs the identical logic the live
 * runtime does.
 */
export function buildReteachBeats(
  script: LessonScript,
  missedAsk: Beat,
  usedAngles: string[],
): { beats: Beat[]; angleUsed: string | null } {
  const summary = conceptSummary(script, missedAsk.conceptTag);
  const angle = summary?.reteachAngles.find((candidate) => !usedAngles.includes(candidate)) ?? null;

  // What exactly was missed: the ask's own goal carries the blank's label
  // ("ask the child for the place value for 5024"), which is the sub-skill.
  const subskill = missedAsk.goal.replace(/^.*ask the child for /i, "").replace(/\.[^.]*$/, "");

  const reteach: Beat = {
    ...missedAsk,
    id: `${missedAsk.id}:reteach`,
    type: "RETEACH",
    goal:
      `The child just missed ${subskill}. Re-explain ONLY that one piece — not the whole idea` +
      (angle
        ? `, and take a DIFFERENT way in than before: ${angle}`
        : ", using different words and a smaller number than before") +
      ". Keep it tiny and concrete.",
    maxSentences: 3,
    board: { kind: "none" },
    expectedAnswer: undefined,
    endBy: "pausing",
  };

  // A fresh MODE 1 demonstration of a different item: the concept's own
  // demo beats (SHOW_BOARD + REVEAL_PARTs) for the first mode-1 item that
  // isn't the missed one, re-issued as inserted copies.
  const demo: Beat[] = [];
  if (summary) {
    const conceptBeats = script.beats.slice(summary.firstBeat, summary.lastBeat + 1);
    const demoShow = conceptBeats.find(
      (beat) => beat.type === "SHOW_BOARD" && beat.mode === 1 && beat.itemId !== missedAsk.itemId,
    );
    if (demoShow) {
      for (const beat of conceptBeats) {
        if (beat.segmentIndex !== demoShow.segmentIndex) continue;
        if (beat.type !== "SHOW_BOARD" && beat.type !== "REVEAL_PART") continue; // checkpoint dropped
        demo.push({ ...beat, id: `${beat.id}:reteach-demo` });
      }
    }
  }

  return { beats: [reteach, ...demo], angleUsed: angle };
}

/** What resolving a CONFIRM reply means for the held question. */
export type ConfirmationOutcome =
  | { kind: "judged"; decision: PlannerDecision }
  | { kind: "reask" }
  | { kind: "fresh-answer" };

/**
 * Resolves the child's reply to "did you say X?" — pure and shared with the
 * simulation harness, because this exact judgment once marked a correct
 * answer wrong: the confirmed value MUST be checked against the asked
 * beat's own expectedAnswer (the recap item's, if that's what was asked),
 * with a matcher a spoken answer can actually satisfy.
 */
export function resolveConfirmation(
  askedBeat: Beat,
  heard: string,
  reply: "yes" | "no" | "other",
  answersMatch: (expected: string, given: string) => boolean,
): ConfirmationOutcome {
  if (reply === "no") return { kind: "reask" };
  if (reply === "other") return { kind: "fresh-answer" };
  const correct = askedBeat.expectedAnswer !== undefined && answersMatch(askedBeat.expectedAnswer, heard);
  return {
    kind: "judged",
    decision: {
      understood: correct,
      next: correct ? "advance" : "another_example",
      reason: `Child confirmed saying "${heard}"${correct ? "" : ` (expected ${askedBeat.expectedAnswer ?? "?"})`}.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * Entering a beat updates the concept-scoped fields: crossing into a new
 * real concept resets the mode ladder and both counters.
 */
function enterBeat(state: OrchestratorState, script: LessonScript, beatIndex: number): OrchestratorState {
  const beat = script.beats[beatIndex];
  if (!beat) return { ...state, beatIndex };
  const changedConcept = beat.conceptTag !== FRAMING_CONCEPT && beat.conceptTag !== state.conceptTag;
  return {
    ...state,
    beatIndex,
    conceptTag: beat.conceptTag !== FRAMING_CONCEPT ? beat.conceptTag : state.conceptTag,
    mode: changedConcept ? 1 : (beat.mode ?? state.mode),
    currentItemId: beat.itemId ?? (changedConcept ? null : state.currentItemId),
    unaidedCorrect: changedConcept ? 0 : state.unaidedCorrect,
    recentMisses: changedConcept ? 0 : state.recentMisses,
  };
}

/**
 * Where the current concept's material ends: the next beat after it that
 * belongs to a different concept or to session framing. Mastery jumps here
 * — skipping leftover practice but never skipping a break or a session
 * close sitting between concepts.
 */
function indexAfterConcept(script: LessonScript, state: OrchestratorState): number {
  const summary = conceptSummary(script, state.conceptTag);
  if (!summary) return state.beatIndex + 1;
  for (let i = state.beatIndex + 1; i <= summary.lastBeat; i += 1) {
    if (script.beats[i].conceptTag !== state.conceptTag) return i;
  }
  return summary.lastBeat + 1;
}

/**
 * A jump within the current concept, for a planner decision that isn't a
 * plain advance. NEVER produces an index before the concept's first
 * practice item — a miss must not rewind into the concept introduction
 * (that reads as the lesson restarting; the targeted RETEACH sequence
 * handles re-explaining instead — see buildReteachBeats).
 */
function findJumpTarget(script: LessonScript, state: OrchestratorState, next: PlannerNext): number | null {
  const summary = conceptSummary(script, state.conceptTag);
  if (!summary) return null;
  const beats = script.beats;
  const segment = beats[state.beatIndex]?.segmentIndex ?? -1;
  const inConcept = (i: number) => beats[i].conceptTag === state.conceptTag;

  if (next === "reteach") {
    // Back to the START of the missed item's segment (its SHOW_BOARD), so
    // after the inserted RETEACH + demo the child retries the same item —
    // never back into the explain run.
    for (let i = state.beatIndex; i >= summary.firstPracticeBeat; i -= 1) {
      if (inConcept(i) && beats[i].segmentIndex === segment && beats[i].type === "SHOW_BOARD") return i;
    }
    return Math.max(summary.firstPracticeBeat, state.beatIndex);
  }

  if (next === "another_example") {
    for (let i = state.beatIndex + 1; i <= summary.lastBeat; i += 1) {
      if (inConcept(i) && beats[i].segmentIndex > segment && beats[i].mode === state.mode && beats[i].type === "SHOW_BOARD")
        return i;
    }
    return null;
  }

  // simplify: drop back a mode — a later segment at the easier mode if one
  // exists, else revisit an earlier one.
  const easierMode = (state.mode > 1 ? state.mode - 1 : 1) as TeachingMode;
  for (let i = state.beatIndex + 1; i <= summary.lastBeat; i += 1) {
    if (inConcept(i) && beats[i].mode === easierMode && beats[i].type === "SHOW_BOARD") return i;
  }
  for (let i = summary.firstBeat; i <= summary.lastBeat; i += 1) {
    if (inConcept(i) && beats[i].mode === easierMode && beats[i].type === "SHOW_BOARD") return i;
  }
  return null;
}

export interface AdvanceResult {
  state: OrchestratorState;
  /** True when the concept was finished (mastered or exhausted). */
  movedConcept: boolean;
  /**
   * Set when this transition was a reteach: the caller inserts the
   * targeted RETEACH sequence (see buildReteachBeats) BEFORE the beat now
   * at state.beatIndex — which is the missed item's own SHOW_BOARD.
   */
  needsReteach?: boolean;
}

/**
 * The single transition function. Every change to position, mode and the
 * two counters happens here.
 */
export function advance(
  script: LessonScript,
  state: OrchestratorState,
  decision: PlannerDecision | null,
): AdvanceResult {
  const beat = currentBeat(script, state);
  if (!beat) return { state, movedConcept: false };

  const next: OrchestratorState = { ...state };

  // Counters move only on a judged answer.
  if (decision && beatSpec(beat.type).onChildResponse === "judge") {
    if (decision.understood) {
      // Only MODE 3 answers are unaided — in MODE 1 and 2 the tutor just
      // did part of the work on screen.
      if (beat.mode === 3) next.unaidedCorrect = state.unaidedCorrect + 1;
      next.recentMisses = 0;
    } else {
      next.recentMisses = state.recentMisses + 1;
    }
  }

  // Mastered: skip the concept's leftover practice, landing on whatever
  // comes next (the following concept, a break, or the session close).
  if (next.unaidedCorrect >= UNAIDED_CORRECT_TO_ADVANCE) {
    return { state: enterBeat(next, script, indexAfterConcept(script, next)), movedConcept: true };
  }

  if (decision && decision.next !== "advance") {
    const effective: PlannerNext =
      next.recentMisses >= MISSES_BEFORE_RETEACH && decision.next === "another_example"
        ? "reteach"
        : decision.next;
    const target = findJumpTarget(script, next, effective);
    if (target !== null) {
      return {
        state: enterBeat(next, script, target),
        movedConcept: false,
        ...(effective === "reteach" ? { needsReteach: true } : {}),
      };
    }
    // Nothing left to offer for that decision — continue rather than stall.
  }

  const wasLastOfConcept =
    beat.conceptTag !== FRAMING_CONCEPT && script.beats[state.beatIndex + 1]?.conceptTag !== beat.conceptTag;
  return { state: enterBeat(next, script, state.beatIndex + 1), movedConcept: wasLastOfConcept };
}

// ---------------------------------------------------------------------------
// The director line
// ---------------------------------------------------------------------------

/**
 * Renders one beat as the [DIRECTOR] line sent to the voice model. Fixed
 * clause order on purpose — a consistently-shaped instruction is followed
 * far more reliably than prose that varies per beat. Types that need a
 * different shape (chat, session close) override in the registry.
 */
export function buildDirectorLine(beat: Beat, context: DirectorContext = {}): string {
  const custom = beatSpec(beat.type).buildDirectorText;
  if (custom) return custom(beat, context);

  const parts = [
    `[DIRECTOR] Board shows: ${beat.boardDescription}.`,
    `Goal: ${beat.goal}`,
    `Speak at most ${beat.maxSentences} sentence${beat.maxSentences === 1 ? "" : "s"}, slowly, in Sinhala.`,
  ];
  if (beat.referenceWording) parts.push(`Reference wording: ${beat.referenceWording}`);
  parts.push(
    beat.endBy === "asking"
      ? "End by asking the child the question above. Then stop."
      : "End by pausing and waiting for the child. Then stop.",
  );
  return parts.join(" ");
}
