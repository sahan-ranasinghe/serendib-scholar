"use client";

/**
 * The product lesson screen: a landscape full-screen classroom modelled on
 * a teacher at a whiteboard. Phone held sideways is the primary case
 * (360-430px short edge); desktop scales the same layout up.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ progress strip (28px): lesson name · concept   │
 *   │   stops (the current one filling, ★ mastered)  │
 *   ├──────────┬─────────────────────────────────────┤
 *   │  Zara    │        the whiteboard (78%)         │
 *   │  22%     │  the storyboard's choreography,     │
 *   │          │  the child's answer surface, the    │
 *   │  mic dot │  pointer, feedback                  │
 *   └──────────┴─────────────────────────────────────┘
 *
 * Portrait shows a friendly rotate-your-phone card instead of attempting a
 * portrait layout. The app opens straight into the lesson (resume or
 * session 1) — no title screen. The session's end shows a card of what the
 * child did today.
 *
 * Data attributes on the root (`data-beat-id`, `data-status`,
 * `data-your-turn`, `data-character`) are the QA harness's view of the
 * lesson — see scripts/session-check.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLessonRuntime } from "@/hooks/useLessonRuntime";
import TeachingBoard from "@/components/TeachingBoard";
import ZaraCharacter, { type ZaraState } from "@/components/ZaraCharacter";
import { BoardStage } from "@/components/board/BoardStage";
import { ProgressStrip } from "@/components/ProgressStrip";
import { SessionSummaryCard } from "@/components/SessionSummaryCard";

/** How often the amplitude state refreshes while Zara talks (~12fps is plenty for 3 mouth shapes). */
const AMPLITUDE_INTERVAL_MS = 80;

