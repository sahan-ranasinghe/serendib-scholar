"use client";

/**
 * The session screen's look, from the design (docs/design/export/handoff —
 * README "Layout", Session.dc.html):
 *
 *   ┌─ strip 28 px teal: title · 8 concept stops · ⏸ ↺ ⏹ · සි ─────────┐
 *   ├─ wood frame 10 · board #F7F3EA, 32 px grid · tray 22 ─────────────┤
 *   │   content inset L94 R82 T22 B64 (124 with chips, 190 with a dock)  │
 *   │   ◉ Zara 64 at L10/B6      ✋ 56 at R12/B76      🐱 Lena 48 R14/B16 │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Purely presentational: LessonScreen feeds it the runtime; the design
 * preview (/admin/design-preview) feeds it a staged frame. Data attributes
 * on the root (`data-beat-id`, `data-status`, `data-your-turn`,
 * `data-character`) are the QA harness's view — see scripts/session-check.ts.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BoardContent } from "@/lib/board";
import type { StageState } from "@/lib/choreography";
import ZaraCharacter, { mouthShapeFor, type MouthShape, type ZaraState } from "@/components/ZaraCharacter";
import LenaCharacter, { type LenaState } from "@/components/LenaCharacter";
import { BoardStage, type YourTurn } from "@/components/board/BoardStage";
import { ProgressStrip, type ConceptStop } from "@/components/ProgressStrip";
import { EdgeState } from "@/components/app/EdgeState";
import { t } from "@/lib/appCopy";

/** How often the amplitude state refreshes while Zara talks (~12fps is plenty for 3 mouth shapes). */
const AMPLITUDE_INTERVAL_MS = 80;
/** A press this long names the control instead of pressing it. */
const LONG_PRESS_MS = 500;

/**
 * The chat panel never receives the child's transcript: it is told only THAT the child has spoken (`childSpoke`), and shows
 * the neutral bubble. The Live API's input transcription misdetects the language independently of the model's
 * understanding (23 Sep 2026 demo — other scripts, other Asian languages, fragments), and correcting it would cost a call
 * per turn and risk showing words the child never said. The transcript lives in the debug overlay only.
 */
export type SessionSheet = { kind: "mic"; onAllow: () => void; onType: () => void } | { kind: "chat"; childSpoke: boolean; zara: string | null; listening: boolean; onReturn: () => void; failure?: string | null; warning?: string | null; closing?: boolean };

/** A one-tap confirmation over the dimmed board: ⏹ (leave) and ↺ (restart) each ask once. */
export interface SessionConfirm {
  id: "leave" | "restart";
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The strip is 40 px (the 15 Sep device triage: 28 px controls were too
 * small to hit); the board keeps the rest. Glyphs are drawn at 28 px, white
 * on the teal, in 56×40 cells whose hit areas reach 56 px into the frame.
 */
export const STRIP_H = 40;

export interface SessionShellProps {
  /** The strip's title: the subject and the lesson's name (from the copy sheet). */
  title: string;
  stage: StageState;
  yourTurn: YourTurn | null;
  zaraState: ZaraState;
  lenaState: LenaState;
  pointerSide: "left" | "right" | null;
  /** Zara is speaking: the mouth follows the output amplitude, the chalk cursor waits. */
  talking: boolean;
  getAmplitude: () => number;
  /** The corner portrait is dimmed (muted or paused). */
  zaraDimmed?: boolean;
  paused?: boolean;
  conceptStops: ConceptStop[];
  captionsOn: boolean;
  onToggleCaptions: () => void;
  /** The caption line (already decided: the clip's text on request, or a line with no clip). */
  caption: string | null;
  hint: string | null;
  sheet: SessionSheet | null;
  /** Zara and Lena are on the frame (the lesson is up). */
  charactersShown: boolean;
  /** The ✋ is on the frame. */
  handShown: boolean;
  chatting?: boolean;
  onHand: () => void;
  onPause: () => void;
  onRepeat: () => void;
  onEnd: () => void;
  onAnswer: (text: string) => void;
  onTouch: () => void;
  onIdleTouch?: () => void;
  onPointerSide?: (side: "left" | "right" | null) => void;
  /** A surface holds input the child is still making. */
  onInput?: (hasInput: boolean) => void;
  renderLegacy?: (content: BoardContent) => ReactNode;
  onTitleTap?: () => void;
  onRootPointerDown?: () => void;
  /** The harness's data attributes on the root. */
  data?: Record<string, string | undefined>;
  /** Overlays over the board (the device gate, an error, the summary card). */
  children?: ReactNode;
  /** ⏹ / ↺ asking once, over the dimmed board. */
  confirm?: SessionConfirm | null;
  /** A panel docked beside the board (the playback panel while ⏸ holds the lesson); the ✋ chat takes the slot when open. */
  sidePanel?: ReactNode;
}

/** A small friendly bot: the chat's persistent icon. */
function BotIcon({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ display: "block" }}>
      <line x1="16" y1="3" x2="16" y2="8" stroke="var(--color-teal)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="3.4" r="2.2" fill="var(--color-saffron)" />
      <rect x="4.5" y="8" width="23" height="18" rx="7" fill="var(--color-teal)" />
      <circle cx="11.5" cy="16" r="2.6" fill="#fff" />
      <circle cx="20.5" cy="16" r="2.6" fill="#fff" />
      <path d="M11.5 21.2c2.8 2 6.2 2 9 0" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <rect x="1.5" y="14" width="3" height="7" rx="1.5" fill="var(--color-teal)" />
      <rect x="27.5" y="14" width="3" height="7" rx="1.5" fill="var(--color-teal)" />
    </svg>
  );
}

