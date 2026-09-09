"use client";

/**
 * The product lesson screen: a landscape full-screen classroom modelled on
 * a teacher at a whiteboard. Phone held sideways is the primary case
 * (360-430px short edge); desktop scales the same layout up.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ strip (28px): name · status · concept stops · ✋│
 *   ├────────────────────────────────────────────────┤
 *   │                                                │
 *   │            the whiteboard, edge to edge        │
 *   │   (the storyboard's choreography, the child's  │
 *   │    answer surface, the pointer, feedback)      │
 *   │ ◉ Zara, 64px, in the frame's corner            │
 *   └────────────────────────────────────────────────┘
 *
 * Zara is a round portrait anchored in the board frame's bottom-left,
 * outside the content area, with her state as a ring; she never overlaps
 * content. Portrait shows a rotate-your-phone card and holds the lesson;
 * a backgrounded tab holds it too. The app opens straight into the lesson
 * (resume or session 1). The session's end shows a card of what the child
 * did today.
 *
 * Data attributes on the root (`data-beat-id`, `data-status`,
 * `data-your-turn`, `data-character`) are the QA harness's view of the
 * lesson — see scripts/session-check.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLessonRuntime } from "@/hooks/useLessonRuntime";
import type { BoardContent } from "@/lib/board";
import TeachingBoard from "@/components/TeachingBoard";
import ZaraCharacter, { type ZaraState } from "@/components/ZaraCharacter";
import { BoardStage } from "@/components/board/BoardStage";
import { ProgressStrip } from "@/components/ProgressStrip";
import { SessionSummaryCard } from "@/components/SessionSummaryCard";

/** How often the amplitude state refreshes while Zara talks (~12fps is plenty for 3 mouth shapes). */
const AMPLITUDE_INTERVAL_MS = 80;

