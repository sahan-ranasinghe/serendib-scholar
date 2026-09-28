"use client";

/**
 * The digit picker, from the design: a slot row of 56×56 paper squares
 * (dashed ink-40 when empty, solid ink-18 with a hard 2 px shadow when
 * filled, dashed saffron on saffron-soft for the slot that waits), a
 * chalk-dashed ellipse (200×132) holding 52×52 paper tiles in StrokeNum 34,
 * the picker's glow on that ring when it is the child's turn, and the
 * built number's Sinhala name beneath in Gemunu 24 — green with a ✓ for
 * the child, marker blue for Zara. The five-number puzzle adds a ledger
 * beside the ring (Session Gaps G6).
 *
 * TOUCH: tap a tile into the next slot; tap a filled slot to take it out;
 * drag a filled slot onto another to reorder.
 */
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { HandNumber } from "./HandNumber";
import { useTargetRef } from "./targets";
import { BOARD, FONT_SINHALA, FONT_LABEL, FONT_LATIN, SPRING, TOUCH_MIN } from "./tokens";
import { playSound } from "./sound";
import { hitTest, useDrag, type DragPoint } from "./useDrag";

export interface DigitPickerProps {
  pool: number[];
  /** Pool indexes, in slot order. */
  built: number[];
  /** Slots to build into; defaults to the pool size. */
  length?: number;
  /** The Sinhala name to write under the built number (built_number). */
  builtName?: string | null;
  /** Whose number it is: the child's (green) or Zara's example (marker blue). */
  builtBy?: "child" | "tutor";
  interactive?: boolean;
  onChange?: (built: number[]) => void;
  /** Kept for callers; the design has one size. */
  compact?: boolean;
  /** The picker is the answer surface: the ring glows. */
  glow?: boolean;
  /** The five-number puzzle's ledger: numbers built so far (✓), the current row glowing while the child builds. */
  ledger?: string[];
  ledgerRows?: number;
  /** `built` is what the child has just committed: it stays in the slots (or the ledger's current row) before and through the judge. */
  entered?: "pending" | "correct" | "wrong" | null;
}

const SLOT = 56;
const TILE = 52;

