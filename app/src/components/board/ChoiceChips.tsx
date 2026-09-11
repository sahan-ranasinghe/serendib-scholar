"use client";

/**
 * choiceChips, from the design (rule 8): two to four paper pills along the
 * foot of the board, 56 px tall, padding 0 22, radius pill, 2 px border,
 * Gemunu 700 24 ink, a hard 2 px shadow, 10 px apart, dealt in left to
 * right. States: idle · pressed (sinks 2 px, no shadow, #F1ECE0) ·
 * selected (saffron border on saffron-soft) · correct (green border on
 * success-soft + ✓) · wrong (wobbles and stays, with a faint ring) ·
 * disabled (38 %).
 */
import { AnimatePresence, motion } from "framer-motion";
import { BOARD, FONT_SINHALA, FONT_LATIN, EASE_SPRING } from "./tokens";
import { useTargetRef } from "./targets";
import { playSound } from "./sound";

export type ChipState = "idle" | "pressed" | "selected" | "correct" | "wrong" | "disabled";

export interface ChoiceChipsProps {
  options: string[];
  /** The child may tap (their turn is open). */
  interactive?: boolean;
  onPick?: (option: string, index: number) => void;
  /** Kept for callers: the read-aloud cue lives in the practice step now. */
  micCue?: boolean;
  /** The chips are the answer surface: the row breathes. */
  glow?: boolean;
  /** Per-option state, by index (idle when absent). */
  states?: Partial<Record<number, ChipState>>;
}

function look(state: ChipState) {
  return {
    border: state === "selected" ? BOARD.chalkYellow : state === "correct" ? BOARD.markerGreen : BOARD.ink18,
    background: state === "pressed" ? "#F1ECE0" : state === "selected" ? BOARD.saffronSoft : state === "correct" ? BOARD.successSoft : BOARD.paper,
    boxShadow: state === "pressed" ? "none" : state === "wrong" ? "0 2px 0 #D8D1C2, 0 0 0 3px rgba(27,27,27,.08)" : "0 2px 0 #D8D1C2",
    transform: state === "pressed" ? "translateY(2px)" : state === "wrong" ? "translateX(5px) rotate(2.5deg)" : "none",
    opacity: state === "disabled" ? 0.38 : 1,
  };
}

export function ChoiceChips({ options, interactive = false, onPick, glow = false, states = {} }: ChoiceChipsProps) {
  const ref = useTargetRef<HTMLDivElement>(["component:choiceChips", "text:chips"]);
  return (
    <div ref={ref} data-testid="choice-chips" className={glow ? "wb-glow" : undefined} style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", maxWidth: "100%", borderRadius: 999, padding: glow ? 2 : 0 }}>
      <AnimatePresence initial={true}>
        {options.map((option, index) => {
          const state = states[index] ?? "idle";
          const l = look(state);
          return (
            <motion.button
              key={`${index}:${option}`}
              type="button"
              className="wb-tap"
              data-testid="turn-choice"
              data-chip={index}
              data-state={state}
              aria-label={option}
              disabled={!interactive || state === "disabled"}
              onClick={() => {
                if (!interactive) return;
                playSound("beadClick");
                onPick?.(option, index);
              }}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: l.opacity, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.4, ease: [...EASE_SPRING], delay: index * 0.09 }}
              style={{
                boxSizing: "content-box",
                height: 56,
                padding: "0 22px",
                border: `2px solid ${l.border}`,
                borderRadius: 999,
                background: l.background,
                display: "flex",
                alignItems: "center",
                gap: 8,
                font: `700 24px/1.5 ${FONT_SINHALA}`,
                color: BOARD.ink,
                boxShadow: l.boxShadow,
                transform: l.transform,
                whiteSpace: "nowrap",
                cursor: interactive ? "pointer" : "default",
              }}
            >
              {option}
              {state === "correct" && <span style={{ width: 24, height: 24, borderRadius: "50%", background: BOARD.markerGreen, color: "#fff", font: `700 15px/24px ${FONT_LATIN}`, textAlign: "center" }}>✓</span>}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
