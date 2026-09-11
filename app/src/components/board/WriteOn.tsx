"use client";

/**
 * Sinhala words in the Noto Sans Sinhala face, revealed with a left-to-
 * right wipe as if written — the words' counterpart to HandNumber's
 * stroke reveal. Never longer than 600 ms.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, type CSSProperties } from "react";
import { BOARD, FONT_SINHALA, MAX_MS } from "./tokens";
import { playSound } from "./sound";

export interface WriteOnProps {
  text: string;
  size?: number;
  color?: string;
  weight?: number;
  write?: boolean;
  delayMs?: number;
  durationMs?: number;
  className?: string;
  style?: CSSProperties;
}

export function WriteOn({
  text,
  size = 28,
  color = BOARD.markerBlue,
  weight = 700,
  write = true,
  delayMs = 0,
  durationMs = 420,
  className,
  style,
}: WriteOnProps) {
  const reduced = useReducedMotion();
  const animate = write && !reduced;
  useEffect(() => {
    if (animate) playSound("chalk");
    // write-once: only the text matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <motion.span
      key={text}
      className={`write-on font-sinhala ${className ?? ""}`}
      style={{
        display: "inline-block",
        fontFamily: FONT_SINHALA,
        fontSize: size,
        fontWeight: weight,
        color,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        ...style,
      }}
      initial={animate ? { clipPath: "inset(-10% 100% -10% 0)" } : false}
      animate={{ clipPath: "inset(-10% 0% -10% 0)" }}
      transition={{ duration: Math.min(durationMs, MAX_MS) / 1000, delay: delayMs / 1000, ease: [0.35, 0, 0.25, 1] }}
    >
      {text}
    </motion.span>
  );
}
