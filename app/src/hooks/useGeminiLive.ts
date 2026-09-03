"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeminiLiveClient, type FunctionCall } from "@/lib/geminiLiveClient";
import { PcmPlayer, startPcmRecorder, type PcmRecorderHandle } from "@/lib/pcmAudio";
import type { BoardContent, PageImageView, TableBoardView } from "@/lib/board";
import { DEFAULT_PAGE_IMAGE_VIEW } from "@/lib/board";
// TEMPORARY PROOF-OF-CONCEPT import — see src/data/lessons/lesson1-numbers.ts's module doc.
import type { FilledAnswer } from "@/data/lessons/lesson1-numbers";
import { extractMentionedPageNumbers } from "@/lib/pageReferenceDetection";
import {
  advance,
  beatSpec,
  buildConfirmBeat,
  buildReteachBeats,
  resolveConfirmation,
  buildDirectorLine,
  buildFeedbackBeat,
  buildWaitBeat,
  conceptSummary,
  createInitialState,
  currentBeat as beatAt,
  isLessonComplete,
  ASK_SILENCE_TIMEOUT_MS,
  FRAMING_CONCEPT,
  type Beat,
  type DirectorContext,
  type LessonScript,
  type OrchestratorState,
  type PlannerDecision,
} from "@/lib/lessonOrchestrator";
import { answersMatch } from "@/lib/answerCheck";
import {
  classifyConfirmation,
  fetchRecapBeats,
  fetchResumePoint,
  logBeat,
  looksLikeAnswerAttempt,
  recordAnswer,
  runPlanner,
  stageBeatBoard,
} from "@/lib/directorRuntime";

export type SessionStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "error";

const TOOL_ENDPOINTS: Record<string, string> = {
  check_answer: "/api/tools/check-answer",
  submit_blank_answer: "/api/tools/submit-blank-answer",
  reveal_answer: "/api/tools/reveal-answer",
  set_active_blank: "/api/tools/set-active-blank",
  search_syllabus: "/api/tools/search-syllabus",
  log_answer: "/api/tools/log-answer",
  flag_weakness: "/api/tools/flag-weakness",
  request_teacher_review: "/api/tools/request-teacher-review",
  show_page_image: "/api/tools/show-page-image",
  next_page: "/api/tools/next-page",
  previous_page: "/api/tools/previous-page",
  zoom_to_region: "/api/tools/zoom-to-region",
  zoom_out: "/api/tools/zoom-out",
  scroll_table: "/api/tools/scroll-table",
  highlight_region: "/api/tools/highlight-region",
  draw_marker: "/api/tools/draw-marker",
  show_table: "/api/tools/show-table",
  show_exercise: "/api/tools/show-exercise",
  show_vocabulary_card: "/api/tools/show-vocabulary-card",
  clear_board: "/api/tools/clear-board",
};

// These tool calls also drive "the board" (src/components/TeachingBoard.tsx)
// — when their response includes a `board` or `viewPatch` payload, it gets
// applied to board state below, in addition to being sent back to Gemini
// like any other tool result. search_syllabus is included because it
// auto-stages the top result's page image as a direct consequence of
// retrieval (see search-syllabus/route.ts) — the board updating shouldn't
// depend on the model remembering to separately call show_page_image
// afterward.
//
// Split into two kinds, handled differently (see the fold in onToolCall):
// - FULL_CONTENT tools replace the board outright with a real `board`
//   object (a brand-new page/table/exercise/card, or clearing it).
// - VIEW_PATCH tools (added for AI-controlled screen actions — zoom, page
//   navigation aside, table scroll, highlight) don't know what's currently
//   on the board (the routes are stateless), so they return a `viewPatch`
//   that gets merged onto whatever's already displayed.
const FULL_CONTENT_BOARD_TOOL_NAMES = new Set([
  "search_syllabus",
  "show_page_image",
  "next_page",
  "previous_page",
  "show_table",
  "show_exercise",
  "show_vocabulary_card",
  "clear_board",
]);
const VIEW_PATCH_BOARD_TOOL_NAMES = new Set([
  "zoom_to_region",
  "zoom_out",
  "scroll_table",
  "highlight_region",
  "draw_marker",
  "submit_blank_answer",
  "reveal_answer",
  "set_active_blank",
]);
const BOARD_TOOL_NAMES = new Set([...FULL_CONTENT_BOARD_TOOL_NAMES, ...VIEW_PATCH_BOARD_TOOL_NAMES]);

// A page-navigation tool call (show_page_image, next_page, previous_page)
// means the model deliberately addressed which page is shown this turn —
// the same signal the board/narration mismatch check (see
// checkForPageReferenceMismatch below) uses to decide whether it still
// needs to step in.
const PAGE_NAVIGATION_TOOL_NAMES = new Set(["show_page_image", "next_page", "previous_page"]);

interface BoardToolResponse {
  board: BoardContent;
}

// The last three fields belong to submit_blank_answer / reveal_answer /
// set_active_blank, which patch a lesson_content board.
type ViewPatch = Partial<PageImageView> & Partial<TableBoardView> & {
  filledAnswer?: FilledAnswer;
  activeBlank?: { rowIndex: number; field: string } | null;
  expectedItemId?: string;
};

interface ViewPatchToolResponse {
  viewPatch: ViewPatch;
}

/**
 * One concept a lesson covers, for the progress bar. Derived from the lesson
 * script the app fetched (see buildLessonScript.ts) rather than from a tool
 * response — the model has no say in what the lesson contains any more.
 */
export interface LessonConcept {
  concept_tag: string;
  description: string | null;
  explanations_available: number;
  problems_available: number;
}

function conceptsFromScript(script: LessonScript): LessonConcept[] {
  return script.concepts.map((summary) => {
    const beats = script.beats
      .slice(summary.firstBeat, summary.lastBeat + 1)
      .filter((beat) => beat.conceptTag === summary.conceptTag);
    return {
      concept_tag: summary.conceptTag,
      description: summary.description,
      explanations_available: beats.filter((beat) => beat.type === "EXPLAIN").length,
      problems_available: new Set(beats.filter((beat) => beat.itemId && beat.type === "SHOW_BOARD").map((b) => b.itemId))
        .size,
    };
  });
}

