"use client";

/**
 * The title card and the text card, from the design.
 *   titleCard: a chalk-drawn frame (300×120 path, ink at 70 %, 3 px), an
 *              emoji at 44 and the heading in Gemunu 700 44 — 32 when it
 *              persists dimmed beside newer cards (rule b).
 *   textCard:  paper, 80 tall, padding 0 22, radius 12, ink-18 border,
 *              paper shadow; numerals in StrokeNum 44, words in Gemunu 700 36.
 */
import { motion } from "framer-motion";
import { HandNumber } from "./HandNumber";
import { isHandWritable } from "./HandGlyphs";
import { useTargetRef } from "./targets";
import { BOARD, FONT_SINHALA, SPRING } from "./tokens";
import { numbersIn } from "./ChalkText";

export interface TitleCardProps {
  title: string;
  emoji?: string;
  /** Persisting beside newer cards: 60 % and smaller. */
  dimmed?: boolean;
}

export function TitleCard({ title, emoji, dimmed = false }: TitleCardProps) {
  const ref = useTargetRef(["component:titleCard", `text:${title}`]);
  const size = dimmed ? 32 : 44;
  return (
    <motion.div
      ref={ref}
      data-testid="title-card"
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: dimmed ? 0.6 : 1, scale: 1, y: 0 }}
      transition={SPRING}
      style={{ position: "relative", padding: dimmed ? "18px 30px" : "26px 44px", display: "flex", alignItems: "center", gap: dimmed ? 14 : 20 }}
    >
      <svg viewBox="0 0 300 120" className="chalk-stroke" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="none" aria-hidden>
        <path d="M8 10C90 4 210 6 292 10c4 30 4 70 0 100-84 6-200 4-284 0C4 80 4 40 8 10z" fill="none" stroke={BOARD.ink} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity=".7" />
      </svg>
      {emoji && <span style={{ fontSize: size, lineHeight: 1 }}>{emoji}</span>}
      <span style={{ font: `700 ${size}px/1.5 ${FONT_SINHALA}`, color: BOARD.ink, whiteSpace: "nowrap" }}>{title}</span>
    </motion.div>
  );
}

export interface TextCardProps {
  text: string;
  size?: number;
  /** A second card stacked beside: shifted and tilted, at 70 %. */
  stacked?: boolean;
  /** Persisting while chalk is written beside it (rule b). */
  dimmed?: boolean;
}

export function TextCard({ text, size, stacked = false, dimmed = false }: TextCardProps) {
  const numbers = numbersIn(text);
  const ref = useTargetRef<HTMLDivElement>(["component:textCard", `text:${text}`, ...numbers.map((n) => `number:${n}`)]);
  const hand = isHandWritable(text.replace(/\s/gu, ""));
  return (
    <motion.div
      ref={ref}
      data-testid="text-card"
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: stacked ? 0.7 : dimmed ? 0.6 : 1, y: 0, scale: 1, x: stacked ? 30 : 0, rotate: stacked ? 4 : 0 }}
      transition={SPRING}
      style={{
        position: "relative",
        padding: "0 22px",
        height: 80,
        background: BOARD.paper,
        border: `2px solid ${BOARD.ink18}`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        boxShadow: "var(--shadow-paper)",

      }}
    >
      {hand ? (
        <HandNumber text={text} size={size ?? 44} color={BOARD.ink} registerNumbers={false} />
      ) : (
        <span style={{ font: `700 ${size ?? 36}px/1.5 ${FONT_SINHALA}`, color: BOARD.ink, whiteSpace: "nowrap" }}>{text}</span>
      )}
    </motion.div>
  );
}
