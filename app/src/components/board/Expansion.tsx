"use client";

/**
 * A number and its expanded form, from the design: "5 421 =" in StrokeNum
 * then paper slots — 64×48 dashed ink-40 when blank (80×56 radius 12 when
 * the expansion stands alone, rule h), a filled slot 96×48 with a 2 px
 * ink-18 border and Zara's ✎ badge, the tapped slot dashed saffron on
 * saffron-soft with the glow, and a value flying from its rod into its
 * slot with a lift shadow at −6°.
 *
 * Vocabulary:
 *   show { number, parts }          → props; every part starts blank
 *   part_reveal { index, value }    → parts[index] = value (Zara writes it, ✎)
 *   part_fly { fromRod, index }     → `fly`: the value floats from the
 *                                     abacus rod into its slot, then reveals
 *
 * TOUCH: tap a blank to answer on the pad.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HandNumber } from "./HandNumber";
import { NumberPad } from "./NumberPad";
import { useBoard, useTargetRef, type Rect } from "./targets";
import { BOARD, FONT_LATIN, formatNumber, SPRING, TOUCH_MIN } from "./tokens";
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
  /** Dock the pad at the board's foot (the lesson board). */
  dockPad?: boolean;
  /** Standing alone on the board (no abacus above): the larger slots. */
  alone?: boolean;
  /** The next blank to fill glows (Zara's turn to write, or the child's). */
  glowIndex?: number | null;
  /** What the child has just entered into the next blank: shown in it before the judge (pending), and while it wobbles (wrong). */
  entry?: { value: string; verdict: "pending" | "correct" | "wrong" } | null;
}

/** The value of digit `index` of `number` — what flies and what is revealed. */
export function partValue(number: number, index: number): string {
  const digits = String(number);
  const digit = Number(digits[index] ?? 0);
  return String(digit * 10 ** (digits.length - 1 - index));
}

