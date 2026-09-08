"use client";

/**
 * Five labelled columns — දසදා · දා · සි · ද · එ — with one digit slot
 * each: the place-value chart the textbook prints above a number.
 *
 * Vocabulary:
 *   show { digits? }               → props digits (null = empty slot)
 *   digit_drop { column, digit }   → digits[column] = digit (the digit
 *                                    bounces in from above)
 *   column_glow { column }         → glowColumn
 *
 * TOUCH: tap a column and a digit pad opens beneath it; one tap fills it.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { HandNumber } from "./HandNumber";
import { NumberPad } from "./NumberPad";
import { useTargetRef } from "./targets";
import { BOARD, ROD_LABELS, SPRING_BOUNCY, TOUCH_MIN } from "./theme";

export interface PlaceValueStripProps {
  digits: Array<number | null>;
  glowColumn?: number | null;
  interactive?: boolean;
  onDigit?: (column: number, digit: number) => void;
  /** Float the digit pad at the board's edge (the lesson's small board). */
  dockPad?: boolean;
}

export function PlaceValueStrip({ digits, glowColumn = null, interactive = false, onDigit, dockPad = false }: PlaceValueStripProps) {
  const columns = digits.length;
  const labels = ROD_LABELS.slice(ROD_LABELS.length - columns);
  const [active, setActive] = useState<number | null>(null);
  const number = digits.every((d) => d !== null) ? Number(digits.join("")) : null;
  const rootRef = useTargetRef(["component:placeValueStrip", ...(number !== null ? [`number:${number}`] : [])]);

  return (
    <div ref={rootRef} data-testid="place-value-strip" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        style={{ display: "flex", borderRadius: 8, boxShadow: `0 0 0 3px ${BOARD.markerBlue}`, background: "rgba(255,255,255,0.35)" }}
      >
        {digits.map((digit, column) => (
          <Column
            key={column}
            column={column}
            label={labels[column] ?? ""}
            digit={digit}
            glow={glowColumn === column}
            dim={glowColumn !== null && glowColumn !== column}
            last={column === columns - 1}
            interactive={interactive}
            active={active === column}
            onTap={() => setActive((a) => (a === column ? null : column))}
          />
        ))}
      </motion.div>
      <AnimatePresence>
        {interactive && active !== null && (
          <NumberPad
            key={active}
            mode="digit"
            docked={dockPad}
            label={labels[active]}
            onCommit={(value) => {
              onDigit?.(active, Number(value));
              setActive(null);
            }}
            onCancel={() => setActive(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Column({
  column,
  label,
  digit,
  glow,
  dim,
  last,
  interactive,
  active,
  onTap,
}: {
  column: number;
  label: string;
  digit: number | null;
  glow: boolean;
  dim: boolean;
  last: boolean;
  interactive: boolean;
  active: boolean;
  onTap: () => void;
}) {
  const ref = useTargetRef<HTMLDivElement>(`column:${column}`);
  return (
    <motion.div
      ref={ref}
      data-testid={`strip-column-${column}`}
      data-glow={glow || undefined}
      className={interactive ? "wb-tap" : undefined}
      onClick={interactive ? onTap : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? `${label} — tap to type a digit` : `${label}: ${digit ?? "empty"}`}
      animate={{ opacity: dim ? 0.55 : 1, backgroundColor: glow || active ? BOARD.chalkYellowSoft : "rgba(243,198,75,0)" }}
      transition={{ duration: 0.3 }}
      style={{
        minWidth: Math.max(TOUCH_MIN, 62),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        borderRight: last ? undefined : `3px solid ${BOARD.markerBlue}`,
        borderRadius: column === 0 ? "8px 0 0 8px" : last ? "0 8px 8px 0" : 0,
      }}
    >
      <div
        className="font-sinhala"
        style={{
          width: "100%",
          textAlign: "center",
          padding: "4px 6px",
          fontSize: 15,
          fontWeight: 700,
          color: BOARD.ink,
          borderBottom: `3px solid ${BOARD.markerBlue}`,
          lineHeight: 1.3,
        }}
      >
        {label}
      </div>
      <div style={{ height: 58, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", width: "100%" }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {digit !== null && (
            <motion.div
              key={digit}
              initial={{ y: -52, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0, transition: { duration: 0.12 } }}
              transition={SPRING_BOUNCY}
              data-testid={`strip-digit-${column}`}
            >
              <HandNumber text={digit} size={36} draw={false} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