export function SessionShell({ title, stage, yourTurn, zaraState, lenaState, pointerSide, talking, getAmplitude, zaraDimmed = false, paused = false, conceptStops, captionsOn, onToggleCaptions, caption, hint, sheet, charactersShown, handShown, chatting = false, onHand, onPause, onRepeat, onEnd, onAnswer, onTouch, onIdleTouch, onPointerSide, onInput, renderLegacy, onTitleTap, onRootPointerDown, data, children, confirm = null, sidePanel = null }: SessionShellProps) {
  const [pressed, setPressed] = useState<string | null>(null);
  const chatOpen = chatting || sheet?.kind === "chat";
  // Zara in the frame's corner. The mouth's amplitude is the portrait's
  // own state (ZaraPortrait polls it), so her talking never re-renders the
  // board — and the board's props are stable, so BoardStage (memoised)
  // redraws only when the stage changes.
  const portrait = useMemo(() => <ZaraPortrait state={zaraState} side={pointerSide} talking={talking} getAmplitude={getAmplitude} dimmed={zaraDimmed} />, [zaraState, pointerSide, talking, getAmplitude, zaraDimmed]);
  const large = useMemo(() => <ZaraPortrait state={zaraState} side={pointerSide} talking={talking} getAmplitude={getAmplitude} dimmed={false} size={160} />, [zaraState, pointerSide, talking, getAmplitude]);
  const lenaSlot = useMemo(() => (charactersShown ? <Lena state={lenaState} /> : undefined), [charactersShown, lenaState]);
  const handSlot = useMemo(
    () =>
      handShown ? (
        // The chat's door, always there: a small bot with the ✋ it answers to. It opens the chat panel and closes it again —
        // the child comes and goes as they like, the board in front of them the whole time.
        <button type="button" className="wb-hand wb-tap" data-testid="hand" data-open={chatOpen || undefined} onClick={onHand} aria-pressed={chatOpen} aria-label={chatOpen ? t("session.handClose") : t("session.handAsk")}>
          <BotIcon />
          <span className="wb-hand-badge" aria-hidden>✋</span>
        </button>
      ) : undefined,
    [handShown, onHand, chatOpen],
  );
  // Only the first-time microphone explanation is a sheet over the board. THE CHAT IS NOT (18 Sep, the device walk): it is a
  // compact panel docked BESIDE the board (below it in portrait) — the board reflows into the room that is left, fully
  // visible and undimmed, with the pointer and the ring still working on it while she explains.
  const boardSheet = sheet?.kind === "mic" ? { kind: "mic" as const, testId: "mic-ask", zara: large, content: <MicAskSheet onAllow={sheet.onAllow} onType={sheet.onType} /> } : null;
  const chat = sheet?.kind === "chat" ? sheet : null;

  return (
    <div className="lesson-screen" onPointerDown={onRootPointerDown} {...data} data-character={zaraState} data-lena={lenaState} data-paused={paused || undefined} data-pause={stage.pause ? "soft" : undefined} style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--color-wood)", color: "var(--color-ink)" }}>
      {/* ---- the strip: title · concept stops · ⏸ ↺ ⏹ · සි ---------------- */}
      <header data-testid="session-strip" style={{ position: "relative", zIndex: 30, height: STRIP_H, flex: "none", background: "var(--color-teal)", display: "flex", alignItems: "center", padding: "0 0 0 14px", color: "#fff" }}>
        {/* not a control: five quick taps open the debug overlay — the one press the single-fire guard must never see */}
        <span data-testid="session-title" onClick={onTitleTap} style={{ font: `600 20px/${STRIP_H}px var(--font-label)`, whiteSpace: "nowrap" }}>
          {title}
        </span>
        <span style={{ flex: 1 }} />
        <ProgressStrip stops={conceptStops} />
        {/* ⏸ ↺ ⏹ සි: 28 px glyphs in 56×40 cells, the hit areas reaching 56 px down into the board frame; a long press names the control */}
        <StripControl label={paused ? t("edge.paused.resume") : t("session.pause")} onPress={onPause} onLabel={setPressed} pressed={pressed}>
          {paused ? "▶" : "⏸"}
        </StripControl>
        <StripControl label={t("detail.restart")} onPress={onRepeat} onLabel={setPressed} pressed={pressed}>
          ↺
        </StripControl>
        <StripControl label={t("edge.paused.stop")} onPress={onEnd} onLabel={setPressed} pressed={pressed}>
          ⏹
        </StripControl>
        <StripControl label={t("session.captions")} onPress={onToggleCaptions} onLabel={setPressed} pressed={pressed} pressedState={captionsOn}>
          <span style={{ padding: "0 6px", border: "2px solid #fff", borderRadius: 6, font: `700 20px/26px var(--font-label)`, background: captionsOn ? "#fff" : "transparent", color: captionsOn ? "var(--color-teal)" : "#fff" }}>{t("session.captionsGlyph")}</span>
        </StripControl>
      </header>

      {/* ---- the board, edge to edge ---------------------------------------- */}
      <main data-testid="session-main" className="session-main" data-chat-panel={chat ? "open" : undefined} style={{ position: "relative", minHeight: 0, flex: 1, overflow: "hidden" }}>
        <div data-testid="session-board" className="session-board">
        <BoardStage
          stage={stage}
          yourTurn={yourTurn}
          onAnswer={onAnswer}
          onTouch={onTouch}
          onIdleTouch={onIdleTouch}
          onPointerSide={onPointerSide}
          onInput={onInput}
          renderLegacy={renderLegacy}
          cornerSlot={charactersShown ? portrait : undefined}
          lenaSlot={lenaSlot}
          handSlot={handSlot}
          caption={caption}
          sheet={boardSheet}
          hint={hint}
          writing={talking}
        />
        </div>
        {chat ? <ChatPanel childSpoke={chat.childSpoke} zara={chat.zara} listening={chat.listening} failure={chat.failure ?? null} warning={chat.warning ?? null} closing={chat.closing ?? false} onClose={chat.onReturn} portrait={<ZaraPortrait state={zaraState} side={null} talking={talking} getAmplitude={getAmplitude} dimmed={false} size={40} />} /> : sidePanel}
        {children}
      </main>

      {/* ---- a one-tap confirmation over the dimmed board (⏹ leave · ↺ restart) --- */}
      {confirm && (
        <div data-testid="confirm-sheet" data-confirm={confirm.id} style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(27,27,27,.55)", padding: 24, textAlign: "center" }}>
          <div style={{ font: "700 26px/1.5 var(--font-display)", color: "#fff", textWrap: "balance" }}>{confirm.title}</div>
          {confirm.body && <div style={{ font: "400 20px/1.5 var(--font-body)", color: "rgba(255,255,255,.85)", maxWidth: 420 }}>{confirm.body}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button type="button" data-testid="confirm-yes" onClick={confirm.onConfirm} style={{ height: 52, padding: "0 24px", border: 0, borderRadius: 12, background: "var(--color-teal)", color: "#fff", font: "700 22px/1.5 var(--font-display)", boxShadow: "var(--shadow-button)", whiteSpace: "nowrap", cursor: "pointer" }}>
              {confirm.confirmLabel}
            </button>
            <button type="button" data-testid="confirm-no" onClick={confirm.onCancel} style={{ height: 52, padding: "0 20px", border: "2px solid var(--color-ink-18)", borderRadius: 12, background: "var(--color-paper)", color: "var(--color-teal)", font: "700 22px/1.5 var(--font-display)", whiteSpace: "nowrap", cursor: "pointer" }}>
              {confirm.cancelLabel}
            </button>
          </div>
        </div>
      )}

      {/* ---- portrait: friendly rotate card (the lesson is held) --------- */}
      <div className="rotate-card">
        <EdgeState kind="rotate" style={{ minHeight: "100%" }} />
      </div>

      <style>{`
        /* the 56×40 cell stays in the strip; the hit area (::after) reaches 56 px down into the board frame */
        .strip-control { position: relative; display: flex; align-items: center; justify-content: center; height: ${STRIP_H}px; width: 56px; padding: 0; background: transparent; border: 0; color: #fff; cursor: pointer; }
        .strip-control::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 56px; }
        .strip-label { position: absolute; top: ${STRIP_H + 4}px; left: 50%; transform: translateX(-50%); z-index: 31; background: rgba(27,27,27,.86); color: #fff; border-radius: 8px; padding: 4px 10px; font: 600 20px/1.4 var(--font-label); white-space: nowrap; pointer-events: none; }
        .rotate-card { display: none; }
        @media (orientation: portrait) {
          .rotate-card { position: fixed; inset: 0; z-index: 50; display: flex; align-items: stretch; justify-content: stretch; background: #F7F3EA; }
        }
        .zara-portrait { display: block; }
      `}</style>
    </div>
  );
}

