"use client";

/**
 * Notes and coins for the hooks and the "coins in a till" analogy:
 * Rs 1000 and Rs 100 notes, Rs 10 and Rs 1 coins, stackable. Stylised —
 * a colour and a number, nothing that could pass for the real thing.
 *
 * Vocabulary:
 *   show { items }   → items (each stack pops in, ≤ 500 ms for the lot)
 *   count { step }   → counted: the first `step` items have slid aside
 *                      into the counted pile, and the running total is
 *                      written beneath
 */
import { motion } from "framer-motion";
import { HandNumber } from "./HandNumber";
import { WriteOn } from "./WriteOn";
import { useTargetRef } from "./targets";
import { BOARD, formatNumber, SPRING } from "./theme";

export interface MoneyItem {
  denomination: 1000 | 100 | 10 | 1 | number;
  count: number;
}

export interface MoneyProps {
  items: MoneyItem[];
  /** How many single notes/coins (in order) have been counted aside. */
  counted?: number;
}

const LOOK: Record<number, { bg: string; ink: string; kind: "note" | "coin" }> = {
  1000: { bg: "linear-gradient(135deg, #7A9C6B, #4F7A4A)", ink: "#F6F1E4", kind: "note" },
  100: { bg: "linear-gradient(135deg, #E9A25A, #C9762B)", ink: "#2A2418", kind: "note" },
  10: { bg: "radial-gradient(circle at 35% 30%, #F4D77A, #C79A2E 70%)", ink: "#4A3510", kind: "coin" },
  1: { bg: "radial-gradient(circle at 35% 30%, #EDEDED, #A9A9A9 70%)", ink: "#2A2418", kind: "coin" },
};

export function Money({ items, counted = 0 }: MoneyProps) {
  const ref = useTargetRef("component:money");
  const singles = items.flatMap((item) => Array.from({ length: item.count }, () => item.denomination));
  const total = singles.slice(0, counted).reduce((sum, d) => sum + d, 0);
  const stagger = Math.min(0.08, 0.35 / Math.max(1, singles.length));
  return (
    <div ref={ref} data-testid="money" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 360 }}>
          {singles.map((denomination, index) => {
            const isCounted = index < counted;
            return (
              <motion.div
                key={index}
                layout
                data-testid={`money-${denomination}-${index}`}
                data-counted={isCounted || undefined}
                initial={{ opacity: 0, y: -16, scale: 0.9 }}
                animate={{ opacity: isCounted ? 0.35 : 1, y: 0, x: isCounted ? 18 : 0, scale: isCounted ? 0.92 : 1 }}
                transition={{ ...SPRING, delay: index * stagger }}
              >
                <Piece denomination={denomination} />
              </motion.div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40 }} data-testid="money-total">
        {counted > 0 && (
          <>
            <WriteOn text="රු." size={20} color={BOARD.markerGreen} write={false} />
            <HandNumber key={total} text={formatNumber(total)} size={34} color={BOARD.markerGreen} budgetMs={300} />
          </>
        )}
      </div>
    </div>
  );
}

function Piece({ denomination }: { denomination: number }) {
  const look = LOOK[denomination] ?? LOOK[1]!;
  const coin = look.kind === "coin";
  return (
    <div
      aria-label={`Rs ${denomination}`}
      style={{
        width: coin ? (denomination >= 10 ? 46 : 40) : 88,
        height: coin ? (denomination >= 10 ? 46 : 40) : 46,
        borderRadius: coin ? "50%" : 6,
        background: look.bg,
        color: look.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: coin ? 15 : 14,
        letterSpacing: 0.5,
        boxShadow: coin ? "0 2px 3px rgba(0,0,0,0.35), inset 0 -2px 2px rgba(0,0,0,0.2)" : "0 2px 4px rgba(0,0,0,0.3), inset 0 0 0 2px rgba(255,255,255,0.35)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {coin ? denomination : `Rs ${denomination}`}
    </div>
  );
}
