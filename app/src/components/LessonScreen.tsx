"use client";

/**
 * The product lesson screen: a landscape full-screen classroom modelled on
 * a teacher at a whiteboard. Phone held sideways is the primary case
 * (360-430px short edge); desktop scales the same layout up.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ progress strip (28px): lesson name · 8 stops   │
 *   ├──────────────────────────────┬─────────────────┤
 *   │                              │                 │
 *   │        whiteboard 75%        │                 │
 *   │   (grid, inner shadow, all   │   hold-to-talk  │
 *   │    board content, caption)   │      88px ◯     │
 *   │ [Zara docks bottom-left]     │                 │
 *   └──────────────────────────────┴─────────────────┘
 *
 * Portrait shows a friendly rotate-your-phone card instead of attempting a
 * portrait layout. The app opens straight into the lesson (resume or
 * session 1) — no title screen.
 */
import { useEffect, useRef, useState } from "react";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import TeachingBoard from "@/components/TeachingBoard";
import ZaraCharacter, { type ZaraState } from "@/components/ZaraCharacter";

const CELEBRATE_MS = 1200;
/** How often the amplitude state refreshes while Zara talks (~12fps is plenty for 3 mouth shapes). */
const AMPLITUDE_INTERVAL_MS = 80;

export default function LessonScreen() {
  const {
    status,
    error,
    outputTranscript,
    boardContent,
    isAiTalking,
    currentSessionIndex,
    sessionCount,
    celebrateNonce,
    start,
    stop,
    notifyManualBoardInteraction,
    submitTypedAnswer,
    muted,
    toggleMute,
    getOutputAmplitude,
  } = useGeminiLive();

  // Opens straight into the lesson: one auto-start on mount (resume or
  // session 1). The browser may require a gesture for mic/audio — if the
  // auto-start fails, the board shows a single tap-to-begin affordance.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Character state: celebration overrides briefly, else talking/listening.
  const [celebrating, setCelebrating] = useState(false);
  const firstCelebrate = useRef(true);
  useEffect(() => {
    if (firstCelebrate.current) {
      firstCelebrate.current = false;
      return;
    }
    setCelebrating(true);
    const timer = setTimeout(() => setCelebrating(false), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [celebrateNonce]);
  const zaraState: ZaraState = celebrating
    ? "celebrating"
    : isAiTalking
      ? "talking"
      : status === "listening"
        ? "listening"
        : "idle";

  // Mouth amplitude, sampled only while talking.
  const [amplitude, setAmplitude] = useState(0);
  useEffect(() => {
    // Subscribes to an external system (the audio analyser): amplitude only
    // ever changes inside the interval callback, never synchronously here.
    const timer = setInterval(() => {
      setAmplitude(isAiTalking ? getOutputAmplitude() : 0);
    }, AMPLITUDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isAiTalking, getOutputAmplitude]);

  const [captionsOn, setCaptionsOn] = useState(false);

  const lessonName = "සංඛ්‍යා - 1";
  const stops = Math.max(sessionCount, 1);

  return (
    <div className="lesson-screen fixed inset-0 flex flex-col bg-[#2f4f5f] text-stone-800">
      {/* ---- progress strip -------------------------------------------- */}
      <header className="flex h-7 shrink-0 items-center justify-between bg-[#26414e] px-3 text-[#d8e3e8]">
        <span className="truncate text-xs font-semibold tracking-wide">{lessonName}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="උපසිරැසි"
            onClick={() => setCaptionsOn((v) => !v)}
            className={`rounded px-1 text-[11px] font-bold leading-4 ${captionsOn ? "bg-amber-400 text-[#26414e]" : "bg-white/10"}`}
          >
            CC
          </button>
          {/* parent mute: capture continues, nothing is sent while muted */}
          <button
            type="button"
            aria-label="මයික් නිහඬ කරන්න"
            onClick={toggleMute}
            className={`rounded px-1 text-[11px] leading-4 ${muted ? "bg-rose-400 text-white" : "bg-white/10"}`}
          >
            {muted ? "🔇" : "🎙️"}
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: stops }).map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${
                  i < currentSessionIndex ? "bg-emerald-400" : i === currentSessionIndex ? "bg-amber-400" : "bg-white/25"
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* ---- classroom -------------------------------------------------- */}
      <div className="relative flex min-h-0 flex-1">
        {/* whiteboard: 75% width, full remaining height */}
        <main className="whiteboard relative h-full w-3/4 overflow-hidden">
          <div className="flex h-full w-full items-center justify-center overflow-y-auto px-[6%] py-6">
            <TeachingBoard
              content={boardContent}
              onManualInteraction={notifyManualBoardInteraction}
              onSubmitTypedAnswer={submitTypedAnswer}
            />
          </div>
          {/* caption: single line at the board's bottom edge */}
          {captionsOn && outputTranscript && (
            <p className="absolute inset-x-4 bottom-1 truncate text-center text-sm font-medium text-[#3d4f5c]/80">
              {outputTranscript}
            </p>
          )}
          {error && (
            <button
              type="button"
              onClick={() => void start()}
              className="absolute inset-x-0 top-1/2 mx-auto w-max -translate-y-1/2 rounded-2xl bg-white px-6 py-4 text-lg font-semibold text-rose-700 shadow-lg"
            >
              {error} — නැවත උත්සාහ කරන්න
            </button>
          )}
          {status === "idle" && !error && (
            <button
              type="button"
              onClick={() => void start()}
              className="absolute inset-0 flex items-center justify-center bg-black/5 text-2xl font-bold text-[#3d4f5c]"
            >
              පටන් ගමු! 👆
            </button>
          )}
        </main>

        {/* right rail: turn-taking is natural now — just a quiet state
            indicator (Zara talking vs. listening for the child). */}
        <aside className="flex h-full w-1/4 flex-col items-center justify-end pb-8">
          <div className="flex flex-col items-center gap-2">
            <span
              className={`h-4 w-4 rounded-full transition ${
                muted ? "bg-stone-500" : isAiTalking ? "bg-amber-400" : "listening-dot bg-emerald-400"
              }`}
            />
            <span className="text-center text-[11px] font-medium leading-tight text-[#d8e3e8]/80">
              {muted ? "නිහඬයි" : isAiTalking ? "Zara කතා කරනවා…" : "ඔයාට කතා කරන්න පුළුවන්"}
            </span>
          </div>
        </aside>

        {/* character dock: anchored to the board's bottom-left corner */}
        <div className="pointer-events-none absolute bottom-0 left-0 z-10 w-[22%] max-w-[240px]">
          <ZaraCharacter state={zaraState} amplitude={amplitude} />
        </div>
      </div>

      {/* ---- portrait: friendly rotate card ----------------------------- */}
      <div className="rotate-card">
        <div className="flex flex-col items-center gap-5 rounded-3xl bg-white px-10 py-8 text-center shadow-2xl">
          <span className="rotate-phone text-6xl">📱</span>
          <p className="text-xl font-bold text-stone-800">දුරකථනය හරවන්න!</p>
          <p className="text-sm text-stone-500">පාඩම බලන්න දුරකථනය පැත්තට හරවන්න</p>
        </div>
      </div>

      <style>{`
        .whiteboard {
          background-color: #f7f5ee;
          background-image:
            linear-gradient(#00000008 1px, transparent 1px),
            linear-gradient(90deg, #00000008 1px, transparent 1px);
          background-size: 24px 24px;
          box-shadow: inset 0 0 28px rgba(0, 0, 0, 0.12);
          border-radius: 0 10px 10px 0;
        }
        .rotate-card {
          display: none;
        }
        @media (orientation: portrait) {
          .rotate-card {
            position: fixed;
            inset: 0;
            z-index: 50;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #2f4f5f;
          }
        }
        .listening-dot {
          animation: listening-pulse 1.6s ease-in-out infinite;
        }
        @keyframes listening-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        .rotate-phone {
          display: inline-block;
          animation: rotate-phone 1.8s ease-in-out infinite;
        }
        @keyframes rotate-phone {
          0%, 20% { transform: rotate(0deg); }
          55%, 80% { transform: rotate(90deg); }
          100% { transform: rotate(90deg); }
        }
      `}</style>
    </div>
  );
}
