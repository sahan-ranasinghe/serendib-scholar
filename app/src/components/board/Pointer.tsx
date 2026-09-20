"use client";

/**
 * Zara's chalk hand, from the design: a 40×52 hand — a wood-brown finger
 * and palm holding a saffron chalk stub. It rests just BELOW its target,
 * tip up — unless that would cover something readable (a rod's place
 * label, a chip, the child's answer), in which case it points from above
 * or from beside: the hand never sits on anything a child has to read
 * (layout.ts). It pulses with a saffron ring and rests where it last
 * pointed on the child's turn.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBoard, useTargetRect, type Rect, type Target } from "./targets";
import { intersectionArea, readableBoxes } from "./layout";
import { SPRING_SNAPPY } from "./tokens";

export interface PointerProps {
  at: Target | null;
  pulseKey?: number;
  /** The child's turn: the hand rests in the corner instead of hiding. */
  parked?: boolean;
  /** Which half of the board the hand is over, for the character to mirror. */
  onSide?: (side: "left" | "right" | null) => void;
  /** Point from above (inverted) — a rod-tap question. */
  inverted?: boolean;
  /** Changes whenever the board around the target does (chips dealt, a dock up, an answer written): the hand re-checks what it would cover. */
  layoutKey?: string | number;
}

export const HAND_W = 40;
export const HAND_H = 52;

/** The hand itself, as the design draws it. */
export function ChalkHand({ width = HAND_W, height = HAND_H, style }: { width?: number; height?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 40 52" width={width} height={height} style={{ display: "block", ...style }} aria-hidden>
      <rect x="15" y="2" width="10" height="26" rx="5" fill="#A9683F" />
      <ellipse cx="20" cy="34" rx="13" ry="12" fill="#A9683F" />
      <rect x="6" y="40" width="28" height="12" rx="4" fill="var(--color-saffron)" />
    </svg>
  );
}

type Side = "below" | "above" | "left" | "right";
const ROTATION: Record<Side, number> = { below: 0, above: 180, left: 90, right: -90 };
/** The smaller hand (the design's table hand is 0.75): used wherever the full one would cover something. */
const SMALL_HAND = 0.7;
/** Air between the chalk's tip and what it points at. */
const TIP_GAP = 2;
/**
 * When the hand looks again after the board changes around it. Chips fade
 * in, a dock slides up, a table lands — measuring mid-animation measures a
 * moving target, so it re-checks rather than trusts the first reading, and
 * stays out of sight until one of these finds a clear spot (see below).
 */
const SETTLE_MS = [350, 800, 1300];

interface Placement {
  /** The hand's unrotated top-left, in surface px (it rotates and scales about its centre). */
  x: number;
  y: number;
  side: Side;
  scale: number;
  /** Readable area this spot covers, in surface px². 0 is the only acceptable resting place. */
  covers: number;
}

/** The hand's VISUAL box for a side of `rect` — after rotation and scale — in surface px. */
function visualBox(rect: Rect, side: Side, scale: number, anchor: "centre" | "start"): { left: number; top: number; width: number; height: number } {
  const upright = side === "below" || side === "above";
  const width = (upright ? HAND_W : HAND_H) * scale;
  const height = (upright ? HAND_H : HAND_W) * scale;
  const cx = anchor === "start" ? rect.x + width / 2 : rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  if (side === "below") return { left: cx - width / 2, top: rect.y + rect.height + TIP_GAP, width, height };
  if (side === "above") return { left: cx - width / 2, top: rect.y - TIP_GAP - height, width, height };
  if (side === "left") return { left: rect.x - TIP_GAP - width, top: cy - height / 2, width, height };
  return { left: rect.x + rect.width + TIP_GAP, top: cy - height / 2, width, height };
}

