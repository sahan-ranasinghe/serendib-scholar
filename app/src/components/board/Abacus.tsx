"use client";

/**
 * The bead abacus, ported from Abacus.dc.html: one SVG (viewBox 320×170),
 * rods 70 units apart on a wood base, beads as 38×14 ellipses stacked 13
 * apart, a saffron-soft glow rect on the named rod with the others veiled
 * to 38 %, the place values beneath in Yaldevi, and the number forming
 * under the rods in StrokeNum — Zara's in marker blue, the child's in green.
 *
 * Vocabulary:
 *   show { digits, startEmpty?, animate? }  → props digits/shown/animate
 *   bead_add { rod, count }                 → shown[rod] += count (parent)
 *   rod_glow { rod, rods? }                 → glowRods (a group named together glows together)
 *   child_answer_overlay { text }           → childAnswer
 *   clear_overlay                           → childAnswer = null
 *
 * TOUCH: drag a bead from the tray (a 72 px paper panel beside the rods)
 * onto a rod; tap the beads on a rod to take the top one off; on a
 * rod-tap question every rod is an invisible 48 px hit column (rule c).
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HandNumber } from "./HandNumber";
import { useTargetRef } from "./targets";
import { BOARD, ROD_LABELS, ROD_VALUE_LABELS, SPRING_BOUNCY, FONT_LABEL } from "./tokens";
import { playSound } from "./sound";
import { hitTest, useDrag, type DragPoint } from "./useDrag";

export interface AbacusProps {
  /** Target beads per rod, left→right. */
  digits: number[];
  /** Beads currently on each rod. */
  shown: number[];
  /** Land the remaining beads on their own, rod by rod. */
  animate?: boolean;
  glowRods?: number[];
  /** The child's number, in green, beneath the rods. */
  childAnswer?: string | null;
  readout?: "asFilled" | "live" | "none";
  interactive?: boolean;
  /** Touch: the beads changed (a new `shown`). */
  onChange?: (shown: number[]) => void;
  /** Fires per bead as `animate` lands them. */
  onBeadLanded?: (rod: number, count: number) => void;
  /** 240 px wide instead of 280 (an expansion shares the board). */
  compact?: boolean;
  /** The child answers by tapping a rod (valueOrPlace): every rod is a hit column. */
  pickRods?: boolean;
  onPickRod?: (rod: number) => void;
  /** The whole abacus is the answer surface (a build): it breathes. */
  glow?: boolean;
  /** 200 px wide (the pad docked beneath, a 360 px phone). */
  dense?: boolean;
  /** Width in px, when the caller decides (the gallery). */
  width?: number;
}

const BEAD_STEP_MS = 120;
const MAX_BEADS = 9;
const VB_W = 320;
const VB_H = 170;

