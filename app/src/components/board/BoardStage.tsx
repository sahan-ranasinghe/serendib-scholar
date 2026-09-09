"use client";

/**
 * The lesson's board: one StageState (src/lib/choreography.ts) drawn with
 * the board primitives, plus the child's turn.
 *
 * YOUR TURN. When the runtime opens the child's window, the primitive on
 * the board becomes the answer surface: beads on the abacus, tiles on the
 * picker, a blank in the table or the expansion, a card in the row. A
 * touch answer goes out through `onAnswer` — the same judging path a
 * spoken one takes. The number pad stays as a fallback behind the 🔢
 * button; name choices are buttons. The surface breathes with a soft
 * glow, the pointer parks, and any tap during a soft check counts as the
 * child responding (`onTouch`).
 */
import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import type { BoardContent } from "@/lib/board";
import type { StageState, AnswerSurface } from "@/lib/choreography";
import { Whiteboard } from "./Whiteboard";
import { Abacus } from "./Abacus";
import { NumberCards } from "./NumberCards";
import { ChalkText } from "./ChalkText";
import { TitleCard, TextCard } from "./Cards";
import { DigitPicker } from "./DigitPicker";
import { Expansion } from "./Expansion";
import { BlankTable } from "./BlankTable";
import { PlaceValueStrip } from "./PlaceValueStrip";
import { Money } from "./Money";
import { Pointer } from "./Pointer";
import { Highlight } from "./Highlight";
import { FeedbackFX } from "./FeedbackFX";
import { NumberPad } from "./NumberPad";
import { BOARD, FONT_SINHALA, SPRING, TOUCH_MIN } from "./theme";
import { playSound } from "./sound";

export interface YourTurn {
  kind: "ask" | "soft";
  surface: AnswerSurface | null;
  /** The surface itself can produce the answer (a build, a blank, a tile). */
  touchable: boolean;
  /** Name answers offered as buttons. */
  choices?: string[];
  /** A numeric answer is expected — the pad fallback applies. */
  numeric: boolean;
  /** Open the pad at once (after two doubtful hearings). */
  padFirst?: boolean;
}

export interface BoardStageProps {
  stage: StageState;
  yourTurn: YourTurn | null;
  /** A touch answer — judged exactly like a spoken one. */
  onAnswer: (text: string) => void;
  /** Any touch on the board during a soft check. */
  onTouch: () => void;
  /** A touch on the board when it is not the child's turn. */
  onIdleTouch?: () => void;
  /** Which side of the board the pointer is on, for the character. */
  onPointerSide?: (side: "left" | "right" | null) => void;
  /** Boards the library does not draw yet. */
  renderLegacy?: (content: BoardContent) => ReactNode;
  /** The frame's bottom-left corner (the tutor's portrait). */
  cornerSlot?: ReactNode;
}

/** Content areas shorter than this get the compact abacus. */
export const COMPACT_BELOW_PX = 340;

