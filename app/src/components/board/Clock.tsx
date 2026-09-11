"use client";

/**
 * The clock (stretch, 5.6b): a 200-unit face on paper with an ink-40 2 px
 * edge and a 6 px wood rim, twelve ink ticks with Gemunu 700 20 numerals at
 * r 68, the hour hand wood-dark 7, the minute hand teal 5, a teal centre;
 * a minute hand being dragged leaves a dashed ghost at 25 % and carries a
 * saffron grip ring (r 22, a 48 px hit) with a lift shadow. The time in
 * StrokeNum 30 beneath.
 */
import { useRef, useState } from "react";
import { HandNumber } from "./HandNumber";
import { useTargetRef } from "./targets";
import { BOARD, FONT_SINHALA } from "./tokens";

export interface ClockProps {
  hour: number;
  minute: number;
  interactive?: boolean;
  onMinute?: (minute: number) => void;
  size?: number;
}

const TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = ((i + 1) * Math.PI) / 6 - Math.PI / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { n: i + 1, x1: 100 + 82 * c, y1: 100 + 82 * s, x2: 100 + 88 * c, y2: 100 + 88 * s, tx: 100 + 68 * c, ty: 100 + 68 * s };
});

export function Clock({ hour, minute, interactive = false, onMinute, size = 180 }: ClockProps) {
  const ref = useTargetRef<HTMLDivElement>("component:clock");
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ from: number; minute: number } | null>(null);
  const shownMinute = drag ? drag.minute : minute;
  const minuteAngle = (shownMinute / 60) * 2 * Math.PI - Math.PI / 2;
  const hourAngle = (((hour % 12) + shownMinute / 60) / 12) * 2 * Math.PI - Math.PI / 2;
  const mx = 100 + 50 * Math.cos(minuteAngle);
  const my = 100 + 50 * Math.sin(minuteAngle);
  const hx = 100 + 52 * Math.cos(hourAngle);
  const hy = 100 + 52 * Math.sin(hourAngle);
  const ghostAngle = drag ? (drag.from / 60) * 2 * Math.PI - Math.PI / 2 : 0;
  const minuteAt = (clientX: number, clientY: number): number => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return shownMinute;
    const x = ((clientX - box.left) / box.width) * 200 - 100;
    const y = ((clientY - box.top) / box.height) * 200 - 100;
    const a = Math.atan2(y, x) + Math.PI / 2;
    return ((Math.round((a / (2 * Math.PI)) * 60) % 60) + 60) % 60;
  };
  const label = `${hour}:${String(shownMinute).padStart(2, "0")}`;
  return (
    <div ref={ref} data-testid="clock" style={{ display: "grid", gap: 12, justifyItems: "center" }}>
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        width={size}
        height={size}
        style={{ overflow: "visible", touchAction: "none" }}
        onPointerDown={interactive ? (e) => { setDrag({ from: minute, minute }); (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId); } : undefined}
        onPointerMove={interactive && drag ? (e) => setDrag((d) => (d ? { ...d, minute: minuteAt(e.clientX, e.clientY) } : d)) : undefined}
        onPointerUp={interactive ? (e) => { const m = minuteAt(e.clientX, e.clientY); setDrag(null); onMinute?.(m); } : undefined}
      >
        <circle cx="100" cy="100" r="92" fill={BOARD.paper} stroke="rgba(27,27,27,.4)" strokeWidth="2" />
        <circle cx="100" cy="100" r="92" fill="none" stroke={BOARD.wood} strokeWidth="6" />
        {TICKS.map((t) => (
          <g key={t.n}>
            <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={BOARD.ink} strokeWidth="3" strokeLinecap="round" />
            <text x={t.tx} y={t.ty} textAnchor="middle" dominantBaseline="middle" fontFamily={FONT_SINHALA} fontWeight="700" fontSize="20" fill={BOARD.ink}>
              {t.n}
            </text>
          </g>
        ))}
        <line x1="100" y1="100" x2={hx} y2={hy} stroke={BOARD.woodDark} strokeWidth="7" strokeLinecap="round" />
        {drag && <line x1="100" y1="100" x2={100 + 50 * Math.cos(ghostAngle)} y2={100 + 50 * Math.sin(ghostAngle)} stroke={BOARD.teal} strokeWidth="5" strokeLinecap="round" opacity=".25" strokeDasharray="6 6" />}
        <line data-testid="clock-minute-hand" x1="100" y1="100" x2={mx} y2={my} stroke={BOARD.teal} strokeWidth="5" strokeLinecap="round" style={drag ? { filter: "drop-shadow(0 8px 6px rgba(27,27,27,.3))" } : undefined} />
        {(drag || interactive) && <circle cx={mx} cy={my} r="22" fill={BOARD.saffronSoft} stroke={BOARD.chalkYellow} strokeWidth="4" opacity={drag ? 0.9 : 0.6} />}
        <circle cx="100" cy="100" r="6" fill={BOARD.teal} />
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <HandNumber text={label} size={30} color={BOARD.ink} draw={false} registerNumbers={false} />
      </div>
    </div>
  );
}