/** The shape of one search_syllabus result relevant to board tracking (see search-syllabus/route.ts). */
interface SearchSyllabusResult {
  topic: string;
  source_reference: string;
  pages: number[];
  image: { imageUrl: string; pageNumber: number; printedPageNumber: number | null; sourceReference: string } | null;
}

// Not every board-tool response actually includes a `board`/`viewPatch`
// field (e.g. a search_syllabus call with no matching image, or any tool
// call that failed validation) — checked structurally rather than relying
// on an `ok` flag, since not all these routes' success responses share
// that shape (search_syllabus's doesn't).
function isBoardToolResponse(response: unknown): response is BoardToolResponse {
  if (typeof response !== "object" || response === null) return false;
  const board = (response as { board?: unknown }).board;
  return typeof board === "object" && board !== null && "type" in board;
}

function isViewPatchToolResponse(response: unknown): response is ViewPatchToolResponse {
  if (typeof response !== "object" || response === null) return false;
  const viewPatch = (response as { viewPatch?: unknown }).viewPatch;
  return typeof viewPatch === "object" && viewPatch !== null;
}

/**
 * Merges a view-only patch (zoom, table scroll position, highlight) onto
 * whatever board content is currently displayed. A no-op (with a console
 * warning, for the same visibility reasons as the page-reference mismatch
 * check) if the current content doesn't support that kind of patch — e.g.
 * the model tried to zoom while an exercise, not a page image, is shown.
 */
function applyViewPatch(current: BoardContent | null, patch: ViewPatch): BoardContent | null {
  if (current?.type === "page_image") {
    return {
      ...current,
      view: {
        zoom: patch.zoom ?? current.view.zoom,
        zoomFocus: patch.zoomFocus !== undefined ? patch.zoomFocus : current.view.zoomFocus,
        highlight: patch.highlight !== undefined ? patch.highlight : current.view.highlight,
        marker: patch.marker !== undefined ? patch.marker : current.view.marker,
      },
    };
  }
  if (current?.type === "table") {
    return {
      ...current,
      view: {
        scrollTo: patch.scrollTo !== undefined ? patch.scrollTo : current.view.scrollTo,
        highlight: patch.highlight !== undefined ? patch.highlight : current.view.highlight,
      },
    };
  }
  // The patches from submit_blank_answer (the child answered),
  // reveal_answer (Zara wrote it herself while demonstrating) and
  // set_active_blank. The first two share this branch deliberately: they
  // differ only by the `source` tag on the filled answer, so the item guard
  // and active-blank clearing below apply to both.
  if (current?.type === "lesson_content" && (patch.filledAnswer || "activeBlank" in patch)) {
    if (patch.expectedItemId !== undefined && patch.expectedItemId !== current.itemId) {
      console.warn(
        `[useGeminiLive] Ignored a blank-tracking action for item ${patch.expectedItemId} — the board is ` +
          `currently showing item ${current.itemId} (the lesson likely already moved on).`,
      );
      return current;
    }
    if (patch.filledAnswer) {
      const isSameCell = (a: FilledAnswer) =>
        a.rowIndex === patch.filledAnswer!.rowIndex && a.field === patch.filledAnswer!.field;
      return {
        ...current,
        filledAnswers: [...current.filledAnswers.filter((a) => !isSameCell(a)), patch.filledAnswer],
        // A filled blank is no longer "the one currently being asked
        // about" — clear the active highlight so it doesn't linger on an
        // already-confirmed cell.
        activeBlank:
          current.activeBlank?.rowIndex === patch.filledAnswer.rowIndex &&
          current.activeBlank?.field === patch.filledAnswer.field
            ? null
            : current.activeBlank,
      };
    }
    // set_active_blank's patch: `activeBlank` present (possibly null, to clear it).
    return { ...current, activeBlank: patch.activeBlank ?? null };
  }
  console.warn(
    `[useGeminiLive] Ignored a view-only board action — current board content ` +
      `(${current?.type ?? "none"}) doesn't support it.`,
  );
  return current;
}

async function executeToolCall(call: FunctionCall) {
  const endpoint = call.name ? TOOL_ENDPOINTS[call.name] : undefined;
  if (!endpoint) {
    return { error: `Unknown tool: ${call.name}` };
  }
  try {
    // No child id in the body: any route that needs the active child
    // resolves it server-side (see src/lib/activeChild.ts).
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(call.args ?? {}),
    });
    return await res.json();
  } catch (error) {
    console.error(`[useGeminiLive] Tool call ${call.name} failed:`, error);
    return { error: "Tool execution failed" };
  }
}

export interface UseGeminiLiveOptions {
  /** Which lesson the orchestrator should run. */
  subject?: string;
  grade?: number;
  lesson?: number;
}

/** 24kHz mono PCM16 — 48 bytes per millisecond of audio. */
const PCM_BYTES_PER_MS = 48;

