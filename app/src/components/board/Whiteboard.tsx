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
import { BOARD, SPRING } from "./theme";
import { playSound, setMuted, useMuted } from "./sound";

export type Viewport = "phone" | "desktop" | "fill" | "stretch";

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
}

const WIPE_MS = 200;

export function Whiteboard({ viewport = "fill", children, wipeKey, showTray = true, className, testId, cornerSlot }: WhiteboardProps) {
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  const registry = useBoardRegistry(surface, overlay);
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
        <div className={`wb-frame ${className ?? ""}`} data-viewport={viewport} data-testid={testId} data-board data-corner={cornerSlot ? "true" : undefined}>
          <div className="wb-surface" ref={attachSurface}>
            <MarkerWobbleDefs />
            <div className="wb-content" style={{ opacity: wiping ? 0 : 1, transition: `opacity ${WIPE_MS * 0.6}ms ease-out` }}>
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
          {showTray && <Tray />}
          {cornerSlot && (
            <div className="wb-corner" data-testid="board-corner">
              {cornerSlot}
            </div>
          )}
        </div>
      </BoardContext.Provider>
    </MotionConfig>
  );
}

/** One turbulence + displacement filter, defined per board; strokes reference it by id. */
function MarkerWobbleDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <filter id="marker-wobble" x="-6%" y="-6%" width="112%" height="112%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

function Tray() {
  const muted = useMuted();
  return (
    <div className="wb-tray" data-testid="board-tray">
      <span className="wb-marker" style={{ background: BOARD.markerBlue }} aria-hidden />
      <span className="wb-marker" style={{ background: BOARD.markerRed }} aria-hidden />
      <span className="wb-felt" aria-hidden />
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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
          {muted ? (
            <path d="M16 9l5 6M21 9l-5 6" />
          ) : (
            <>
              <path d="M16 9a4 4 0 0 1 0 6" />
              <path d="M18.5 6.5a8 8 0 0 1 0 11" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
