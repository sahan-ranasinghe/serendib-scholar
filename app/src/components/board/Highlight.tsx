"use client";

/**
 * A chalk-yellow mark on something already on the board — a ring round
 * it or a line under it, drawn as a stroke.
 *
 * Vocabulary:
 *   circle { target }     → kind="circle", target
 *   underline { target }  → kind="underline", target
 *   off                   → kind=null
 */
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useBoard, useTargetRect, type Target } from "./targets";
import { BOARD } from "./theme";
import { ringPath, underlinePath } from "./strokes";

export interface HighlightProps {
  kind: "circle" | "underline" | null;
  target: Target | null;
}

const PAD = 10;

export function Highlight({ kind, target }: HighlightProps) {
  const board = useBoard();
  const rect = useTargetRect(kind ? target : null);
  if (!board.overlay) return null;
  const key = kind && target ? `${kind}:${JSON.stringify(target)}` : null;
  return createPortal(
    <AnimatePresence>
      {kind && rect && (
        // A plain, React-positioned box: motion.svg keeps the style it
        // mounted with, so left/top must not live on it. The path is drawn
        // in this box's own pixel space, so its length reveal is uniform.
        <div
          key={key}
          data-testid={`highlight-${kind}`}
          style={{
            position: "absolute",
            left: rect.x - PAD,
            top: kind === "circle" ? rect.y - PAD : rect.y + rect.height - 4,
            width: rect.width + PAD * 2,
            height: kind === "circle" ? rect.height + PAD * 2 : 14,
          }}
          aria-hidden
        >
          <motion.svg
            className="chalk-stroke"
            width={rect.width + PAD * 2}
            height={kind === "circle" ? rect.height + PAD * 2 : 14}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            style={{ display: "block", overflow: "visible" }}
          >
            <motion.path
              d={kind === "circle" ? ringPath(rect.width + PAD * 2, rect.height + PAD * 2) : underlinePath(rect.width + PAD * 2, 14)}
              fill="none"
              stroke={BOARD.chalkYellow}
              strokeWidth={kind === "circle" ? 5 : 6}
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