export default function LessonScreen() {
  const {
    status,
    error,
    caption,
    isAiTalking,
    stage,
    yourTurn,
    characterMood,
    conceptStops,
    sessionSummary,
    start,
    submitTypedAnswer,
    muted,
    toggleMute,
    paused,
    togglePause,
    repeatLastBeat,
    endSessionNow,
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
  // StrictMode-safe: no cleanup here (the session ends via ⏹ /
  // CLOSE_SESSION / tab close), and a delayed self-check restarts once if
  // the session isn't up shortly after mount.
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

  // The character's state comes from the orchestrator: a mood it set
  // around feedback wins; then judging, listening, speaking (pointing when
  // the board's pointer is up), else idle. No timer decides any of it.
  const [pointerSide, setPointerSide] = useState<"left" | "right" | null>(null);
  const onPointerSide = useCallback((side: "left" | "right" | null) => setPointerSide(side), []);
  const zaraState: ZaraState =
    characterMood === "celebrate"
      ? "celebrate"
      : characterMood === "encourage"
        ? "encourage"
        : thinking
          ? "thinking"
          : listening
            ? "listening"
            : isAiTalking
              ? pointerSide
                ? "pointing"
                : "talking"
              : "idle";

  // Mouth amplitude, sampled only while talking.
  const [amplitude, setAmplitude] = useState(0);
  useEffect(() => {
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

  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const lessonName = "සංඛ්‍යා - 1";
  const snapshot = getDebugSnapshot();

  return (
    // Any tap resumes the output AudioContext — mobile browsers keep a
    // context created outside a user gesture suspended, which silently
    // breaks playback AND drain detection (the mobile stall). Idempotent.
    <div
      className="lesson-screen fixed inset-0 flex flex-col bg-[#2f4f5f] text-stone-800"
      onPointerDown={resumeAudioOutput}
      data-beat-id={snapshot.beatId}
      data-beat-type={snapshot.beatType}
      data-status={status}
      data-your-turn={yourTurn ? `${yourTurn.kind}:${yourTurn.surface ?? "pad"}${yourTurn.touchable ? ":touch" : ""}` : undefined}
      data-character={zaraState}
    >
      {/* ---- progress strip -------------------------------------------- */}
      <header className="flex h-7 shrink-0 items-center justify-between gap-2 bg-[#26414e] px-3 text-[#d8e3e8]">
        <span className="shrink-0 truncate text-xs font-semibold tracking-wide" onClick={onTitleTap}>
          {lessonName}
        </span>
        <ProgressStrip stops={conceptStops} />
        <div className="flex shrink-0 items-center gap-2">
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
          <button type="button" aria-label="නැවත කියන්න" onClick={repeatLastBeat} className="rounded bg-white/10 px-1 text-[11px] leading-4">
            ↺
          </button>
          <button type="button" aria-label="අවසන් කරන්න" onClick={endSessionNow} className="rounded bg-white/10 px-1 text-[11px] leading-4">
            ⏹
          </button>
        </div>
      </header>

      {/* ---- classroom: [character 22% | board 78%] — the character has
              its own column and NEVER overlays board content ------------- */}
      <div className="grid min-h-0 flex-1 grid-cols-[22%_78%]">
        {/* character column */}
        <div className="relative flex min-h-0 flex-col items-center justify-end overflow-hidden pb-1">
          {/* the child's own way in: free conversation, on request — in her
              column, never over the board */}
          {status !== "idle" && status !== "error" && status !== "done" && (
            <button
              type="button"
              onClick={requestChat}
              className={`absolute left-1 top-1 z-10 rounded-full px-3 py-1.5 text-xs font-bold shadow-lg active:scale-95 ${
                chatting ? "bg-rose-400 text-white" : "bg-amber-400 text-[#26414e]"
              }`}
            >
              {chatting ? "✋ ඉවරයි" : "✋ කතා කරමු"}
            </button>
          )}
          <div className="flex min-h-0 w-full max-w-[240px] flex-1 items-end justify-center">
            <div className="zara-fit">
              <ZaraCharacter state={zaraState} amplitude={amplitude} side={pointerSide} />
            </div>
          </div>
          {/* the mic dot: pulses on the child's turn */}
          <span
            data-testid="mic-dot"
            className={`mb-1 h-3 w-3 rounded-full ${
              muted || paused ? "bg-stone-500" : listening ? "listening-dot bg-emerald-400" : isAiTalking ? "bg-amber-400" : "bg-white/25"
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
                    ? yourTurn?.touchable
                      ? "ඔයාගේ වාරයයි — කතා කරන්න, නැත්නම් බෝඩ් එකේ අතගාන්න!"
                      : "ඔයාගේ වාරයයි — කතා කරන්න!"
                    : thinking
                      ? "හිතනවා…"
                      : isAiTalking
                        ? "Zara කතා කරනවා…"
                        : ""}
          </span>
        </div>

        {/* whiteboard column */}
        <main className="relative h-full min-h-0 overflow-hidden p-1.5">
          <BoardStage
            stage={stage}
            yourTurn={listening ? yourTurn : null}
            onAnswer={submitTypedAnswer}
            onTouch={() => submitTypedAnswer("(tapped)")}
            onPointerSide={onPointerSide}
            renderLegacy={(content) => <TeachingBoard content={content} onSubmitTypedAnswer={submitTypedAnswer} />}
          />

          {/* caption: single line at the board's bottom edge */}
          {captionsOn && caption && (
            <p className="pointer-events-none absolute inset-x-6 bottom-2 truncate rounded bg-[#26414e]/80 px-2 text-center text-sm font-medium text-white">
              {caption}
            </p>
          )}

          {/* recording: a ring that breathes with the child's own voice */}
          {listening && (
            <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2">
              <span
                className="block rounded-full border-4 border-emerald-400 transition-all duration-100"
                style={{ width: 22 + micLevel * 90, height: 22 + micLevel * 90 }}
              />
            </div>
          )}
          {/* judging: a quiet cue so the wait never looks like a freeze */}
          {thinking && (
            <div className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-[#26414e]/85 px-3 py-1 text-xs font-semibold text-amber-200">
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
              <p className="text-center text-xs text-white/70">(දෙමාපියන් සඳහා — මේ උපකරණයේ එක වතාවක් පමණයි)</p>
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
                <button type="submit" className="rounded-xl bg-amber-400 px-4 py-2 text-lg font-bold text-[#26414e] active:scale-95">
                  ඇතුල් වෙන්න
                </button>
              </form>
              {error && <p className="text-sm font-semibold text-rose-300">{error}</p>}
            </div>
          )}

          {/* the sitting's end: what the child did today */}
          {status === "done" && sessionSummary && !summaryDismissed && (
            <SessionSummaryCard summary={sessionSummary} onClose={() => setSummaryDismissed(true)} />
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
                board: {debug.stage} | choreo {debug.choreo}
              </div>
              <div>
                audio: cached {debug.metrics.cachedSeconds}s | flash {debug.metrics.flashAudioSeconds}s | live {debug.metrics.liveSeconds}s
                {debug.metrics.clipsRendered > 0 ? ` | ${debug.metrics.clipsRendered} rendered` : ""}
              </div>
              {debug.playback && (
                <div>
                  ctx: {debug.playback.contextState} | t {debug.playback.currentTime.toFixed(1)} / end {debug.playback.lastScheduledEnd.toFixed(1)} | drain:{" "}
                  {debug.playback.lastDrainVia ?? "—"}
                </div>
              )}
              <div className="mt-1 border-t border-emerald-200/30 pt-1">
                {debug.events.map((event, i) => (
                  <div key={i} className="truncate">
                    {event}
                  </div>
                ))}
              </div>
              <button type="button" onClick={sendDiagnostics} className="mt-1 w-full rounded bg-emerald-500 py-1 font-bold text-black">
                {reportState === "sending" ? "…" : reportState === "sent" ? "sent ✓" : reportState === "failed" ? "failed — retry" : "send diagnostics"}
              </button>
            </div>
          )}

          {status === "idle" && !error && (
            <button
              type="button"
              onClick={() => void start()}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/5 text-2xl font-bold text-[#3d4f5c]"
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
        .rotate-card { display: none; }
        @media (orientation: portrait) {
          .rotate-card { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: #2f4f5f; }
        }
        .zara-fit { width: 100%; height: 100%; max-height: min(46vh, 340px); display: flex; align-items: flex-end; justify-content: center; }
        @media (max-height: 400px) { .zara-fit { max-height: 88vh; } }
        .listening-dot { animation: listening-pulse 1.6s ease-in-out infinite; }
        @keyframes listening-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(1.35); } }
        .rotate-phone { display: inline-block; animation: rotate-phone 1.8s ease-in-out infinite; }
        @keyframes rotate-phone { 0%, 20% { transform: rotate(0deg); } 55%, 80% { transform: rotate(90deg); } 100% { transform: rotate(90deg); } }
      `}</style>
    </div>
  );
}
