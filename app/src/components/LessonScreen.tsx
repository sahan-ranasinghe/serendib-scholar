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
 * lesson; a backgrounded tab holds it too. /session opens straight into the
 * lesson (resume or session 1); the sitting's end goes to /session/summary.
 * The edge states (loading, paused, rotate, error) are the design's
 * (src/components/app/EdgeState.tsx), wired to the runtime's status.
 *
 * Data attributes on the root (`data-beat-id`, `data-status`,
 * `data-your-turn`, `data-character`) are the QA harness's view of the
 * lesson — see scripts/session-check.ts.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useLessonRuntime } from "@/hooks/useLessonRuntime";
import { EdgeState } from "@/components/app/EdgeState";
import { PlaybackPanel } from "@/components/PlaybackPanel";
import { leaveLessonDisplay } from "@/components/app/StartLessonButton";
import { pageBuildStamp } from "@/components/app/UpdateBanner";
import { t } from "@/lib/appCopy";
import { useAppState } from "@/lib/appStore";
import type { BoardContent } from "@/lib/board";
import TeachingBoard from "@/components/TeachingBoard";
import type { ZaraState } from "@/components/ZaraCharacter";
import type { LenaState } from "@/components/LenaCharacter";
import { SessionShell, type SessionConfirm, type SessionSheet } from "@/components/SessionShell";

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
    noteActivity,
    noteInput,
    chatTranscript,
    start,
    submitTypedAnswer,
    muted,
    paused,
    togglePause,
    leaveSession,
    restartThisSession,
    lesson,
    chatting,
    chatError,
    requestChat,
    getDebugSnapshot,
    getOutputAmplitude,
    resumeAudioOutput,
    submitAccessCode,
    childSettings,
    limitEnded,
    devLimit,
    cycleDailyLimit,
    jumpTo,
    navInfo,
    requestNav,
  } = useLessonRuntime();
  const router = useRouter();

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

  // Captions: ON by default for a child session (the design shows them on);
  // the සි toggle persists the choice per child (/api/child-settings) and
  // caches it on the device so the first beat already has it.
  const [captionsChoice, setCaptionsChoice] = useState<boolean | null>(() => {
    try {
      const cached = localStorage.getItem("ss:captions");
      return cached === null ? null : cached === "1";
    } catch {
      return null;
    }
  });
  const captionsOn = captionsChoice ?? childSettings?.captions ?? true;
  const toggleCaptions = () => {
    const next = !captionsOn;
    setCaptionsChoice(next);
    try {
      localStorage.setItem("ss:captions", next ? "1" : "0");
    } catch {
      /* private mode */
    }
    void fetch("/api/child-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ captions: next }) }).catch(() => undefined);
  };

  // ⏹ leaves (nothing is closed) and ↺ restarts this session — each asks once.
  const [asking, setAsking] = useState<"leave" | "restart" | null>(null);
  const [leaving, setLeaving] = useState(false);

  // A question over the board HOLDS the lesson, like a rotation or a
  // backgrounded tab. Without this the sheet covered a lesson that kept
  // playing: Zara talked on behind it and the beat moved while the child
  // was reading, so "දිගටම" — carry on — came back somewhere else. Cancel
  // now returns to the exact beat the question interrupted.
  useEffect(() => {
    holdFor("asking", asking !== null);
  }, [asking, holdFor]);

  // The sitting's end: the summary screen (real lines from the log). The
  // moment on the board is given a beat so the celebration lands first.
  const { refresh: refreshAppState } = useAppState();
  // Leaving the lesson by any path (⏹, ↺, the end, an error): the store re-reads the child's records, so the
  // lesson detail and home the child lands on show this sitting (resume, not start) — never the cached copy.
  useEffect(() => () => void refreshAppState(), [refreshAppState]);
  useEffect(() => {
    if (status !== "done" || leaving) return;
    // The store re-reads the child's records now, so /session/summary opens on this sitting's numbers, not the cached ones.
    void refreshAppState();
    const timer = setTimeout(() => router.replace(limitEnded ? "/session/summary?limit=1" : "/session/summary"), 900);
    return () => clearTimeout(timer);
  }, [status, limitEnded, leaving, router, refreshAppState]);

  // Entering the lesson asked for fullscreen + landscape (StartLessonButton); leaving lets go of both.
  useEffect(() => {
    return () => {
      void leaveLessonDisplay();
    };
  }, []);
  const portrait = useSyncExternalStore(subscribePortrait, isPortrait, () => false);

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
  // DEV_MODE only: wipe this child's rows (session_log, child_progress, child_profile) and start the lesson again — the laptop's reset:child, from the phone.
  const [resetState, setResetState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const resetThisChild = async () => {
    setResetState("busy");
    try {
      const res = await fetch("/api/child/reset", { method: "POST" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "failed");
      setResetState("done");
      leaveSession();
      setTimeout(() => window.location.assign("/session"), 600);
    } catch {
      setResetState("failed");
    }
  };
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

  const confirm: SessionConfirm | null =
    asking === "leave"
      ? {
          id: "leave",
          title: t("session.leaveAsk"),
          body: t("session.leaveBody"),
          confirmLabel: t("edge.paused.stop"),
          cancelLabel: t("edge.paused.resume"),
          onConfirm: () => {
            setAsking(null);
            setLeaving(true);
            leaveSession();
            // The store re-reads the records BEFORE the detail opens, so it renders "resume" from its first frame — no cached
            // "start" flipping to "resume" as the fresh copy lands (a layout shift, and a tap that can miss).
            void refreshAppState().finally(() => router.push(`/lessons/${lesson}`));
          },
          onCancel: () => setAsking(null),
        }
      : asking === "restart"
        ? {
            id: "restart",
            title: t("session.restartAsk"),
            confirmLabel: t("detail.restart"),
            cancelLabel: t("edge.paused.resume"),
            onConfirm: () => {
              setAsking(null);
              setLeaving(true);
              void restartThisSession().then(() => {
                // A fresh mount starts the sitting again at beat 0 with nothing carried over.
                window.location.assign("/session");
              });
            },
            onCancel: () => setAsking(null),
          }
        : null;

  const inLesson = status !== "idle" && status !== "locked";

  const handShown = inLesson && status !== "error" && status !== "done";
  const onBoardTouch = useCallback(() => submitTypedAnswer("(tapped)"), [submitTypedAnswer]);
  const onRootPointerDown = useCallback(() => {
    resumeAudioOutput();
    noteActivity();
  }, [resumeAudioOutput, noteActivity]);
  const renderLegacy = useCallback((content: BoardContent) => <TeachingBoard content={content} onSubmitTypedAnswer={submitTypedAnswer} />, [submitTypedAnswer]);

  // The caption line: the spoken clip's own text on request (සි), and a
  // line with no clip read on the board rather than lost.
  const captionText = noClipCaption ? `📖 ${noClipCaption}` : captionsOn && caption ? caption : null;

  const sheet: SessionSheet | null = micAsk
    ? { kind: "mic", onAllow: () => answerMicAsk(true), onType: () => answerMicAsk(false) }
    : status === "chatting"
      ? { kind: "chat", childSpoke: chatTranscript.child.length > 0, zara: chatTranscript.zara, listening: chatting && !muted && !paused, onReturn: requestChat }
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
      onToggleCaptions={toggleCaptions}
      caption={captionText}
      hint={hint}
      sheet={sheet}
      charactersShown={inLesson}
      handShown={handShown}
      chatting={chatting}
      onHand={requestChat}
      onPause={togglePause}
      onRepeat={() => setAsking("restart")}
      onEnd={() => setAsking("leave")}
      confirm={confirm}
      onAnswer={submitTypedAnswer}
      onTouch={onBoardTouch}
      onIdleTouch={noteIdleTouch}
      onInput={noteInput}
      onPointerSide={onPointerSide}
      renderLegacy={renderLegacy}
      onTitleTap={onTitleTap}
      // Any tap resumes the output AudioContext — mobile browsers keep a
      // context created outside a user gesture suspended, which silently
      // breaks playback AND drain detection (the mobile stall). Idempotent.
      // The same tap is child activity: the inactivity ladder counts from it.
      onRootPointerDown={onRootPointerDown}
      data={{
        "data-beat-id": snapshot.beatId,
        "data-beat-type": snapshot.beatType,
        "data-status": status,
        "data-your-turn": yourTurn ? `${yourTurn.kind}:${yourTurn.surface ?? "pad"}:${yourTurn.touchable ? "touch" : "voice"}:${yourTurn.answerMode ?? "-"}${yourTurn.chips ? ":chips" : ""}${yourTurn.rodPick ? `:rod-${yourTurn.rodPick}` : ""}` : undefined,
        "data-captions": captionsOn ? "on" : "off",
        "data-error": error ?? undefined,
        "data-chat": chatting ? "connected" : chatError ? "error" : "idle",
        "data-chat-error": chatError ?? undefined,
        // the navigation's view, for the harness: where the cursor is, how far the sitting reached, and whether this is a revisit
        "data-beat-index": navInfo ? String(navInfo.current) : undefined,
        "data-furthest-index": navInfo ? String(navInfo.furthest) : undefined,
        "data-revisit": navInfo?.revisit ? "true" : undefined,
      }}
    >
      {/* the designed error state — Zara, two buttons, never a stack trace (the message sits in data-error for the harness) */}
      {error && status !== "locked" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 25 }}>
          <EdgeState kind="error" onCta={() => void start()} altHref="/home" />
        </div>
      )}

      {/* ⏸ — the designed paused state over the dimmed board (the rotate card covers it in portrait).
          NOT while a question is up: ⏹ and ↺ now hold the lesson, so `paused` is true behind their
          sheet, and without this the "පාඩම නවත්තලා" card mounted underneath it — read by the layout
          probe, and flashed across the board for a frame when the child chose දිගටම. One thing at a
          time on the board: the sheet IS the paused state while it is asking. */}
      {paused && !asking && inLesson && !micAsk && status !== "chatting" && !portrait && (
        <div style={{ position: "absolute", inset: 0, zIndex: 24 }}>
          {/* the playback panel at the card's foot: ⏮ ⏭ and this session's step marks (src/components/PlaybackPanel.tsx) */}
          <EdgeState kind="paused" onCta={togglePause} onAlt={() => setAsking("leave")} style={navInfo ? { paddingBottom: 92 } : undefined}>
            {navInfo && <PlaybackPanel info={navInfo} onBack={() => requestNav("back")} onForward={() => requestNav("forward")} onGoto={(index) => requestNav("goto", index)} />}
          </EdgeState>
        </div>
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

      {/* the sitting's end: the summary screen takes over (see the effect above); the board holds the celebration until then */}
      {status === "done" && sessionSummary && <span data-testid="session-summary" data-asked={sessionSummary.asked} data-correct={sessionSummary.correct} hidden />}

      {debugOpen && debug && (
        <div style={{ position: "absolute", right: 8, top: 8, zIndex: 40, width: 256, borderRadius: 8, background: "rgba(0,0,0,.8)", padding: 8, font: "10px/1.3 ui-monospace, monospace", color: "#A7F3D0" }}>
          <div data-testid="debug-build">build: {pageBuildStamp()}</div>
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
          <div data-testid="debug-minutes">
            today: {debug.minutesToday} min | limit: {debug.dailyLimit === Infinity ? "off" : `${debug.dailyLimit} min`} | close: {debug.closeReason}
          </div>
          <div data-testid="debug-chat" style={debug.chatError ? { color: "#F87171" } : undefined}>
            ✋ {debug.chatStatus}{debug.chatError ? ` — ${debug.chatError}` : ""}
          </div>
          {/* the Live API's input transcription — misdetects the language, so it is shown HERE only, never in the chat panel */}
          <div data-testid="debug-chat-child" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ✋ heard: {debug.chatChild || "—"}
          </div>
          {childSettings?.devMode && (
            <form
              data-testid="dev-jump"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const session = Number((form.elements.namedItem("session") as HTMLInputElement).value) - 1;
                const beat = Number((form.elements.namedItem("beat") as HTMLInputElement).value);
                if (Number.isInteger(session) && session >= 0 && Number.isInteger(beat) && beat >= 0) jumpTo(session, beat);
              }}
              style={{ marginTop: 4, display: "flex", gap: 4, alignItems: "center" }}
            >
              <span>jump →</span>
              <input name="session" type="number" min={1} defaultValue={1} aria-label="session" style={{ width: 40, font: "inherit" }} />
              <span>/ beat</span>
              <input name="beat" type="number" min={0} defaultValue={0} aria-label="beat" style={{ width: 48, font: "inherit" }} />
              <button type="submit" style={{ borderRadius: 4, border: 0, background: "#A78BFA", padding: "2px 8px", fontWeight: 700, color: "#000" }}>
                go
              </button>
            </form>
          )}
          {childSettings?.devMode && (
            <button type="button" data-testid="daily-limit-toggle" data-limit={devLimit === null ? "off" : String(devLimit)} onClick={cycleDailyLimit} style={{ marginTop: 4, width: "100%", borderRadius: 4, border: 0, background: "#60A5FA", padding: "4px 0", fontWeight: 700, color: "#000" }}>
              daily limit: {devLimit === null ? "off (DEV_MODE)" : `${devLimit} min`} — tap to cycle
            </button>
          )}
          {childSettings?.devMode && (
            <button type="button" data-testid="reset-this-child" onClick={() => void resetThisChild()} style={{ marginTop: 4, width: "100%", borderRadius: 4, border: 0, background: "#F59E0B", padding: "4px 0", fontWeight: 700, color: "#000" }}>
              {resetState === "busy" ? "…" : resetState === "done" ? "reset ✓ — restarting" : resetState === "failed" ? "reset failed" : "reset this child (DEV_MODE)"}
            </button>
          )}
        </div>
      )}

      {/* the designed loading state while the script and the first clip arrive (a tap starts again if autostart was blocked) */}
      {(status === "idle" || status === "preparing") && !error && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10 }} onClick={status === "idle" ? () => void start() : undefined}>
          <EdgeState kind="loading" />
        </div>
      )}
    </SessionShell>
  );
}

function subscribePortrait(onChange: () => void): () => void {
  const media = window.matchMedia("(orientation: portrait)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function isPortrait(): boolean {
  return window.matchMedia("(orientation: portrait)").matches;
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
