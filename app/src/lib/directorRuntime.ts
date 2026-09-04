"use client";

/**
 * The client-side plumbing between the orchestrator (pure decisions) and the
 * outside world (board routes, planner, session log).
 *
 * Split out of the runtime hook deliberately: the hook is already the
 * hardest file in the app to hold in your head, and none of this needs
 * React. Everything here is a plain async function over fetch, which also
 * means the dry-run harness can exercise the same code paths.
 */

import type { Beat, BeatBoardAction, PlannerDecision } from "@/lib/lessonOrchestrator";
import type { BoardContent } from "@/lib/board";

/** What a beat's board action did, so the caller can apply it to board state. */
export interface StagedBoard {
  /** A full replacement board (stage_item), if this action produced one. */
  board?: BoardContent;
  /** A view patch (reveal_part / set_active_blank), if this action produced one. */
  viewPatch?: Record<string, unknown>;
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Performs a beat's board action BEFORE the model is told to speak.
 *
 * The ordering is the fix for the drift the old design kept producing: with
 * the model choosing content, the board and the narration were two
 * independent decisions that agreed only when the model remembered to make
 * them agree. Here the board is staged first and the director line then
 * describes what is already on screen, so they cannot disagree.
 */
export async function stageBeatBoard(action: BeatBoardAction): Promise<StagedBoard> {
  switch (action.kind) {
    case "stage_item": {
      const response = await post("/api/tools/find-teaching-content", { item_id: action.itemId });
      const board = response.board as BoardContent | undefined;
      return board ? { board } : {};
    }
    case "reveal_part": {
      const response = await post("/api/tools/reveal-answer", {
        item_id: action.itemId,
        row_index: action.rowIndex,
        field: action.field,
        value: action.value,
      });
      const viewPatch = response.viewPatch as Record<string, unknown> | undefined;
      return viewPatch ? { viewPatch } : {};
    }
    case "set_active_blank": {
      const response = await post("/api/tools/set-active-blank", {
        item_id: action.itemId,
        row_index: action.rowIndex,
        field: action.field,
      });
      const viewPatch = response.viewPatch as Record<string, unknown> | undefined;
      return viewPatch ? { viewPatch } : {};
    }
    case "title_card":
      // Purely presentational and fully determined by the beat — no route.
      return { board: { type: "title_card", title: action.title, ...(action.emoji ? { emoji: action.emoji } : {}) } };
    case "abacus_set":
      return {
        board: {
          type: "abacus",
          digits: action.digits,
          // animate → beads land on their own; startEmpty → add_bead beats
          // fill it; otherwise complete at once.
          shown: action.animate || action.startEmpty ? action.digits.map(() => 0) : [...action.digits],
          selfAnimate: action.animate,
          childAnswer: null,
        },
      };
    case "abacus_add_bead":
      return { viewPatch: { abacusAddBead: { rod: action.rod, count: action.count } } };
    case "show_components":
      return {
        board: {
          type: "lesson_content",
          itemId: action.itemId,
          components: action.components,
          filledAnswers: [],
          activeBlank: null,
        },
      };
    case "text_card":
      return { board: { type: "text_card", text: action.text } };
    case "none":
      return {};
  }
}

/** Asks the planner what to do after a child's answer to an ASK beat. */
export async function runPlanner(beat: Beat, transcript: string): Promise<PlannerDecision> {
  try {
    const response = await post("/api/planner", {
      beat_goal: beat.goal,
      expected: beat.expectedAnswer ?? null,
      transcript,
    });
    const decision = response.decision as PlannerDecision | undefined;
    if (decision && typeof decision.understood === "boolean") return decision;
  } catch (error) {
    console.error("[directorRuntime] Planner request failed:", error);
  }
  // Never advance on a failure — an unjudged answer is not a correct one.
  return { understood: false, next: "another_example", reason: "Planner unreachable." };
}

export interface SessionLogPayload {
  sessionId: string;
  sequence: number;
  beat: Beat;
  directorText: string;
  boardState: BoardContent | null;
  childTranscript: string | null;
  plannerDecision: PlannerDecision | null;
  outputAudioMs: number | null;
  startedAt: string;
  endedAt: string | null;
}

/** Appends a finished beat to session_log. Best-effort: never throws into the lesson. */
export async function logBeat(payload: SessionLogPayload): Promise<void> {
  try {
    // No child id here: the route resolves the active child itself (see
    // activeChild.ts) — the browser is never trusted to say who is present.
    await post("/api/session-log", {
      session_id: payload.sessionId,
      sequence: payload.sequence,
      beat_id: payload.beat.id,
      beat_type: payload.beat.type,
      concept_tag: payload.beat.conceptTag,
      mode: payload.beat.mode,
      board_state: payload.boardState,
      director_text: payload.directorText,
      output_audio_ms: payload.outputAudioMs,
      child_transcript: payload.childTranscript,
      planner_decision: payload.plannerDecision,
      started_at: payload.startedAt,
      ended_at: payload.endedAt,
    });
  } catch (error) {
    console.error("[directorRuntime] Session log write failed:", error);
  }
}

/**
 * Whether what the child said is a genuine attempt at the current beat, or
 * an unrelated aside.
 *
 * A tangent is not a wrong answer and must not be planned against — a child
 * who says "my brother has a bicycle" hasn't failed a place-value question.
 * Cheap and structural on purpose (no model call): an utterance that
 * contains no digit and no Sinhala number word, on a beat whose expected
 * answer is a number, is treated as off-topic and re-issued rather than
 * marked wrong. Erring toward "on-topic" is safe — the planner handles a
 * genuinely wrong answer gracefully.
 */
const SINHALA_NUMBER_WORDS =
  /(එක|දෙ|තුන|හතර|පහ|හය|හත|අට|නව|දහ|විස්ස|තිහ|හතලිස්|පනස්|හැට|හැත්තෑ|අසූ|අනූ|සිය|දහස|දාහ|ලක්ෂ)/;

export function looksLikeAnswerAttempt(beat: Beat, transcript: string): boolean {
  const said = transcript.trim();
  if (said === "") return false;
  const expected = beat.expectedAnswer ?? "";
  const expectsNumber = /^[\d\s,]+$/.test(expected.trim()) && expected.trim() !== "";
  if (!expectsNumber) return true;
  return /\d/.test(said) || SINHALA_NUMBER_WORDS.test(said);
}

/**
 * Records a judged answer into child_progress — the mastery data RECAP
 * draws on next session. Best-effort, like the session log.
 */
export async function recordAnswer(beat: Beat, correct: boolean): Promise<void> {
  if (!beat.conceptTag) return;
  try {
    await post("/api/tools/log-answer", { question_id: beat.id, correct, topic: beat.conceptTag });
  } catch (error) {
    console.error("[directorRuntime] child_progress write failed:", error);
  }
}

/**
 * Expands a RECAP placeholder into real review questions: the server picks
 * the weakest concepts from this child's progress and returns ready-made
 * ASK beats over verified bank items. Empty when there is nothing to
 * review (a first session, or no logged answers yet).
 */
export async function fetchRecapBeats(options: {
  excludeSessionId?: string;
  conceptTags?: string[];
} = {}): Promise<Beat[]> {
  try {
    const response = await post("/api/recap", {
      exclude_session_id: options.excludeSessionId ?? null,
      concept_tags: options.conceptTags ?? null,
    });
    return Array.isArray(response.beats) ? (response.beats as Beat[]) : [];
  } catch (error) {
    console.error("[directorRuntime] Recap fetch failed:", error);
    return [];
  }
}

/** Where this child left off — the resume anchor from their last logged beat. */
export async function fetchResumePoint(): Promise<{ lastBeatId: string | null }> {
  try {
    const response = await post("/api/resume-state", {});
    return { lastBeatId: typeof response.last_beat_id === "string" ? response.last_beat_id : null };
  } catch (error) {
    console.error("[directorRuntime] Resume lookup failed:", error);
    return { lastBeatId: null };
  }
}

/**
 * Reads a child's yes/no when asked to CONFIRM a doubtfully-heard number.
 * "other" usually means they restated the answer — judged as a fresh
 * attempt rather than as a confirmation.
 */
export function classifyConfirmation(transcript: string): "yes" | "no" | "other" {
  const said = transcript.trim().toLowerCase();
  if (/(නෑ|නැහැ|නැත|නෙවෙයි|නෙමේ|\bno\b)/.test(said)) return "no";
  if (/(ඔව්|ඔවු|හරි|එහෙමයි|\byes\b|\byeah\b)/.test(said)) return "yes";
  return "other";
}
