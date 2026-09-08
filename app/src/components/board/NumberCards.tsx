"use client";

/**
 * A row of numbers on chalk cards — "84 · 101 · 528 · 997". Cards deal in
 * left to right; a chalk-yellow ring goes round one of them.
 *
 * Vocabulary:
 *   show { values }            → values
 *   highlight_ring { value }   → ringed
 *   ring_off                   → ringed = null
 *
 * TOUCH: tap a card to select it (it lifts); drag a card onto another to
 * put it there.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HandNumber } from "./HandNumber";
import { useTargetRef } from "./targets";
import { BOARD, formatNumber, SPRING, TOUCH_MIN } from "./theme";
import { ringPath } from "./strokes";
import { playSound } from "./sound";
import { hitTest, useDrag, type DragPoint } from "./useDrag";

export interface NumberCardsProps {
  values: number[];
  ringed?: number | null;
  selected?: number | null;
  interactive?: boolean;
  onSelect?: (value: number | null) => void;
  onReorder?: (values: number[]) => void;
  size?: number;
}

const TILTS = [-2.5, 1.5, -1, 2, -1.5, 1];

export function NumberCards({ values, ringed = null, selected = null, interactive = false, onSelect, onReorder, size = 34 }: NumberCardsProps) {
  const rootRef = useTargetRef("component:numberCards");
  const [ghost, setGhost] = useState<{ point: DragPoint; value: number } | null>(null);
  const drag = useDrag<number>({
    onStart: (position, point) => setGhost({ point, value: values[position]! }),
    onMove: (_, point) => setGhost((g) => (g ? { ...g, point } : g)),
    onEnd: (position, point, moved) => {
      setGhost(null);
      if (!moved) {
        const value = values[position]!;
        playSound("beadClick");
        onSelect?.(selected === value ? null : value);
        return;
      }
      const hit = hitTest(point, "data-card");
      if (!hit) return;
      const to = values.indexOf(Number(hit.value));
      if (to < 0 || to === position) return;
      const next = [...values];
      const [card] = next.splice(position, 1);
      next.splice(to, 0, card!);
      playSound("beadClick");
      onReorder?.(next);
    },
  });

  return (
    <div ref={rootRef} data-testid="number-cards" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "clamp(8px, 2vw, 18px)" }}>
      <AnimatePresence initial={true}>
        {values.map((value, index) => (
          <Card
            key={value}
            value={value}
            index={index}
            size={size}
            ringed={ringed === value}
            selected={selected === value}
            interactive={interactive}
            handlers={interactive ? drag(index) : {}}
          />
        ))}
      </AnimatePresence>
      {ghost &&
        createPortal(
          <div style={{ position: "fixed", left: ghost.point.x - 40, top: ghost.point.y - 60, pointerEvents: "none", zIndex: 1000, transform: "scale(1.08)" }}>
            <CardFace value={ghost.value} size={size} lifted />
          </div>,
          document.body,
        )}
    </div>
  );
}

function Card({
  value,
  index,
  size,
  ringed,
  selected,
  interactive,
  handlers,
}: {
  value: number;
  index: number;
  size: number;
  ringed: boolean;
  selected: boolean;
  interactive: boolean;
  handlers: Record<string, unknown>;
}) {
  const ref = useTargetRef<HTMLDivElement>([`card:${value}`, `number:${value}`]);
  const box = useRef<HTMLDivElement | null>(null);
  const mergedRef = useCallback(
    (element: HTMLDivElement | null) => {
      ref(element);
      box.current = element;
    },
    [ref],
  );
  const [ringBox, setRingBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!ringed || !box.current) return;
    const { offsetWidth, offsetHeight } = box.current;
    const frame = requestAnimationFrame(() => setRingBox({ w: offsetWidth, h: offsetHeight }));
    return () => cancelAnimationFrame(frame);
  }, [ringed]);
  return (
    <motion.div
      ref={mergedRef}
      layout
      data-card={value}
      data-testid={`card-${value}`}
      data-ringed={ringed || undefined}
      className={interactive ? "wb-touch" : undefined}
      role={interactive ? "button" : undefined}
      aria-label={`${value}${selected ? " (selected)" : ""}`}
      aria-pressed={interactive ? selected : undefined}
      {...handlers}
      initial={{ x: -48, y: -14, rotate: -9, opacity: 0 }}
      animate={{ x: 0, y: selected ? -8 : 0, rotate: TILTS[index % TILTS.length], opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={{ ...SPRING, delay: index * 0.07 }}
      style={{ position: "relative", minWidth: TOUCH_MIN, minHeight: TOUCH_MIN }}
    >
      <CardFace value={value} size={size} lifted={selected} targetBase={`card:${value}`} />
      <AnimatePresence>
        {ringed && ringBox && (
          <motion.svg
            key="ring"
            className="chalk-stroke"
            width={ringBox.w + 20}
            height={ringBox.h + 20}
            style={{ position: "absolute", left: -10, top: -10, pointerEvents: "none", overflow: "visible" }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            aria-hidden
          >
            <motion.path
              d={ringPath(ringBox.w + 20, ringBox.h + 20)}
              fill="none"
              stroke={BOARD.chalkYellow}
              strokeWidth="5"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CardFace({ value, size, lifted, targetBase }: { value: number; size: number; lifted?: boolean; targetBase?: string }) {
  return (
    <div
      style={{
        padding: "10px 16px",
        borderRadius: 8,
        background: "#fffdf7",
        boxShadow: lifted
          ? `0 14px 22px rgba(40,25,10,0.3), inset 0 0 0 2.5px ${BOARD.markerBlue}`
          : `0 3px 6px rgba(40,25,10,0.2), inset 0 0 0 2.5px ${BOARD.markerBlue}`,
        transition: "box-shadow 150ms",
      }}
    >
      <HandNumber text={formatNumber(value)} size={size} draw={false} targetBase={targetBase} />
    </div>
  );
}
