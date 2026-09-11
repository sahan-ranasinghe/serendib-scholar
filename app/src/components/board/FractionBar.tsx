"use client";

/**
 * The fraction bar (stretch, 5.6b): a 240×56 paper bar with a 2 px ink-40
 * border, radius 10, split into equal parts by 2 px ink-40 lines; shaded
 * parts saffron; a part lifting out (translateY −12, −4°, scale 1.04, lift
 * shadow, radius 6); the bar glows when it is the child's turn. The
 * fraction's StrokeNum beneath.
 */
import { motion } from "framer-motion";
import { HandNumber } from "./HandNumber";
import { useTargetRef } from "./targets";
import { BOARD, SPRING_BOUNCY } from "./tokens";

export interface FractionBarProps {
  parts: number;
  shaded: number;
  /** A part mid-drag (its index). */
  lifted?: number | null;
  glow?: boolean;
  interactive?: boolean;
  onPart?: (index: number) => void;
}

export function FractionBar({ parts, shaded, lifted = null, glow = false, interactive = false, onPart }: FractionBarProps) {
  const ref = useTargetRef("component:fractionBar");
  const label = parts <= 1 ? "1" : shaded === parts ? String(parts) : `${shaded}/${parts}`;
  return (
    <div ref={ref} data-testid="fraction-bar" style={{ display: "grid", gap: 12, justifyItems: "center" }}>
      <div className={glow ? "wb-glow" : undefined} style={{ position: "relative", display: "flex", width: 240, height: 56, border: `2px solid ${BOARD.ink40}`, borderRadius: 10, overflow: "visible", background: BOARD.paper }}>
        {Array.from({ length: Math.max(1, parts) }).map((_, i) => {
          const lift = lifted === i;
          return (
            <motion.div
              key={i}
              data-testid={`fraction-part-${i}`}
              className={interactive ? "wb-tap" : undefined}
              role={interactive ? "button" : undefined}
              aria-label={`part ${i + 1}`}
              onClick={interactive ? () => onPart?.(i) : undefined}
              animate={{ y: lift ? -12 : 0, rotate: lift ? -4 : 0, scale: lift ? 1.04 : 1 }}
              transition={SPRING_BOUNCY}
              style={{ flex: 1, background: i < shaded ? BOARD.chalkYellow : BOARD.paper, borderLeft: i === 0 ? 0 : `2px solid ${BOARD.ink40}`, boxShadow: lift ? "var(--shadow-lift)" : "none", borderRadius: lift ? 6 : 0, position: "relative", zIndex: lift ? 2 : 1 }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40 }}>
        <HandNumber text={label} size={30} color={BOARD.ink} draw={false} registerNumbers={false} />
      </div>
    </div>
  );
}
