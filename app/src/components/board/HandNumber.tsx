"use client";

/**
 * A number (or a short sum) in the board's handwriting: each glyph is an
 * SVG stroke revealed along its length, staggered left to right so the
 * whole string is drawn inside `budgetMs` (never more than 600 ms). Drawn
 * once — a re-render with the same text does not redraw.
 *
 * Every number in the string registers as `number:<n>` on a span around
 * its own glyphs — so "80" inside "84 = 80 + 4" is a target of its own,
 * and a ring or underline for it fits the 80, not the line. With
 * `targetBase`, each digit of the first number registers as
 * `<targetBase>/place:<place>` so a line can point at "the tens place of
 * 3058".
 */
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { GLYPHS } from "./HandGlyphs";
import { placeOfDigit, BOARD, MAX_MS } from "./theme";
import { useTargetRef } from "./targets";
import { playSound } from "./sound";

export interface HandNumberProps {
  text: string | number;
  /** Glyph height in px. */
  size?: number;
  color?: string;
  /** Draw the strokes on mount (true) or appear at once (false). */
  draw?: boolean;
  delayMs?: number;
  /** Total time for the whole string; clamped to MAX_MS. */
  budgetMs?: number;
  /** Register each digit as `<targetBase>/place:<place>`. */
  targetBase?: string;
  /** Register the whole string under these keys as well. */
  targetKeys?: string[];
  /** Register each number in the string as `number:<n>` on its own glyphs (default true). */
  registerNumbers?: boolean;
  /** Marker thickness in glyph units. */
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  onDrawn?: () => void;
}

export function HandNumber({
  text,
  size = 40,
  color = BOARD.markerBlue,
  draw = true,
  delayMs = 0,
  budgetMs = MAX_MS,
  targetBase,
  targetKeys,
  registerNumbers = true,
  strokeWidth = 5,
  className,
  style,
  onDrawn,
}: HandNumberProps) {
  const reduced = useReducedMotion();
  const rootRef = useTargetRef<HTMLSpanElement>(targetKeys?.length ? targetKeys : null);
  const chars = [...String(text)];
  const drawn = chars.filter((c) => c !== " ").length;
  const budget = Math.min(budgetMs, MAX_MS) / 1000;
  const each = Math.min(0.26, (budget / Math.max(1, drawn)) * 1.5);
  const stagger = drawn > 1 ? (budget - each) / (drawn - 1) : 0;
  const animate = draw && !reduced;
  const digitPositions = digitIndexes(chars);
  const groups = registerNumbers ? numberGroups(chars) : [];

  useEffect(() => {
    if (animate) playSound("chalk");
    const done = setTimeout(() => onDrawn?.(), animate ? delayMs + budget * 1000 : 0);
    return () => clearTimeout(done);
    // draw-once: only the text matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [String(text)]);

  let strokeIndex = 0;
  const glyphAt = (char: string, index: number) => {
    const glyph = GLYPHS[char] ?? GLYPHS["?"]!;
    const order = char === " " ? -1 : strokeIndex++;
    const place = digitPositions.get(index);
    return (
      <Glyph
        key={`${index}:${char}`}
        d={glyph.d}
        width={(glyph.w / 60) * size}
        height={size}
        color={color}
        strokeWidth={strokeWidth}
        animate={animate && order >= 0}
        delay={delayMs / 1000 + Math.max(0, order) * stagger}
        duration={each}
        targetKey={targetBase && place ? `${targetBase}/place:${place.place}` : null}
      />
    );
  };
  // Glyphs, with each number's run wrapped in its own registered span.
  const rendered: ReactNode[] = [];
  for (let index = 0; index < chars.length; ) {
    const group = groups.find((g) => g.start === index);
    if (group) {
      rendered.push(
        <NumberSpan key={`n${index}`} value={group.value}>
          {chars.slice(group.start, group.end).map((char, offset) => glyphAt(char, group.start + offset))}
        </NumberSpan>,
      );
      index = group.end;
    } else {
      rendered.push(glyphAt(chars[index]!, index));
      index += 1;
    }
  }
  return (
    <span
      ref={rootRef}
      className={`hand-number ${className ?? ""}`}
      style={{ display: "inline-flex", alignItems: "flex-end", lineHeight: 0, verticalAlign: "middle", ...style }}
      aria-label={String(text)}
    >
      {rendered}
    </span>
  );
}

/** The runs of digits (a thousands space allowed) in the string, as [start, end) with their value. */
function numberGroups(chars: string[]): Array<{ start: number; end: number; value: number }> {
  const groups: Array<{ start: number; end: number; value: number }> = [];
  const text = chars.join("");
  for (const match of text.matchAll(/\d+(?: \d{3})*/gu)) {
    const start = [...text.slice(0, match.index)].length;
    groups.push({ start, end: start + [...match[0]].length, value: Number(match[0].replace(/\s/gu, "")) });
  }
  return groups;
}

function NumberSpan({ value, children }: { value: number; children: ReactNode }) {
  const ref = useTargetRef<HTMLSpanElement>(`number:${value}`);
  return (
    <span ref={ref} data-number={value} style={{ display: "inline-flex", alignItems: "flex-end" }}>
      {children}
    </span>
  );
}

/** Which characters are digits of the first number in the string, and their places. */
function digitIndexes(chars: string[]): Map<number, { place: string }> {
  const map = new Map<number, { place: string }>();
  const indexes: number[] = [];
  let started = false;
  for (let i = 0; i < chars.length; i += 1) {
    const isDigit = /\d/u.test(chars[i]!);
    if (isDigit) {
      indexes.push(i);
      started = true;
    } else if (started && !(chars[i] === " " && /\d/u.test(chars[i + 1] ?? ""))) {
      break;
    }
  }
  indexes.forEach((charIndex, digitIndex) => {
    const place = placeOfDigit(digitIndex, indexes.length);
    if (place) map.set(charIndex, { place });
  });
  return map;
}

function Glyph({
  d,
  width,
  height,
  color,
  strokeWidth,
  animate,
  delay,
  duration,
  targetKey,
}: {
  d: string;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  animate: boolean;
  delay: number;
  duration: number;
  targetKey: string | null;
}) {
  const ref = useTargetRef<SVGSVGElement>(targetKey);
  return (
    <svg
      ref={ref}
      className="hand-stroke"
      viewBox={`0 0 ${Math.round((width / height) * 60)} 60`}
      width={width}
      height={height}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden
    >
      {d && (
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animate ? { pathLength: 0, opacity: 0.6 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ pathLength: { duration, delay, ease: "easeOut" }, opacity: { duration: 0.05, delay } }}
        />
      )}
    </svg>
  );
}