export function Pointer({ at, pulseKey = 0, parked = false, onSide, inverted = false, layoutKey = 0 }: PointerProps) {
  const board = useBoard();
  const reduced = useReducedMotion();
  const rect = useTargetRect(at, 650, layoutKey);
  const visible = at !== null && rect !== null;
  const surfaceWidth = board.surface?.offsetWidth ?? 0;
  const side: "left" | "right" | null = visible && surfaceWidth ? (rect.x + rect.width / 2 < surfaceWidth / 2 ? "left" : "right") : null;
  useEffect(() => {
    onSide?.(parked ? null : side);
  }, [side, parked, onSide]);
  const [last, setLast] = useState<Placement>({ x: 40, y: 40, side: "below", scale: 1, covers: 0 });
  // A table cell is pointed at with the smaller hand (M10, S1, G13: 30×39); a whole chalk line from its start (G2: the hand under the line).
  const atCell = at !== null && "cell" in at;
  const atLine = !atCell && at !== null && "text" in at && !("place" in at && at.place) && rect !== null && rect.width > 120;
  const scale = atCell ? 0.75 : 1;
  const rectKey = rect ? `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : "";

  // NOTHING OVERLAPS: the hand goes to the first side of its target where it covers nothing readable — below (the design's
  // resting place), above, then beside — and stays on the board. If every side covers something, the side that covers least.
  // What arrives around the target arrives animated (chips fade in, a dock slides up): the hand looks again once it has.
  const [settled, setSettled] = useState(SETTLE_MS.length);
  useEffect(() => {
    // Counted from 0 again for each new layout, so the render below can tell
    // "still looking for a clear spot" from "there is no clear spot".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettled(0);
    const timers = SETTLE_MS.map((ms) => setTimeout(() => setSettled((n) => n + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [layoutKey, rectKey]);
  useEffect(() => {
    const surface = board.surface;
    if (!rect || !surface) return;
    const root = surface.closest("[data-board-root]") ?? surface;
    const surfaceBox = surface.getBoundingClientRect();
    const k = surface.offsetWidth ? surfaceBox.width / surface.offsetWidth : 1;
    // Readable boxes in surface px; whatever is INSIDE the target itself is what she is pointing at, not an obstacle for the tip's side…
    const obstacles = readableBoxes(root).map((b) => ({ left: (b.left - surfaceBox.left) / k, top: (b.top - surfaceBox.top) / k, right: (b.right - surfaceBox.left) / k, bottom: (b.bottom - surfaceBox.top) / k }));
    const order: Side[] = inverted ? ["above", "below", "left", "right"] : atCell ? ["left", "below", "right", "above"] : ["below", "above", "left", "right"];
    const candidates: Array<{ side: Side; box: { left: number; top: number; width: number; height: number }; scale?: number }> = order.map((candidate) => ({ side: candidate, box: visualBox(rect, candidate, scale, atLine && (candidate === "below" || candidate === "above") ? "start" : "centre") }));
    // A table cell's own resting place, from the design (M10, S1, G13): the small hand at the cell's left edge, hanging 12 px
    // below its top — clear of the cell's centred text. It comes first; the sides follow if that spot covers something.
    if (atCell) candidates.unshift({ side: "below", box: { left: rect.x - 2, top: rect.y + 12, width: HAND_W * scale, height: HAND_H * scale } });
    // A cell boxed in by full neighbours (a long place name either side, rows above and below): she points at its ROW from
    // outside the table — the cell itself is already outlined, or carries her ✎.
    const table = atCell ? board.resolve({ text: "table" }) : null;
    const tableRect = table ? board.measure(table) : null;
    if (atCell && tableRect) candidates.push({ side: "left", box: visualBox({ x: tableRect.x, y: rect.y, width: tableRect.width, height: rect.height }, "left", scale, "centre") });
    // A tight spot (a part between its neighbours, a rod above a dock): the smaller hand, on every side, before settling for an overlap.
    if (!atCell) for (const candidate of order) candidates.push({ side: candidate, box: visualBox(rect, candidate, SMALL_HAND, "centre"), scale: SMALL_HAND });
    let best: { placement: Placement; cost: number } | null = null;
    for (const { side: candidate, box, scale: handScale = scale } of candidates) {
      const handBox = { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height };
      const off = Math.max(0, -handBox.left) + Math.max(0, -handBox.top) + Math.max(0, handBox.right - surface.offsetWidth) + Math.max(0, handBox.bottom - surface.offsetHeight);
      const covered = obstacles.reduce((sum, o) => sum + intersectionArea(o, handBox), 0);
      const cost = covered + off * 200;
      // The element is HAND_W × HAND_H and transforms about its centre: place the centre where the visual box's is.
      const placement: Placement = { x: box.left + box.width / 2 - HAND_W / 2, y: box.top + box.height / 2 - HAND_H / 2, side: candidate, scale: handScale, covers: covered };
      if (!best || cost < best.cost) best = { placement, cost };
      if (cost === 0) break;
    }
    // A placement is MEASURED from the painted board (what is readable, and where): it cannot be known before the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (best && (best.placement.x !== last.x || best.placement.y !== last.y || best.placement.side !== last.side || best.placement.scale !== last.scale || best.placement.covers !== last.covers)) setLast(best.placement);
    // `rectKey` stands in for `rect` (a fresh object per measure); `board.version` re-places the hand when the board's content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rectKey, board.version, board.surface, inverted, scale, atLine, atCell, layoutKey, settled]);

  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (pulseKey) setPulse(pulseKey);
  }, [pulseKey]);
  if (!board.overlay) return null;
  // Parked (the child's turn): the hand rests where it last pointed (M3, M4).
  const pos = last;
  /**
   * NOTHING OVERLAPS, INCLUDING FOR A MOMENT (20 Sep 2026).
   *
   * Every side of the target can be occupied while the board is still
   * arriving — the table at readWrite4Digit:18c lands under a hand that was
   * placed against the card before it, and the least-bad spot sat on
   * "9 015" until the next re-check moved it. The live session probe caught
   * exactly that frame, and so would a child reading the row.
   *
   * So a hand with nowhere clean to go WAITS instead: hidden while the
   * re-checks are still running, shown wherever it landed once they are
   * done. A layout with genuinely no clear spot still gets a hand — after
   * 1.3 s, not a flash of one on top of a number the child is reading.
   */
  const stillLooking = settled < SETTLE_MS.length;
  const hidden = pos.covers > 0 && stillLooking;
  return createPortal(
    <motion.div
      data-testid="pointer"
      data-parked={parked || undefined}
      data-side={side ?? undefined}
      data-placed={pos.side}
      initial={false}
      data-waiting={hidden || undefined}
      animate={{ left: pos.x, top: pos.y, opacity: hidden || !(visible || parked) ? 0 : parked ? 0.85 : 1, rotate: ROTATION[pos.side], scale: pos.scale }}
      // Going out of sight is instant — a spring would leave the hand legible
      // on top of a number for the length of its own fade, which is the very
      // frame this is here to remove. Coming back is an ordinary fade.
      transition={reduced ? { duration: 0 } : { ...SPRING_SNAPPY, opacity: { duration: hidden ? 0 : 0.15 } }}
      style={{ position: "absolute", width: HAND_W, height: HAND_H, pointerEvents: "none", zIndex: 8, transformOrigin: "center" }}
      aria-hidden
    >
      {pulse > 0 && !reduced && (
        <motion.div
          key={pulse}
          data-layout-ignore
          initial={{ opacity: 0.45, scale: 1 }}
          animate={{ opacity: 0, scale: 1.7 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ position: "absolute", left: 8, top: -10, width: 24, height: 24, borderRadius: "50%", border: "3px solid var(--color-saffron)" }}
        />
      )}
      <ChalkHand />
    </motion.div>,
    board.overlay,
  );
}
