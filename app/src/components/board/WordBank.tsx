"use client";

/**
 * The Sinhala word bank, from the design (rule e1): the name's words plus
 * two distractors as 56 px paper tiles on a wood dock spanning the foot of
 * the board, tapped in order into the cell; used tiles veil to 38 %; ⌫
 * takes the last back; ✓ (the only teal key) commits.
 */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBoard } from "./targets";
import { BOARD, FONT_SINHALA, FONT_LATIN, EASE_SPRING } from "./tokens";
import { playSound } from "./sound";
import { t } from "@/lib/appCopy";

export const WORD_TILE_PX = 56;

export interface WordBankProps {
  tiles: string[];
  /** Which cell this writes into, for the label. */
  label?: string;
  onCommit: (text: string) => void;
  /** Docked at the foot (the board's footer). */
  docked?: boolean;
  /** Reports the line so far, for the cell's caret preview. */
  onChange?: (line: string) => void;
}

export function WordBank({ tiles, label, onCommit, docked = false, onChange }: WordBankProps) {
  const [picked, setPicked] = useState<number[]>([]);
  const board = useBoard();
  useEffect(() => {
    if (!docked) return;
    board.noteDock(1);
    return () => board.noteDock(-1);
  }, [docked, board]);
  useEffect(() => () => board.noteInput("bank", false), [board]);
  const line = picked.map((i) => tiles[i]).join(" ");
  const update = (next: number[]) => {
    setPicked(next);
    onChange?.(next.map((i) => tiles[i]).join(" "));
    board.noteInput("bank", next.length > 0);
  };
  const bank = (
    <motion.div
      data-testid="word-bank"
      data-docked={docked || undefined}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: [...EASE_SPRING] }}
      aria-label={label}
      style={{
        display: "flex",
        gap: 8,
        justifyContent: "center",
        alignItems: "center",
        padding: "8px 10px 0",
        background: BOARD.wood,
        borderRadius: "12px 12px 0 0",
        boxShadow: "0 -6px 14px rgba(27,27,27,.15)",
        width: "100%",

        flexWrap: "nowrap",
      }}
    >
      <span data-testid="word-bank-line" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {line}
      </span>
      {tiles.map((word, index) => {
        const used = picked.includes(index);
        return (
          <button
            key={`${index}:${word}`}
            type="button"
            className="wb-tap"
            data-testid="word-tile"
            data-word={word}
            data-used={used || undefined}
            aria-label={word}
            disabled={used}
            onClick={() => {
              if (used) return;
              playSound("beadClick");
              update([...picked, index]);
            }}
            style={{
              height: WORD_TILE_PX,
              minWidth: WORD_TILE_PX,
              flex: "none",
              padding: "0 14px",
              border: 0,
              background: BOARD.paper,
              borderRadius: "10px 10px 0 0",
              boxShadow: "0 2px 0 #D8D1C2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: `700 24px/1 ${FONT_SINHALA}`,
              color: BOARD.ink,
              whiteSpace: "nowrap",
              opacity: used ? 0.38 : 1,
              boxSizing: "border-box",
              cursor: used ? "default" : "pointer",
            }}
          >
            {word}
          </button>
        );
      })}
      <button type="button" className="wb-tap" data-testid="word-bank-backspace" data-tap-repeat aria-label={t("a11y.backspace")} onClick={() => update(picked.slice(0, -1))} style={{ width: 56, height: 56, flex: "none", border: 0, background: BOARD.paper, borderRadius: "10px 10px 0 0", boxShadow: "0 2px 0 #D8D1C2", display: "flex", alignItems: "center", justifyContent: "center", font: `700 22px/1 ${FONT_LATIN}`, color: BOARD.inkSoft, cursor: "pointer" }}>
        ⌫
      </button>
      <button
        type="button"
        className="wb-tap"
        data-testid="word-bank-done"
        aria-label={t("a11y.done")}
        disabled={picked.length === 0}
        onClick={() => {
          if (!line) return;
          playSound("beadClick");
          onCommit(line);
        }}
        style={{ width: 56, height: 56, flex: "none", border: 0, background: BOARD.teal, borderRadius: "10px 10px 0 0", boxShadow: "0 2px 0 var(--color-teal-dark)", display: "flex", alignItems: "center", justifyContent: "center", font: `700 24px/1 ${FONT_LATIN}`, color: "#fff", cursor: "pointer", opacity: picked.length ? 1 : 0.6 }}
      >
        ✓
      </button>
    </motion.div>
  );
  return docked && board.dock ? createPortal(bank, board.dock) : bank;
}