export const BoardStage = memo(function BoardStage({ stage, yourTurn, onAnswer, onTouch, onIdleTouch, onPointerSide, renderLegacy, cornerSlot }: BoardStageProps) {
  const base = stage.base;
  const active = yourTurn !== null;
  const soft = yourTurn?.kind === "soft";
  const touchable = Boolean(yourTurn?.touchable);

  // Drafts the child is making on the surface, belonging to THIS turn: a
  // new turn (or none) starts them fresh without an effect having to clear them.
  const [drafts, setDrafts] = useState<{ turn: YourTurn | null; beads: number[] | null; tiles: number[]; padOpen: boolean }>({ turn: null, beads: null, tiles: [], padOpen: false });
  const draft = drafts.turn === yourTurn ? drafts : { turn: yourTurn, beads: null, tiles: [], padOpen: Boolean(yourTurn?.padFirst) };
  const { beads, tiles, padOpen } = draft;

  // How tall the surface is: a phone held sideways gives the content area
  // under 340 px, and the abacus (rods, readout, the child's answer, a note
  // beneath) only fits it in its compact form. Measured, not assumed — the
  // same stage serves the desktop.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [surfaceHeight, setSurfaceHeight] = useState<number | null>(null);
  useEffect(() => {
    const area = wrapperRef.current?.parentElement;
    if (!area || typeof ResizeObserver === "undefined") return;
    const measure = () => setSurfaceHeight(area.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);
  const shortSurface = surfaceHeight !== null && surfaceHeight < COMPACT_BELOW_PX;
  const setBeads = (next: number[]) => setDrafts({ ...draft, turn: yourTurn, beads: next });
  const setTiles = (next: number[]) => setDrafts({ ...draft, turn: yourTurn, tiles: next });
  const setPadOpen = (next: boolean) => setDrafts({ ...draft, turn: yourTurn, padOpen: next });

  const submit = (text: string) => {
    playSound("beadClick");
    onAnswer(text);
  };

  const pickerBuilt = (pool: number[], built: string | null): number[] => {
    if (!built) return [];
    const used = new Set<number>();
    return [...built].flatMap((char) => {
      const index = pool.findIndex((d, i) => d === Number(char) && !used.has(i));
      if (index < 0) return [];
      used.add(index);
      return [index];
    });
  };

  let content: ReactNode = null;
  if (base) {
    switch (base.kind) {
      case "abacus": {
        const editing = active && touchable && yourTurn?.surface === "abacus";
        const shown = editing && beads ? beads : base.shown;
        content = (
          <>
            <Abacus
              digits={editing ? base.digits.map(() => 9) : base.digits}
              shown={shown}
              animate={!editing && base.animate}
              glowRod={base.glowRod}
              childAnswer={base.childAnswer}
              readout={editing ? "live" : "asFilled"}
              interactive={editing}
              onChange={setBeads}
              compact={base.expansion !== null || shortSurface}
            />
            {base.expansion && (
              <Expansion
                number={base.expansion.number}
                parts={base.expansion.parts}
                fly={base.expansion.fly}
                interactive={active && touchable && yourTurn?.surface === "expansion"}
                onAnswer={(_, value) => submit(value)}
                size={30}
                dockPad
              />
            )}
          </>
        );
        break;
      }
      case "numberCards":
        content = (
          <NumberCards
            values={base.values}
            ringed={base.ringed}
            interactive={active && touchable && yourTurn?.surface === "numberCards"}
            onSelect={(value) => value !== null && submit(String(value))}
            size={32}
          />
        );
        break;
      case "chalk":
        content = (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {base.lines.map((line) => (
              <ChalkText key={line.key} text={line.text} append={line.append} size={32} />
            ))}
          </div>
        );
        break;
      case "textCard":
        content = <TextCard key={base.text} text={base.text} />;
        break;
      case "titleCard":
        content = <TitleCard key={base.title} title={base.title} emoji={base.emoji} />;
        break;
      case "digitPicker": {
        const editing = active && touchable && yourTurn?.surface === "digitPicker";
        const built = editing ? tiles : pickerBuilt(base.pool, base.built);
        content = (
          <DigitPicker
            pool={base.pool}
            built={built}
            builtName={editing ? null : base.builtName}
            builtBy={base.builtBy}
            interactive={editing}
            onChange={setTiles}
            compact
          />
        );
        break;
      }
      case "expansion":
        content = (
          <Expansion
            number={base.expansion.number}
            parts={base.expansion.parts}
            fly={base.expansion.fly}
            interactive={active && touchable && yourTurn?.surface === "expansion"}
            onAnswer={(_, value) => submit(value)}
            dockPad
          />
        );
        break;
      case "blankTable":
        content = (
          <BlankTable
            columns={base.columns}
            rows={base.rows}
            filled={base.filled}
            activeBlank={base.activeBlank}
            interactive={active && touchable && yourTurn?.surface === "blankTable"}
            onAnswer={(_, __, value) => submit(value)}
            dockPad
            dense={shortSurface}
          />
        );
        break;
      case "placeValueStrip":
        content = <PlaceValueStrip digits={base.digits} glowColumn={base.glowColumn} />;
        break;
      case "money":
        content = <Money items={base.items} counted={base.counted} />;
        break;
      case "legacy":
        content = renderLegacy ? renderLegacy(base.content) : null;
        break;
    }
  }

  // The commit button for surfaces that build something (beads, tiles).
  const commit =
    active && touchable && yourTurn?.surface === "abacus" && beads
      ? beads.join("")
      : active && touchable && yourTurn?.surface === "digitPicker" && base?.kind === "digitPicker" && tiles.length === base.pool.length
        ? tiles.map((i) => base.pool[i]).join("")
        : null;

  return (
    <Whiteboard viewport="stretch" wipeKey={stage.wipe} testId="lesson-board" cornerSlot={cornerSlot}>
      <div
        ref={wrapperRef}
        className={active && touchable && !soft ? "wb-your-turn" : active ? "wb-your-turn-soft" : undefined}
        data-soft-tap={soft ? "true" : undefined}
        data-surface={yourTurn?.surface ?? undefined}
        onPointerDown={soft ? onTouch : active ? undefined : onIdleTouch}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 10, borderRadius: 18, maxWidth: "100%" }}
      >
        {content}
      </div>
      {stage.notes.map((line) => (
        <ChalkText key={line.key} text={line.text} append={line.append} size={24} />
      ))}

      {/* the child's turn: commit, choices, the pad fallback */}
      <AnimatePresence>
        {active && !soft && (
          <motion.div
            key="turn-controls"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={SPRING}
            // Docked in the board's top-right corner: never pushes the
            // primitive off a small surface, never sits under the tray.
            style={{ position: "absolute", top: 8, right: 8, zIndex: 4, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8, maxWidth: "60%" }}
          >
            {commit && (
              <button
                type="button"
                className="wb-tap"
                data-testid="turn-commit"
                onClick={() => submit(commit)}
                style={{ minHeight: TOUCH_MIN, minWidth: TOUCH_MIN, padding: "0 18px", borderRadius: 12, border: 0, background: BOARD.markerGreen, color: "#fff", fontFamily: FONT_SINHALA, fontSize: 18, fontWeight: 700, boxShadow: "0 3px 0 rgba(0,0,0,0.2)" }}
              >
                හරි ✓
              </button>
            )}
            {(yourTurn?.choices ?? []).map((choice) => (
              <button
                key={choice}
                type="button"
                className="wb-tap"
                data-testid="turn-choice"
                onClick={() => submit(choice)}
                style={{ minHeight: TOUCH_MIN, padding: "0 16px", borderRadius: 12, border: 0, background: "#fffdf7", color: BOARD.markerBlue, fontFamily: FONT_SINHALA, fontSize: 18, fontWeight: 700, boxShadow: `0 2px 0 rgba(0,0,0,0.18), inset 0 0 0 2px ${BOARD.markerBlue}` }}
              >
                {choice}
              </button>
            ))}
            {yourTurn?.numeric && !padOpen && (
              <button
                type="button"
                className="wb-tap"
                data-testid="turn-pad-toggle"
                aria-label="අංක පුවරුව"
                onClick={() => setPadOpen(true)}
                style={{ minHeight: TOUCH_MIN, minWidth: TOUCH_MIN, borderRadius: 12, border: 0, background: "rgba(255,253,247,0.9)", color: BOARD.ink, fontSize: 20, boxShadow: "0 2px 0 rgba(0,0,0,0.18)" }}
              >
                🔢
              </button>
            )}
            {yourTurn?.numeric && padOpen && <NumberPad mode="number" onCommit={submit} onCancel={() => setPadOpen(false)} docked />}
          </motion.div>
        )}
      </AnimatePresence>

      <Pointer at={stage.pointer} pulseKey={stage.pointerPulse} parked={stage.parked} onSide={onPointerSide} />
      <Highlight kind={stage.highlight?.kind ?? null} target={stage.highlight?.target ?? null} />
      <FeedbackFX kind={stage.feedback.kind} at={stage.feedback.at} nonce={stage.feedback.nonce} />
    </Whiteboard>
  );
});
