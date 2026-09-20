"use client";

/**
 * Number cards, from the design: paper cards (min 96×80, padding 0 14,
 * radius 12, 2 px ink-18 border, paper shadow) with StrokeNum 44 in ink,
 * dealt in left to right; a chalk-saffron ring around one; a lifted card
 * rises 10 px, tilts −3° and takes the lift shadow. Ten cards use 56×60
 * in one row (rule d) and veil to 50 % once four are drawn — those four
 * lift out at 72×76.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HandNumber } from "./HandNumber";
import { useTargetRef } from "./targets";
import { BOARD, SPRING, TOUCH_MIN } from "./tokens";
import { lassoPath } from "./strokes";
import { playSound } from "./sound";
import { hitTest, useDrag, type DragPoint } from "./useDrag";

export interface NumberCardsProps {
  values: number[];
  ringed?: number | null;
  selected?: number | null;
  interactive?: boolean;
  onSelect?: (value: number | null) => void;
  onReorder?: (values: number[]) => void;
  /** Numeral height: 44 on the board, 34 in the gallery's small cards. */
  size?: number;
  /** The four cards drawn from a ten-card row: they lift out at 72×76, the row veils. */
  drawn?: number[];
  /** The number the drawn cards make, on a card beside them after an arrow (G3). */
  made?: string;
}

export function NumberCards({ values, ringed = null, selected = null, interactive = false, onSelect, onReorder, size = 44, drawn, made }: NumberCardsProps) {
  const rootRef = useTargetRef("component:numberCards");
  const tenRow = values.length >= 8;
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
  const small = size <= 34 && !tenRow;
  return (
    <div ref={rootRef} data-testid="number-cards" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: tenRow ? "nowrap" : "wrap", justifyContent: "center", alignItems: "center", gap: tenRow ? 8 : small ? 12 : 22, opacity: tenRow && drawn?.length ? 0.5 : 1, transition: "opacity var(--dur-ui)" }}>
        <AnimatePresence initial={true}>
          {values.map((value, index) => (
            <Card
              key={value}
              value={value}
              index={index}
              size={tenRow ? 34 : size}
              box={tenRow ? { minWidth: 56, height: 60, padding: "0", radius: 10 } : small ? { minWidth: 72, height: 64, padding: "0 10px", radius: 10 } : { minWidth: 96, height: 80, padding: "0 14px", radius: 12 }}
              ringed={ringed === value}
              selected={selected === value}
              interactive={interactive}
              handlers={interactive ? drag(index) : {}}
              ringInset={small ? 12 : 14}
            />
          ))}
        </AnimatePresence>
      </div>
      {tenRow && drawn && drawn.length > 0 && (
        <div data-testid="drawn-cards" style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 8 }}>
          {drawn.map((d) => (
            <div key={d} style={{ width: 72, height: 76, background: BOARD.paper, border: `2px solid ${BOARD.ink18}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-lift)", transform: "translateY(-6px)" }}>
              <HandNumber text={d} size={44} color={BOARD.ink} draw={false} registerNumbers={false} />
            </div>
          ))}
          {made && (
            <>
              <span aria-hidden style={{ font: `700 40px/1 var(--font-display)`, color: BOARD.ink40, margin: "0 6px" }}>→</span>
              <div data-testid="made-card" style={{ padding: "0 20px", height: 76, background: BOARD.paper, border: `2px solid ${BOARD.ink18}`, borderRadius: 12, display: "flex", alignItems: "center", boxShadow: "var(--shadow-paper)" }}>
                <HandNumber text={made} size={44} color={BOARD.ink} draw={false} targetKeys={[`text:${made}`]} />
              </div>
            </>
          )}
        </div>
      )}
      {ghost &&
        createPortal(
          <div style={{ position: "fixed", left: ghost.point.x - 48, top: ghost.point.y - 60, pointerEvents: "none", zIndex: 1000 }}>
            <CardFace value={ghost.value} size={size} box={{ minWidth: 96, height: 80, padding: "0 14px", radius: 12 }} lifted />
          </div>,
          document.body,
        )}
    </div>
  );
}

interface Box {
  minWidth: number;
  height: number;
  padding: string;
  radius: number;
}

function Card({
  value,
  index,
  size,
  box,
  ringed,
  selected,
  interactive,
  handlers,
  ringInset,
}: {
  value: number;
  index: number;
  size: number;
  box: Box;
  ringed: boolean;
  selected: boolean;
  interactive: boolean;
  handlers: Record<string, unknown>;
  ringInset: number;
}) {
  // The ring is drawn in the card's own pixels (cluster F): measure the card, redraw on resize.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const read = () => {
      // offsetWidth/Height: the layout box, untouched by the deal-in rotation and the lift.
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setMeasured((m) => (m && Math.abs(m.w - w) < 0.5 && Math.abs(m.h - h) < 0.5 ? m : { w, h }));
    };
    read();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const ref = useTargetRef<HTMLDivElement>([`card:${value}`, `number:${value}`]);
  const el = useRef<HTMLDivElement | null>(null);
  const mergedRef = useCallback(
    (element: HTMLDivElement | null) => {
      ref(element);
      el.current = element;
      cardRef.current = element;
    },
    [ref],
  );
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
      initial={{ x: 40, rotate: 6, opacity: 0.6 }}
      animate={{ x: 0, y: selected ? -10 : 0, rotate: selected ? -3 : 0, opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={{ ...SPRING, delay: index * 0.07 }}
      style={{ position: "relative", minWidth: Math.max(box.minWidth, interactive ? TOUCH_MIN : 0), minHeight: interactive ? TOUCH_MIN : undefined }}
    >
      <CardFace value={value} size={size} box={box} lifted={selected} />
      {ringed && measured && (
        <svg viewBox={`0 0 ${measured.w + ringInset * 2} ${measured.h + ringInset * 2}`} className="chalk-stroke" data-testid="card-ring" data-pad={ringInset} style={{ position: "absolute", inset: -ringInset, width: `calc(100% + ${ringInset * 2}px)`, height: `calc(100% + ${ringInset * 2}px)`, overflow: "visible", pointerEvents: "none" }} preserveAspectRatio="none" aria-hidden>
          <motion.path d={lassoPath(measured.w + ringInset * 2, measured.h + ringInset * 2, ringInset)} fill="none" stroke="var(--color-saffron)" strokeWidth="3.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, ease: "easeOut" }} />
        </svg>
      )}
    </motion.div>
  );
}

function CardFace({ value, size, box, lifted = false }: { value: number; size: number; box: Box; lifted?: boolean }) {
  return (
    <div
      style={{
        minWidth: box.minWidth,
        height: box.height,
        padding: box.padding,
        background: BOARD.paper,
        border: `2px solid ${BOARD.ink18}`,
        borderRadius: box.radius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: lifted ? "var(--shadow-lift)" : "var(--shadow-paper)",

      }}
    >
      <HandNumber text={value} size={size} color={BOARD.ink} draw={false} registerNumbers={false} />
    </div>
  );
}