export function DigitPicker({ pool, built, length, builtName = null, builtBy = "child", interactive = false, onChange, glow = false, ledger, ledgerRows = 5, entered = null }: DigitPickerProps) {
  const slots = length ?? pool.length;
  const group = useId();
  const number = built.map((i) => pool[i]).join("");
  const builtColour = builtBy === "tutor" ? BOARD.markerBlue : BOARD.successText;
  const rootRef = useTargetRef(["component:picker", "text:picker", "component:digitPicker"]);
  const builtRef = useTargetRef(number ? `number:${Number(number)}` : null);

  const tapTile = (index: number) => {
    if (!interactive || built.includes(index) || built.length >= slots) return;
    playSound("beadClick");
    onChange?.([...built, index]);
  };
  const tapSlot = (position: number) => {
    if (!interactive || built[position] === undefined) return;
    playSound("beadClick");
    onChange?.(built.filter((_, i) => i !== position));
  };
  const [ghost, setGhost] = useState<{ point: DragPoint; digit: number } | null>(null);
  const drag = useDrag<number>({
    onStart: (position, point) => setGhost({ point, digit: pool[built[position]!] ?? 0 }),
    onMove: (_, point) => setGhost((g) => (g ? { ...g, point } : g)),
    onEnd: (position, point, moved) => {
      setGhost(null);
      if (!moved) {
        tapSlot(position);
        return;
      }
      const hit = hitTest(point, "data-slot");
      if (!hit) return;
      const to = Number(hit.value);
      if (to === position || to >= built.length) return;
      const next = [...built];
      const [tile] = next.splice(position, 1);
      next.splice(to, 0, tile!);
      playSound("beadClick");
      onChange?.(next);
    },
  });

  const waiting = interactive ? built.length : -1;
  // The design's ring holds four tiles at 200×132; a printed pool (the textbook puzzle deals eleven) widens to six tiles a row, two rows.
  const ringCols = pool.length <= 4 ? 2 : Math.min(6, Math.ceil(pool.length / 2));
  // A tile is 52 + its 2 px borders (the session's boxes are content-box) = 56, with 10 between: six a row need 386 inside the ring's 26 px sides.
  const ringW = pool.length <= 4 ? 200 : ringCols * 66 - 10 + 52 + 8;
  const ringH = pool.length <= 4 ? 132 : Math.ceil(pool.length / ringCols) * 66 - 10 + 28 + 8;
  const current = ledger ? ledger.length : -1;

  return (
    <LayoutGroup id={group}>
      {/* the puzzle's hand and its ledger stand side by side and keep their own widths: where the room is short the board scales the pair down (BoardStage's fit) — it never wraps the ledger under the tiles or squeezes the ring */}
      <div ref={rootRef} data-testid="digit-picker" style={{ display: "flex", gap: ledger ? 28 : 40, alignItems: "center", justifyContent: "center", flexWrap: ledger ? "nowrap" : "wrap", maxWidth: ledger ? undefined : "100%" }}>
        <div style={{ display: "grid", gap: 12, justifyItems: "center", flex: "none" }}>
          {ledger && <div style={{ font: `600 20px/1.5 ${FONT_LABEL}`, color: BOARD.inkSoft }}>පොතේ ඉලක්කම්</div>}
          {/* the slot row — the puzzle has none: its number forms in the ledger's current row (G6) */}
          {!ledger && (
          <div style={{ display: "flex", gap: 8 }} data-testid="digit-picker-slots" data-entry={entered ? number : undefined} data-entry-verdict={entered ?? undefined}>
            {Array.from({ length: slots }).map((_, position) => {
              const poolIndex = built[position];
              const filled = poolIndex !== undefined;
              const waits = position === waiting;
              return (
                <div
                  key={position}
                  data-slot={position}
                  data-testid={`picker-slot-${position}`}
                  className={interactive && filled ? "wb-touch" : undefined}
                  {...(interactive && filled ? drag(position) : {})}
                  role={interactive && filled ? "button" : undefined}
                  aria-label={filled ? `slot ${position + 1}: ${pool[poolIndex]} — tap to remove, drag to reorder` : `slot ${position + 1}: empty`}
                  style={{
                    width: SLOT,
                    height: SLOT,
                    minWidth: TOUCH_MIN,
                    minHeight: TOUCH_MIN,
                    border: waits ? `3px dashed ${BOARD.chalkYellow}` : filled ? `2px solid ${BOARD.ink18}` : `3px dashed ${BOARD.ink40}`,
                    borderRadius: 12,
                    background: waits ? BOARD.saffronSoft : BOARD.paper,
                    boxShadow: filled ? "0 2px 0 #D8D1C2" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",

                  }}
                >
                  {filled && (
                    <motion.div layoutId={`${group}-tile-${poolIndex}`} transition={SPRING}>
                      <HandNumber text={pool[poolIndex]!} size={34} color={BOARD.ink} draw={false} registerNumbers={false} />
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
          )}
          {/* the chalk ring with the pool */}
          <div
            data-testid="picker-ring"
            className={glow && !ledger ? "wb-glow" : undefined}
            style={{
              position: "relative",
              width: ringW,
              height: ringH,
              borderRadius: "50%",
              border: `3px dashed ${BOARD.ink40}`,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "center",
              padding: "14px 26px",
              boxSizing: "border-box",
            }}
          >
            {pool.map((digit, index) => {
              const used = built.includes(index);
              return <Tile key={index} index={index} digit={digit} used={used} interactive={interactive && !used} onTap={() => tapTile(index)} layoutId={`${group}-tile-${index}`} />;
            })}
          </div>
          {/* the built number's name — the child's in green with a ✓, Zara's in blue */}
          <AnimatePresence>
            {(number || builtName) && (
              <motion.div
                key={`${number}:${builtName ?? ""}`}
                ref={builtRef}
                data-testid="digit-picker-built"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.4 }}
                style={{ minHeight: 34, display: "flex", alignItems: "center", gap: 10, font: `700 24px/1.5 ${FONT_SINHALA}`, color: builtColour, whiteSpace: "nowrap" }}
              >
                {builtName ?? ""}
                {builtName && builtBy === "child" && " ✓"}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {ledger && (
          <div data-testid="picker-ledger" style={{ display: "grid", gap: 6, flex: "none" }}>
            <div style={{ font: `600 20px/1.5 ${FONT_LABEL}`, color: BOARD.inkSoft }}>හදපු සංඛ්‍යා {ledgerRows}</div>
            {/* the row being built is always ON the ledger: once it is full (the example counted as one), the five rows shown slide down to keep it */}
            {Array.from({ length: ledgerRows }, (_, i) => i + Math.max(0, ledger.length + (interactive || entered !== null ? 1 : 0) - ledgerRows)).map((row) => {
              const done = ledger[row];
              const active = row === current && (interactive || entered !== null);
              return (
                <div
                  key={row}
                  data-testid={`ledger-row-${row}`}
                  data-done={done ? "true" : undefined}
                  data-current={active ? "true" : undefined}
                  data-entry={active && entered ? number : undefined}
                  data-entry-verdict={active && entered ? entered : undefined}
                  role={active && interactive && built.length ? "button" : undefined}
                  aria-label={active ? `row ${row + 1}: ${number || "empty"} — tap to take the last digit back` : undefined}
                  onClick={active && interactive && built.length ? () => tapSlot(built.length - 1) : undefined}
                  // Each tap gives one digit back: quick taps are separate presses (src/lib/singleFire.ts).
                  data-tap-repeat={active && interactive && built.length ? true : undefined}
                  style={{ display: "flex", alignItems: "center", gap: 12, height: 34, minHeight: active && built.length ? TOUCH_MIN : undefined }}
                >
                  <span style={{ width: 28, height: 28, borderRadius: "50%", background: done ? BOARD.markerGreen : active ? BOARD.chalkYellow : "rgba(27,27,27,.25)", color: "#fff", font: `700 16px/28px ${FONT_LATIN}`, textAlign: "center" }}>{row + 1}</span>
                  <div
                    className={active ? "wb-glow" : undefined}
                    style={{
                      width: 150,
                      height: 32,
                      border: active ? `3px dashed ${BOARD.chalkYellow}` : done ? `2px solid ${BOARD.ink18}` : "3px dashed rgba(27,27,27,.3)",
                      borderRadius: 8,
                      background: active ? BOARD.saffronSoft : BOARD.paper,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 10px",
                      boxSizing: "border-box",
                      gap: 10,
                    }}
                  >
                    {done && <HandNumber text={done} size={26} color={BOARD.successText} draw={false} registerNumbers={false} />}
                    {active && number && <HandNumber text={number} size={26} color={BOARD.successText} draw={false} registerNumbers={false} />}
                    {active && !entered && <span style={{ width: 2, height: 24, background: BOARD.successText }} />}
                    {done && <span style={{ marginLeft: "auto", width: 22, height: 22, borderRadius: "50%", background: BOARD.markerGreen, color: "#fff", font: `700 16px/22px ${FONT_LATIN}`, textAlign: "center" }}>✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {ghost &&
          createPortal(
            <div style={{ position: "fixed", left: ghost.point.x - TILE / 2, top: ghost.point.y - TILE / 2 - 14, pointerEvents: "none", zIndex: 1000, width: TILE, height: TILE, background: BOARD.paper, border: `2px solid ${BOARD.ink18}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-lift)", transform: "rotate(-5deg)" }}>
              <HandNumber text={ghost.digit} size={34} color={BOARD.ink} draw={false} registerNumbers={false} />
            </div>,
            document.body,
          )}
      </div>
    </LayoutGroup>
  );
}

function Tile({ index, digit, used, interactive, onTap, layoutId }: { index: number; digit: number; used: boolean; interactive: boolean; onTap: () => void; layoutId: string }) {
  const ref = useTargetRef<HTMLDivElement>(`digit:${digit}`);
  return (
    <motion.div
      ref={ref}
      layout
      data-testid={`picker-tile-${index}`}
      className={interactive ? "wb-tap" : undefined}
      role={interactive ? "button" : undefined}
      aria-label={`${digit}${used ? " (used)" : ""}`}
      onClick={interactive ? onTap : undefined}
      animate={{ opacity: used ? 0.38 : 1, y: 0 }}
      whileTap={interactive ? { y: -8, rotate: -5, boxShadow: "var(--shadow-lift)" } : undefined}
      transition={SPRING}
      style={{
        width: TILE,
        height: TILE,
        minWidth: interactive ? TOUCH_MIN : undefined,
        minHeight: interactive ? TOUCH_MIN : undefined,
        background: BOARD.paper,
        border: `2px solid ${BOARD.ink18}`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 0 #D8D1C2",

      }}
    >
      {!used && (
        <motion.div layoutId={layoutId}>
          <HandNumber text={digit} size={34} color={BOARD.ink} draw={false} registerNumbers={false} />
        </motion.div>
      )}
    </motion.div>
  );
}
