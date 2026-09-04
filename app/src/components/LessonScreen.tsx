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
    notifyManualBoardInteraction,
    submitTypedAnswer,
    muted,
    toggleMute,
    paused,
    togglePause,
    repeatLastBeat,
    endSessionNow,
    micWindowOpen,
    answerPad,
    stalled,
    continueNow,
    getDebugSnapshot,
    getOutputAmplitude,
  } = useGeminiLive();

  // Opens straight into the lesson: one auto-start on mount (resume or
  // session 1). The browser may require a gesture for mic/audio — if the
  // auto-start fails, the board shows a single tap-to-begin affordance.
  // StrictMode-safe: dev double-mount used to run this effect's cleanup
  // (stop) right after the first start(), while the ref guard blocked the
  // remount's restart — the app then sat idle at "පටන් ගමු" forever
  // (observed in an unattended run). So: no cleanup here (the session ends
  // via ⏹ / CLOSE_SESSION / tab close), and a delayed self-check restarts
  // once if the session isn't up shortly after mount.
  const startedRef = useRef(false);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      void start();
    }
    const retry = setTimeout(() => {
      if (statusRef.current === "idle") void start();
    }, 2500);
    return () => clearTimeout(retry);
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

  // Debug overlay: five taps on the lesson title within ~2.5s toggles it;
  // while open it polls the hook's snapshot once a second.
  const [debugOpen, setDebugOpen] = useState(false);
  const titleTapsRef = useRef<number[]>([]);
  const onTitleTap = () => {
    const now = Date.now();
    titleTapsRef.current = [...titleTapsRef.current.filter((t) => now - t < 2500), now];
    if (titleTapsRef.current.length >= 5) {
      titleTapsRef.current = [];
      setDebugOpen((v) => !v);
    }
  };
  const [debug, setDebug] = useState<ReturnType<typeof getDebugSnapshot> | null>(null);
  useEffect(() => {
    if (!debugOpen) return;
    const timer = setInterval(() => setDebug(getDebugSnapshot()), 1000);
    return () => clearInterval(timer);
  }, [debugOpen, getDebugSnapshot]);
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const sendDiagnostics = async () => {
    setReportState("sending");
    try {
      const res = await fetch("/api/debug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panel: getDebugSnapshot() }),
      });
      const json = await res.json();
      setReportState(json?.ok ? "sent" : "failed");
    } catch {
      setReportState("failed");
    }
  };

  const lessonName = "සංඛ්‍යා - 1";
  const stops = Math.max(sessionCount, 1);

  return (
    <div className="lesson-screen fixed inset-0 flex flex-col bg-[#2f4f5f] text-stone-800">
      {/* ---- progress strip -------------------------------------------- */}
      <header className="flex h-7 shrink-0 items-center justify-between bg-[#26414e] px-3 text-[#d8e3e8]">
        <span className="truncate text-xs font-semibold tracking-wide" onClick={onTitleTap}>
          {lessonName}
        </span>
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
          <button
            type="button"
            aria-label="විරාමය"
            onClick={togglePause}
            className={`rounded px-1 text-[11px] leading-4 ${paused ? "bg-amber-400 text-[#26414e]" : "bg-white/10"}`}
          >
            {paused ? "▶" : "⏸"}
          </button>
          <button
            type="button"
            aria-label="නැවත කියන්න"
            onClick={repeatLastBeat}
            className="rounded bg-white/10 px-1 text-[11px] leading-4"
          >
            ↺
          </button>
          <button
            type="button"
            aria-label="අවසන් කරන්න"
            onClick={endSessionNow}
            className="rounded bg-white/10 px-1 text-[11px] leading-4"
          >
            ⏹
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

      {/* ---- classroom: [character 22% | board 78%] — the character has
              its own column and NEVER overlays board content ------------- */}
      <div className="grid min-h-0 flex-1 grid-cols-[22%_78%]">
        {/* character column */}
        <div className="relative flex min-h-0 flex-col items-center justify-end overflow-hidden pb-1">
          <div className="flex min-h-0 w-full max-w-[240px] flex-1 items-end justify-center">
            {/* the SVG scales to FIT (never crops the face): full height at
                short heights, full width otherwise */}
            <div className="zara-fit">
              <ZaraCharacter state={zaraState} amplitude={amplitude} />
            </div>
          </div>
          <span
            className={`mb-1 h-3 w-3 rounded-full ${
              muted || paused ? "bg-stone-500" : micWindowOpen ? "listening-dot bg-emerald-400" : isAiTalking ? "bg-amber-400" : "bg-white/25"
            }`}
          />
          <span className="px-1 text-center text-[10px] font-medium leading-tight text-[#d8e3e8]/80">
            {paused ? "විරාමයක්" : muted ? "නිහඬයි" : micWindowOpen ? "ඔයාගේ වාරයයි — කතා කරන්න!" : isAiTalking ? "Zara කතා කරනවා…" : ""}
          </span>
        </div>

        {/* whiteboard column */}
        <main className={`whiteboard relative h-full overflow-hidden ${micWindowOpen ? "your-turn" : ""}`}>
          <div className="flex h-full w-full items-center justify-center overflow-y-auto px-[5%] py-6">
            <TeachingBoard
              content={boardContent}
              onManualInteraction={notifyManualBoardInteraction}
              onSubmitTypedAnswer={submitTypedAnswer}
            />
          </div>

          {/* tap-to-answer: number pad or name choices, at the board's bottom */}
          {answerPad && micWindowOpen && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
              {answerPad.kind === "number" ? (
                <NumberPad onSubmit={submitTypedAnswer} />
              ) : (
                <div className="flex flex-wrap justify-center gap-2 px-3">
                  {answerPad.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => submitTypedAnswer(option)}
                      className="rounded-2xl border-2 border-sky-300 bg-white px-4 py-3 text-lg font-semibold text-sky-900 shadow active:scale-95"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
          {/* watchdog stall: never silent with no indication */}
          {stalled && (
            <button
              type="button"
              onClick={continueNow}
              className="absolute inset-x-0 bottom-16 mx-auto w-max rounded-full bg-amber-400 px-8 py-3 text-xl font-bold text-[#26414e] shadow-lg active:scale-95"
            >
              ▶ ඉදිරියට
            </button>
          )}

          {debugOpen && debug && (
            <div className="absolute right-2 top-2 z-20 w-64 rounded-lg bg-black/80 p-2 font-mono text-[10px] leading-tight text-emerald-200">
              <div>beat: {debug.beatId}</div>
              <div>
                type: {debug.beatType} / {debug.endBy}
              </div>
              <div>
                playback: {debug.playing ? "PLAYING" : "idle"} | mic: {debug.micOpen ? "OPEN" : "closed"}
                {debug.holding ? " (holding)" : ""}
                {debug.stalled ? " STALLED" : ""}
              </div>
              <div>last output: {debug.secondsSinceOutput}s ago</div>
              <div className="mt-1 border-t border-emerald-200/30 pt-1">
                {debug.events.map((event, i) => (
                  <div key={i} className="truncate">{event}</div>
                ))}
              </div>
              <button
                type="button"
                onClick={sendDiagnostics}
                className="mt-1 w-full rounded bg-emerald-500 py-1 font-bold text-black"
              >
                {reportState === "sending" ? "…" : reportState === "sent" ? "sent ✓" : reportState === "failed" ? "failed — retry" : "send diagnostics"}
              </button>
            </div>
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
        .your-turn {
          animation: board-pulse 1.8s ease-in-out infinite;
        }
        @keyframes board-pulse {
          0%, 100% { box-shadow: inset 0 0 28px rgba(0,0,0,0.12); }
          50% { box-shadow: inset 0 0 28px rgba(0,0,0,0.12), inset 0 0 0 4px rgba(52, 211, 153, 0.55); }
        }
        .zara-fit {
          width: 100%;
          height: 100%;
          max-height: min(46vh, 340px);
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        @media (max-height: 400px) {
          /* short landscape: scale to the column, whole head always visible */
          .zara-fit { max-height: 88vh; }
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


/** Large tap pad for numeric answers — same path as speech (submitTypedAnswer). */
function NumberPad({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");
  const key = (k: string) => setValue((v) => (v + k).slice(0, 6));
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white/95 p-2 shadow-lg">
      <span className="min-w-[5.5rem] rounded-lg bg-stone-100 px-3 py-2 text-right font-mono text-xl text-stone-800">
        {value || "…"}
      </span>
      <div className="grid grid-cols-6 gap-1">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => key(digit)}
            className="h-10 w-10 rounded-lg bg-sky-100 text-lg font-bold text-sky-900 active:scale-95"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          aria-label="මකන්න"
          onClick={() => setValue((v) => v.slice(0, -1))}
          className="h-10 w-10 rounded-lg bg-stone-200 text-lg active:scale-95"
        >
          ⌫
        </button>
        <button
          type="button"
          aria-label="හරි"
          onClick={() => {
            if (value) onSubmit(value);
            setValue("");
          }}
          className="h-10 w-10 rounded-lg bg-emerald-500 text-lg font-bold text-white active:scale-95"
        >
          ✓
        </button>
      </div>
    </div>
  );
}
