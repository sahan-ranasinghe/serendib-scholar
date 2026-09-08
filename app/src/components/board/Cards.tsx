"use client";

/**
 * The two card primitives.
 *
 *   titleCard.show { title, emoji? } — a big friendly card: one heading,
 *   one emoji, in 300 ms.
 *
 *   textCard.show { text } — a plain card with short text ("100 000",
 *   "ලොකු සංඛ්‍යා"): a chalk card WITHOUT the write animation. Numbers
 *   are still drawn in the hand face, they just appear at once.
 */
import { motion } from "framer-motion";
import { HandNumber } from "./HandNumber";
import { WriteOn } from "./WriteOn";
import { isHandWritable } from "./HandGlyphs";
import { numbersIn } from "./ChalkText";
import { useTargetRef } from "./targets";
import { BOARD } from "./theme";

export interface TitleCardProps {
  title: string;
  emoji?: string;
}

export function TitleCard({ title, emoji }: TitleCardProps) {
  const ref = useTargetRef(["component:titleCard", `text:${title}`]);
  return (
    <motion.div
      ref={ref}
      data-testid="title-card"
      initial={{ opacity: 0, scale: 0.9, rotate: -1.5 }}
      animate={{ opacity: 1, scale: 1, rotate: -0.6 }}
      transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1.1] }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "clamp(14px, 3vw, 26px) clamp(22px, 5vw, 44px)",
        borderRadius: 16,
        background: "#FFFBF0",
        boxShadow: `0 10px 26px rgba(40,25,10,0.22), inset 0 0 0 3px ${BOARD.markerBlue}`,
        maxWidth: "92%",
      }}
    >
      {emoji && (
        <span aria-hidden style={{ fontSize: "clamp(34px, 7vw, 58px)", lineHeight: 1 }}>
          {emoji}
        </span>
      )}
      <WriteOn text={title} size={38} weight={800} durationMs={300} style={{ fontSize: "clamp(24px, 4.5vw, 40px)", whiteSpace: title.length <= 16 ? "nowrap" : "pre-wrap" }} />
    </motion.div>
  );
}

export interface TextCardProps {
  text: string;
  size?: number;
}

export function TextCard({ text, size = 40 }: TextCardProps) {
  const numbers = numbersIn(text);
  const ref = useTargetRef("component:textCard");
  // A ring or underline goes round the WRITING — the word, the number —
  // not the card's padding, so the text keys sit on the inner span.
  const inner = useTargetRef<HTMLSpanElement>([`text:${text}`, ...numbers.map((n) => `number:${n}`)]);
  const hand = isHandWritable(text);
  return (
    <motion.div
      ref={ref}
      data-testid="text-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        padding: "14px 30px",
        borderRadius: 10,
        background: "rgba(255,253,247,0.9)",
        boxShadow: `0 4px 12px rgba(40,25,10,0.18), inset 0 0 0 2.5px ${BOARD.markerBlue}`,
        maxWidth: "92%",
      }}
    >
      <span ref={inner} style={{ display: "inline-block" }}>
        {hand ? (
          <HandNumber text={text} size={size} draw={false} targetBase={`text:${text}`} />
        ) : (
          <WriteOn text={text} size={size * 0.8} write={false} />
        )}
      </span>
    </motion.div>
  );
}