export function useGeminiLive({
  subject = "maths",
  grade = 5,
  lesson = 1,
}: UseGeminiLiveOptions = {}) {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [outputTranscript, setOutputTranscript] = useState("");
  const [inputTranscript, setInputTranscript] = useState("");
  const [boardContent, setBoardContent] = useState<BoardContent | null>(null);
  // True exactly while the AI's voice is actually audible (real playback
  // state from PcmPlayer, not just "a chunk arrived over the network" —
  // playback lags behind receipt by a buffer) — drives the character's
  // "talking" visual state (see CharacterState.tsx).
  const [isAiTalking, setIsAiTalking] = useState(false);
  // What the lesson covers and where in it we are, for the always-visible
  // progress bar (LessonProgress.tsx). Both come from the orchestrator now:
  // the concept list from the fetched lesson script, the current concept
  // from orchestrator state.
  //
  // Note this tracks which concept is being taught, NOT how many are
  // "done" — a concept is finished when the child answers two unaided, and
  // the orchestrator (not the bar) is what knows that.
  const [lessonConcepts, setLessonConcepts] = useState<LessonConcept[]>([]);
  const [currentConceptTag, setCurrentConceptTag] = useState<string | null>(null);

  // --- Lesson orchestrator -------------------------------------------
  // The teacher's brain (see lessonOrchestrator.ts). Refs rather than
  // state because every one of these is read and written inside WebSocket
  // handlers that fire outside React's render cycle; the only pieces
  // mirrored into state are the ones the UI actually draws.
  const scriptRef = useRef<LessonScript | null>(null);
  const orchStateRef = useRef<OrchestratorState>(createInitialState());
  const activeBeatRef = useRef<Beat | null>(null);
  /** False for beats the orchestrator inserted live (WAIT, FEEDBACK) rather than ones from the script. */
  const activeBeatScriptedRef = useRef(true);
  /** Beats to speak before returning to the script — feedback on an answer, and nothing else so far. */
  const pendingBeatsRef = useRef<Beat[]>([]);
  /** "speaking" = the model is delivering a beat; "awaiting_child" = the beat is delivered and it's the child's turn. */
  const phaseRef = useRef<"idle" | "speaking" | "awaiting_child">("idle");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const childTranscriptForBeatRef = useRef("");
  const beatStartedAtRef = useRef<string>(new Date().toISOString());
  const beatAudioBytesRef = useRef(0);
  const beatSequenceRef = useRef(0);
  const sessionIdRef = useRef<string>("");
  /** One check-in per ASK — a child who stays quiet twice needs a different beat, not another nudge. */
  const waitIssuedForBeatRef = useRef<string | null>(null);
  /** A doubtful number hearing awaiting the child's yes/no (see buildConfirmBeat). */
  const confirmPendingRef = useRef<{ askBeatId: string; heard: string } | null>(null);
  /** When the current chat beat's free-conversation window closes. */
  const chatDeadlineRef = useRef(0);
  /** What actually happened this sitting — feeds CLOSE_SESSION's director context. */
  const sessionStatsRef = useRef({ concepts: new Set<string>(), correct: 0, asked: 0 });
  /** What the child said since the LAST next_beat call — one conversational round. */
  const roundTranscriptRef = useRef("");
  /** The beat a runtime interjection (WAIT/CONFIRM) returns to once spoken — with its own scriptedness. */
  const returnAfterInterjectionRef = useRef<{ beat: Beat; scripted: boolean } | null>(null);
  /** Reteach angles already spoken this session, per concept — a re-explanation must take a NEW way in. */
  const usedReteachAnglesRef = useRef<string[]>([]);
  /** Set when the ask-silence timer fired without an answer — the next next_beat call acts on it. */
  const silenceExpiredRef = useRef(false);
  /** True while the model has been told to hold for the child on the active beat. */
  const holdingForChildRef = useRef(false);
  /** Manual turn-taking (default) vs. the experimental open-mic-chat session mode. */
  const openMicChatRef = useRef(false);
  /** True while the push-to-talk button is held. */
  const micHeldRef = useRef(false);
  /** Chunks streamed during the current hold — a release with zero would make an audio-less activity window, which the API rejects. */
  const chunksSentDuringHoldRef = useRef(0);
  /** Mirrors isAiTalking for handlers outside the render cycle. */
  const aiTalkingRef = useRef(false);
  /** This session's CHAT_OPENER personalisation (see /api/opener). */
  const openerRef = useRef<{ goal: string; skip: boolean } | null>(null);
  /** The opener's first-reply bookkeeping: interest extraction + the short-reply rule fire once. */
  const openerReplyHandledRef = useRef(false);

  const clientRef = useRef<GeminiLiveClient | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const recorderRef = useRef<PcmRecorderHandle | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Board/narration consistency tracking (see checkForPageReferenceMismatch
  // in `start` below). Refs, not state, because these are read/written
  // synchronously inside WebSocket message handlers that fire outside
  // React's render cycle — a stale closure over state would miss updates
  // that happened between renders.
  const boardContentRef = useRef<BoardContent | null>(null);
  const outputTranscriptForTurnRef = useRef("");
  const pageNavigationCalledThisTurnRef = useRef(false);
  const warnedPagesThisTurnRef = useRef<Set<number>>(new Set());
  const pendingAutoStagePagesRef = useRef<Set<number>>(new Set());
  // The most recent search_syllabus result the model has been given —
  // persists across turns (not reset per-turn) since narration of one
  // retrieved passage typically spans several turns. Needed to know which
  // source_reference to auto-stage against, and to gate auto-staging to
  // page numbers we know are actually part of the current passage (never
  // guessing at an unrelated number).
  const lastSearchPassageRef = useRef<{ sourceReference: string; pages: number[] } | null>(null);
  // The topic of the most recent search_syllabus result the board was
  // (or should have been) staged from — see FIX 1: the board/narration
  // mismatch check above only ever catches a spoken page NUMBER; it misses
  // the model moving to a whole different topic/question without saying
  // one at all (confirmed real case: narrating a time/schedule problem
  // while the board still showed an unrelated multiplication table).
  // Comparing this against each new search_syllabus result's own topic
  // catches that broader case too. Reset to null by clear_board, so a
  // fresh search right after an intentionally-cleared board doesn't count
  // as "changed from nothing."
  const stagedTopicRef = useRef<string | null>(null);
  // Whether the child has manually interacted with the board (tap-to-zoom,
  // pinch, manual table scroll) since the last full content change — see
  // notifyManualBoardInteraction below and prompt.ts's THE BOARD section.
  // Persists across turns (unlike the per-turn refs above): once the child
  // takes control of the view, that stays true until fresh content
  // replaces it, not just until the current turn ends.
  const childInteractedManuallyRef = useRef(false);

  const stop = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    phaseRef.current = "idle";
    activeBeatRef.current = null;
    pendingBeatsRef.current = [];
    returnAfterInterjectionRef.current = null;
    holdingForChildRef.current = false;
    micHeldRef.current = false;
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    clientRef.current?.close();
    clientRef.current = null;
    setStatus("idle");
  }, []);

  // Called by TeachingBoard (via HostScreen) whenever the child directly
  // manipulates the board — see PART B: manual interaction becomes the new
  // authoritative state, and subsequent AI view actions should be aware of
  // it (surfaced to the model as `board_state.child_interacted_manually` on
  // every board-tool response — see onToolCall below) rather than the AI
  // immediately fighting it, e.g. zooming back out right after the child
  // zoomed in themselves.
  const notifyManualBoardInteraction = useCallback(() => {
    childInteractedManuallyRef.current = true;
  }, []);

  // Lets the child type/tap an answer on the board (see AnswerCell in
  // LessonComponents.tsx) instead of speaking it. Recorded as this beat's
  // child transcript so the planner judges it exactly like a spoken answer,
  // and also sent to the model so it can react in the conversation.
  const submitTypedAnswer = useCallback((text: string) => {
    roundTranscriptRef.current += (roundTranscriptRef.current ? " " : "") + text;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    // Ordinary child input — NOT director text. The caption never renders
    // client-sent text (it shows model output transcription only).
    clientRef.current?.sendTextInput(text);
  }, []);

  /**
   * Push-to-talk: audio streams only while held (see onReady's recorder
   * gating). Press is ignored while the model is speaking a non-chat beat —
   * a teaching beat must not be interruptible by the mic.
   */
  const startTalking = useCallback(() => {
    const beatType = activeBeatRef.current?.type;
    const isChat = beatType === "CHAT_OPENER" || beatType === "BREAK_CHAT";
    if (aiTalkingRef.current && !isChat) return;
    if (micHeldRef.current) return;
    micHeldRef.current = true;
    chunksSentDuringHoldRef.current = 0;
    if (!openMicChatRef.current) clientRef.current?.sendActivityStart();
  }, []);

  const stopTalking = useCallback(() => {
    if (!micHeldRef.current) return;
    micHeldRef.current = false;
    if (!openMicChatRef.current) {
      // A tap-and-release before any mic chunk went out would close the
      // window empty — and an audio-less activity window kills the whole
      // session (1007 "Precondition check failed"). Pad it with silence.
      if (chunksSentDuringHoldRef.current === 0) {
        clientRef.current?.sendAudioChunk("A".repeat(4000));
      }
      clientRef.current?.sendActivityEnd();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    setBoardContent(null);
    boardContentRef.current = null;
    outputTranscriptForTurnRef.current = "";
    pageNavigationCalledThisTurnRef.current = false;
    warnedPagesThisTurnRef.current.clear();
    pendingAutoStagePagesRef.current.clear();
    lastSearchPassageRef.current = null;
    stagedTopicRef.current = null;
    childInteractedManuallyRef.current = false;
    setIsAiTalking(false);
    setLessonConcepts([]);
    setCurrentConceptTag(null);
    scriptRef.current = null;
    orchStateRef.current = createInitialState();
    activeBeatRef.current = null;
    activeBeatScriptedRef.current = true;
    pendingBeatsRef.current = [];
    returnAfterInterjectionRef.current = null;
    holdingForChildRef.current = false;
    silenceExpiredRef.current = false;
    roundTranscriptRef.current = "";
    usedReteachAnglesRef.current = [];
    openerRef.current = null;
    openerReplyHandledRef.current = false;
    phaseRef.current = "idle";
    childTranscriptForBeatRef.current = "";
    beatAudioBytesRef.current = 0;
    beatSequenceRef.current = 0;
    waitIssuedForBeatRef.current = null;
    confirmPendingRef.current = null;
    chatDeadlineRef.current = 0;
    sessionStatsRef.current = { concepts: new Set<string>(), correct: 0, asked: 0 };
    sessionIdRef.current = crypto.randomUUID();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    try {
      // The lesson plan is fetched before the socket opens: without a
      // script there is nothing to direct, and starting a voice session
      // that then has nothing to say is worse than failing here.
      const scriptRes = await fetch("/api/lesson-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, grade, lesson }),
      });
      const scriptJson = await scriptRes.json();
      if (scriptJson?.ok && scriptJson.found) {
        scriptRef.current = scriptJson.script as LessonScript;
        setLessonConcepts(conceptsFromScript(scriptRef.current));
      } else {
        throw new Error("No lesson is ready to teach yet.");
      }

      // Resume where this child left off: their last logged beat anchors
      // the position; an id the current script no longer contains falls
      // back to the start (re-teaching is cheap, skipping is not).
      const script = scriptRef.current;
      const resume = await fetchResumePoint();
      let startIndex = 0;
      if (resume.lastBeatId) {
        const lastIndex = script.beats.findIndex((beat) => beat.id === resume.lastBeatId);
        if (lastIndex !== -1) startIndex = Math.min(lastIndex + 1, script.beats.length);
      }
      orchStateRef.current = createInitialState(startIndex);

      // Landing in the middle of a concept means it was left unfinished —
      // review it before continuing (spec: unfinished concepts get a RECAP
      // first).
      const landing = script.beats[startIndex];
      if (landing && landing.conceptTag !== FRAMING_CONCEPT) {
        const summary = conceptSummary(script, landing.conceptTag);
        if (summary && startIndex > summary.firstBeat) {
          pendingBeatsRef.current.push(...(await fetchRecapBeats({ conceptTags: [landing.conceptTag] })));
        }
      }

      const sessionRes = await fetch("/api/gemini-session", { method: "POST" });
      if (!sessionRes.ok) {
        throw new Error("Could not start a study session. Please try again.");
      }
      const { token, model, openMicChat } = await sessionRes.json();
      openMicChatRef.current = openMicChat === true;

      // The session's CHAT_OPENER personalisation — fetched up front so
      // serving the opener beat never waits on the network.
      try {
        const openerRes = await fetch("/api/opener", { method: "POST" });
        const opener = await openerRes.json();
        if (opener?.ok) openerRef.current = { goal: String(opener.goal ?? ""), skip: opener.skip === true };
      } catch {
        openerRef.current = null; // scripted default opener stands
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const player = new PcmPlayer({
        onPlaybackStateChange: (talking) => {
          aiTalkingRef.current = talking;
          setIsAiTalking(talking);
        },
      });
      await player.resume();
      playerRef.current = player;

      // Structural fix for a confirmed failure mode: the model would
      // narrate moving to a page ("let's look at page 43") without
      // actually calling show_page_image, leaving the board showing a
      // stale, unrelated page while accurate content for a different page
      // was being discussed. Prompt instructions alone can't be trusted to
      // fire every single time, so this runs on every transcript chunk and
      // (a) always logs a clear, countable warning on any detected
      // mismatch, and (b) auto-stages the board itself when it can do so
      // confidently — the page must be part of the most recently retrieved
      // passage's known `pages` list, never a guess. Deliberately
      // keyword-anchored (see extractMentionedPageNumbers) so an unrelated
      // number spoken mid-problem (e.g. "31 × 8") never misfires this.
      function checkForPageReferenceMismatch() {
        const mentioned = extractMentionedPageNumbers(outputTranscriptForTurnRef.current);
        if (mentioned.length === 0) return;

        const board = boardContentRef.current;
        const currentPage = board?.type === "page_image" ? board.pageNumber : null;
        const currentPrinted = board?.type === "page_image" ? board.printedPageNumber : null;

        for (const page of mentioned) {
          if (page === currentPage || page === currentPrinted) continue;
          if (warnedPagesThisTurnRef.current.has(page)) continue;
          warnedPagesThisTurnRef.current.add(page);

          const passage = lastSearchPassageRef.current;
          const canAutoStage =
            !pageNavigationCalledThisTurnRef.current &&
            !!passage &&
            passage.pages.includes(page) &&
            !pendingAutoStagePagesRef.current.has(page);

          console.warn(
            `[useGeminiLive] Board/narration mismatch: AI referenced page ${page} in speech, but the ` +
              `board is showing page ${currentPage ?? "none"} (printed ${currentPrinted ?? "none"}), and ` +
              `no page-navigation call was made this turn.` +
              (canAutoStage
                ? ` Auto-staging page ${page} now.`
                : ` Not auto-staging — ${
                    pageNavigationCalledThisTurnRef.current
                      ? "a page-navigation call was already made this turn for a different page."
                      : !passage
                        ? "no search result context is tracked yet."
                        : `page ${page} isn't in the currently tracked result's pages list ` +
                          `[${passage.pages.join(", ")}], so it can't be confirmed confidently.`
                  }`),
          );

          if (!canAutoStage || !passage) continue;
          pendingAutoStagePagesRef.current.add(page);
          executeToolCall({
            name: "show_page_image",
            args: { source_reference: passage.sourceReference, page_number: page },
          })
            .then((response) => {
              if (isBoardToolResponse(response)) {
                boardContentRef.current = response.board;
                setBoardContent(response.board);
                childInteractedManuallyRef.current = false;
              }
            })
            .catch((err) => console.error("[useGeminiLive] Auto-stage show_page_image failed:", err));
        }
      }

      // ---- The director loop ------------------------------------------
      //
      // One beat at a time: stage the board, hand the model a single
      // instruction with a sentence budget, let it speak, then decide what
      // happens next in code. The model never chooses what comes next, and
      // never sees more of the lesson than the beat it is currently
      // speaking — which is exactly why it can no longer race ahead.

      const clearBeatTimers = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      };

      /** Runtime context for director lines that reference what actually happened (CLOSE_SESSION). */
      const directorContext = (): DirectorContext => ({
        sessionSummary: {
          conceptsWorked: [...sessionStatsRef.current.concepts],
          correctAnswers: sessionStatsRef.current.correct,
          totalAsked: sessionStatsRef.current.asked,
        },
      });

      const finishBeatLog = async (beat: Beat, decision: PlannerDecision | null) => {
        beatSequenceRef.current += 1;
        await logBeat({
          sessionId: sessionIdRef.current,
          sequence: beatSequenceRef.current,
          beat,
          directorText: buildDirectorLine(beat, directorContext()),
          boardState: boardContentRef.current,
          childTranscript: childTranscriptForBeatRef.current.trim() || null,
          plannerDecision: decision,
          outputAudioMs: Math.round(beatAudioBytesRef.current / PCM_BYTES_PER_MS),
          startedAt: beatStartedAtRef.current,
          endedAt: new Date().toISOString(),
        });
      };

      /**
       * Hands the model its turn when the child hasn't taken one — the only
       * way to wake a session that runs manual turn-taking. An empty
       * activity pulse is a "your move" with nothing said in it.
       */
      const nudgeModelTurn = () => {
        if (openMicChatRef.current) {
          // Explicit activity signals are rejected while the API's own
          // detection is on — silence handling is unavailable in this
          // experimental mode.
          console.warn("[useGeminiLive] Cannot nudge on silence in open-mic-chat mode.");
          return;
        }
        // NEVER an empty start/end pair — an audio-less activity window
        // kills the session with 1007 "Precondition check failed".
        clientRef.current?.sendSilentTurn();
      };

      const startSilenceTimer = (ms: number) => {
        clearBeatTimers();
        silenceTimerRef.current = setTimeout(() => {
          silenceExpiredRef.current = true;
          nudgeModelTurn();
        }, ms);
      };

      /** Board first, then bookkeeping — the words about it come back as the tool result. */
      const prepareBeat = async (beat: Beat, options: { scripted: boolean; returnTo?: { beat: Beat; scripted: boolean } | null }) => {
        clearBeatTimers();
        activeBeatRef.current = beat;
        activeBeatScriptedRef.current = options.scripted;
        returnAfterInterjectionRef.current = options.returnTo ?? null;
        childTranscriptForBeatRef.current = "";
        holdingForChildRef.current = false;
        silenceExpiredRef.current = false;
        beatStartedAtRef.current = new Date().toISOString();
        beatAudioBytesRef.current = 0;
        if (beat.conceptTag !== FRAMING_CONCEPT) setCurrentConceptTag(beat.conceptTag);
        if (beat.type === "CHAT_OPENER") {
          sessionStatsRef.current = { concepts: new Set<string>(), correct: 0, asked: 0 };
          openerReplyHandledRef.current = false;
        }
        try {
          const staged = await stageBeatBoard(beatSpec(beat.type).boardAction(beat));
          if (staged.board) {
            boardContentRef.current = staged.board;
            setBoardContent(staged.board);
            childInteractedManuallyRef.current = false;
          } else if (staged.viewPatch) {
            const patched = applyViewPatch(boardContentRef.current, staged.viewPatch as ViewPatch);
            boardContentRef.current = patched;
            setBoardContent(patched);
          }
        } catch (err) {
          console.error("[useGeminiLive] Board staging failed for beat", beat.id, err);
        }
      };

      /** Serves a beat: stages it and returns its director instruction as the next_beat result. */
      const serveBeat = async (
        beat: Beat,
        options: { scripted: boolean; returnTo?: { beat: Beat; scripted: boolean } | null },
      ): Promise<Record<string, unknown>> => {
        // CHAT_OPENER personalisation (see /api/opener): swap in the chosen
        // opener, or the quick-start line for the 20% of sessions that skip.
        let served = beat;
        if (beat.type === "CHAT_OPENER" && openerRef.current) {
          if (openerRef.current.skip) {
            served = {
              ...beat,
              goal:
                'Skip the small talk today: ask, warmly, exactly this — "අද ඉක්මනට පටන් ගමුද?" — and nothing else.',
              maxSentences: 1,
            };
            chatDeadlineRef.current = 0; // first reply ends the "chat"
          } else {
            served = { ...beat, goal: openerRef.current.goal };
          }
        }
        await prepareBeat(served, options);
        return { instruction: buildDirectorLine(served, directorContext()) };
      };

      /** The instruction that yields the turn to the child without moving the lesson. */
      const holdForChild = (reason: string): Record<string, unknown> => {
        holdingForChildRef.current = true;
        startSilenceTimer(ASK_SILENCE_TIMEOUT_MS);
        return { instruction: `${reason} Say nothing. Call next_beat() again at the start of your next turn.` };
      };

      const serveNext = async (): Promise<Record<string, unknown>> => {
        const queued = pendingBeatsRef.current.shift();
        if (queued) return serveBeat(queued, { scripted: false });
        const script = scriptRef.current;
        if (!script || isLessonComplete(script, orchStateRef.current)) {
          phaseRef.current = "idle";
          activeBeatRef.current = null;
          return { instruction: "The lesson is finished. Say a warm goodbye in one sentence. Then stop." };
        }
        const next = beatAt(script, orchStateRef.current);
        if (!next) {
          activeBeatRef.current = null;
          return { instruction: "The lesson is finished. Say a warm goodbye in one sentence. Then stop." };
        }
        return serveBeat(next, { scripted: true });
      };

      /**
       * The whole director channel, pulled: the model calls next_beat() at
       * the start of every turn and after finishing each beat of speech;
       * everything the old push loop did on timers and turn-completes now
       * happens here, and the instruction goes back as the TOOL RESULT —
       * never as conversation text, so it cannot leak into captions or be
       * read aloud as a message.
       */
      const handleNextBeat = async (): Promise<Record<string, unknown>> => {
        const beat = activeBeatRef.current;
        const roundSaid = roundTranscriptRef.current.trim();
        roundTranscriptRef.current = "";

        if (!beat) return serveNext();

        const handling = beatSpec(beat.type).onChildResponse;
        const wasHolding = holdingForChildRef.current;
        holdingForChildRef.current = false;

        // --- an interjection (WAIT / CONFIRM) just finished speaking -----
        const returnTo = returnAfterInterjectionRef.current;
        if (returnTo && !wasHolding) {
          returnAfterInterjectionRef.current = null;
          await finishBeatLog(beat, null);
          // Hand the original question back to the child, without
          // re-asking — restoring ITS OWN scriptedness: a recap ASK is an
          // inserted beat, and concluding it as "scripted" would wrongly
          // advance the lesson script.
          activeBeatRef.current = returnTo.beat;
          activeBeatScriptedRef.current = returnTo.scripted;
          childTranscriptForBeatRef.current = "";
          return holdForChild("The child still has the question in front of them — wait for their answer.");
        }

        // --- the beat was delivered and expects a response ---------------
        if (beat.endBy === "asking" && !wasHolding && !roundSaid) {
          // The model just finished asking; the child hasn't had a turn yet.
          if (beat.type === "CHAT_OPENER" || beat.type === "BREAK_CHAT") {
            chatDeadlineRef.current =
              chatDeadlineRef.current === 0 ? 0 : Date.now() + beatSpec(beat.type).estimateSeconds * 1000;
            if (chatDeadlineRef.current === 0) chatDeadlineRef.current = Date.now() + 20000;
          }
          return holdForChild("Wait for the child now.");
        }

        // --- silence ran out while holding -------------------------------
        if (wasHolding && !roundSaid && silenceExpiredRef.current) {
          silenceExpiredRef.current = false;
          if (handling === "judge" && waitIssuedForBeatRef.current !== beat.id) {
            waitIssuedForBeatRef.current = beat.id;
            return serveBeat(buildWaitBeat(beat), {
              scripted: false,
              returnTo: { beat, scripted: activeBeatScriptedRef.current },
            });
          }
          // Second silence (or a non-judged question nobody answered):
          // conclude with no answer and move on.
          return concludeAndServeNext(beat, "");
        }

        // --- still holding, spurious call with nothing new ---------------
        if (wasHolding && !roundSaid) {
          return holdForChild("Keep waiting for the child.");
        }

        // --- chat rounds --------------------------------------------------
        if (handling === "chat" && roundSaid) {
          childTranscriptForBeatRef.current += (childTranscriptForBeatRef.current ? " " : "") + roundSaid;
          const wordCount = roundSaid.split(/\s+/).filter(Boolean).length;
          if (beat.type === "CHAT_OPENER" && !openerReplyHandledRef.current) {
            openerReplyHandledRef.current = true;
            // Learn what they mentioned, off the hot path.
            void fetch("/api/extract-interest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transcript: roundSaid }),
            }).catch(() => undefined);
            if (wordCount < 6) {
              // A short first reply means they're not in a chatting mood —
              // straight to the lesson, no second chat question.
              return concludeAndServeNext(beat, roundSaid);
            }
          }
          if (Date.now() >= chatDeadlineRef.current) {
            return concludeAndServeNext(beat, roundSaid);
          }
          holdingForChildRef.current = true;
          startSilenceTimer(ASK_SILENCE_TIMEOUT_MS);
          return {
            instruction:
              "Respond warmly and briefly in Sinhala to what the child just said — one or two sentences, " +
              "one small follow-up question at most. Then stop and wait for them.",
          };
        }

        // --- a real response to a delivered beat -------------------------
        return concludeAndServeNext(beat, roundSaid);
      };

      const concludeAndServeNext = async (beat: Beat, said: string): Promise<Record<string, unknown>> => {
        const script = scriptRef.current;
        if (!script) return { instruction: "Wait." };
        if (said) {
          childTranscriptForBeatRef.current +=
            childTranscriptForBeatRef.current.endsWith(said) || !said ? "" : (childTranscriptForBeatRef.current ? " " : "") + said;
        }

        const handling = beatSpec(beat.type).onChildResponse;
        const scripted = activeBeatScriptedRef.current;
        let decision: PlannerDecision | null = null;

        // A CONFIRM just resolved: the child answered "did you say X?" —
        // judged by the shared pure resolver against THIS beat's own
        // expected answer (see resolveConfirmation's doc for the bug this
        // guards against).
        const pendingConfirm = confirmPendingRef.current;
        if (pendingConfirm && pendingConfirm.askBeatId === beat.id && said) {
          confirmPendingRef.current = null;
          const outcome = resolveConfirmation(beat, pendingConfirm.heard, classifyConfirmation(said), answersMatch);
          if (outcome.kind === "judged") {
            decision = outcome.decision;
          } else if (outcome.kind === "reask") {
            await finishBeatLog(beat, null);
            return serveBeat(beat, { scripted });
          }
          // "fresh-answer": a restated answer — judged fresh below.
        }

        if (!decision && handling === "judge" && said) {
          if (!looksLikeAnswerAttempt(beat, said)) {
            // A tangent is not a wrong answer: acknowledge it, then put the
            // question back.
            await finishBeatLog(beat, null);
            await prepareBeat(beat, { scripted });
            return {
              instruction:
                "The child said something off-topic. Respond to it warmly in ONE short Sinhala sentence, " +
                `then gently ask the question again: ${beat.goal} Then stop and wait.`,
            };
          }
          decision = await runPlanner(beat, said);
          if (decision.ambiguousNumber && beat.expectedAnswer !== undefined) {
            // Doubtful hearing: never judged unconfirmed.
            confirmPendingRef.current = { askBeatId: beat.id, heard: decision.ambiguousNumber };
            return serveBeat(buildConfirmBeat(beat, decision.ambiguousNumber), {
              scripted: false,
              returnTo: { beat, scripted },
            });
          }
        }
        if (!decision && handling === "judge" && !said) {
          decision = { understood: false, next: "simplify", reason: "No answer after a check-in." };
        }

        if (decision) {
          sessionStatsRef.current.asked += 1;
          if (decision.understood) sessionStatsRef.current.correct += 1;
          if (beat.conceptTag !== FRAMING_CONCEPT) sessionStatsRef.current.concepts.add(beat.conceptTag);
          void recordAnswer(beat, decision.understood);
        }

        await finishBeatLog(beat, decision);

        if (!scripted) {
          if (decision) {
            pendingBeatsRef.current.push(buildFeedbackBeat(beat, decision.understood, beat.expectedAnswer));
          }
          return serveNext();
        }

        if (beat.type === "RECAP") {
          pendingBeatsRef.current.push(...(await fetchRecapBeats({ excludeSessionId: sessionIdRef.current })));
        }

        const result = advance(script, orchStateRef.current, decision);
        orchStateRef.current = result.state;

        if (decision) {
          pendingBeatsRef.current.push(
            buildFeedbackBeat(beat, decision.understood, beat.expectedAnswer, { reteachFollows: result.needsReteach }),
          );
        }
        if (result.needsReteach) {
          // Targeted re-teaching from a fresh angle + a demo of a different
          // item, then the script (already rewound to the missed item's
          // SHOW_BOARD) retries the missed item itself.
          const { beats: reteachBeats, angleUsed } = buildReteachBeats(script, beat, usedReteachAnglesRef.current);
          if (angleUsed) usedReteachAnglesRef.current.push(angleUsed);
          pendingBeatsRef.current.push(...reteachBeats);
        }

        if (beat.type === "CLOSE_SESSION") {
          // The sitting is over; the next visit resumes at the next
          // session's opener. Let the tool response flush before closing.
          setTimeout(() => stop(), 300);
          return { instruction: "The session is over and you have said goodbye. Say nothing more." };
        }
        return serveNext();
      };

      const client = new GeminiLiveClient({
        onReady: async () => {
          setStatus("listening");
          const recorder = await startPcmRecorder(stream, (chunk) => {
            // Push-to-talk: audio flows ONLY while the button is held —
            // stray mic noise can never reach (or interrupt) the model.
            // The experimental open-mic mode streams freely during the two
            // chat beat types.
            const beatType = activeBeatRef.current?.type;
            const openMicNow =
              openMicChatRef.current && (beatType === "CHAT_OPENER" || beatType === "BREAK_CHAT");
            if (micHeldRef.current || openMicNow) {
              client.sendAudioChunk(chunk);
              if (micHeldRef.current) chunksSentDuringHoldRef.current += 1;
            }
          });
          recorderRef.current = recorder;
          // In manual turn-taking, nothing happens until someone takes a
          // turn — hand the model its first one so the lesson opens itself.
          // Must carry audio: an empty activity window is rejected (1007).
          if (!openMicChatRef.current) client.sendSilentTurn();
        },
        onAudioChunk: (chunk) => {
          player.enqueue(chunk);
          // Base64 -> bytes -> milliseconds of speech, for the session log's
          // record of how long the model actually talked for on this beat.
          beatAudioBytesRef.current += Math.floor((chunk.length * 3) / 4);
        },
        onInterrupted: () => player.clear(),
        onInputTranscript: (text) => {
          setInputTranscript((prev) => prev + text);
          // The child is talking: they are not silent, so cancel the
          // check-in timer, and collect this round's words for next_beat.
          roundTranscriptRef.current += text;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        },
        onOutputTranscript: (text) => {
          setOutputTranscript((prev) => prev + text);
          outputTranscriptForTurnRef.current += text;
          checkForPageReferenceMismatch();
        },
        onTurnComplete: () => {
          setInputTranscript("");
          setOutputTranscript("");
          outputTranscriptForTurnRef.current = "";
          pageNavigationCalledThisTurnRef.current = false;
          warnedPagesThisTurnRef.current.clear();
          pendingAutoStagePagesRef.current.clear();
          // Beat flow is pull-based now (see handleNextBeat) — nothing to
          // drive here; the model's own next_beat calls carry the lesson.
        },
        onToolCall: async (calls) => {
          // next_page/previous_page are declared with no parameters (the
          // model just says "next page," it doesn't track technical IDs —
          // see geminiLiveTools.ts) — inject the file/page it should act on
          // from the board's own tracked state before the request goes out.
          // Captured synchronously per call, before any awaiting, so a
          // multi-call batch can't race against its own board updates
          // (those only land later, after execution, in the fold below).
          const augmentedCalls = calls.map((call) => {
            if (
              (call.name === "next_page" || call.name === "previous_page") &&
              boardContentRef.current?.type === "page_image"
            ) {
              return {
                ...call,
                args: {
                  source_reference: boardContentRef.current.sourceReference,
                  current_page_number: boardContentRef.current.pageNumber,
                },
              };
            }
            return call;
          });

          const executed = await Promise.all(
            augmentedCalls.map(async (call) => ({
              call,
              // next_beat is the director channel: answered locally by the
              // lesson controller, never by an HTTP route. Everything else
              // still goes to its tool endpoint.
              response: call.name === "next_beat" ? await handleNextBeat() : await executeToolCall(call),
            })),
          );

          for (const { call } of executed) {
            if (call.name && PAGE_NAVIGATION_TOOL_NAMES.has(call.name)) {
              pageNavigationCalledThisTurnRef.current = true;
            }
          }
          for (const { call, response } of executed) {
            if (call.name === "clear_board") {
              stagedTopicRef.current = null;
            }
            if (call.name !== "search_syllabus") continue;
            const results = (response as { results?: SearchSyllabusResult[] } | undefined)?.results;
            const topResult = results?.[0];
            if (!topResult) continue;
            lastSearchPassageRef.current = { sourceReference: topResult.source_reference, pages: topResult.pages };

            // FIX 1: the mismatch check above only ever catches a spoken
            // page NUMBER differing from the board — it misses the model
            // moving to an entirely different topic without saying one at
            // all (confirmed real case: narrating a time/schedule problem
            // while the board still showed an unrelated multiplication
            // table). The server only auto-stages via `board` when this
            // result is unambiguously one page; if it's ambiguous but the
            // topic genuinely changed from what's currently up, a
            // topically-correct-but-imprecise page beats a stale,
            // completely unrelated one, so stage it ourselves.
            const topicChanged = stagedTopicRef.current !== null && topResult.topic !== stagedTopicRef.current;
            stagedTopicRef.current = topResult.topic;
            if (topicChanged && !isBoardToolResponse(response) && topResult.image) {
              console.warn(
                `[useGeminiLive] Board/topic mismatch: search_syllabus returned a new topic ` +
                  `("${topResult.topic}") that wasn't auto-staged (ambiguous multi-page result). ` +
                  `Staging its top image (page ${topResult.image.pageNumber}) now so the board doesn't ` +
                  `keep showing the previous topic.`,
              );
              (response as { board?: BoardContent }).board = {
                type: "page_image",
                imageUrl: topResult.image.imageUrl,
                pageNumber: topResult.image.pageNumber,
                printedPageNumber: topResult.image.printedPageNumber,
                sourceReference: topResult.image.sourceReference,
                view: DEFAULT_PAGE_IMAGE_VIEW,
              };
            }
          }

          // Apply this batch's board-affecting calls in order — a
          // sequential fold rather than "just take the last one," since a
          // batch can mix a full-content call (e.g. show_page_image) with a
          // view-only one (e.g. a following zoom_to_region) that needs to
          // apply on top of it, not instead of it.
          const wasManuallyInteracted = childInteractedManuallyRef.current;
          let nextBoard = boardContentRef.current;
          let boardChanged = false;
          for (const { call, response } of executed) {
            if (!call.name || !BOARD_TOOL_NAMES.has(call.name)) continue;
            if (FULL_CONTENT_BOARD_TOOL_NAMES.has(call.name) && isBoardToolResponse(response)) {
              nextBoard = response.board;
              childInteractedManuallyRef.current = false;
              boardChanged = true;
            } else if (VIEW_PATCH_BOARD_TOOL_NAMES.has(call.name) && isViewPatchToolResponse(response)) {
              nextBoard = applyViewPatch(nextBoard, response.viewPatch);
              boardChanged = true;
            }
          }
          if (boardChanged) {
            boardContentRef.current = nextBoard;
            setBoardContent(nextBoard);
          }

          client.sendToolResponse(
            executed.map(({ call, response }) => ({
              id: call.id,
              name: call.name,
              // Board-tool responses carry a lightweight, best-effort
              // signal for whether the child has taken manual control of
              // the view since the last full content change — enough
              // context for the model to avoid immediately overriding a
              // manual zoom, without needing exact pixel state (see PART B
              // / prompt.ts's THE BOARD section).
              response:
                call.name && BOARD_TOOL_NAMES.has(call.name)
                  ? { ...response, board_state: { child_interacted_manually: wasManuallyInteracted } }
                  : response,
            })),
          );
        },
        onError: (err) => {
          console.error("[useGeminiLive] WebSocket error:", err);
          setError("Connection lost. Please try again.");
          setStatus("error");
        },
        onClose: () => {
          if (status !== "error") setStatus("idle");
        },
      });

      clientRef.current = client;
      client.connect(token, model);
    } catch (err) {
      console.error("[useGeminiLive] Failed to start session:", err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop, subject, grade, lesson]);

  useEffect(() => stop, [stop]);

  return {
    status,
    error,
    inputTranscript,
    outputTranscript,
    boardContent,
    isAiTalking,
    lessonConcepts,
    currentConceptTag,
    start,
    stop,
    notifyManualBoardInteraction,
    submitTypedAnswer,
    startTalking,
    stopTalking,
  };
}
