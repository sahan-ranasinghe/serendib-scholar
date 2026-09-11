"use client";

/**
 * Zara's chalk hand, from the design: a 40×52 hand — a wood-brown finger
 * and palm holding a saffron chalk stub. It rests with the chalk at the
 * target's bottom-centre, pulses with a saffron ring, parks in the corner
 * on the child's turn, and inverts above a rod on a rod-tap question.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBoard, useTargetRect, type Target } from "./targets";
import { SPRING_SNAPPY } from "./tokens";

export interface PointerProps {
  at: Target | null;
  pulseKey?: number;
  /** The child's turn: the hand rests in the corner instead of hiding. */
  parked?: boolean;
  /** Which half of the board the hand is over, for the character to mirror. */
  onSide?: (side: "left" | "right" | null) => void;
  /** Point from above (inverted) — a rod-tap question. */
  inverted?: boolean;
}

export const HAND_W = 40;
export const HAND_H = 52;

/** The hand itself, as the design draws it. */
export function ChalkHand({ width = HAND_W, height = HAND_H, style }: { width?: number; height?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 40 52" width={width} height={height} style={{ display: "block", ...style }} aria-hidden>
      <rect x="15" y="2" width="10" height="26" rx="5" fill="#A9683F" />
      <ellipse cx="20" cy="34" rx="13" ry="12" fill="#A9683F" />
      <rect x="6" y="40" width="28" height="12" rx="4" fill="var(--color-saffron)" />
    </svg>
  );
}

export function Pointer({ at, pulseKey = 0, parked = false, onSide, inverted = false }: PointerProps) {
  const board = useBoard();
  const reduced = useReducedMotion();
  const rect = useTargetRect(at);
  const visible = at !== null && rect !== null;
  const surfaceWidth = board.surface?.offsetWidth ?? 0;
  const side: "left" | "right" | null = visible && surfaceWidth ? (rect.x + rect.width / 2 < surfaceWidth / 2 ? "left" : "right") : null;
  useEffect(() => {
    onSide?.(parked ? null : side);
  }, [side, parked, onSide]);
  const [last, setLast] = useState({ x: 40, y: 40 });
  // A table cell is pointed at from its left edge with the smaller hand (M10, S1, G13: left −2, top 12, 30×39);
  // a whole chalk line from its start (G2: left 0, the hand under the line).
  const atCell = at !== null && "cell" in at;
  const atLine = !atCell && at !== null && "text" in at && !("place" in at && at.place) && rect !== null && rect.width > 120;
  const scale = atCell ? 0.75 : 1;
  if (rect) {
    // the chalk touches the target's bottom-centre; the hand hangs below it
    const next = atCell ? { x: rect.x - 2, y: rect.y + 12 } : atLine ? { x: rect.x, y: rect.y + rect.height - 4 } : inverted ? { x: rect.x + rect.width / 2 - HAND_W / 2, y: rect.y - HAND_H - 4 } : { x: rect.x + rect.width / 2 - HAND_W / 2, y: rect.y + rect.height - 6 };
    if (next.x !== last.x || next.y !== last.y) setLast(next);
  }
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (pulseKey) setPulse(pulseKey);
  }, [pulseKey]);
  if (!board.overlay) return null;
  const parkedPos = { x: (board.surface?.offsetWidth ?? 400) - HAND_W - 8, y: (board.surface?.offsetHeight ?? 200) - HAND_H - 8 };
  // Parked (the child's turn): the hand rests where it last pointed (M3, M4); it only backs off to the corner when there is nothing to rest at.
  const pos = parked && !last ? parkedPos : last;
  return createPortal(
    <motion.div
      data-testid="pointer"
      data-parked={parked || undefined}
      data-side={side ?? undefined}
      initial={false}
      animate={{ left: pos.x, top: pos.y, opacity: visible || parked ? (parked ? 0.85 : 1) : 0, rotate: inverted ? 180 : 0, scale }}
      transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
      style={{ position: "absolute", width: HAND_W, height: HAND_H, pointerEvents: "none", zIndex: 8, transformOrigin: "top left" }}
      aria-hidden
    >
      {pulse > 0 && !reduced && (
        <motion.div
          key={pulse}
          initial={{ opacity: 0.45, scale: 1 }}
          animate={{ opacity: 0, scale: 1.7 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ position: "absolute", left: 8, top: -10, width: 24, height: 24, borderRadius: "50%", border: "3px solid var(--color-saffron)" }}
        />
      )}
      <ChalkHand />
    </motion.div>,
    board.overlay,
  );
}
