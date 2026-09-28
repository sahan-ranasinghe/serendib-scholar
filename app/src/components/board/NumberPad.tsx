"use client";

/**
 * The number pad, from the design (rule e0): two rows of six 56×56 keys
 * on a wood dock — 1–5 ⌫ over 6–0 ✓ — docked at the foot of the board
 * (the content inset's bottom becomes 190 px while it is). Top-row keys
 * round at the top, bottom-row keys at the bottom; ✓ is the only teal key.
 *
 * THE PAD'S CONTRACT (23 Sep 2026, the director's demo — "999 + 1" closed
 * after 100): it submits on ✓ and on nothing else; it never closes itself
 * while it holds a digit; it takes up to six digits; one tap is one digit.
 * The pad used to cancel on a double-click, and two taps on the same key
 * inside the browser's double-tap window (the two 0s of 1000) ARE a
 * double-click — the pad vanished with the digits in it. There is no cancel
 * gesture now: the pad leaves with the turn, or with its ✓. A tap delivered twice is dropped by the app-wide
 * single-fire guard (src/lib/singleFire.ts); the digit keys and ⌫ are marked data-tap-repeat there, so two real taps
 * on one key — the two 0s — are two digits however quick.
 */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBoard } from "./targets";
import { BOARD, FONT_SINHALA, FONT_LATIN, EASE_SPRING } from "./tokens";
import { playSound } from "./sound";

export interface NumberPadProps {
  onCommit: (value: string) => void;
  label?: string;
  /** Docked at the foot (the board's footer). */
  docked?: boolean;
  /** Reports the digits so far — the cell or slot being answered shows them with a caret (the design's pad has no readout of its own). */
  onChange?: (value: string) => void;
}

/**
 * The pad takes up to six digits whatever the answer's length: a child who
 * types 10000 for a four-digit answer is judged wrong like anyone else, never
 * blocked at the fourth key (which would also give the length away). ⌫
 * always works.
 */
export const MAX_DIGITS = 6;

const TOP = ["1", "2", "3", "4", "5", "⌫"] as const;
const BOTTOM = ["6", "7", "8", "9", "0", "✓"] as const;

export function NumberPad({ onCommit, label, docked = false, onChange }: NumberPadProps) {
  const [value, setValueState] = useState("");
  const board = useBoard();
  const setValue = (next: string | ((v: string) => string)) => {
    setValueState((v) => {
      const out = typeof next === "function" ? next(v) : next;
      onChange?.(out);
      board.noteInput("pad", out.length > 0);
      return out;
    });
  };
  useEffect(() => {
    if (!docked) return;
    board.noteDock(1);
    return () => board.noteDock(-1);
  }, [docked, board]);
  // The pad leaving (committed, the turn over) clears its input claim.
  useEffect(() => () => board.noteInput("pad", false), [board]);
  const press = (key: string) => {
    if (key === "⌫") {
      setValue((v) => v.slice(0, -1));
      return;
    }
    if (key === "✓") {
      if (!value) return;
      onCommit(value);
      return;
    }
    playSound("beadClick");
    setValue((v) => (v.length >= MAX_DIGITS ? v : v + key));
  };
  const keys = [...TOP, ...BOTTOM];
  const pad = (
    <motion.div
      data-testid="number-pad"
      data-docked={docked || undefined}
      data-value={value}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: [...EASE_SPRING] }}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 56px)",
        gap: 4,
        padding: "6px 8px 0",
        background: BOARD.wood,
        borderRadius: "12px 12px 0 0",
        boxShadow: "0 -6px 14px rgba(27,27,27,.15)",
        width: "max-content",
        position: "relative",
        // No double-tap zoom over the keys: the two 0s of 1000 are two digits, not a gesture.
        touchAction: "manipulation",
      }}
    >
      <span data-testid="number-pad-value" aria-label={label} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {value}
      </span>
      {keys.map((key, i) => {
        const top = i < 6;
        const tick = key === "✓";
        const back = key === "⌫";
        return (
          <button
            key={key}
            type="button"
            className="wb-tap"
            aria-label={tick ? "done" : back ? "backspace" : key}
            data-tap-repeat={tick ? undefined : true}
            onClick={() => press(key)}
            style={{
              width: 56,
              height: 56,
              border: 0,
              background: tick ? BOARD.teal : BOARD.paper,
              color: tick ? "#fff" : back ? BOARD.inkSoft : BOARD.ink,
              borderRadius: top ? "10px 10px 0 0" : "0 0 6px 6px",
              boxShadow: tick ? "0 2px 0 var(--color-teal-dark)" : "0 2px 0 #D8D1C2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: tick ? `700 22px/1 ${FONT_LATIN}` : back ? `700 20px/1 ${FONT_LATIN}` : `700 26px/1 ${FONT_SINHALA}`,
              cursor: "pointer",
              opacity: tick && !value ? 0.6 : 1,
            }}
          >
            {key}
          </button>
        );
      })}
    </motion.div>
  );
  return docked && board.dock ? createPortal(pad, board.dock) : pad;
}
