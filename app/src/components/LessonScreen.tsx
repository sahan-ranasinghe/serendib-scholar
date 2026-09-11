"use client";

/**
 * The session screen, from the design (docs/design/export/handoff —
 * README "Layout", Session.dc.html):
 *
 *   ┌─ strip 28 px teal: title · 8 concept stops · ⏸ ↺ ⏹ · සි ─────────┐
 *   ├─ wood frame 10 · board #F7F3EA, 32 px grid · tray 22 ─────────────┤
 *   │   content inset L94 R82 T22 B64 (124 with chips, 190 with a dock)  │
 *   │   ◉ Zara 64 at L10/B6      ✋ 56 at R12/B76      🐱 Lena 48 R14/B16 │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * The runtime decides what happens (useLessonRuntime); this file decides
 * only how it looks. Portrait shows a rotate-your-phone card and holds the
 * lesson; a backgrounded tab holds it too. The app opens straight into the
 * lesson (resume or session 1). The session's end shows a card of what the
 * child did today.
 *
 * Data attributes on the root (`data-beat-id`, `data-status`,
 * `data-your-turn`, `data-character`) are the QA harness's view of the
 * lesson — see scripts/session-check.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLessonRuntime } from "@/hooks/useLessonRuntime";
import type { BoardContent } from "@/lib/board";
import TeachingBoard from "@/components/TeachingBoard";
import type { ZaraState } from "@/components/ZaraCharacter";
import type { LenaState } from "@/components/LenaCharacter";
import { SessionShell, type SessionSheet } from "@/components/SessionShell";
import { SessionSummaryCard } from "@/components/SessionSummaryCard";

/** Lena dozes after this long of Zara talking without a turn. */
const LENA_DOZE_AFTER_MS = 20000;

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
    micAsk,
    answerMicAsk,
    holdFor,
    noteIdleTouch,
    chatTranscript,
    start,
    submitTypedAnswer,
    muted,
    paused,
    togglePause,
    repeatLastBeat,
    endSessionNow,
    chatting,
    requestChat,
    getDebugSnapshot,
    getOutputAmplitude,
    resumeAudioOutput,
    submitAccessCode,
  } = useLessonRuntime();

  // Access-code entry (parent-facing, once per device — see /api/session-start).
  const [codeDraft, setCodeDraft] = useState("");

  const listening = status === "turn";
  const pausing = status === "pausing";
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

  // Zara's state comes from the orchestrator: a mood it set around
  // feedback wins; then judging, listening, speaking (pointing when the
  // board's pointer is up), else idle; she waves on the opening card.
  const [pointerSide, setPointerSide] = useState<"left" | "right" | null>(null);
  const onPointerSide = useCallback((side: "left" | "right" | null) => setPointerSide(side), []);
  const snapshot = getDebugSnapshot();
  const opening = stage.base?.kind === "titleCard" && /:(1|opening)\b/u.test(snapshot.beatId ?? "") && isAiTalking;
  const zaraState: ZaraState =
    characterMood === "celebrate"
      ? "celebrate"
      : characterMood === "encourage"
        ? "encourage"
        : thinking
          ? "thinking"
          : listening || pausing
            ? "listening"
            : isAiTalking
              ? opening
                ? "wave"
                : pointerSide
                  ? "pointing"
                  : "talking"
              : "idle";

  // Lena, from the state table: hops on a celebration, droops then nudges
  // on a wrong answer, perks up on the child's turn and the soft check,
  // peeks while Zara thinks, dozes when Zara has talked for a long while,
  // wakes when the turn comes, holds the flame when a star lands.
  const lenaState = useLenaState({ celebrate: characterMood === "celebrate", wrong: stage.retry, turn: listening || pausing, thinking, talking: isAiTalking, stops: conceptStops, beatId: snapshot.beatId ?? null });

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
  const inLesson = status !== "idle" && status !== "locked";

  const handShown = inLesson && status !== "error" && status !== "done";
  const onBoardTouch = useCallback(() => submitTypedAnswer("(tapped)"), [submitTypedAnswer]);
  const renderLegacy = useCallback((content: BoardContent) => <TeachingBoard content={content} onSubmitTypedAnswer={submitTypedAnswer} />, [submitTypedAnswer]);

  // The caption line: the spoken clip's own text on request (සි), and a
  // line with no clip read on the board rather than lost.
  const captionText = noClipCaption ? `📖 ${noClipCaption}` : captionsOn && caption ? caption : null;

  const sheet: SessionSheet | null = micAsk
    ? { kind: "mic", onAllow: () => answerMicAsk(true), onType: () => answerMicAsk(false) }
    : status === "chatting"
      ? { kind: "chat", child: chatTranscript.child, zara: chatTranscript.zara, listening: chatting && !muted && !paused, onReturn: requestChat }
      : null;

  return (
    <SessionShell
      stage={stage}
      yourTurn={listening || pausing ? yourTurn : null}
      zaraState={zaraState}
      lenaState={lenaState}
      pointerSide={pointerSide}
      talking={isAiTalking}
      getAmplitude={getOutputAmplitude}
      zaraDimmed={muted || paused}
      paused={paused}
      conceptStops={conceptStops}
      captionsOn={captionsOn}
      onToggleCaptions={() => setCaptionsOn((v) => !v)}
      caption={captionText}
      hint={hint}
      sheet={sheet}
      charactersShown={inLesson}
      handShown={handShown}
      chatting={chatting}
      onHand={requestChat}
      onPause={togglePause}
      onRepeat={repeatLastBeat}
      onEnd={endSessionNow}
      onAnswer={submitTypedAnswer}
      onTouch={onBoardTouch}
      onIdleTouch={noteIdleTouch}
      onPointerSide={onPointerSide}
      renderLegacy={renderLegacy}
      onTitleTap={onTitleTap}
      // Any tap resumes the output AudioContext — mobile browsers keep a
      // context created outside a user gesture suspended, which silently
      // breaks playback AND drain detection (the mobile stall). Idempotent.
      onRootPointerDown={resumeAudioOutput}
      data={{
        "data-beat-id": snapshot.beatId,
        "data-beat-type": snapshot.beatType,
        "data-status": status,
        "data-your-turn": yourTurn ? `${yourTurn.kind}:${yourTurn.surface ?? "pad"}:${yourTurn.touchable ? "touch" : "voice"}:${yourTurn.answerMode ?? "-"}${yourTurn.chips ? ":chips" : ""}${yourTurn.rodPick ? `:rod-${yourTurn.rodPick}` : ""}` : undefined,
      }}
    >
      {error && status !== "locked" && (
        <button type="button" onClick={() => void start()} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: 56, padding: "0 28px", border: 0, borderRadius: 12, background: "var(--color-paper)", color: "var(--color-coral-text)", font: "700 24px/1.5 var(--font-display)", boxShadow: "var(--shadow-lift)", cursor: "pointer", zIndex: 25 }}>
          {error} — නැවත උත්සාහ කරන්න
        </button>
      )}

      {/* device gate: the shared access code, entered once per device */}
      {status === "locked" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(27,27,27,.38)", padding: 24 }}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (codeDraft.trim()) void submitAccessCode(codeDraft);
            }}
            style={{ display: "grid", gap: 12, justifyItems: "center", background: "var(--color-paper)", borderRadius: 16, padding: "16px 20px", boxShadow: "var(--shadow-lift)" }}
          >
            <p style={{ margin: 0, font: "700 26px/1.4 var(--font-display)", color: "var(--color-ink)" }}>ප්‍රවේශ කේතය ඇතුළත් කරන්න</p>
            <p style={{ margin: 0, font: "400 20px/1.5 var(--font-body)", color: "var(--color-ink-70)" }}>(දෙමාපියන් සඳහා — මේ උපකරණයේ එක වතාවක් පමණයි)</p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="password" inputMode="text" autoFocus value={codeDraft} onChange={(event) => setCodeDraft(event.target.value)} style={{ width: 176, height: 56, borderRadius: 12, border: "2px solid var(--color-ink-18)", background: "#fff", padding: "0 12px", textAlign: "center", font: "700 22px/1 var(--font-latin)", letterSpacing: "0.2em", color: "var(--color-ink)" }} />
              <button type="submit" style={{ height: 56, padding: "0 28px", border: 0, borderRadius: 12, background: "var(--color-teal)", color: "#fff", font: "700 24px/1.5 var(--font-display)", boxShadow: "var(--shadow-button)", cursor: "pointer" }}>
                ඇතුල් වෙන්න
              </button>
            </div>
            {error && <p style={{ margin: 0, font: "600 20px/1.5 var(--font-label)", color: "var(--color-coral-text)" }}>{error}</p>}
          </form>
        </div>
      )}

      {/* the sitting's end: what the child did today */}
      {status === "done" && sessionSummary && !summaryDismissed && <SessionSummaryCard summary={sessionSummary} onClose={() => setSummaryDismissed(true)} />}

      {debugOpen && debug && (
        <div style={{ position: "absolute", right: 8, top: 8, zIndex: 40, width: 256, borderRadius: 8, background: "rgba(0,0,0,.8)", padding: 8, font: "10px/1.3 ui-monospace, monospace", color: "#A7F3D0" }}>
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
              ctx: {debug.playback.contextState} | t {debug.playback.currentTime.toFixed(1)} / end {debug.playback.lastScheduledEnd.toFixed(1)} | drain: {debug.playback.lastDrainVia ?? "—"}
            </div>
          )}
          <div style={{ marginTop: 4, borderTop: "1px solid rgba(167,243,208,.3)", paddingTop: 4 }}>
            {debug.events.map((event, i) => (
              <div key={i} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {event}
              </div>
            ))}
          </div>
          <button type="button" onClick={sendDiagnostics} style={{ marginTop: 4, width: "100%", borderRadius: 4, border: 0, background: "#34D399", padding: "4px 0", fontWeight: 700, color: "#000" }}>
            {reportState === "sending" ? "…" : reportState === "sent" ? "sent ✓" : reportState === "failed" ? "failed — retry" : "send diagnostics"}
          </button>
        </div>
      )}

      {status === "idle" && !error && (
        <button type="button" onClick={() => void start()} style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", border: 0, background: "rgba(27,27,27,.12)", font: "700 32px/1.5 var(--font-display)", color: "var(--color-teal)", cursor: "pointer" }}>
          පටන් ගමු! 👆
        </button>
      )}
    </SessionShell>
  );
}

