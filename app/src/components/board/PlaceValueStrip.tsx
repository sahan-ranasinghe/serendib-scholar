"use client";

/**
 * The place-value strip, from the design: five columns labelled in
 * Yaldevi 600 20 ink-70 ("දස දහසේ ඒවා" … "එකේ ඒවා", a 60 px label box),
 * each with a 64×56 paper slot — dashed ink-40 when empty, solid ink-18
 * when filled (StrokeNum 36, green for the child), dashed saffron when it
 * waits; a column glows (siblings veiled to 38 %) when it is the child's
 * turn; a tapped column drops a digit tile (56 px, rotate −4°, lift
 * shadow) from the pad docked beneath it (keys 56×48).
 *
 * Vocabulary:
 *   show { digits }                → digits (null = empty)
 *   digit_drop { column, digit }   → digits[column] = digit
 *   column_glow { column }         → glowColumn
 *
 * TOUCH: tap a column to type its digit on the pad.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { HandNumber } from "./HandNumber";
import { useTargetRef } from "./targets";
import { BOARD, FONT_LABEL, FONT_SINHALA, SPRING_BOUNCY, TOUCH_MIN } from "./tokens";
import { playSound } from "./sound";

export const PLACE_LABELS = ["දස දහසේ ඒවා", "දහසේ ඒවා", "සියයේ ඒවා", "දහයේ ඒවා", "එකේ ඒවා"];

export interface PlaceValueStripProps {
  digits: Array<number | null>;
  glowColumn?: number | null;
  interactive?: boolean;
  onDigit?: (column: number, digit: number) => void;
  /** Kept for callers: the pad docks under the tapped column in the design. */
  dockPad?: boolean;
  /** Digits the child dropped (green); the rest are Zara's (ink). */
  byChild?: number[];
  /** A digit mid-drop into a column (the components sheet's second cell). */
  dropping?: { column: number; digit: number } | null;
}

export function PlaceValueStrip({ digits, glowColumn = null, interactive = false, onDigit, byChild = [], dropping = null }: PlaceValueStripProps) {
  const columns = digits.length;
  const labels = PLACE_LABELS.slice(PLACE_LABELS.length - columns);
  const [active, setActive] = useState<number | null>(null);
  const number = digits.every((d) => d !== null) ? Number(digits.join("")) : null;
  const rootRef = useTargetRef(["component:placeValueStrip", ...(number !== null ? [`number:${number}`] : [])]);
  const waiting = active ?? (interactive ? digits.findIndex((d) => d === null) : -1);

  return (
    <div ref={rootRef} data-testid="place-value-strip" style={{ display: "grid", gap: 10, justifyItems: "center" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 6, position: "relative" }}>
        {digits.map((digit, column) => (
          <Column
            key={column}
            column={column}
            label={labels[column] ?? ""}
            digit={digit}
            child={byChild.includes(column)}
            glow={glowColumn === column}
            dim={glowColumn !== null && glowColumn !== column}
            waits={waiting === column && digit === null}
            interactive={interactive && digit === null}
            active={active === column}
            onTap={() => setActive((a) => (a === column ? null : column))}
          />
        ))}
        {dropping && (
          <div data-testid="strip-drop" style={{ position: "absolute", left: `calc(${(dropping.column + 0.5) * (100 / columns)}% - 28px)`, top: 18, width: 56, height: 56, background: BOARD.paper, border: `2px solid ${BOARD.ink18}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-lift)", transform: "rotate(-4deg)" }}>
            <HandNumber text={dropping.digit} size={36} color={BOARD.ink} draw={false} registerNumbers={false} />
          </div>
        )}
      </div>
      <AnimatePresence>
        {interactive && active !== null && (
          <motion.div
            key={active}
            data-testid="strip-pad"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={SPRING_BOUNCY}
            style={{ display: "grid", gridTemplateColumns: "repeat(5, 56px)", gap: 6, justifySelf: active >= columns - 2 ? "end" : active <= 1 ? "start" : "center", marginTop: -2 }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((key) => (
              <button
                key={key}
                type="button"
                className="wb-tap"
                data-testid={`strip-key-${key}`}
                aria-label={String(key)}
                onClick={() => {
                  playSound("beadClick");
                  onDigit?.(active, key);
                  setActive(null);
                }}
                style={{ width: 56, height: 48, minHeight: 48, background: BOARD.paper, border: `2px solid ${BOARD.ink18}`, borderRadius: 10, boxShadow: "0 2px 0 #D8D1C2", display: "flex", alignItems: "center", justifyContent: "center", font: `700 26px/1 ${FONT_SINHALA}`, color: BOARD.ink, cursor: "pointer" }}
              >
                {key}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Column({ column, label, digit, child, glow, dim, waits, interactive, active, onTap }: { column: number; label: string; digit: number | null; child: boolean; glow: boolean; dim: boolean; waits: boolean; interactive: boolean; active: boolean; onTap: () => void }) {
  const ref = useTargetRef<HTMLDivElement>(`column:${column}`);
  const filled = digit !== null;
  return (
    <motion.div
      ref={ref}
      data-testid={`strip-column-${column}`}
      data-glow={glow || undefined}
      data-active={active || undefined}
      className={interactive ? "wb-tap" : undefined}
      onClick={interactive ? onTap : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? `${label} — tap to type a digit` : `${label}: ${digit ?? "empty"}`}
      animate={{ opacity: dim ? 0.38 : 1 }}
      style={{ display: "grid", gap: 6, justifyItems: "center", minWidth: interactive ? TOUCH_MIN : undefined }}
    >
      <div style={{ font: `600 20px/1.5 ${FONT_LABEL}`, color: BOARD.inkSoft, textAlign: "center", height: 60 }}>{label}</div>
      <div
        className={glow ? "wb-glow" : undefined}
        style={{
          width: 64,
          height: 56,
          border: filled ? `2px solid ${BOARD.ink18}` : waits || active ? `3px dashed ${BOARD.chalkYellow}` : `3px dashed ${BOARD.ink40}`,
          borderRadius: 12,
          background: waits || active ? BOARD.saffronSoft : BOARD.paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",

        }}
      >
        <AnimatePresence>
          {filled && (
            <motion.div key={digit} data-testid={`strip-digit-${column}`} initial={{ y: -24, opacity: 0, rotate: -4 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={SPRING_BOUNCY}>
              <HandNumber text={digit} size={36} color={child ? BOARD.successText : BOARD.ink} draw={false} registerNumbers={false} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