export function Expansion({ number, parts, fly = null, onFlyDone, interactive = false, onAnswer, answered, size, dockPad = false, alone = false, glowIndex = null, entry = null }: ExpansionProps) {
  const entryIndex = entry ? parts.findIndex((part, i) => part === null && (answered?.[i] ?? null) === null) : -1;
  const board = useBoard();
  const [active, setActive] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [flight, setFlight] = useState<{ key: number; index: number; from: Rect; to: Rect; value: string } | null>(null);
  // The slot a value is flying towards stays blank until it lands (M8: "5000 flies from the 1000 rod into the first slot").
  const [inFlight, setInFlight] = useState<{ key: number; index: number } | null>(null);
  const [landedFor, setLandedFor] = useState<{ number: number; values: Record<number, string> }>({ number, values: {} });
  const landed = landedFor.number === number ? landedFor.values : {};
  const land = (index: number, value: string) => setLandedFor((l) => ({ number, values: { ...(l.number === number ? l.values : {}), [index]: value } }));
  const rootRef = useTargetRef(["component:expansion", `number:${number}`]);
  const glyph = size ?? (alone ? 44 : 34);

  useEffect(() => {
    if (!fly) return;
    setInFlight({ key: fly.key, index: fly.index });
    const frame = requestAnimationFrame(() => {
      const rod = board.resolve({ rod: fly.fromRod });
      const slot = board.resolve({ part: fly.index });
      const from = rod ? board.measure(rod) : null;
      const to = slot ? board.measure(slot) : null;
      const value = partValue(number, fly.index);
      if (!from || !to) {
        land(fly.index, value);
        setInFlight(null);
        onFlyDone?.(fly.index, value);
        return;
      }
      setFlight({ key: fly.key, index: fly.index, from, to, value });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly?.key]);

  return (
    <div ref={rootRef} data-testid="expansion" data-alone={alone || undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} style={{ display: "flex", alignItems: "center", flexWrap: alone ? "nowrap" : "wrap", justifyContent: "center", gap: alone ? 12 : 10, position: "relative" }}>
        <HandNumber text={`${formatNumber(number)} =`} size={glyph} draw={false} targetBase={`text:${number}`} />
        {parts.map((part, index) => {
          const flying = inFlight !== null && inFlight.index === index && landed[index] === undefined;
          const child = flying ? null : (answered?.[index] ?? null);
          // The child's own answer stands in its slot: her later confirmation does not write over it.
          const value = flying || child !== null ? null : (part ?? landed[index] ?? null);
          return (
            <span key={index} style={{ display: "inline-flex", alignItems: "center", gap: alone ? 12 : 10 }}>
              {index > 0 && <HandNumber text="+" size={glyph} draw={false} />}
              <Part
                index={index}
                value={value !== null ? String(value) : null}
                childValue={child !== null ? String(child) : null}
                alone={alone}
                interactive={interactive && value === null && child === null}
                active={active === index}
                draft={active === index ? draft : ""}
                entry={index === entryIndex && value === null && child === null ? entry : null}
                glow={glowIndex === index && value === null && child === null}
                // A tap on the part being filled, with digits in the pad, changes nothing: the pad never closes while it holds a digit.
                onTap={() => setActive((a) => (a === index ? (draft ? a : null) : index))}
              />
            </span>
          );
        })}
      </motion.div>
      <AnimatePresence>
        {interactive && active !== null && (
          <NumberPad
            key={active}
            docked={dockPad}
            onChange={setDraft}
            onCommit={(value) => {
              onAnswer?.(active, value);
              setActive(null);
              setDraft("");
            }}
          />
        )}
      </AnimatePresence>
      {flight &&
        board.overlay &&
        createPortal(
          <motion.div
            key={flight.key}
            data-testid="expansion-flight"
            initial={{ left: flight.from.x + flight.from.width / 2, top: flight.from.y + flight.from.height * 0.4, opacity: 0.7, scale: 0.8, rotate: -6 }}
            animate={{ left: flight.to.x + flight.to.width / 2, top: flight.to.y + flight.to.height / 2, opacity: 1, scale: 1, rotate: 0 }}
            transition={SPRING}
            onAnimationComplete={() => {
              playSound("chalk");
              land(flight.index, flight.value);
              setInFlight(null);
              onFlyDone?.(flight.index, flight.value);
              setFlight(null);
            }}
            style={{ position: "absolute", pointerEvents: "none", filter: "drop-shadow(0 10px 8px rgba(27,27,27,.25))" }}
          >
            <div style={{ transform: "translate(-50%, -50%)" }}>
              <HandNumber text={flight.value} size={30} draw={false} />
            </div>
          </motion.div>,
          board.overlay,
        )}
    </div>
  );
}

function Part({ index, value, childValue, alone, interactive, active, glow, draft = "", entry = null, onTap }: { index: number; value: string | null; childValue: string | null; alone: boolean; interactive: boolean; active: boolean; glow: boolean; draft?: string; entry?: ExpansionProps["entry"]; onTap: () => void }) {
  const shown = value ?? childValue;
  const ref = useTargetRef<HTMLSpanElement>([`part:${index}`, ...(shown ? [`number:${Number(shown)}`] : [])]);
  const w = alone ? 80 : 64;
  const h = alone ? 56 : 46;
  const r = alone ? 12 : 10;
  const waits = active || glow;
  return (
    <motion.span
      ref={ref}
      data-testid={`expansion-part-${index}`}
      data-value={shown ?? ""}
      data-entry={entry ? entry.value : childValue ?? undefined}
      data-entry-verdict={entry ? entry.verdict : childValue ? "correct" : undefined}
      className={`${interactive ? "wb-tap" : ""} ${waits ? "wb-glow" : ""}`.trim() || undefined}
      onClick={interactive ? onTap : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? `part ${index + 1} — tap to answer` : `part ${index + 1}: ${shown ?? "blank"}`}
      initial={false}
      animate={{ backgroundColor: waits ? BOARD.saffronSoft : BOARD.paper }}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: shown || entry ? (alone ? 100 : 84) : w,
        height: h,
        minHeight: interactive ? TOUCH_MIN : undefined,
        padding: shown || entry ? (alone ? "0 8px" : "0 6px") : 0,
        border: shown ? `2px solid ${BOARD.ink18}` : `3px dashed ${waits ? BOARD.chalkYellow : BOARD.ink40}`,
        borderRadius: r,
        boxSizing: alone ? "content-box" : "border-box",
      }}
    >
      {value ? (
        <>
          <HandNumber key={value} text={value} size={alone ? 36 : 30} budgetMs={350} />
          <span aria-hidden style={{ position: "absolute", right: -14, top: -16, width: 22, height: 22, borderRadius: "50%", background: BOARD.markerBlue, color: "#fff", font: `16px/22px ${FONT_LATIN}`, textAlign: "center" }}>
            ✎
          </span>
        </>
      ) : entry ? (
        /^\d+$/u.test(entry.value) ? <HandNumber key={entry.value} text={entry.value} size={alone ? 36 : 30} color={BOARD.successText} draw={false} registerNumbers={false} /> : <span style={{ font: `700 20px/1.2 ${FONT_LATIN}`, color: BOARD.successText }}>{entry.value}</span>
      ) : active && draft ? (
        <>
          <HandNumber key={draft} text={draft} size={alone ? 36 : 30} color={BOARD.successText} draw={false} registerNumbers={false} />
          <span aria-hidden style={{ width: 2, height: alone ? 30 : 24, background: BOARD.successText, marginLeft: 4 }} />
        </>
      ) : childValue ? (
        <>
          <HandNumber key={childValue} text={childValue} size={alone ? 36 : 30} color={BOARD.successText} budgetMs={350} />
          <span aria-hidden style={{ position: "absolute", right: -14, top: -16, width: 22, height: 22, borderRadius: "50%", background: BOARD.markerGreen, color: "#fff", font: `700 16px/22px ${FONT_LATIN}`, textAlign: "center" }}>
            ✓
          </span>
        </>
      ) : null}
    </motion.span>
  );
}
