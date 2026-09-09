"use client";

/**
 * A chalk circle of digit tiles the child builds a number from. Tapped
 * tiles lift into the slot row above; the built number and its Sinhala
 * name are written beneath, on top of the picker — never instead of it.
 *
 * Vocabulary:
 *   show { pool }                    → pool
 *   tap { digit }                    → built (the parent appends the tile)
 *   built_number { digits, name, by? } → builtName (the readout); `by`
 *                                      colours it — the child's green, or
 *                                      marker blue for an example Zara builds
 *   clear_built                      → built = [], builtName = null
 *
 * `built` is a list of pool INDEXES, so a pool with two 3s stays honest.
 *
 * TOUCH: tap a tile in, tap a slot out, drag a slot tile to reorder.
 */
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { HandNumber } from "./HandNumber";
import { WriteOn } from "./WriteOn";
import { useTargetRef } from "./targets";
import { BOARD, SPRING, TOUCH_MIN } from "./theme";
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
  /** Smaller tiles and circle — the lesson's phone-sized board. */
  compact?: boolean;
}

const TILE = 52;

export function DigitPicker({ pool, built, length, builtName = null, builtBy = "child", interactive = false, onChange, compact = false }: DigitPickerProps) {
  const slots = length ?? pool.length;
  const group = useId();
  const number = built.map((i) => pool[i]).join("");
  const builtColour = builtBy === "tutor" ? BOARD.markerBlue : BOARD.markerGreen;
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

  // --- drag a filled slot onto another slot to reorder --------------------
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

  // Tiles sit on a ring inside the chalk circle.
  // Compact: the ring just clears the tiles, and a phone's 360 px still fits the slots, the ring and the number with its name.
  const radius = compact ? (pool.length <= 4 ? 44 : 64) : pool.length <= 4 ? 62 : 84;
  const diameter = radius * 2 + TILE + (compact ? 4 : 16);

  return (
    <LayoutGroup id={group}>
      <div ref={rootRef} data-testid="digit-picker" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/* the slot row */}
        <div style={{ display: "flex", gap: 8 }} data-testid="digit-picker-slots">
          {Array.from({ length: slots }).map((_, position) => {
            const poolIndex = built[position];
            const filled = poolIndex !== undefined;
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
                  width: TILE,
                  height: TILE,
                  minWidth: TOUCH_MIN,
                  minHeight: TOUCH_MIN,
                  borderRadius: 10,
                  boxShadow: `inset 0 0 0 3px ${BOARD.markerBlue}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {filled && (
                  <motion.div layoutId={`${group}-tile-${poolIndex}`} transition={{ ...SPRING, duration: 0.1 }} style={{ pointerEvents: "none" }}>
                    <Tile digit={pool[poolIndex]!} />
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
        {/* the chalk circle with the pool */}
        <div style={{ position: "relative", width: diameter, height: diameter }}>
          <svg
            className="chalk-stroke"
            viewBox="0 0 100 100"
            width={diameter}
            height={diameter}
            style={{ position: "absolute", inset: 0 }}
            aria-hidden
          >
            <motion.ellipse
              cx="50"
              cy="50"
              rx="47"
              ry="46"
              fill="none"
              stroke={BOARD.markerBlue}
              strokeWidth="2.2"
              strokeLinecap="round"
              transform="rotate(-8 50 50)"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </svg>
          {pool.map((digit, index) => {
            const angle = -Math.PI / 2 + (index / pool.length) * Math.PI * 2;
            const x = diameter / 2 + Math.cos(angle) * radius - TILE / 2;
            const y = diameter / 2 + Math.sin(angle) * radius - TILE / 2;
            const used = built.includes(index);
            return (
              <PoolTile key={index} digit={digit} index={index} x={x} y={y} used={used} group={group} interactive={interactive} onTap={() => tapTile(index)} />
            );
          })}
        </div>
        {/* the built number, on top of the picker, in the child's colour */}
        <AnimatePresence>
          {number && (
            <motion.div
              key={number}
              ref={builtRef}
              data-testid="digit-picker-built"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.4 }}
              // Compact: the number and its name share one line, so the readout never pushes the ring off a short surface.
              style={{ display: "flex", flexDirection: compact ? "row" : "column", alignItems: compact ? "baseline" : "center", gap: compact ? 14 : 2, flexWrap: "wrap", justifyContent: "center" }}
            >
              <HandNumber text={number} size={compact ? 30 : 32} color={builtColour} budgetMs={400} />
              {builtName && <WriteOn text={builtName} size={18} color={builtColour} durationMs={400} />}
            </motion.div>
          )}
        </AnimatePresence>
        {ghost &&
          createPortal(
            <div
              style={{
                position: "fixed",
                left: ghost.point.x - TILE / 2,
                top: ghost.point.y - TILE / 2 - 14,
                pointerEvents: "none",
                zIndex: 1000,
                filter: "drop-shadow(0 12px 10px rgba(0,0,0,0.35))",
                transform: "scale(1.12)",
              }}
            >
              <Tile digit={ghost.digit} />
            </div>,
            document.body,
          )}
      </div>
    </LayoutGroup>
  );
}

function PoolTile({
  digit,
  index,
  x,
  y,
  used,
  group,
  interactive,
  onTap,
}: {
  digit: number;
  index: number;
  x: number;
  y: number;
  used: boolean;
  group: string;
  interactive: boolean;
  onTap: () => void;
}) {
  const ref = useTargetRef<HTMLDivElement>(`digit:${digit}`);
  return (
    <div
      ref={ref}
      data-testid={`picker-tile-${index}`}
      className={interactive && !used ? "wb-tap" : undefined}
      onClick={interactive && !used ? onTap : undefined}
      role={interactive && !used ? "button" : undefined}
      aria-label={used ? `${digit} (used)` : `${digit} — tap to add`}
      style={{ position: "absolute", left: x, top: y, width: TILE, height: TILE, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {/* the tile's shadow stays in the circle when the tile has gone up */}
      <div
        aria-hidden
        style={{ position: "absolute", inset: 6, borderRadius: 10, boxShadow: `inset 0 0 0 2px ${BOARD.inkSoft}`, opacity: used ? 0.35 : 0 }}
      />
      {!used && (
        <motion.div layoutId={`${group}-tile-${index}`} transition={{ ...SPRING, duration: 0.1 }}>
          <Tile digit={digit} />
        </motion.div>
      )}
    </div>
  );
}

function Tile({ digit }: { digit: number }) {
  return (
    <div
      style={{
        width: TILE - 8,
        height: TILE - 8,
        borderRadius: 10,
        background: "#fffdf7",
        boxShadow: "0 2px 0 rgba(0,0,0,0.2), 0 4px 10px rgba(40,25,10,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <HandNumber text={digit} size={28} draw={false} />
    </div>
  );
}