/** The ring around her portrait says what she is doing. */
const RING: Record<ZaraState, string> = {
  idle: "rgba(255,255,255,0.25)",
  talking: "#F3C64B",
  pointing: "#F3C64B",
  listening: "#34D399",
  thinking: "#A78BFA",
  encourage: "#7DD3FC",
  celebrate: "#FDE68A",
};

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
    noClipCaption,
    hint,
    holdFor,
    noteIdleTouch,
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

  const listening = status === "listening";
  const thinking = status === "thinking";

  // Opens straight into the lesson: one auto-start on mount (resume or
  // session 1). StrictMode-safe: no cleanup here, and a delayed self-check
  // restarts once if the session isn't up shortly after mount.
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

  // Rotation mid-beat and a backgrounded tab both HOLD the lesson (the
  // runtime treats them like ⏸) and let go when the phone comes back.
  useEffect(() => {
    const media = window.matchMedia("(orientation: portrait)");
    const onOrientation = () => holdFor("portrait", media.matches);
    onOrientation();
    media.addEventListener("change", onOrientation);
    const onVisibility = () => holdFor("background", document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      media.removeEventListener("change", onOrientation);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [holdFor]);

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

  const [captionsOn, setCaptionsOn] = useState(false);

  // Debug overlay: five taps on the lesson title within ~2.5s toggles it.
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
  const statusText = paused
    ? "විරාමයක්"
    : muted
      ? "නිහඬයි"
      : chatting
        ? "කතා කරමු!"
        : listening
          ? yourTurn?.touchable
            ? "ඔයාගේ වාරයයි — කතා කරන්න, නැත්නම් බෝඩ් එකේ අතගාන්න"
            : "ඔයාගේ වාරයයි — කතා කරන්න!"
          : thinking
            ? "හිතනවා…"
            : isAiTalking
              ? "Zara කතා කරනවා…"
              : "";

  // Zara, as the portrait in the board's corner: the ring is her state; the
  // mic ring breathes with the child's own voice on their turn. The mouth's
  // amplitude is the portrait's own state (ZaraPortrait polls it), so her
  // talking never re-renders the board — and the board's props below are
  // stable, so BoardStage (memoised) redraws only when the stage changes.
  const micPad = listening ? 2 + Math.round(micLevel * 10) : 2;
  const portrait = useMemo(
    () => <ZaraPortrait state={zaraState} side={pointerSide} live={listening && !muted && !paused} dimmed={muted || paused} pad={micPad} talking={isAiTalking} getAmplitude={getOutputAmplitude} />,
    [zaraState, pointerSide, listening, muted, paused, micPad, isAiTalking, getOutputAmplitude],
  );
  const cornerSlot = status !== "idle" && status !== "locked" ? portrait : undefined;
  const onBoardTouch = useCallback(() => submitTypedAnswer("(tapped)"), [submitTypedAnswer]);
  const renderLegacy = useCallback((content: BoardContent) => <TeachingBoard content={content} onSubmitTypedAnswer={submitTypedAnswer} />, [submitTypedAnswer]);

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
      data-paused={paused || undefined}
    >
      {/* ---- the strip: name · status · concept stops · controls ------- */}
      <header className="flex h-7 shrink-0 items-center gap-2 bg-[#26414e] px-2 text-[#d8e3e8]">
        <span className="shrink-0 truncate text-xs font-semibold tracking-wide" onClick={onTitleTap}>
          {lessonName}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#d8e3e8]/85" data-testid="status-text">
          {statusText}
        </span>
        <ProgressStrip stops={conceptStops} />
        <div className="flex shrink-0 items-center gap-1.5">
          {status !== "idle" && status !== "error" && status !== "done" && status !== "locked" && (
            <button
              type="button"
              onClick={requestChat}
              aria-label={chatting ? "කතාව ඉවරයි" : "Zara එක්ක කතා කරන්න"}
              className={`rounded px-1.5 text-[11px] font-bold leading-4 ${chatting ? "bg-rose-400 text-white" : "bg-amber-400 text-[#26414e]"}`}
            >
              ✋
            </button>
          )}
          <button
            type="button"
            aria-label="උපසිරැසි"
            onClick={() => setCaptionsOn((v) => !v)}
            className={`rounded px-1 text-[11px] font-bold leading-4 ${captionsOn ? "bg-amber-400 text-[#26414e]" : "bg-white/10"}`}
          >
            CC
          </button>
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

      {/* ---- the whiteboard, edge to edge ------------------------------- */}
      <main className="relative min-h-0 flex-1 overflow-hidden p-1">
        <BoardStage
          stage={stage}
          yourTurn={listening ? yourTurn : null}
          onAnswer={submitTypedAnswer}
          onTouch={onBoardTouch}
          onIdleTouch={noteIdleTouch}
          onPointerSide={onPointerSide}
          renderLegacy={renderLegacy}
          cornerSlot={cornerSlot}
        />

        {/* caption: the spoken clip's own text, on request (CC) */}
        {captionsOn && caption && !noClipCaption && (
          <p className="pointer-events-none absolute inset-x-28 bottom-3 truncate rounded-lg bg-[#26414e]/85 px-3 py-1 text-center text-base font-medium text-white">
            {caption}
          </p>
        )}
        {/* a line with no clip is read on the board rather than lost */}
        {noClipCaption && (
          <p data-testid="caption" className="pointer-events-none absolute inset-x-28 bottom-3 truncate rounded-lg bg-[#26414e]/85 px-3 py-1 text-center text-base font-medium text-white">
            📖 {noClipCaption}
          </p>
        )}

        {/* a brief hint: a tap while she talks, a rotation, a background */}
        {hint && (
          <p data-testid="hint" className="pointer-events-none absolute inset-x-28 top-3 rounded-lg bg-amber-400/95 px-3 py-1 text-center text-base font-bold text-[#26414e] shadow">
            {hint}
          </p>
        )}

        {/* judging: a quiet cue so the wait never looks like a freeze */}
        {thinking && (
          <div className="pointer-events-none absolute bottom-4 right-6 rounded-full bg-[#26414e]/85 px-3 py-1 text-base font-semibold text-amber-200">
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

      {/* ---- portrait: friendly rotate card (the lesson is held) --------- */}
      <div className="rotate-card">
        <div className="flex flex-col items-center gap-5 rounded-3xl bg-white px-10 py-8 text-center shadow-2xl">
          <span className="rotate-phone text-6xl">📱</span>
          <p className="text-xl font-bold text-stone-800">දුරකථනය හරවන්න!</p>
          <p className="text-base text-stone-500">පාඩම නවත්තලා — හැරෙව්වම දිගටම යනවා</p>
        </div>
      </div>

      <style>{`
        .rotate-card { display: none; }
        @media (orientation: portrait) {
          .rotate-card { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: #2f4f5f; }
        }
        .zara-ring { border-radius: 50%; background: #26414e; transition: box-shadow 280ms ease, padding 100ms linear; }
        .zara-ring-live { animation: zara-ring-pulse 1.6s ease-in-out infinite; }
        @keyframes zara-ring-pulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
        .zara-portrait { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; background: #5c7d8a; }
        .zara-portrait .zara-root { align-items: stretch; }
        .rotate-phone { display: inline-block; animation: rotate-phone 1.8s ease-in-out infinite; }
        @keyframes rotate-phone { 0%, 20% { transform: rotate(0deg); } 55%, 80% { transform: rotate(90deg); } 100% { transform: rotate(90deg); } }
        @media (prefers-reduced-motion: reduce) { .zara-ring-live, .rotate-phone { animation: none; } }
      `}</style>
    </div>
  );
}

/**
 * The 64 px portrait with its state ring. The mouth's amplitude is polled
 * here, at ~12 fps while she talks, so only this small subtree re-renders
 * on each tick.
 */
function ZaraPortrait({ state, side, live, dimmed, pad, talking, getAmplitude }: { state: ZaraState; side: "left" | "right" | null; live: boolean; dimmed: boolean; pad: number; talking: boolean; getAmplitude: () => number }) {
  const [amplitude, setAmplitude] = useState(0);
  useEffect(() => {
    if (!talking) return;
    const timer = setInterval(() => setAmplitude(getAmplitude()), AMPLITUDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [talking, getAmplitude]);
  const mouth = talking ? amplitude : 0;
  return (
    <div className="flex items-end gap-2" data-testid="zara-portrait" data-state={state}>
      <div className={`zara-ring ${live ? "zara-ring-live" : ""}`} style={{ boxShadow: `0 0 0 3px ${dimmed ? "#78716c" : RING[state]}, 0 4px 12px rgba(0,0,0,0.35)`, padding: pad }}>
        <div className="zara-portrait">
          <ZaraCharacter state={state} amplitude={mouth} side={side} portrait />
        </div>
      </div>
    </div>
  );
}
