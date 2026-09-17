"use client";

/**
 * A chalk mark on something already there: the design's saffron ring
 * (inset −14 around a card, −8 around a whole abacus) or its underline,
 * 3.5 px, drawn once in 250 ms.
 */
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useBoard, useTargetRect, type Target } from "./targets";
import { RING_D, RING_FRAME_D, UNDERLINE_D, scaledPath } from "./strokes";

export interface HighlightProps {
  kind: "circle" | "underline" | null;
  target: Target | null;
}

export function Highlight({ kind, target }: HighlightProps) {
  const board = useBoard();
  const rect = useTargetRect(kind ? target : null);
  if (!board.overlay) return null;
  const key = kind && target ? `${kind}:${JSON.stringify(target)}` : null;
  // a ring around a whole primitive (an abacus) sits closer than one around a card
  const big = rect !== null && rect.width > 200;
  const pad = big ? 8 : 14;
  return createPortal(
    <AnimatePresence>
      {kind && rect && (
        <div
          key={key}
          data-testid={`highlight-${kind}`}
          style={{
            position: "absolute",
            left: kind === "circle" ? rect.x - pad : rect.x,
            top: kind === "circle" ? rect.y - pad : rect.y + rect.height - 2,
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
              d={kind === "circle" ? scaledPath(big ? RING_FRAME_D : RING_D, rect.width + pad * 2, rect.height + pad * 2) : scaledPath(UNDERLINE_D, rect.width, 10, 100, 10)}
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
