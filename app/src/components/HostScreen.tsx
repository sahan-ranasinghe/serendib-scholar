"use client";

import { useState } from "react";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import TeachingBoard from "@/components/TeachingBoard";
import CharacterState, { CHARACTER_STATE_CONFIG, type CharacterVisualState } from "@/components/CharacterState";
import LessonProgress from "@/components/LessonProgress"; // TEMPORARY PROOF-OF-CONCEPT
import { hasVisibleBoardContent } from "@/lib/board";

const STATUS_COPY: Record<string, string> = {
  idle: "Tap the button and say hello!",
  connecting: "Getting ready...",
  listening: "I'm listening!",
  error: "Oops, something went wrong.",
};

export default function HostScreen({ childId = "demo-child" }: { childId?: string }) {
  const {
    status,
    error,
    outputTranscript,
    boardContent,
    isAiTalking,
    currentLessonStepNumber, // TEMPORARY PROOF-OF-CONCEPT
    start,
    stop,
    notifyManualBoardInteraction,
    submitTypedAnswer, // TEMPORARY PROOF-OF-CONCEPT
  } = useGeminiLive({ childId });
  const isActive = status === "listening" || status === "connecting";

  // idle covers not-yet-started, connecting, and error alike — those are
  // all "not currently in a live back-and-forth" states, and error has its
  // own text feedback below already. Once truly live ("listening" status),
  // isAiTalking (PcmPlayer's real playback state, not just chunk arrival)
  // splits it into the child's turn vs. the AI's.
  const characterVisualState: CharacterVisualState = status !== "listening" ? "idle" : isAiTalking ? "talking" : "listening";

  // Mobile-first toggle/takeover: below the lg breakpoint, only one of
  // "character" (voice UI) or "board" is shown full-screen at a time, with
  // a small persistent indicator to switch back — the board takes over the
  // instant there's something to show, since that's the whole point of the
  // AI actively using it, and hands back to the character view once
  // cleared. On lg screens and up, both are always shown side by side
  // (the layout below this point is unaffected by `activeView`).
  const [activeView, setActiveView] = useState<"character" | "board">("character");
  const hasBoardContent = hasVisibleBoardContent(boardContent);
  const [trackedHasBoardContent, setTrackedHasBoardContent] = useState(hasBoardContent);
  if (hasBoardContent !== trackedHasBoardContent) {
    setTrackedHasBoardContent(hasBoardContent);
    setActiveView(hasBoardContent ? "board" : "character");
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-gradient-to-b from-amber-50 via-orange-50 to-rose-50 px-6 py-12 text-center">
      <header className={`flex flex-col items-center gap-2 ${activeView === "board" ? "hidden lg:flex" : "flex"}`}>
        <span className="text-4xl">📚✨</span>
        <h1 className="text-2xl font-bold text-orange-900">Serendib Scholar</h1>
        <p className="text-base text-orange-700">Your friendly study buddy</p>
      </header>

      {/* Always visible once the lesson has started, in both views — TEMPORARY PROOF-OF-CONCEPT */}
      <LessonProgress currentStepNumber={currentLessonStepNumber} />

      <div className="flex w-full flex-1 flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center">
        <main
          className={`w-full max-w-sm shrink-0 flex-col items-center justify-center gap-8 lg:flex lg:min-h-[28rem] ${
            activeView === "board" ? "hidden lg:flex" : "flex"
          }`}
        >
          <CharacterState state={characterVisualState} onClick={isActive ? stop : start} />

          <p className="min-h-8 text-lg font-medium text-orange-900">
            {error ?? STATUS_COPY[status]}
          </p>

          {outputTranscript && (
            <p className="rounded-2xl bg-white/70 px-5 py-4 text-lg leading-relaxed text-orange-950 shadow-sm">
              {outputTranscript}
            </p>
          )}
        </main>

        <div
          className={`w-full max-w-2xl lg:mt-0 ${
            activeView === "character" && hasBoardContent ? "hidden lg:block" : hasBoardContent ? "block" : "hidden lg:block"
          }`}
        >
          <TeachingBoard
            content={boardContent}
            onManualInteraction={notifyManualBoardInteraction}
            onSubmitTypedAnswer={submitTypedAnswer}
          />
        </div>
      </div>

      {/* Small persistent indicators to switch views — mobile only; lg screens always show both. */}
      {activeView === "board" && (
        <button
          type="button"
          onClick={() => setActiveView("character")}
          aria-label="Zara ට නැවත සවන් දෙන්න"
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white py-2 pr-4 pl-2 shadow-lg shadow-orange-200 active:scale-95 lg:hidden"
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full text-lg text-white ${CHARACTER_STATE_CONFIG[characterVisualState].bg}`}
          >
            {CHARACTER_STATE_CONFIG[characterVisualState].icon}
          </span>
          <span className="text-sm font-semibold whitespace-nowrap text-orange-900">
            නැවත Zara අහන්න ටැප් කරන්න
          </span>
        </button>
      )}
      {activeView === "character" && hasBoardContent && (
        <button
          type="button"
          onClick={() => setActiveView("board")}
          aria-label="Back to the board"
          className="fixed bottom-6 left-1/2 z-40 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-white text-2xl shadow-lg shadow-orange-200 active:scale-95 lg:hidden"
        >
          📖
        </button>
      )}

      <footer className={activeView === "board" ? "hidden lg:block" : undefined}>
        <p className="text-sm text-orange-600">
          Ask me anything about your Grade 5 Scholarship studies!
        </p>
      </footer>
    </div>
  );
}
