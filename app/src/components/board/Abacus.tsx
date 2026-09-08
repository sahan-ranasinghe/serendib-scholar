"use client";

/**
 * The four-rod bead abacus — rods දා සි ද එ on a wooden base.
 *
 * Vocabulary:
 *   show { digits, startEmpty?, animate? }  → props digits/shown/animate
 *   bead_add { rod, count }                 → shown[rod] += count (parent)
 *   rod_glow { rod }                        → glowRod
 *   child_answer_overlay { text }           → childAnswer
 *   clear_overlay                           → childAnswer = null
 *
 * Beads slide down onto a rod one at a time with a click; `animate`
 * lands the beads from `shown` up to `digits` on its own, 120 ms a
 * bead, skipping rods that already carry theirs. The digits form beneath
 * the rods as each rod completes, left to right ("asFilled"), or track
 * every bead ("live") — which is what touch mode needs.
 *
 * TOUCH: drag a bead from the tray onto a rod (it takes the rod's
 * colour); tap the beads on a rod to take the top one off. Every hit area
 * is a whole rod column, never a single 22-px bead.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HandNumber } from "./HandNumber";
import { WriteOn } from "./WriteOn";
import { useTargetRef } from "./targets";
import { BOARD, ROD_LABELS, SPRING, SPRING_BOUNCY, TOUCH_MIN } from "./theme";
import { playSound } from "./sound";
import { hitTest, useDrag, type DragPoint } from "./useDrag";

export interface AbacusProps {
  /** Target beads per rod, left→right. */
  digits: number[];
  /** Beads currently on each rod. */
  shown: number[];
  /** Land the remaining beads on their own, rod by rod. */
  animate?: boolean;
  glowRod?: number | null;
  /** The child's number, in the second colour, beneath the rods. */
  childAnswer?: string | null;
  readout?: "asFilled" | "live" | "none";
  interactive?: boolean;
  /** Touch: the beads changed (a new `shown`). */
  onChange?: (shown: number[]) => void;
  /** Fires per bead as `animate` lands them. */
  onBeadLanded?: (rod: number, count: number) => void;
  /** Rendered smaller — for the expansion runs where it shares the board. */
  compact?: boolean;
}

const BEAD_STEP_MS = 120;
const MAX_BEADS = 9;

