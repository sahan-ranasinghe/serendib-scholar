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

import { parseAnswerPredicate } from "@/lib/answerCheck";
import type { Beat, BeatBoardAction, CloseReason, PlannerDecision } from "@/lib/lessonOrchestrator";
import type { BoardContent } from "@/lib/board";
import type { PhraseRubric } from "@/lib/authoredScript";

/** What a beat's board action did, so the caller can apply it to board state. */
export interface StagedBoard {
  /** A full replacement board (stage_item), if this action produced one. */
  board?: BoardContent;
  /** A view patch (reveal_part / set_active_blank), if this action produced one. */
  viewPatch?: Record<string, unknown>;
}

/** A write that takes longer than this is treated as failed: a network that drops mid-lesson (a half-open connection never errors on its own) must not hang the beat that awaits its log row. */
const POST_TIMEOUT_MS = 15_000;

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
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
      if (!board) return {};
      // A demonstration row: its worked cells are blanked here (the number
      // stays) so Zara's reveal beats fill them one by one — the row is
      // worked in front of the child, not shown finished.
      if (action.demonstrateRow !== undefined && board.type === "lesson_content") {
        const components = (board.components as Array<{ type: string; props: Record<string, unknown> }>).map((component) => {
          if (component.type !== "PlaceValueTable" || !Array.isArray(component.props.rows)) return component;
          const rows = (component.props.rows as Array<Record<string, unknown>>).map((row, index) =>
            index === action.demonstrateRow ? Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === "number" ? value : null])) : row,
          );
          return { ...component, props: { ...component.props, rows } };
        });
        return { board: { ...board, components } as BoardContent };
      }
      return { board };
    }
    case "reveal_part": {
      // A synthetic expansion (see authoredScript.expansionItemId) has no
      // content_bank row for the route to look up; its reveal is the same
      // view patch, built here.
      if (action.itemId.startsWith("expansion:")) {
        return {
          viewPatch: {
            expectedItemId: action.itemId,
            filledAnswer: { rowIndex: action.rowIndex, field: action.field, value: action.value, source: "tutor" },
          },
        };
      }
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
      return { viewPatch: { abacusAddBead: action.adds ?? [{ rod: action.rod, count: action.count }] } };
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
      return { board: { type: "text_card", text: action.text, highlight: action.highlight } };
    case "clear":
      // The one deliberate blank. Everything else that says nothing about
      // the board leaves it exactly as it was.
      return { board: { type: "empty" } };
    case "built_number":
      // The runtime owns the number (it is whatever the child last built);
      // it patches the board itself. Nothing to stage here.
      return {};
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

/** Stage 2 of a phrase answer: the planner route's rubric judge (one model call). */
export async function judgeWithRubric(transcript: string, rubric: PhraseRubric): Promise<{ accepted: boolean; why: string }> {
  try {
    const response = await post("/api/planner", { beat_goal: rubric.conceptDescription, expected: null, transcript, rubric });
    const decision = response.decision as PlannerDecision | undefined;
    if (decision && typeof decision.understood === "boolean") return { accepted: decision.understood, why: decision.reason ?? String(response.checked_by ?? "") };
  } catch (error) {
    console.error("[directorRuntime] Rubric judge request failed:", error);
  }
  return { accepted: false, why: "rubric judge unreachable" };
}

export interface SessionLogPayload {
  sessionId: string;
  sequence: number;
  beat: Beat;
  directorText: string;
  boardState: BoardContent | Record<string, unknown> | string | null;
  childTranscript: string | null;
  plannerDecision: PlannerDecision | null;
  /** Why the sitting ended — on the close row (and the metrics row when the child left). */
  closeReason?: { reason: CloseReason; minutesToday: number; minutesThisSitting: number } | null;
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
      // The close row has no planner decision; the reason it ended lives there instead.
      planner_decision: payload.closeReason ?? payload.plannerDecision,
      started_at: payload.startedAt,
      ended_at: payload.endedAt,
    });
  } catch (error) {
    console.error("[directorRuntime] Session log write failed:", error);
  }
}

export type NavKind = "replay" | "back" | "forward" | "goto";

/**
 * A navigation event (⏮ ⏭ or a step mark on the paused card's playback
 * panel) on session_log: a NAV row, never an answer. Its beat_id is not a
 * script beat's, so the resume anchor (src/lib/sessionRows.ts) and the
 * app's reads ignore it; the row is the record that the child went back.
 */
export async function logNav(payload: { sessionId: string; sequence: number; kind: NavKind; fromBeatId: string | null; toBeatId: string; furthestBeatId: string | null }): Promise<void> {
  try {
    const now = new Date().toISOString();
    await post("/api/session-log", {
      session_id: payload.sessionId,
      sequence: payload.sequence,
      beat_id: `nav:${payload.kind}`,
      beat_type: "NAV",
      concept_tag: null,
      mode: null,
      board_state: null,
      director_text: `${payload.kind}: ${payload.fromBeatId ?? "—"} → ${payload.toBeatId} (furthest ${payload.furthestBeatId ?? "—"})`,
      output_audio_ms: 0,
      child_transcript: null,
      planner_decision: { nav: payload.kind, from: payload.fromBeatId, to: payload.toBeatId, furthest: payload.furthestBeatId },
      started_at: now,
      ended_at: now,
    });
  } catch (error) {
    console.error("[directorRuntime] Nav log write failed:", error);
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
  // A predicate ("any arrangement of these digits") expects a number just
  // as a plain "6000" does; only its JSON shape would fail the regex.
  const expectsNumber =
    parseAnswerPredicate(expected) !== null || (/^[\d\s,]+$/.test(expected.trim()) && expected.trim() !== "");
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
