"use client";

/**
 * What the board does when the child answers.
 *
 *   correct    a soft chime and a short sparkle at the answer; the
 *              element settles (a 4 % breath, then still).
 *   wrong      a gentle side-to-side wobble and a low tone. Nothing red,
 *              nothing punitive — the answer simply did not sit.
 *   celebrate  a confetti burst — once per concept, never per answer.
 *
 * Fire by bumping `nonce` with a `kind`; `at` says where (any Target).
 * The wobble and the settle run on the target element itself with the
 * Web Animations API, so no primitive has to know about feedback.
 */
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBoard, type Target } from "./targets";
import { BOARD } from "./theme";
import { playSound } from "./sound";

export type FeedbackKind = "correct" | "wrong" | "celebrate";

export interface FeedbackFXProps {
  kind: FeedbackKind | null;
  at?: Target | null;
  nonce: number;
}

const SPARKS = 10;
const CONFETTI = 90;
const CONFETTI_MS = 600;

export function FeedbackFX({ kind, at = null, nonce }: FeedbackFXProps) {
  const board = useBoard();
  const [sparkle, setSparkle] = useState<{ key: number; x: number; y: number } | null>(null);
  const [confetti, setConfetti] = useState<number>(0);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const fire = () => {
    if (!kind) return;
    const element = at ? board.resolve(at) : null;
    const rect = element ? board.measure(element) : null;
    const centre = rect
      ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      : { x: (board.surface?.offsetWidth ?? 400) / 2, y: (board.surface?.offsetHeight ?? 200) / 2 };
    if (kind === "correct") {
      playSound("chime");
      setSparkle({ key: nonce, x: centre.x, y: centre.y });
      if (element && !reduced) {
        (element as HTMLElement).animate?.(
          [{ transform: "scale(1)" }, { transform: "scale(1.04)", offset: 0.4 }, { transform: "scale(1)" }],
          { duration: 300, easing: "ease-out" },
        );
      }
    } else if (kind === "wrong") {
      playSound("wobble");
      if (element && !reduced) {
        (element as HTMLElement).animate?.(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-7px)" },
            { transform: "translateX(6px)" },
            { transform: "translateX(-4px)" },
            { transform: "translateX(3px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 400, easing: "ease-in-out" },
        );
      }
    } else {
      playSound("chime");
      setConfetti(nonce);
    }
  };

  useEffect(() => {
    if (!kind || nonce === 0) return;
    const frame = requestAnimationFrame(() => fire());
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);


  // Confetti on a canvas: 90 pieces, gravity, done inside 600 ms.
  useEffect(() => {
    if (!confetti || !canvas.current || reduced) return;
    const el = canvas.current;
    const width = (el.width = el.offsetWidth);
    const height = (el.height = el.offsetHeight);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const colours = [...BOARD.beads, BOARD.chalkYellow, BOARD.markerBlue];
    const pieces = Array.from({ length: CONFETTI }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const speed = 380 + Math.random() * 420;
      return {
        x: width / 2,
        y: height * 0.55,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 6,
        h: 4 + Math.random() * 5,
        spin: (Math.random() - 0.5) * 20,
        angle: Math.random() * Math.PI,
        colour: colours[Math.floor(Math.random() * colours.length)]!,
      };
    });
    let start: number | null = null;
    let last = 0;
    let frame = 0;
    const tick = (now: number) => {
      if (start === null) {
        start = now;
        last = now;
      }
      const t = now - start;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);
      const fade = t > CONFETTI_MS * 0.7 ? 1 - (t - CONFETTI_MS * 0.7) / (CONFETTI_MS * 0.3) : 1;
      for (const p of pieces) {
        p.vy += 1500 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < CONFETTI_MS) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [confetti, reduced]);

  if (!board.overlay) return null;
  return createPortal(
    <>
      {sparkle && (
        <div key={sparkle.key} data-testid="feedback-sparkle" style={{ position: "absolute", left: sparkle.x, top: sparkle.y, width: 0, height: 0 }}>
          {Array.from({ length: SPARKS }).map((_, i) => {
            const angle = (i / SPARKS) * Math.PI * 2;
            const r = 34 + (i % 2) * 14;
            return (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                animate={{ x: Math.cos(angle) * r, y: Math.sin(angle) * r, scale: [0, 1.1, 0], opacity: [1, 1, 0] }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                onAnimationComplete={() => i === 0 && setSparkle(null)}
                style={{
                  position: "absolute",
                  width: 10,
                  height: 10,
                  marginLeft: -5,
                  marginTop: -5,
                  borderRadius: i % 2 ? "50%" : 2,
                  background: i % 3 === 0 ? BOARD.chalkYellow : i % 3 === 1 ? BOARD.markerGreen : BOARD.beads[1],
                  boxShadow: `0 0 6px ${BOARD.chalkYellow}`,
                }}
              />
            );
          })}
        </div>
      )}
      <canvas
        ref={canvas}
        data-testid="feedback-confetti"
        data-active={confetti ? "true" : undefined}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      />
    </>,
    board.overlay,
  );
}