export function Abacus({
  digits,
  shown,
  animate = false,
  glowRod = null,
  childAnswer = null,
  readout = "asFilled",
  interactive = false,
  onChange,
  onBeadLanded,
  compact = false,
}: AbacusProps) {
  const reduced = useReducedMotion();
  const rods = digits.length;
  const labels = ROD_LABELS.slice(ROD_LABELS.length - rods);
  const colours = rods > 4 ? [BOARD.beadExtra, ...BOARD.beads] : BOARD.beads.slice(BOARD.beads.length - rods);

  // `animate`: walk bead by bead from `shown` up to `digits`. Rods that
  // already carry their beads are left alone — a re-stage of a half-built
  // abacus must never re-land what the child just watched land.
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
  const complete = readoutDigits?.every((d) => d !== null) ?? false;
  const number = complete ? readoutDigits!.join("") : effective.join("");

  const rootRef = useTargetRef(["component:abacus", "text:abacus"]);
  const readoutRef = useTargetRef(readoutDigits ? [`number:${Number(number)}`] : null);

  // --- touch: a bead from the tray, or the top bead off a rod ---------
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

  const rodHeight = compact ? 110 : 150;
  const beadW = compact ? 34 : 44;
  const beadH = compact ? 18 : 22;

  return (
    <div
      ref={rootRef}
      data-testid="abacus"
      data-number={number}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: compact ? 380 : 520 }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "3%", width: "100%", padding: "0 3%" }}>
        {digits.map((digit, rod) => (
          <Rod
            key={rod}
            rod={rod}
            label={labels[rod] ?? ""}
            colour={colours[rod] ?? BOARD.beadExtra}
            count={effective[rod] ?? 0}
            glow={glowRod === rod}
            dim={glowRod !== null && glowRod !== rod}
            hover={overRod === rod}
            height={rodHeight}
            beadW={beadW}
            beadH={beadH}
            interactive={interactive}
            onTap={() => removeTop(rod)}
            reduced={!!reduced}
            digit={digit}
          />
        ))}
      </div>
      {/* the base: one wooden bar with the labels printed on it */}
      <div
        style={{
          width: "100%",
          height: compact ? 12 : 16,
          borderRadius: 6,
          marginTop: -2,
          background: `linear-gradient(180deg, ${BOARD.woodLight}, ${BOARD.wood} 55%, ${BOARD.woodDark})`,
          boxShadow: "0 4px 8px rgba(40,25,10,0.3), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
        aria-hidden
      />
      {readoutDigits && (
        <div
          ref={readoutRef}
          data-testid="abacus-readout"
          style={{ display: "flex", justifyContent: "center", gap: "3%", width: "100%", padding: "6px 3% 0", minHeight: compact ? 30 : 38 }}
        >
          {readoutDigits.map((d, rod) => (
            <div key={rod} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              {d !== null && <HandNumber key={`${rod}:${d}`} text={d} size={compact ? 26 : 34} budgetMs={260} />}
            </div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {childAnswer && (
          <motion.div
            key={childAnswer}
            data-testid="abacus-child-answer"
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ ...SPRING, duration: 0.25 }}
            style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}
          >
            <WriteOn text="ඔයාගේ උත්තරය:" size={compact ? 16 : 20} color={BOARD.markerGreen} write={false} />
            <HandNumber text={childAnswer} size={compact ? 28 : 36} color={BOARD.markerGreen} budgetMs={250} />
          </motion.div>
        )}
      </AnimatePresence>
      {interactive && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }} data-testid="abacus-tray">
          <WriteOn text="පබළු:" size={16} color={BOARD.inkSoft} write={false} />
          <div
            className="wb-touch"
            role="button"
            aria-label="drag a bead onto a rod"
            data-testid="abacus-tray-bead"
            {...drag("tray")}
            style={{
              minWidth: TOUCH_MIN,
              minHeight: TOUCH_MIN,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 24,
              background: "rgba(0,0,0,0.05)",
            }}
          >
            <Bead colour="#9A8A7A" w={beadW} h={beadH} still />
          </div>
          {ghost &&
            createPortal(
              <div
                style={{
                  position: "fixed",
                  left: ghost.x - beadW / 2,
                  top: ghost.y - beadH / 2 - 12,
                  pointerEvents: "none",
                  zIndex: 1000,
                  filter: "drop-shadow(0 10px 10px rgba(0,0,0,0.35))",
                  transform: "scale(1.15)",
                }}
              >
                <Bead colour={overRod !== null ? (colours[overRod] ?? BOARD.beadExtra) : "#9A8A7A"} w={beadW} h={beadH} still />
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
  label,
  colour,
  count,
  digit,
  glow,
  dim,
  hover,
  height,
  beadW,
  beadH,
  interactive,
  onTap,
  reduced,
}: {
  rod: number;
  label: string;
  colour: string;
  count: number;
  digit: number;
  glow: boolean;
  dim: boolean;
  hover: boolean;
  height: number;
  beadW: number;
  beadH: number;
  interactive: boolean;
  onTap: () => void;
  reduced: boolean;
}) {
  const ref = useTargetRef<HTMLDivElement>(`rod:${rod}`);
  return (
    <motion.div
      ref={ref}
      data-rod={rod}
      data-testid={`abacus-rod-${rod}`}
      data-glow={glow || undefined}
      animate={{ opacity: dim ? 0.55 : 1 }}
      transition={{ duration: 0.3 }}
      style={{ flex: 1, minWidth: TOUCH_MIN, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}
    >
      {/* the glow: a chalk-yellow halo behind the named rod */}
      <motion.div
        aria-hidden
        initial={false}
        animate={{ opacity: glow ? 1 : hover ? 0.5 : 0, scale: glow ? 1 : 0.92 }}
        transition={{ duration: 0.3 }}
        style={{
          position: "absolute",
          inset: "-6px -4px 8px",
          borderRadius: 18,
          background: `radial-gradient(ellipse at 50% 70%, ${BOARD.chalkYellowSoft}, rgba(243,198,75,0.08) 70%, transparent)`,
          boxShadow: `0 0 26px ${BOARD.chalkYellowSoft}`,
        }}
      />
      <div
        className={interactive ? "wb-tap" : undefined}
        onClick={interactive ? onTap : undefined}
        role={interactive ? "button" : undefined}
        aria-label={interactive ? `${label}: ${count} beads — tap to remove one` : `${label}: ${count} of ${digit}`}
        style={{
          position: "relative",
          height,
          width: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        {/* the pole */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: 0,
            width: 7,
            height: "100%",
            borderRadius: "4px 4px 0 0",
            background: `linear-gradient(90deg, ${BOARD.woodDark}, ${BOARD.woodLight} 45%, ${BOARD.woodDark})`,
            boxShadow: "0 0 3px rgba(0,0,0,0.3)",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column-reverse", alignItems: "center" }}>
          <AnimatePresence initial={false}>
            {Array.from({ length: count }).map((_, i) => (
              <motion.div
                key={i}
                layout
                initial={reduced ? { opacity: 0 } : { y: -(height - i * (beadH - 2) - beadH), opacity: 0.6, scaleY: 0.92 }}
                animate={{ y: 0, opacity: 1, scaleY: 1 }}
                exit={{ y: -40, opacity: 0, transition: { duration: 0.15 } }}
                transition={SPRING_BOUNCY}
                onAnimationStart={() => playSound("beadClick")}
                style={{ marginBottom: -2 }}
              >
                <Bead colour={colour} w={beadW} h={beadH} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
      {/* the rod's name, printed on the base */}
      <div
        style={{
          marginTop: 4,
          fontSize: beadH < 20 ? 14 : 17,
          fontWeight: 700,
          color: glow ? BOARD.ink : "rgba(42,36,24,0.8)",
          lineHeight: 1.2,
          textShadow: glow ? `0 0 8px ${BOARD.chalkYellow}` : undefined,
        }}
        className="font-sinhala"
      >
        {label}
      </div>
    </motion.div>
  );
}

function Bead({ colour, w, h, still = false }: { colour: string; w: number; h: number; still?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        width: w,
        height: h,
        borderRadius: "50%",
        background: `radial-gradient(ellipse at 35% 30%, #ffffffaa, ${colour} 40%, ${colour})`,
        boxShadow: still ? "0 1px 2px rgba(0,0,0,0.3)" : "0 2px 3px rgba(0,0,0,0.35), inset 0 -2px 3px rgba(0,0,0,0.25)",
        border: "1px solid rgba(0,0,0,0.18)",
      }}
    />
  );
}
