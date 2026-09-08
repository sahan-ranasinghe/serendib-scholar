"use client";

/**
 * A number and its expanded form: 5 421 = ▢ + ▢ + ▢ + ▢.
 *
 * Vocabulary:
 *   show { number, parts }          → props; every part starts blank
 *   part_reveal { index, value }    → parts[index] = value (Zara writes it, ✎)
 *   part_fly { fromRod, index }     → `fly`: the value floats from the
 *                                     abacus rod into its slot, then reveals
 *
 * Built to sit BENEATH an abacus on the same board — it never replaces
 * it. For part_fly the abacus must be on the board too: the flight
 * starts at the registered `rod:<fromRod>` element.
 *
 * TOUCH: tap a blank to answer on the pad.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HandNumber } from "./HandNumber";
import { NumberPad } from "./NumberPad";
import { useBoard, useTargetRef, type Rect } from "./targets";
import { BOARD, formatNumber, SPRING, TOUCH_MIN } from "./theme";
import { playSound } from "./sound";

export interface ExpansionFlight {
  fromRod: number;
  index: number;
  /** A fresh value per flight so the same slot can fly twice. */
  key: number;
}

export interface ExpansionProps {
  number: number;
  parts: Array<number | string | null>;
  fly?: ExpansionFlight | null;
  /** The flight landed: the caller should now set parts[index]. */
  onFlyDone?: (index: number, value: string) => void;
  interactive?: boolean;
  onAnswer?: (index: number, value: string) => void;
  /** The child's answers, in the second colour. */
  answered?: Array<number | string | null>;
  size?: number;
  /** Float the answer pad at the board's edge (the lesson's small board). */
  dockPad?: boolean;
}

/** The value of digit `index` of `number` — what flies and what is revealed. */
export function partValue(number: number, index: number): string {
  const digits = String(number);
  const digit = Number(digits[index] ?? 0);
  return String(digit * 10 ** (digits.length - 1 - index));
}

export function Expansion({ number, parts, fly = null, onFlyDone, interactive = false, onAnswer, answered, size = 34, dockPad = false }: ExpansionProps) {
  const board = useBoard();
  const [active, setActive] = useState<number | null>(null);
  const [flight, setFlight] = useState<{ key: number; index: number; from: Rect; to: Rect; value: string } | null>(null);
  // Values that have landed by flight, kept per number so a new `show`
  // starts blank without an effect having to clear anything.
  const [landedFor, setLandedFor] = useState<{ number: number; values: Record<number, string> }>({ number, values: {} });
  const landed = landedFor.number === number ? landedFor.values : {};
  const land = (index: number, value: string) =>
    setLandedFor((l) => ({ number, values: { ...(l.number === number ? l.values : {}), [index]: value } }));
  const rootRef = useTargetRef(["component:expansion", `number:${number}`]);

  // A new `fly`: after paint, find the rod and the slot and send the value across.
  useEffect(() => {
    if (!fly) return;
    const frame = requestAnimationFrame(() => {
      const rod = board.resolve({ rod: fly.fromRod });
      const slot = board.resolve({ part: fly.index });
      const from = rod ? board.measure(rod) : null;
      const to = slot ? board.measure(slot) : null;
      const value = partValue(number, fly.index);
      if (!from || !to) {
        // No abacus on the board: nothing to fly from, so just reveal.
        land(fly.index, value);
        onFlyDone?.(fly.index, value);
        return;
      }
      setFlight({ key: fly.key, index: fly.index, from, to, value });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly?.key]);

  return (
    <div ref={rootRef} data-testid="expansion" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: "center", gap: "0.35em", rowGap: 8 }}
      >
        <HandNumber text={formatNumber(number)} size={size} draw={false} targetBase={`text:${number}`} />
        <HandNumber text="=" size={size} draw={false} />
        {parts.map((part, index) => {
          const value = part ?? landed[index] ?? null;
          const child = answered?.[index] ?? null;
          return (
            <span key={index} style={{ display: "inline-flex", alignItems: "center", gap: "0.35em" }}>
              {index > 0 && <HandNumber text="+" size={size} draw={false} />}
              <Part
                index={index}
                value={value !== null ? String(value) : null}
                childValue={child !== null ? String(child) : null}
                size={size}
                interactive={interactive && value === null}
                active={active === index}
                onTap={() => setActive((a) => (a === index ? null : index))}
              />
            </span>
          );
        })}
      </motion.div>
      <AnimatePresence>
        {interactive && active !== null && (
          <NumberPad
            key={active}
            mode="number"
            docked={dockPad}
            onCommit={(value) => {
              onAnswer?.(active, value);
              setActive(null);
            }}
            onCancel={() => setActive(null)}
          />
        )}
      </AnimatePresence>
      {flight &&
        board.overlay &&
        createPortal(
          <motion.div
            key={flight.key}
            data-testid="expansion-flight"
            initial={{ left: flight.from.x + flight.from.width / 2, top: flight.from.y + flight.from.height * 0.4, opacity: 0.7, scale: 0.8 }}
            animate={{ left: flight.to.x + flight.to.width / 2, top: flight.to.y + flight.to.height / 2, opacity: 1, scale: 1 }}
            transition={{ ...SPRING, stiffness: 300, damping: 26 }}
            onAnimationComplete={() => {
              playSound("chalk");
              land(flight.index, flight.value);
              onFlyDone?.(flight.index, flight.value);
              setFlight(null);
            }}
            style={{ position: "absolute", transform: "translate(-50%, -50%)", pointerEvents: "none" }}
          >
            <div style={{ transform: "translate(-50%, -50%)", filter: "drop-shadow(0 6px 6px rgba(0,0,0,0.25))" }}>
              <HandNumber text={flight.value} size={size} draw={false} />
            </div>
          </motion.div>,
          board.overlay,
        )}
    </div>
  );
}

function Part({
  index,
  value,
  childValue,
  size,
  interactive,
  active,
  onTap,
}: {
  index: number;
  value: string | null;
  childValue: string | null;
  size: number;
  interactive: boolean;
  active: boolean;
  onTap: () => void;
}) {
  const shown = value ?? childValue;
  const ref = useTargetRef<HTMLSpanElement>([`part:${index}`, ...(shown ? [`number:${Number(shown)}`] : [])]);
  return (
    <motion.span
      ref={ref}
      data-testid={`expansion-part-${index}`}
      data-value={shown ?? ""}
      className={interactive ? "wb-tap" : undefined}
      onClick={interactive ? onTap : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? `part ${index + 1} — tap to answer` : `part ${index + 1}: ${shown ?? "blank"}`}
      animate={{ backgroundColor: active ? BOARD.chalkYellowSoft : "rgba(243,198,75,0)" }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: Math.max(TOUCH_MIN, size * 1.8),
        minHeight: Math.max(TOUCH_MIN, size * 1.3),
        padding: "2px 8px",
        borderRadius: 8,
        boxShadow: shown ? undefined : `inset 0 0 0 3px ${BOARD.markerBlue}`,
        position: "relative",
      }}
    >
      {value ? (
        <>
          <HandNumber key={value} text={formatNumber(value)} size={size} budgetMs={350} />
          <span aria-hidden style={{ position: "absolute", top: -8, right: -6, fontSize: 13, color: BOARD.markerBlue }}>
            ✎
          </span>
        </>
      ) : childValue ? (
        <HandNumber key={childValue} text={formatNumber(childValue)} size={size} color={BOARD.markerGreen} budgetMs={350} />
      ) : null}
    </motion.span>
  );
}