/**
 * Zara's round portrait (64 px in the corner, 160 px on a sheet). The
 * mouth's amplitude is polled here, at ~12 fps while she talks, so only
 * this small subtree re-renders on each tick.
 */
export function ZaraPortrait({ state, side, talking, getAmplitude, dimmed, size = 64 }: { state: ZaraState; side: "left" | "right" | null; talking: boolean; getAmplitude: () => number; dimmed: boolean; size?: number }) {
  const [amplitude, setAmplitude] = useState(0);
  useEffect(() => {
    // Sampled always (cheap: one analyser read per frame); shapes change only on a band change.
    // Per frame, from the player's analyser: the mouth follows the voice —
    // three shapes by band, closed between words and on the clip's tail.
    // Only a CHANGE of shape re-renders the portrait.
    let frame = 0;
    let lastShape: MouthShape = 0;
    const tick = () => {
      const a = getAmplitude();
      const shape = mouthShapeFor(a);
      if (shape !== lastShape) {
        lastShape = shape;
        setAmplitude(a);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [talking, getAmplitude]);
  const mouth = amplitude;
  return (
    // the wrapper takes the portrait's drawn size (its 3 px paper border included) so the box sits where the export anchors it.
    // Zara is not a control: she is never tappable during a lesson.
    <div className="zara-portrait" data-testid="zara-portrait" data-state={state} data-size={size} style={{ display: "block", width: "max-content", lineHeight: 0, opacity: dimmed ? 0.6 : 1, transition: "opacity 300ms" }}>
      <ZaraCharacter state={state} amplitude={mouth} side={side} portrait size={size} />
    </div>
  );
}

/**
 * One strip control: a 28 px glyph in a 56×40 cell, white on the teal, with
 * a 56 px hit area reaching into the board frame. A long press (500 ms)
 * names it — the icons alone are not self-explanatory, and a child should
 * be able to ask what one does without pressing it.
 */
function StripControl({ label, onPress, onLabel, pressed, pressedState, children }: { label: string; onPress: () => void; onLabel: (label: string | null) => void; pressed: string | null; pressedState?: boolean; children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = () => {
    held.current = false;
    timer.current = setTimeout(() => {
      held.current = true;
      onLabel(label);
    }, LONG_PRESS_MS);
  };
  const end = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (held.current) {
      // A long press asked what this is; it does not also press it.
      setTimeout(() => onLabel(null), 1400);
      held.current = false;
      return;
    }
    onLabel(null);
  };
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressedState}
      title={label}
      className="strip-control"
      style={{ font: "28px/1 var(--font-latin)" }}
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        held.current = false;
        onLabel(null);
      }}
      onClick={() => {
        if (held.current) return;
        onPress();
      }}
    >
      {children}
      {pressed === label && <span className="strip-label">{label}</span>}
    </button>
  );
}

