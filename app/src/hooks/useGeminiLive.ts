"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeminiLiveClient, type FunctionCall } from "@/lib/geminiLiveClient";
import { PcmPlayer, startPcmRecorder, type PcmRecorderHandle } from "@/lib/pcmAudio";
import type { BoardContent, PageImageView, TableBoardView } from "@/lib/board";
import { DEFAULT_PAGE_IMAGE_VIEW } from "@/lib/board";
// TEMPORARY PROOF-OF-CONCEPT import — see src/data/lessons/lesson1-numbers.ts's module doc.
import type { FilledAnswer } from "@/data/lessons/lesson1-numbers";
import { extractMentionedPageNumbers } from "@/lib/pageReferenceDetection";

export type SessionStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "error";

const TOOL_ENDPOINTS: Record<string, string> = {
  // TEMPORARY PROOF-OF-CONCEPT — see src/data/lessons/lesson1-numbers.ts's
  // module doc for the full removal list.
  teach_lesson1_step: "/api/tools/teach-lesson1-step",
  check_answer: "/api/tools/check-answer",
  find_teaching_content: "/api/tools/find-teaching-content",
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
  "teach_lesson1_step", // TEMPORARY PROOF-OF-CONCEPT
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
  "submit_blank_answer", // TEMPORARY PROOF-OF-CONCEPT
  "reveal_answer", // TEMPORARY PROOF-OF-CONCEPT
  "set_active_blank", // TEMPORARY PROOF-OF-CONCEPT
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

// The last three fields are TEMPORARY PROOF-OF-CONCEPT additions for
// submit_blank_answer / set_active_blank — see
// src/data/lessons/lesson1-numbers.ts's module doc.
type ViewPatch = Partial<PageImageView> & Partial<TableBoardView> & {
  filledAnswer?: FilledAnswer;
  activeBlank?: { rowIndex: number; field: string } | null;
  expectedStepNumber?: number;
};

interface ViewPatchToolResponse {
  viewPatch: ViewPatch;
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
  // TEMPORARY PROOF-OF-CONCEPT — the patches from submit_blank_answer (the
  // child answered), reveal_answer (Zara wrote it herself while
  // demonstrating) and set_active_blank. The first two share this branch
  // deliberately: they differ only by the `source` tag on the filled
  // answer, so the step guard and active-blank clearing below apply to
  // both. See src/data/lessons/lesson1-numbers.ts's module doc.
  if (current?.type === "lesson_step" && (patch.filledAnswer || "activeBlank" in patch)) {
    if (patch.expectedStepNumber !== undefined && patch.expectedStepNumber !== current.stepNumber) {
      console.warn(
        `[useGeminiLive] Ignored a blank-tracking action for step ${patch.expectedStepNumber} — the board is ` +
          `currently showing step ${current.stepNumber} (the child likely already moved on).`,
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

async function executeToolCall(call: FunctionCall, childId: string) {
  const endpoint = call.name ? TOOL_ENDPOINTS[call.name] : undefined;
  if (!endpoint) {
    return { error: `Unknown tool: ${call.name}` };
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...call.args, child_id: childId }),
    });
    return await res.json();
  } catch (error) {
    console.error(`[useGeminiLive] Tool call ${call.name} failed:`, error);
    return { error: "Tool execution failed" };
  }
}

export interface UseGeminiLiveOptions {
  /** Identifies whose progress/safety events get logged. */
  childId: string;
}

export function useGeminiLive({ childId }: UseGeminiLiveOptions) {
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
  // TEMPORARY PROOF-OF-CONCEPT — which Lesson 1 step is (or was last)
  // showing, for the always-visible progress bar (LessonProgress.tsx).
  // Deliberately persists even if the board later shows something else
  // (e.g. briefly cleared), rather than disappearing and reappearing — see
  // src/data/lessons/lesson1-numbers.ts's module doc.
  const [currentLessonStepNumber, setCurrentLessonStepNumber] = useState<number | null>(null);

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

  // TEMPORARY PROOF-OF-CONCEPT — lets the child type/tap an answer on the
  // board (see AnswerCell in LessonComponents.tsx) instead of speaking it.
  // Sent as a real text turn (GeminiLiveClient.sendTextInput), so the model
  // receives and reacts to it exactly as it would a transcribed spoken
  // answer — same check_answer/submit_blank_answer flow, no separate code
  // path. See src/data/lessons/lesson1-numbers.ts's module doc.
  const submitTypedAnswer = useCallback((text: string) => {
    clientRef.current?.sendTextInput(text);
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
    setCurrentLessonStepNumber(null); // TEMPORARY PROOF-OF-CONCEPT

    try {
      const sessionRes = await fetch("/api/gemini-session", { method: "POST" });
      if (!sessionRes.ok) {
        throw new Error("Could not start a study session. Please try again.");
      }
      const { token, model } = await sessionRes.json();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const player = new PcmPlayer({ onPlaybackStateChange: setIsAiTalking });
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
          executeToolCall(
            { name: "show_page_image", args: { source_reference: passage.sourceReference, page_number: page } },
            childId,
          )
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

      const client = new GeminiLiveClient({
        onReady: async () => {
          setStatus("listening");
          const recorder = await startPcmRecorder(stream, (chunk) => {
            client.sendAudioChunk(chunk);
          });
          recorderRef.current = recorder;
        },
        onAudioChunk: (chunk) => player.enqueue(chunk),
        onInterrupted: () => player.clear(),
        onInputTranscript: (text) => setInputTranscript((prev) => prev + text),
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
              response: await executeToolCall(call, childId),
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
            // TEMPORARY PROOF-OF-CONCEPT — see src/data/lessons/lesson1-numbers.ts's module doc.
            if (nextBoard?.type === "lesson_step") setCurrentLessonStepNumber(nextBoard.stepNumber);
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
  }, [childId, stop]);

  useEffect(() => stop, [stop]);

  return {
    status,
    error,
    inputTranscript,
    outputTranscript,
    boardContent,
    isAiTalking,
    currentLessonStepNumber, // TEMPORARY PROOF-OF-CONCEPT
    start,
    stop,
    notifyManualBoardInteraction,
    submitTypedAnswer, // TEMPORARY PROOF-OF-CONCEPT
  };
}
