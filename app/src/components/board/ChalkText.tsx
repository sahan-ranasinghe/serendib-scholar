"use client";

/**
 * Verbatim marker writing — a sum, a sentence, a term — written left to
 * right in ≤ 600 ms. Numbers and signs are drawn as strokes
 * (HandNumber); Sinhala words are wiped on in the Sinhala face (WriteOn).
 *
 * Vocabulary:
 *   write { text, append? }  → text (with `append`, only the tail is
 *                              new: the head stays put and the tail writes)
 *   erase                    → the Whiteboard's `wipeKey`; unmount this
 *
 * Registers the whole line as `text:<text>`; each number as `number:<n>`
 * on the token that shows it (so an underline under 80 in "84 = 80 + 4"
 * is under the 80, not the line); and the digits of the first number as
 * `text:<text>/place:<place>`.
 */
import { useMemo } from "react";
import { HandNumber } from "./HandNumber";
import { WriteOn } from "./WriteOn";
import { isGlyph } from "./HandGlyphs";
import { useTargetRef } from "./targets";
import { BOARD, FONT_SINHALA, MAX_MS } from "./tokens";

export interface ChalkTextProps {
  text: string;
  /** The part of `text` that is new (must be its tail). */
  append?: string;
  size?: number;
  color?: string;
  align?: "left" | "center";
  /** An older line of the chalk stack: 60 % (rule a). */
  dimmed?: boolean;
  /** Mid-write: the marker cursor waits at the end of the line. */
  cursor?: boolean;
  /** The child answers this line on the pad: a trailing "?" becomes the glowing answer slot showing their digits so far (G2). */
  answerSlot?: { draft: string; glow: boolean; /** The draft is a committed entry, and how the judge found it. */ verdict?: "pending" | "correct" | "wrong" } | null;
}

interface Token {
  kind: "hand" | "word";
  text: string;
}

/** Splits a line into stroke-drawn runs and word runs; spaces join the run they follow. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const char of text) {
    const last = tokens[tokens.length - 1];
    if (char === " " && last) {
      last.text += char;
      continue;
    }
    const kind: Token["kind"] = isGlyph(char) && char !== " " ? "hand" : "word";
    if (last && last.kind === kind) last.text += char;
    else tokens.push({ kind, text: char });
  }
  return tokens.filter((t) => t.text.length > 0);
}

export function numbersIn(text: string): number[] {
  const joined = text.replace(/(\d)\s(?=\d{3}(?!\d))/gu, "$1");
  return [...joined.matchAll(/\d+/gu)].map((m) => Number(m[0]));
}

interface Planned extends Token {
  key: string;
  write: boolean;
  delayMs: number;
  budgetMs: number;
  targetBase?: string;
}

/** The write plan: every token, when it starts, and how long it has — the tail inside MAX_MS. */
function plan(head: string, tail: string, fullText: string): Planned[] {
  const total = tail.replace(/\s/gu, "").length || 1;
  const planned: Planned[] = [];
  let elapsed = 0;
  let firstNumberSeen = false;
  const push = (tokens: Token[], write: boolean, prefix: string) => {
    tokens.forEach((token, index) => {
      const share = (token.text.replace(/\s/gu, "").length / total) * MAX_MS;
      const isFirstNumber = !firstNumberSeen && token.kind === "hand" && /\d/u.test(token.text);
      if (isFirstNumber) firstNumberSeen = true;
      planned.push({
        ...token,
        key: `${prefix}${index}:${token.text}`,
        write,
        delayMs: write ? elapsed : 0,
        budgetMs: Math.max(120, share),
        targetBase: isFirstNumber ? `text:${fullText}` : undefined,
      });
      if (write) elapsed += share;
    });
  };
  push(tokenize(head), false, "h");
  push(tokenize(tail), true, "t");
  return planned;
}

export function ChalkText({ text: fullText, append: fullAppend, size = 34, color = BOARD.markerBlue, align = "center", dimmed = false, cursor = false, answerSlot = null }: ChalkTextProps) {
  // With an answer slot, the line's trailing "?" is the slot itself (G2); after a trailing "+" the next value's slot waits (G10).
  const slotted = answerSlot !== null && /\?\s*$/u.test(fullText);
  const nextSlot = answerSlot !== null && !slotted && /\+\s*$/u.test(fullText);
  const text = slotted ? fullText.replace(/\s*\?\s*$/u, "").trimEnd() : fullText;
  const append = slotted && fullAppend ? fullAppend.replace(/\s*\?\s*$/u, "").trimEnd() : fullAppend;
  const hasTail = Boolean(append && text.endsWith(append));
  const head = hasTail ? text.slice(0, text.length - append!.length) : "";
  const tail = hasTail ? append! : text;
  const planned = useMemo(() => plan(head, tail, text), [head, tail, text]);
  const ref = useTargetRef(`text:${fullText}`);
  // Sinhala words on the board are Gemunu Libre, never under 28 px (rule 4).
  const wordSize = Math.max(28, Math.round(size * 0.85));
  return (
    <div
      ref={ref}
      className="chalk-text"
      data-testid="chalk-text"
      data-dimmed={dimmed || undefined}
      style={{ display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", gap: "0.3em", opacity: dimmed ? 0.6 : 1, transition: "opacity var(--dur-ui)", maxWidth: "100%" }}
    >
      {planned.map((token) =>
        token.kind === "hand" ? (
          <HandNumber key={token.key} text={token.text} size={size} color={color} draw={token.write} delayMs={token.delayMs} budgetMs={token.budgetMs} targetBase={token.targetBase} />
        ) : (
          <WriteOn key={token.key} text={token.text} size={wordSize} color={color} weight={700} write={token.write} delayMs={token.delayMs} durationMs={token.budgetMs} style={{ fontFamily: FONT_SINHALA, lineHeight: 1.6 }} />
        ),
      )}
      {slotted && answerSlot && (
        <span data-testid="chalk-answer-slot" data-entry={answerSlot.verdict ? answerSlot.draft : undefined} data-entry-verdict={answerSlot.verdict} className={answerSlot.glow ? "wb-glow" : undefined} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, width: 120, height: 52, border: `3px dashed ${BOARD.chalkYellow}`, borderRadius: 10, background: BOARD.saffronSoft }}>
          {answerSlot.draft && <HandNumber text={answerSlot.draft} size={34} color={BOARD.successText} draw={false} registerNumbers={false} />}
          {!answerSlot.verdict && <span aria-hidden style={{ width: 2, height: 30, background: BOARD.successText }} />}
        </span>
      )}
      {nextSlot && answerSlot && (
        <span data-testid="chalk-next-slot" data-entry={answerSlot.verdict ? answerSlot.draft : undefined} data-entry-verdict={answerSlot.verdict} className={answerSlot.glow ? "wb-glow" : undefined} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 64, height: 46, border: `3px dashed ${BOARD.chalkYellow}`, borderRadius: 10, background: BOARD.saffronSoft }}>
          {answerSlot.draft && <HandNumber text={answerSlot.draft} size={30} color={BOARD.successText} draw={false} registerNumbers={false} />}
        </span>
      )}
      {cursor && !slotted && !nextSlot && <span data-testid="chalk-cursor" aria-hidden style={{ width: 14, height: size, borderRight: `3px solid ${color}`, opacity: 0.5 }} />}
    </div>
  );
}
