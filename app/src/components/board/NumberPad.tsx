"use client";

/**
 * The pad a child types an answer on — shared by the strip, the
 * expansion and the blank table. Ten digit keys, delete, and a tick;
 * every key at least 48 px. In "digit" mode a tap commits at once (one
 * digit per column); in "number" mode the tick commits.
 */
import { motion } from "framer-motion";
import { useState } from "react";
import { BOARD, FONT_SINHALA, SPRING, TOUCH_MIN } from "./theme";
import { playSound } from "./sound";

export interface NumberPadProps {
  mode: "digit" | "number";
  onCommit: (value: string) => void;
  onCancel?: () => void;
  maxLength?: number;
  /** A short prompt above the keys, e.g. the cell being filled. */
  label?: string;
  /** Float at the board's right edge (the lesson's small board) instead of sitting in the flow. */
  docked?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"] as const;

export function NumberPad({ mode, onCommit, onCancel, maxLength = 6, label, docked = false }: NumberPadProps) {
  const [typed, setTyped] = useState("");
  const press = (key: string) => {
    playSound("beadClick");
    if (key === "⌫") {
      if (typed === "" && onCancel) onCancel();
      setTyped((t) => t.slice(0, -1));
      return;
    }
    if (key === "✓") {
      if (typed !== "") onCommit(typed);
      return;
    }
    if (mode === "digit") {
      onCommit(key);
      return;
    }
    setTyped((t) => (t.length >= maxLength ? t : t + key));
  };
  return (
    <motion.div
      role="group"
      aria-label="number pad"
      data-testid="number-pad"
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
      style={{
        ...(docked ? { position: "absolute", right: 8, top: "50%", translate: "0 -50%", zIndex: 4 } : {}),
        display: "grid",
        gridTemplateColumns: `repeat(${mode === "digit" ? 5 : 3}, ${TOUCH_MIN}px)`,
        gap: 6,
        padding: 8,
        borderRadius: 12,
        background: "rgba(255,255,255,0.55)",
        boxShadow: "0 4px 14px rgba(40,25,10,0.18), inset 0 0 0 1px rgba(30,76,153,0.25)",
        fontFamily: FONT_SINHALA,
      }}
    >
      {label && (
        <div style={{ gridColumn: "1 / -1", fontSize: 13, color: BOARD.inkSoft, textAlign: "center", minHeight: 16 }}>{label}</div>
      )}
      {mode === "number" && (
        <div
          data-testid="number-pad-display"
          style={{
            gridColumn: "1 / -1",
            minHeight: 34,
            borderRadius: 8,
            background: BOARD.surface,
            boxShadow: `inset 0 0 0 2px ${BOARD.markerBlue}`,
            color: BOARD.markerGreen,
            fontSize: 24,
            fontWeight: 700,
            textAlign: "center",
            lineHeight: "34px",
            letterSpacing: 2,
          }}
        >
          {typed || " "}
        </div>
      )}
      {KEYS.filter((key) => (mode === "digit" ? key !== "✓" && key !== "⌫" : true)).map((key) => (
        <button
          key={key}
          type="button"
          className="wb-tap"
          onClick={() => press(key)}
          aria-label={key === "⌫" ? "delete" : key === "✓" ? "done" : key}
          style={{
            minWidth: TOUCH_MIN,
            minHeight: TOUCH_MIN,
            borderRadius: 10,
            border: 0,
            background: key === "✓" ? BOARD.markerGreen : key === "⌫" ? "rgba(42,36,24,0.12)" : "#fffdf7",
            color: key === "✓" ? "#fff" : BOARD.ink,
            fontSize: 22,
            fontWeight: 700,
            boxShadow: "0 2px 0 rgba(0,0,0,0.18)",
          }}
        >
          {key}
        </button>
      ))}
    </motion.div>
  );
}
