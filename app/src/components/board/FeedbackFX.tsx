"use client";

/**
 * Feedback, from the design (rule 7):
 *   correct   — a green ✓ badge at the answer's top-right and six saffron
 *               diamonds that settle around it over 900 ms; a soft chime.
 *   wrong     — the answered element wobbles ±6 px / ±3° for 500 ms with
 *               a low tone. Nothing red, no face.
 *   celebrate — one burst of confetti per concept, bead colours only.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBoard, type Target } from "./targets";
import { BOARD } from "./tokens";
import { playSound } from "./sound";

export type FeedbackKind = "correct" | "wrong" | "celebrate";

export interface FeedbackFXProps {
  kind: FeedbackKind | null;
  at?: Target | null;
  nonce: number;
  /** Draw the green ✓ badge at the answer (off when the answer surface carries its own ✓ — a table cell, a chip). */
  badge?: boolean;
}

/** The design's six diamonds, as offsets around the answer (left, top, opacity). */
export const SPARKLES: Array<[string, string, number]> = [
  ["-16px", "-14px", 1],
  ["96%", "-12px", 0.8],
  ["104%", "60%", 0.6],
  ["50%", "-22px", 0.9],
  ["-14px", "70%", 0.5],
  ["30%", "104%", 0.7],
];
const CONFETTI = 14;
const CONFETTI_COLOURS = [BOARD.beads[0]!, BOARD.beads[1]!, BOARD.beads[2]!, BOARD.beads[3]!];

export function FeedbackFX({ kind, at = null, nonce, badge = true }: FeedbackFXProps) {
  const board = useBoard();
  const [sparkle, setSparkle] = useState<{ key: number; x: number; y: number; w: number; h: number } | null>(null);
  const [confetti, setConfetti] = useState<number>(0);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const last = useRef(0);

  useEffect(() => {
    if (!kind || nonce === 0 || nonce === last.current) return;
    last.current = nonce;
    const element = at ? board.resolve(at) : null;
    const rect = element ? board.measure(element) : null;
    const box = rect ?? { x: (board.surface?.offsetWidth ?? 400) / 2 - 44, y: (board.surface?.offsetHeight ?? 200) / 2 - 32, width: 88, height: 64 };
    if (kind === "correct") {
      playSound("chime");
      setSparkle({ key: nonce, x: box.x, y: box.y, w: box.width, h: box.height });
      const clear = setTimeout(() => setSparkle(null), 900);
      return () => clearTimeout(clear);
    }
    if (kind === "wrong") {
      playSound("wobble");
      if (element && !reduced) {
        (element as HTMLElement).animate?.(
          [
            { transform: "translateX(0) rotate(0)" },
            { transform: "translateX(-6px) rotate(-3deg)", offset: 0.2 },
            { transform: "translateX(6px) rotate(3deg)", offset: 0.4 },
            { transform: "translateX(-5px) rotate(-2.5deg)", offset: 0.6 },
            { transform: "translateX(5px) rotate(2.5deg)", offset: 0.8 },
            { transform: "translateX(0) rotate(0)" },
          ],
          { duration: 500, easing: "ease-in-out" },
        );
      }
      return;
    }
    playSound("chime");
    setConfetti(nonce);
    const clear = setTimeout(() => setConfetti(0), 1200);
    return () => clearTimeout(clear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, nonce]);

  if (!board.overlay) return null;
  return createPortal(
    <>
      <AnimatePresence>
        {sparkle && (
          <div key={sparkle.key} data-testid="feedback-sparkle" style={{ position: "absolute", left: sparkle.x, top: sparkle.y, width: sparkle.w, height: sparkle.h, pointerEvents: "none" }}>
            {badge && (
              <motion.span
                data-testid="feedback-tick"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.25, ease: [0.34, 1.3, 0.64, 1] }}
                style={{ position: "absolute", right: -12, top: -12, width: 28, height: 28, borderRadius: "50%", background: BOARD.markerGreen, color: "#fff", font: "700 17px/28px var(--font-latin)", textAlign: "center" }}
              >
                ✓
              </motion.span>
            )}
            {SPARKLES.map(([x, y, o], i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, o, o, 0], scale: [0.4, 1, 1, 0.8] }}
                transition={{ duration: 0.9, times: [0, 0.3, 0.75, 1], delay: reduced ? 0 : i * 0.05 }}
                style={{ position: "absolute", left: x, top: y, width: 10, height: 10, background: BOARD.chalkYellow, transform: "rotate(45deg)" }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {confetti > 0 && (
          <div key={confetti} data-testid="feedback-confetti" style={{ position: "absolute", left: "50%", top: "40%", width: 180, height: 64, transform: "translate(-50%, -50%)", pointerEvents: "none" }}>
            {Array.from({ length: CONFETTI }, (_, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: [0, 1, 1, 0], y: [-10, 0, 30, 60] }}
                transition={{ duration: reduced ? 0 : 1.1, times: [0, 0.2, 0.7, 1], delay: reduced ? 0 : (i % 5) * 0.04 }}
                style={{ position: "absolute", left: `${(i * 13) % 100}%`, top: `${(i * 37) % 60}%`, width: 8, height: 14, borderRadius: 2, background: CONFETTI_COLOURS[i % 4], transform: `rotate(${((i * 53) % 90) - 45}deg)` }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
    </>,
    board.overlay,
  );
}