export function Abacus({
  digits,
  shown,
  animate = false,
  glowRods = [],
  childAnswer = null,
  readout = "asFilled",
  interactive = false,
  onChange,
  onBeadLanded,
  compact = false,
  pickRods = false,
  onPickRod,
  glow: glowAll = false,
  dense = false,
  width,
}: AbacusProps) {
  const reduced = useReducedMotion();
  const rods = digits.length;
  const labels = ROD_LABELS.slice(ROD_LABELS.length - rods);
  const valueLabels = ROD_VALUE_LABELS.slice(ROD_VALUE_LABELS.length - rods);
  const colours = rods > 4 ? [BOARD.beadExtra, ...BOARD.beads] : BOARD.beads.slice(BOARD.beads.length - rods);
  const w = width ?? (dense ? 200 : compact ? 240 : 280);
  const scale = w / VB_W;

  // `animate`: walk bead by bead from `shown` up to `digits`.
  const [selfShown, setSelfShown] = useState<number[]>(() => digits.map((d, i) => Math.min(d, shown[i] ?? 0)));
  const animKey = digits.join(",");
  const animKeyRef = useRef(animKey);
  useEffect(() => {
    if (!animate) return;
    if (animKeyRef.current !== animKey) {
      animKeyRef.current = animKey;
      setSelfShown(digits.map((d, i) => Math.min(d, shown[i] ?? 0)));
    }
    const timer = setInterval(
      () => {
        setSelfShown((current) => {
          const next = [...current];
          for (let rod = 0; rod < digits.length; rod += 1) {
            if ((next[rod] ?? 0) < (digits[rod] ?? 0)) {
              next[rod] = (next[rod] ?? 0) + 1;
              onBeadLanded?.(rod, next[rod]!);
              return next;
            }
          }
          clearInterval(timer);
          return current;
        });
      },
      reduced ? 0 : BEAD_STEP_MS,
    );
    return () => clearInterval(timer);
    // `shown` is the starting point, read when the animation (re)starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, animKey]);
  const effective = animate ? selfShown : shown;

  const readoutDigits = useMemo(() => {
    if (readout === "none") return null;
    return digits.map((digit, rod) => {
      const count = effective[rod] ?? 0;
      if (readout === "live") return count;
      const leftDone = digits.slice(0, rod).every((d, r) => (effective[r] ?? 0) >= d);
      return leftDone && count >= digit ? digit : null;
    });
  }, [digits, effective, readout]);
  const complete = digits.every((d, rod) => (effective[rod] ?? 0) >= d);
  const number = complete ? digits.join("") : effective.join("");
  // The whole abacus answers to its number: a ring on {number:5421} rings the frame (rule g).
  const rootRef = useTargetRef(["component:abacus", "text:abacus", ...(complete ? [`number:${Number(number)}`] : [])]);
  const childDigits = childAnswer && childAnswer.length === rods && /^\d+$/u.test(childAnswer) ? childAnswer.split("") : null;

  // --- touch: drag from the tray, tap to remove ---------------------------
  const [ghost, setGhost] = useState<DragPoint | null>(null);
  const [overRod, setOverRod] = useState<number | null>(null);
  const drag = useDrag<"tray">({
    onStart: (_, point) => setGhost(point),
    onMove: (_, point) => {
      setGhost(point);
      const hit = hitTest(point, "data-rod");
      setOverRod(hit ? Number(hit.value) : null);
    },
    onEnd: (_, point, moved) => {
      setGhost(null);
      setOverRod(null);
      if (!moved) return;
      const hit = hitTest(point, "data-rod");
      if (!hit) return;
      const rod = Number(hit.value);
      if ((shown[rod] ?? 0) >= MAX_BEADS) return;
      const next = shown.map((n, i) => (i === rod ? n + 1 : n));
      playSound("beadClick");
      onChange?.(next);
    },
  });
  const removeTop = (rod: number) => {
    if (!interactive || (shown[rod] ?? 0) === 0) return;
    playSound("beadClick");
    onChange?.(shown.map((n, i) => (i === rod ? n - 1 : n)));
  };

  const anyGlow = glowRods.length > 0;
  const rodX = (i: number) => (rods === 4 ? 55 + i * 70 : (VB_W / rods) * (i + 0.5));

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flex: "none" }}>
      <div
        ref={rootRef}
        className={glowAll ? "wb-glow" : undefined}
        data-testid="abacus"
        data-number={number}
        style={{ width: w, flex: "none", borderRadius: 14 }}
      >
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={w} style={{ display: "block", overflow: "visible" }}>
          {digits.map((digit, rod) => {
            const x = rodX(rod);
            const count = effective[rod] ?? 0;
            const isGlow = glowRods.includes(rod);
            const tappable = interactive || pickRods;
            return (
              <Rod
                key={rod}
                rod={rod}
                x={x}
                colour={colours[rod] ?? BOARD.beadExtra}
                count={count}
                digit={digit}
                label={labels[rod] ?? ""}
                glow={isGlow}
                veiled={anyGlow && !isGlow}
                hover={overRod === rod}
                tappable={tappable}
                onTap={() => (pickRods ? onPickRod?.(rod) : removeTop(rod))}
                reduced={!!reduced}
              />
            );
          })}
          {/* the wood base and its underside */}
          <rect x="8" y="146" width="304" height="20" rx="6" fill={BOARD.wood} />
          <rect x="8" y="160" width="304" height="6" rx="3" fill={BOARD.woodDark} />
        </svg>
        {/* the place values, beneath the rods, never inside */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${rods}, 1fr)`, textAlign: "center", font: `600 20px/1.5 ${FONT_LABEL}`, color: BOARD.inkSoft }}>
          {valueLabels.map((label, rod) => (
            <div key={rod} style={{ opacity: anyGlow && !glowRods.includes(rod) ? 0.38 : 1 }}>
              {label}
            </div>
          ))}
        </div>
        {/* the number forming beneath: Zara's in blue, the child's in green */}
        {(readoutDigits || childDigits) && (
          <div data-testid="abacus-readout" style={{ display: "grid", gridTemplateColumns: `repeat(${rods}, 1fr)`, justifyItems: "center", marginTop: 4 }}>
            {digits.map((_, rod) => {
              const child = childDigits?.[rod];
              const d = child ?? readoutDigits?.[rod] ?? null;
              return (
                <div key={rod} style={{ height: 40 * scale + 0, display: "flex", alignItems: "center" }}>
                  {/* a forming number prints its landed digits only — an empty rod stays blank ("5___") */}
                  {d !== null && d !== undefined && !(child === undefined && readout === "asFilled" && d === 0 && (effective[rod] ?? 0) === 0) && <HandNumber key={`${rod}:${d}:${child ? "c" : "z"}`} text={d} size={40 * scale} color={child ? BOARD.markerGreen : BOARD.markerBlue} budgetMs={260} registerNumbers={false} />}
                </div>
              );
            })}
          </div>
        )}
        {/* a short answer (a count, a value) the child gave, in green */}
        <AnimatePresence>
          {childAnswer && !childDigits && (
            <motion.div
              key={childAnswer}
              data-testid="abacus-child-answer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ ...SPRING_BOUNCY }}
              style={{ display: "flex", justifyContent: "center", marginTop: 4 }}
            >
              <HandNumber text={childAnswer} size={34 * scale + 6} color={BOARD.markerGreen} budgetMs={250} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* the bead tray: paper, beside the rods — the child's drag source, and where her beads come from while they land (M6) */}
      {(interactive || animate || effective.some((n, i) => n < (digits[i] ?? 0))) && (
        <div
          className="wb-touch"
          role="button"
          aria-label="drag a bead onto a rod"
          data-testid="abacus-tray-bead"
          {...drag("tray")}
          style={{
            width: 72,
            padding: "10px 8px",
            background: BOARD.paper,
            border: `2px solid ${BOARD.ink18}`,
            borderRadius: 12,
            boxShadow: "var(--shadow-paper)",
            display: "grid",
            gap: 8,
            justifyItems: "center",
            flex: "none",

            minHeight: 56,
          }}
        >
          {[colours[0], colours[0], colours[1], colours[2], colours[3]].map((c, i) => (
            <div key={i} style={{ width: 38, height: 14, borderRadius: "50%", background: c, border: "1.5px solid rgba(27,27,27,.18)" }} />
          ))}
          <div style={{ font: `600 20px/1.5 ${FONT_LABEL}`, color: BOARD.inkSoft }}>පබළු</div>
          {ghost &&
            createPortal(
              <div style={{ position: "fixed", left: ghost.x - 21, top: ghost.y - 8 - 14, pointerEvents: "none", zIndex: 1000, filter: "drop-shadow(0 14px 10px rgba(27,27,27,.3))" }}>
                <div style={{ width: 42, height: 16, borderRadius: "50%", background: overRod !== null ? (colours[overRod] ?? BOARD.beadExtra) : BOARD.beads[3], border: "1.5px solid rgba(27,27,27,.18)" }} />
              </div>,
              document.body,
            )}
        </div>
      )}
    </div>
  );
}

function Rod({
  rod,
  x,
  colour,
  count,
  digit,
  label,
  glow,
  veiled,
  hover,
  tappable,
  onTap,
  reduced,
}: {
  rod: number;
  x: number;
  colour: string;
  count: number;
  digit: number;
  label: string;
  glow: boolean;
  veiled: boolean;
  hover: boolean;
  tappable: boolean;
  onTap: () => void;
  reduced: boolean;
}) {
  const ref = useTargetRef<SVGGElement>(`rod:${rod}`);
  return (
    <motion.g
      ref={ref}
      data-rod={rod}
      data-testid={`abacus-rod-${rod}`}
      data-glow={glow || undefined}
      animate={{ opacity: veiled ? 0.38 : 1 }}
      transition={{ duration: 0.3 }}
      role={tappable ? "button" : undefined}
      aria-label={tappable ? `${label}: ${count} beads — tap` : `${label}: ${count} of ${digit}`}
      onClick={tappable ? onTap : undefined}
      style={{ cursor: tappable ? "pointer" : undefined }}
    >
      {/* the glow: saffron-soft, on the named rod */}
      <rect x={x - 29} y="6" width="58" height="150" rx="14" fill={glow ? BOARD.saffronSoft : hover ? "rgba(233,180,76,.18)" : "none"} stroke={glow ? BOARD.chalkYellow : "none"} strokeWidth="3" />
      {/* the 48 px hit column, invisible */}
      <rect x={x - 31} y="0" width="62" height="158" fill="transparent" />
      <line x1={x} y1="18" x2={x} y2="146" stroke={BOARD.woodDark} strokeWidth="4" strokeLinecap="round" />
      <AnimatePresence initial={false}>
        {Array.from({ length: count }).map((_, k) => (
          <motion.ellipse
            key={k}
            cx={x}
            rx="19"
            ry="7"
            fill={colour}
            stroke="rgba(27,27,27,.18)"
            strokeWidth="1.5"
            initial={reduced ? { cy: 138 - k * 13, opacity: 0 } : { cy: 26, opacity: 0.85 }}
            animate={{ cy: 138 - k * 13, opacity: 1 }}
            exit={{ cy: 26, opacity: 0, transition: { duration: 0.15 } }}
            transition={SPRING_BOUNCY}
            onAnimationStart={() => playSound("beadClick")}
          />
        ))}
      </AnimatePresence>
    </motion.g>
  );
}
