"use client";

/**
 * The board every primitive sits on.
 *
 * A wooden frame around an off-white surface with a faint grid; a tray
 * along the bottom holding two markers, a felt eraser and the mute
 * toggle. It provides the target registry the pointer and highlight
 * resolve against, the overlay layer they draw on, the SVG filter that
 * gives every stroke its hand-drawn wobble, and the erase sweep
 * (`chalkText.erase`): bump `wipeKey` and a felt block wipes across
 * while the content blanks — the caller unmounts what was up.
 *
 * `viewport` fixes the aspect: "phone" is a 390×844 phone held sideways,
 * "desktop" is 16:9 at 1024 wide, "fill" takes the parent's width,
 * "stretch" fills the parent's box entirely (the lesson screen's column).
 */
import "./board.css";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BoardContext, useBoardRegistry, type BoardRegistry } from "./targets";
import { BOARD, SPRING } from "./tokens";
import { playSound, setMuted, useMuted } from "./sound";

export type Viewport = "phone" | "desktop" | "fill" | "stretch" | "cell";

export interface WhiteboardProps {
  viewport?: Viewport;
  children?: ReactNode;
  /** Bump to run the eraser across the board (200 ms). */
  wipeKey?: number;
  showTray?: boolean;
  className?: string;
  testId?: string;
  /** Something anchored in the frame's bottom-left corner, outside the content (the tutor's portrait). */
  cornerSlot?: ReactNode;
  /** A row along the foot of the surface (the answer chips, a dock); the content keeps clear of it. */
  footer?: ReactNode;
  /** What the foot holds: chips (content bottom 124) or a dock — a pad or word bank (content bottom 190, content top-aligned). */
  footKind?: "chips" | "dock" | "bank";
  /** Lena, on the frame at right 14 / bottom 16. */
  lenaSlot?: ReactNode;
  /** The ✋, on the frame at right 12 / bottom 76 (56 px). */
  handSlot?: ReactNode;
  /** The caption line, left 94 / right 82 / bottom 26. */
  caption?: ReactNode;
  /** A sheet over the dimmed board (the ✋ chat, the first-time mic explanation): { zara, sheet }. */
  sheet?: { zara: ReactNode; content: ReactNode; kind?: "chat" | "mic"; testId?: string } | null;
  /** Things positioned against the frame itself (the retry note, the tap hint). */
  frameSlot?: ReactNode;
}

const WIPE_MS = 200;

export function Whiteboard({ viewport = "fill", children, wipeKey, showTray = true, className, testId, cornerSlot, footer, footKind, lenaSlot, handSlot, caption, sheet, frameSlot }: WhiteboardProps) {
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  // Docked inputs (a pad, a word bank) count themselves in; while one is
  // up the content inset's bottom is 190 and the chips row stands down.
  const [docked, setDocked] = useState(0);
  const noteDock = useCallback((delta: number) => setDocked((n) => Math.max(0, n + delta)), []);
  const dockUp = docked > 0;
  const registry = useBoardRegistry(surface, overlay, dock, noteDock, dockUp ? 1 : 0);
  const foot = dockUp || footKind === "dock" || footKind === "bank" ? "dock" : footer ? "chips" : undefined;
  // QA hook: board-check asks the surface what a target resolves to, so
  // its expectations are the registry's answers, not a DOM guess.
  // `resolve` is stable for the life of the board, so the ref can carry it.
  const attachSurface = useCallback(
    (element: HTMLDivElement | null) => {
      setSurface(element);
      if (element) (element as HTMLElement & { __board?: { resolve: BoardRegistry["resolve"] } }).__board = { resolve: registry.resolve };
    },
    [registry.resolve],
  );

  const [wiping, setWiping] = useState(false);
  const lastWipe = useRef(wipeKey);
  useEffect(() => {
    if (wipeKey === undefined || wipeKey === lastWipe.current) return;
    lastWipe.current = wipeKey;
    setWiping(true);
    playSound("chalk");
    const done = setTimeout(() => setWiping(false), WIPE_MS + 40);
    return () => clearTimeout(done);
  }, [wipeKey]);

  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <BoardContext.Provider value={registry}>
        <div
          className={`wb-frame ${className ?? ""}`}
          data-viewport={viewport}
          data-testid={testId}
          data-board
          data-corner={cornerSlot ? "true" : undefined}
          data-footer={footer && !dockUp ? "true" : undefined}
          data-foot={foot}
        >
          <div className="wb-surface" ref={attachSurface} data-testid="board-surface">
            <div className="wb-content" data-testid="board-content" style={{ opacity: wiping ? 0 : 1, transition: `opacity ${WIPE_MS * 0.6}ms ease-out` }}>
              {children}
            </div>
            <div className="wb-overlay" ref={setOverlay} />
            <AnimatePresence>
              {wiping && (
                <motion.div
                  className="wb-eraser"
                  initial={{ x: "-110%", rotate: -4 }}
                  animate={{ x: "480%", rotate: 3 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: WIPE_MS / 1000, ease: "easeInOut" }}
                />
              )}
            </AnimatePresence>
          </div>
          {footer && !dockUp && (
            <div className="wb-footer" data-testid="board-footer" data-kind={footKind ?? "chips"}>
              {footer}
            </div>
          )}
          <div className="wb-dock" data-testid="board-dock" data-up={dockUp || undefined} ref={setDock} />
          {frameSlot}
          {caption && (
            <div className="wb-caption" data-testid="caption">
              {caption}
            </div>
          )}
          {showTray && <Tray />}
          {handSlot}
          {cornerSlot && (
            <div className="wb-corner" data-testid="board-corner">
              {cornerSlot}
            </div>
          )}
          {lenaSlot && (
            <div className="wb-lena" data-testid="board-lena">
              {lenaSlot}
            </div>
          )}
          {sheet && (
            <div className="wb-sheet-layer" data-testid={sheet.testId ?? "board-sheet"} data-kind={sheet.kind ?? "chat"}>
              <div className="wb-dim" data-testid="board-dim" />
              <div className="wb-zara-large">{sheet.zara}</div>
              <div className="wb-sheet" data-kind={sheet.kind ?? "chat"}>
                {sheet.content}
              </div>
            </div>
          )}
        </div>
      </BoardContext.Provider>
    </MotionConfig>
  );
}


function Tray() {
  const muted = useMuted();
  return (
    <div className="wb-tray" data-testid="board-tray">
      <span className="wb-marker" style={{ background: BOARD.markerBlue }} aria-hidden />
      <span className="wb-marker" style={{ background: BOARD.markerGreen }} aria-hidden />
      <button
        type="button"
        className="wb-mute"
        aria-pressed={muted}
        aria-label={muted ? "Sound off — turn on" : "Sound on — turn off"}
        onClick={() => {
          setMuted(!muted);
          if (muted) playSound("beadClick");
        }}
        data-testid="board-mute"
      >
        <span className="wb-mute-chip">{muted ? "♪̸" : "♪"}</span>
      </button>
    </div>
  );
}
