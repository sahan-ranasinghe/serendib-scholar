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
import { BOARD, MAX_MS } from "./theme";

export interface ChalkTextProps {
  text: string;
  /** The part of `text` that is new (must be its tail). */
  append?: string;
  size?: number;
  color?: string;
  align?: "left" | "center";
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

export function ChalkText({ text, append, size = 34, color = BOARD.markerBlue, align = "center" }: ChalkTextProps) {
  const hasTail = Boolean(append && text.endsWith(append));
  const head = hasTail ? text.slice(0, text.length - append!.length) : "";
  const tail = hasTail ? append! : text;
  const planned = useMemo(() => plan(head, tail, text), [head, tail, text]);
  const ref = useTargetRef(`text:${text}`);

  return (
    <div
      ref={ref}
      data-testid="chalk-text"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: align === "center" ? "center" : "flex-start",
        rowGap: 6,
        maxWidth: "100%",
        lineHeight: 1.3,
      }}
    >
      {planned.map((token) =>
        token.kind === "hand" ? (
          <HandNumber
            key={token.key}
            text={token.text}
            size={size}
            color={color}
            draw={token.write}
            delayMs={token.delayMs}
            budgetMs={token.budgetMs}
            targetBase={token.targetBase}
            style={{ margin: "0 0.12em" }}
          />
        ) : (
          <WriteOn
            key={token.key}
            text={token.text}
            size={size * 0.8}
            color={color}
            write={token.write}
            delayMs={token.delayMs}
            durationMs={Math.max(150, token.budgetMs)}
          />
        ),
      )}
    </div>
  );
}
