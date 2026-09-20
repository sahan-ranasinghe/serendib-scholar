"use client";

/**
 * A chalk mark on something already there: a saffron ring or an underline,
 * 3.5 px, drawn once in 250 ms.
 *
 * NOTHING OVERLAPS (18 Sep 2026): a mark is drawn OUTSIDE its target's
 * bounding box, with clearance, never across it. The ring is a lasso in a
 * box RING_PAD larger than the target on every side (strokes.lassoPath keeps
 * the stroke in the outer few px of that box — ≥ 8 px of clear air to the
 * target); the underline hangs UNDERLINE_GAP below the target's bottom edge.
 */
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useBoard, useTargetRect, type Target } from "./targets";
import { UNDERLINE_D, lassoPath, scaledPath } from "./strokes";

/** The ring's box is the target's, plus this on every side. */
export const RING_PAD = 14;
/** The underline's top edge sits this far below the target's bottom edge. */
export const UNDERLINE_GAP = 3;

export interface HighlightProps {
  kind: "circle" | "underline" | null;
  target: Target | null;
  /** Changes whenever the board around the target does (the content scaled to fit, a new stage event): the mark re-measures its target. */
  layoutKey?: string | number;
}

/** The ring's pad for this target: RING_PAD, less whatever it takes to stay off the glyphs beside it on the same line (never under 6). */
function ringPadFor(board: ReturnType<typeof useBoard>, target: Target | null, rect: { x: number; y: number; width: number; height: number }): number {
  const element = target ? board.resolve(target) : null;
  const line = element?.parentElement;
  if (!element || !line || !board.surface) return RING_PAD;
  let gap = Infinity;
  for (const sibling of line.children) {
    if (sibling === element || sibling.contains(element)) continue;
    // A space between glyphs is air, not a neighbour.
    if (sibling instanceof SVGElement && (sibling.querySelector("path")?.getAttribute("d") ?? "") === "") continue;
    const r = board.measure(sibling);
    if (!r || r.width < 1 || r.height < 1) continue;
    // Only what stands beside the target on its own line; a sibling above or below is another line's business.
    if (r.y + r.height <= rect.y || r.y >= rect.y + rect.height) continue;
    const distance = r.x >= rect.x + rect.width ? r.x - (rect.x + rect.width) : rect.x >= r.x + r.width ? rect.x - (r.x + r.width) : Infinity;
    gap = Math.min(gap, distance);
  }
  return Number.isFinite(gap) ? Math.max(6, Math.min(RING_PAD, Math.floor(gap - 3))) : RING_PAD;
}

export function Highlight({ kind, target, layoutKey = 0 }: HighlightProps) {
  const board = useBoard();
  const rect = useTargetRect(kind ? target : null, 650, layoutKey);
  if (!board.overlay) return null;
  const key = kind && target ? `${kind}:${JSON.stringify(target)}` : null;
  // A number ringed INSIDE a line ("5 421 - පන්දහස් …") has neighbours a space away: the ring draws in to clear them —
  // the air it needs comes off its pad, never out of the neighbour. RING_PAD wherever there is room.
  const pad = kind === "circle" && rect ? ringPadFor(board, target, rect) : RING_PAD;
  return createPortal(
    <AnimatePresence>
      {kind && rect && (
        <div
          key={key}
          data-testid={`highlight-${kind}`}
          data-pad={kind === "circle" ? pad : 0}
          style={{
            position: "absolute",
            left: kind === "circle" ? rect.x - pad : rect.x,
            top: kind === "circle" ? rect.y - pad : rect.y + rect.height + UNDERLINE_GAP,
            width: kind === "circle" ? rect.width + pad * 2 : rect.width,
            height: kind === "circle" ? rect.height + pad * 2 : 10,
          }}
          aria-hidden
        >
          <motion.svg
            className="chalk-stroke"
            data-testid="chalk-ring-path"
            viewBox={kind === "circle" ? `0 0 ${rect.width + pad * 2} ${rect.height + pad * 2}` : `0 0 ${rect.width} 10`}
            width="100%"
            height="100%"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            style={{ display: "block", overflow: "visible" }}
          >
            <motion.path
              d={kind === "circle" ? lassoPath(rect.width + pad * 2, rect.height + pad * 2, pad) : scaledPath(UNDERLINE_D, rect.width, 10, 100, 10)}
              fill="none"
              stroke="var(--color-saffron)"
              strokeWidth={3.5}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          </motion.svg>
        </div>
      )}
    </AnimatePresence>,
    board.overlay,
  );
}
