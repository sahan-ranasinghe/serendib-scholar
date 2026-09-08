"use client";

/**
 * Zara's chalk hand. It sits on the board whenever she is talking about
 * something on the board, its fingertip at the thing.
 *
 * Vocabulary:
 *   move_to { target }  → at (a rod, a column, a card, a cell, a part, a
 *                         digit, a text span, or a number wherever it is)
 *   pulse               → bump pulseKey
 *   hide                → at = null
 *
 * A target nothing has registered hides the hand (data-missing="true")
 * rather than pointing at the wrong thing.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBoard, useTargetRect, type Target } from "./targets";
import { BOARD, SPRING_SNAPPY } from "./theme";

export interface PointerProps {
  at: Target | null;
  pulseKey?: number;
  /** The child's turn: the hand rests in the corner instead of hiding. */
  parked?: boolean;
  /** Which half of the board the hand is over, for the character to mirror. */
  onSide?: (side: "left" | "right" | null) => void;
}

const HAND = 44;

export function Pointer({ at, pulseKey = 0, parked = false, onSide }: PointerProps) {
  const board = useBoard();
  const reduced = useReducedMotion();
  const rect = useTargetRect(parked ? null : at);
  const visible = at !== null && rect !== null;
  const surfaceWidth = board.surface?.offsetWidth ?? 0;
  const surfaceHeight = board.surface?.offsetHeight ?? 0;
  const side: "left" | "right" | null = visible && surfaceWidth ? (rect.x + rect.width / 2 < surfaceWidth / 2 ? "left" : "right") : null;
  useEffect(() => {
    onSide?.(parked ? null : side);
  }, [side, parked, onSide]);
  // The hand keeps its last position while hidden, so a hide/show does
  // not snap it to a corner. Adjusted during render, as React recommends
  // for state that follows a derived value.
  const [last, setLast] = useState({ x: 40, y: 40 });
  if (rect) {
    // the fingertip lands at the bottom-centre of the target, the hand hanging below-right
    const next = { x: rect.x + rect.width / 2 - 9, y: rect.y + rect.height - 4 };
    if (next.x !== last.x || next.y !== last.y) setLast(next);
  }
  const pulsing = pulseKey;
  const parkAt = { x: Math.max(0, surfaceWidth - HAND - 12), y: Math.max(0, surfaceHeight - HAND - 16) };

  if (!board.overlay) return null;
  return createPortal(
    <motion.div
      data-testid="pointer"
      data-missing={!parked && at !== null && rect === null ? "true" : undefined}
      data-parked={parked || undefined}
      initial={false}
      animate={{
        left: parked ? parkAt.x : last.x,
        top: parked ? parkAt.y : last.y,
        opacity: parked ? 0.55 : visible ? 1 : 0,
        scale: parked ? 0.85 : visible ? 1 : 0.8,
      }}
      transition={{
        left: reduced ? { duration: 0 } : SPRING_SNAPPY,
        top: reduced ? { duration: 0 } : SPRING_SNAPPY,
        opacity: { duration: 0.15 },
        scale: { duration: 0.15 },
      }}
      style={{ position: "absolute", width: HAND, height: HAND, transformOrigin: "20% 8%" }}
    >
      <motion.svg
        key={pulsing}
        viewBox="0 0 44 44"
        width={HAND}
        height={HAND}
        initial={pulsing ? { scale: 1 } : false}
        animate={pulsing && !reduced ? { scale: [1, 1.28, 1] } : { scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{ transformOrigin: "20% 8%", filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.3))" }}
        aria-hidden
      >
        {/* a pointing hand: index finger up, three fingers folded, a bit of cuff */}
        <path
          d="M 9 3 C 11 1, 14 2, 14 5 L 14 18 C 16 17, 19 17, 21 18 C 23 17, 27 17, 28 19 C 30 18, 34 19, 34 22 L 34 30 C 34 37, 29 42, 22 42 C 15 42, 11 38, 9 32 L 5 24 C 4 21, 7 19, 9 21 L 9 3 Z"
          fill="#F6E1C8"
          stroke={BOARD.ink}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M 14 18 L 14 26 M 21 18 L 21 27 M 28 19 L 28 28" stroke={BOARD.ink} strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
        <rect x="12" y="38" width="22" height="6" rx="2" fill={BOARD.markerBlue} />
      </motion.svg>
    </motion.div>,
    board.overlay,
  );
}