function Lena({ state }: { state: LenaState }) {
  return (
    <div data-testid="lena" data-state={state} style={{ width: 48, height: 48 }}>
      <LenaCharacter state={state} size={48} />
    </div>
  );
}

/** The first ✋ (P1): why she listens, that nothing is stored, and the choice. */
function MicAskSheet({ onAllow, onType }: { onAllow: () => void; onType: () => void }) {
  const badge = (n: number, bg: string) => <span style={{ width: 28, height: 28, borderRadius: "50%", background: bg, color: "#fff", font: "700 15px/28px var(--font-latin)", textAlign: "center", flex: "none" }}>{n}</span>;
  return (
    <>
      <span style={{ font: "700 26px/1.4 var(--font-display)", color: "var(--color-ink)" }}>{t("edge.mic.title")}</span>
      <div style={{ display: "grid", gap: 8, font: "400 20px/1.5 var(--font-body)", color: "var(--color-ink)" }}>
        <div style={{ display: "flex", gap: 10 }}>
          {badge(1, "var(--color-teal)")}
          <span>{t("edge.mic.whenAsked")}</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {badge(2, "var(--color-success)")}
          <span>{t("edge.mic.body")}</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {badge(3, "var(--color-coral)")}
          <span>{t("edge.mic.orType")}</span>
        </div>
      </div>
      <div style={{ marginTop: "auto", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" data-testid="mic-ask-type" onClick={onType} style={{ height: 56, padding: "0 22px", border: "2px solid var(--color-ink-18)", borderRadius: 12, background: "var(--color-paper)", color: "var(--color-teal)", font: "700 24px/1.5 var(--font-display)", cursor: "pointer" }}>
          {t("edge.mic.type")}
        </button>
        <button type="button" data-testid="mic-ask-allow" onClick={onAllow} style={{ height: 56, padding: "0 28px", border: 0, borderRadius: 12, background: "var(--color-teal)", color: "#fff", font: "700 24px/1.5 var(--font-display)", boxShadow: "var(--shadow-button)", cursor: "pointer" }}>
          {t("edge.mic.allow")}
        </button>
      </div>
    </>
  );
}

/**
 * The ✋ chat, as a compact panel (18 Sep 2026 — it used to be a sheet over a dimmed board, so a child could not see what
 * they were asking about). Zara small, the listening pill, the live transcript (what the child said, what she is saying),
 * and a close button. It sits beside the board in landscape and beneath it — at most a third of the height — in portrait.
 */
/**
 * `failure`: the chat could not go on (the day's chat time spent, no network, the connection gone) — the panel stays,
 * Zara's line says what happened, and nothing pretends to listen, until the child closes it (28 Sep 2026).
 * `warning` / `closing`: her five- and one-minute warnings are her line here like anything else she says; at the limit
 * the microphone is off (the pill stops listening) and the panel goes once she has finished (29 Sep 2026).
 */
function ChatPanel({ childSpoke, zara, listening, failure, warning, closing, onClose, portrait }: { childSpoke: boolean; zara: string | null; listening: boolean; failure: string | null; warning: string | null; closing: boolean; onClose: () => void; portrait: ReactNode }) {
  return (
    <aside className="chat-panel" data-testid="chat-sheet" data-chat-failure={failure ?? undefined} data-chat-warning={warning ?? undefined} data-chat-closing={closing || undefined} aria-label={t("chat.panelName")}>
      <div className="chat-panel-head">
        <span className="chat-panel-zara">{portrait}</span>
        {!failure && !closing && (
          <span data-testid="chat-listening" className="chat-panel-pill" style={{ opacity: listening ? 1 : 0.55 }}>
            <span className="chat-panel-dot" />
            🎤 {listening ? t("chat.listening") : t("chat.connecting")}
          </span>
        )}
        <button type="button" className="chat-panel-close wb-tap" data-testid="chat-return" onClick={onClose} aria-label={t("chat.closeToLesson")}>
          ✕
        </button>
      </div>
      <div className="chat-panel-lines" data-testid="chat-transcript">
        {/* the child's turn: a neutral bubble with a small waveform — never the transcript (see SessionSheet) */}
        <div data-testid="chat-line-child" data-child-turn={childSpoke ? "spoke" : "none"} className="chat-line chat-line-child" style={{ visibility: childSpoke ? "visible" : "hidden", display: "flex", alignItems: "center", gap: 8 }}>
          <svg className="chat-wave" viewBox="0 0 28 16" width="28" height="16" aria-hidden>
            {[2, 6, 10, 14, 18, 22, 26].map((x, i) => (
              <rect key={x} x={x - 1.5} y={8 - [3, 6, 8, 5, 7, 4, 2][i]! / 2} width="3" height={[3, 6, 8, 5, 7, 4, 2][i]} rx="1.5" fill="var(--color-success)" />
            ))}
          </svg>
          <span>{t("chat.childSpoke")}</span>
        </div>
        <div data-testid="chat-line-zara" className="chat-line chat-line-zara" style={{ visibility: zara ? "visible" : "hidden" }}>
          {zara ?? ""}
        </div>
      </div>
    </aside>
  );
}
