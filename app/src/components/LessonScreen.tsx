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
import { useLessonRuntime } from "@/hooks/useLessonRuntime";
import TeachingBoard from "@/components/TeachingBoard";
import ZaraCharacter, { type ZaraState } from "@/components/ZaraCharacter";

const CELEBRATE_MS = 1200;
/** How often the amplitude state refreshes while Zara talks (~12fps is plenty for 3 mouth shapes). */
const AMPLITUDE_INTERVAL_MS = 80;

export default function LessonScreen() {
  const {
    status,
    error,
    caption,
    boardContent,
    isAiTalking,
    currentSessionIndex,
    sessionCount,
    celebrateNonce,
    start,
    submitTypedAnswer,
    muted,
    toggleMute,
    paused,
    togglePause,
    repeatLastBeat,
    endSessionNow,
    answerPad,
    micLevel,
    chatting,
    requestChat,
    getDebugSnapshot,
    getOutputAmplitude,
    resumeAudioOutput,
    submitAccessCode,
  } = useLessonRuntime();

  // Access-code entry (parent-facing, once per device — see /api/session-start).
  const [codeDraft, setCodeDraft] = useState("");

  // The two states the child sees a cue for: she is recording their answer
  // ("listening"), or their answer is being judged ("thinking").
  const listening = status === "listening";
  const thinking = status === "thinking";

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
      : listening
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
    // Any tap resumes the output AudioContext — mobile browsers keep a
    // context created outside a user gesture suspended, which silently
    // breaks playback AND drain detection (the mobile stall). Idempotent.
    <div
      className="lesson-screen fixed inset-0 flex flex-col bg-[#2f4f5f] text-stone-800"
      onPointerDown={resumeAudioOutput}
    >
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
              muted || paused
                ? "bg-stone-500"
                : listening
                  ? "listening-dot bg-emerald-400"
                  : isAiTalking
                    ? "bg-amber-400"
                    : "bg-white/25"
            }`}
          />
          <span className="px-1 text-center text-[10px] font-medium leading-tight text-[#d8e3e8]/80">
            {paused
              ? "විරාමයක්"
              : muted
                ? "නිහඬයි"
                : chatting
                  ? "කතා කරමු!"
                  : listening
                    ? "ඔයාගේ වාරයයි — කතා කරන්න!"
                    : thinking
                      ? "හිතනවා…"
                      : isAiTalking
                        ? "Zara කතා කරනවා…"
                        : ""}
          </span>
        </div>

        {/* whiteboard column */}
        <main className={`whiteboard relative h-full overflow-hidden ${listening ? "your-turn" : ""}`}>
          <div className="flex h-full w-full items-center justify-center overflow-y-auto px-[5%] py-6">
            <TeachingBoard content={boardContent} onSubmitTypedAnswer={submitTypedAnswer} />
          </div>

          {/* tap-to-answer: number pad or name choices, at the board's bottom */}
          {answerPad && listening && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
              {answerPad.kind === "number" ? (
                <NumberPad onSubmit={submitTypedAnswer} />
              ) : (
                <div className="flex flex-wrap justify-center gap-2 px-3">
                  {(answerPad.options ?? []).map((option) => (
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
          {captionsOn && caption && (
            <p className="absolute inset-x-4 bottom-1 truncate text-center text-sm font-medium text-[#3d4f5c]/80">
              {caption}
            </p>
          )}

          {/* recording: a ring that breathes with the child's own voice */}
          {listening && (
            <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2">
              <span
                className="block rounded-full border-4 border-emerald-400 transition-all duration-100"
                style={{ width: 22 + micLevel * 90, height: 22 + micLevel * 90 }}
              />
            </div>
          )}
          {/* judging: a quiet cue so the wait never looks like a freeze */}
          {thinking && (
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-[#26414e]/85 px-3 py-1 text-xs font-semibold text-amber-200">
              හිතනවා…
            </div>
          )}
          {error && status !== "locked" && (
            <button
              type="button"
              onClick={() => void start()}
              className="absolute inset-x-0 top-1/2 mx-auto w-max -translate-y-1/2 rounded-2xl bg-white px-6 py-4 text-lg font-semibold text-rose-700 shadow-lg"
            >
              {error} — නැවත උත්සාහ කරන්න
            </button>
          )}

          {/* device gate: the shared access code, entered once per device */}
          {status === "locked" && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#26414e]/95 px-6">
              <p className="text-center text-lg font-semibold text-white">ප්‍රවේශ කේතය ඇතුළත් කරන්න</p>
              <p className="text-center text-xs text-white/70">
                (දෙමාපියන් සඳහා — මේ උපකරණයේ එක වතාවක් පමණයි)
              </p>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (codeDraft.trim()) void submitAccessCode(codeDraft);
                }}
              >
                <input
                  type="password"
                  inputMode="text"
                  autoFocus
                  value={codeDraft}
                  onChange={(event) => setCodeDraft(event.target.value)}
                  className="w-44 rounded-xl border-2 border-white/40 bg-white px-3 py-2 text-center text-lg tracking-widest text-stone-800"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-amber-400 px-4 py-2 text-lg font-bold text-[#26414e] active:scale-95"
                >
                  ඇතුල් වෙන්න
                </button>
              </form>
              {error && <p className="text-sm font-semibold text-rose-300">{error}</p>}
            </div>
          )}
          {/* the child's own way in: free conversation, on request */}
          {status !== "idle" && status !== "error" && (
            <button
              type="button"
              onClick={requestChat}
              className={`absolute bottom-3 left-3 rounded-full px-4 py-2 text-sm font-bold shadow-lg active:scale-95 ${
                chatting ? "bg-rose-400 text-white" : "bg-amber-400 text-[#26414e]"
              }`}
            >
              {chatting ? "✋ කතාව ඉවරයි" : "✋ Zara එක්ක කතා කරන්න"}
            </button>
          )}

          {debugOpen && debug && (
            <div className="absolute right-2 top-2 z-20 w-64 rounded-lg bg-black/80 p-2 font-mono text-[10px] leading-tight text-emerald-200">
              <div>beat: {debug.beatId}</div>
              <div>
                type: {debug.beatType} | state: {debug.status}
              </div>
              <div>
                playback: {debug.playing ? "PLAYING" : "idle"} | {debug.recording ? "RECORDING" : "mic idle"}
              </div>
              <div>
                voice: {debug.voice} | clips {debug.audioVersion}
              </div>
              <div>
                audio: cached {debug.metrics.cachedSeconds}s | flash {debug.metrics.flashAudioSeconds}s | live{" "}
                {debug.metrics.liveSeconds}s
                {debug.metrics.clipsRendered > 0 ? ` | ${debug.metrics.clipsRendered} rendered` : ""}
              </div>
              {debug.playback && (
                <div>
                  ctx: {debug.playback.contextState} | t {debug.playback.currentTime.toFixed(1)} / end{" "}
                  {debug.playback.lastScheduledEnd.toFixed(1)} | drain: {debug.playback.lastDrainVia ?? "—"}
                </div>
              )}
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
