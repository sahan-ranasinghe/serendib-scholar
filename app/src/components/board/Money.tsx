"use client";

/**
 * Stylised Sri Lankan money, from the design: Rs. 1000 notes 100×52 in
 * #2E7D6E (a stack shows two ghosts behind), Rs. 100 notes in #C9683B,
 * both with a white-50 border and "රු." / value in Gemunu 700 20; Rs. 10
 * coins 48 px #D8B25A with a #B8912F rim, Rs. 1 coins 44 px #CFCBC0 with
 * #A8A399; an item slides aside (translateX 24, −5°, lift shadow) as it is
 * counted; the running total in StrokeNum 32 beneath "එකතුව".
 *
 * Vocabulary:
 *   show { items }          → the notes/coins
 *   count { upto }          → counted: how many slid aside so far
 */
import { motion } from "framer-motion";
import { HandNumber } from "./HandNumber";
import { useTargetRef } from "./targets";
import { BOARD, FONT_LABEL, FONT_SINHALA, SPRING } from "./tokens";

export interface MoneyItem {
  denomination: 1000 | 100 | 10 | 1 | number;
  count: number;
}

export interface MoneyProps {
  items: MoneyItem[];
  /** How many single notes/coins (in order) have been counted aside. */
  counted?: number;
}

export function Money({ items, counted = 0 }: MoneyProps) {
  const ref = useTargetRef("component:money");
  const singles = items.flatMap((item) => Array.from({ length: item.count }, () => item.denomination));
  const total = singles.slice(0, counted).reduce((sum, d) => sum + d, 0);
  return (
    <div ref={ref} data-testid="money" style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {singles.map((denomination, index) => {
          const aside = index < counted;
          const sliding = index === counted - 1;
          return (
            <motion.div
              key={index}
              data-testid={`money-${denomination}-${index}`}
              data-counted={aside || undefined}
              initial={false}
              animate={{ x: sliding ? 24 : 0, rotate: sliding ? -5 : 0, opacity: aside && !sliding ? 0.5 : 1 }}
              transition={SPRING}
              style={{ boxShadow: sliding ? "var(--shadow-lift)" : "none", borderRadius: denomination >= 100 ? 6 : "50%" }}
            >
              <Piece denomination={denomination} />
            </motion.div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }} data-testid="money-total">
        <span style={{ font: `600 20px/1.5 ${FONT_LABEL}`, color: BOARD.inkSoft }}>එකතුව</span>
        <HandNumber text={total} size={32} draw={false} registerNumbers={false} />
      </div>
    </div>
  );
}

function Piece({ denomination }: { denomination: number }) {
  if (denomination >= 100) {
    const bg = denomination >= 1000 ? "#2E7D6E" : "#C9683B";
    return (
      <div aria-label={`Rs ${denomination}`} style={{ width: 100, height: 52, background: bg, borderRadius: 6, border: "2px solid rgba(255,255,255,.5)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", boxSizing: "border-box", color: "#fff", font: `700 20px/1 ${FONT_SINHALA}` }}>
        <span>රු.</span>
        <span>{denomination}</span>
      </div>
    );
  }
  const ten = denomination >= 10;
  return (
    <div aria-label={`Rs ${denomination}`} style={{ width: ten ? 48 : 44, height: ten ? 48 : 44, borderRadius: "50%", background: ten ? "#D8B25A" : "#CFCBC0", border: `3px solid ${ten ? "#B8912F" : "#A8A399"}`, display: "flex", alignItems: "center", justifyContent: "center", font: `700 20px/1 ${FONT_SINHALA}`, color: ten ? "#5B4310" : "#3F3B33" }}>
      {denomination}
    </div>
  );
}