/** Lena's state from what the lesson is doing (Lena.dc.html's table). */
function useLenaState({ celebrate, wrong, turn, thinking, talking, stops, beatId }: { celebrate: boolean; wrong: boolean; turn: boolean; thinking: boolean; talking: boolean; stops: Array<{ tag: string; status: string }>; beatId: string | null }): LenaState {
  const [dozing, setDozing] = useState(false);
  const [woke, setWoke] = useState(false);
  const [flame, setFlame] = useState(false);
  const masteredRef = useRef(0);
  const mastered = stops.filter((s) => s.status === "mastered").length;
  // A star just landed: she holds the flame for a moment.
  useEffect(() => {
    if (mastered > masteredRef.current) {
      masteredRef.current = mastered;
      setFlame(true);
      const t = setTimeout(() => setFlame(false), 4000);
      return () => clearTimeout(t);
    }
    masteredRef.current = mastered;
  }, [mastered]);
  // A long stretch of Zara talking and she dozes; the next turn wakes her.
  useEffect(() => {
    if (!talking || turn) {
      if (dozing && turn) {
        setDozing(false);
        setWoke(true);
        const t = setTimeout(() => setWoke(false), 1500);
        return () => clearTimeout(t);
      }
      return;
    }
    const t = setTimeout(() => setDozing(true), LENA_DOZE_AFTER_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talking, turn, beatId]);
  if (celebrate) return "hop";
  if (flame) return "hold-flame";
  if (wrong) return "droop-then-nudge";
  if (woke) return "wake";
  if (turn) return "alert";
  if (thinking) return "peek";
  if (dozing) return "doze";
  // The idle variants rotate with the beat.
  const seed = beatId ? [...beatId].reduce((n, c) => n + c.charCodeAt(0), 0) : 0;
  return (["idle", "idle-2", "idle-3"] as const)[seed % 3]!;
}
