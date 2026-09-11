"use client";

/**
 * The lesson's board: one StageState (src/lib/choreography.ts) drawn with
 * the board primitives in the design's session shell, plus the child's
 * turn.
 *
 * YOUR TURN. When the runtime opens the child's window, the primitive on
 * the board becomes the answer surface: beads on the abacus, tiles on the
 * picker, a blank in the table or the expansion, a card in the row, chips
 * along the foot. A touch answer goes out through `onAnswer` — the same
 * judging path for every surface. The one element to touch glows (its
 * siblings veil), the pointer parks, and any tap during a soft check
 * counts as the child responding (`onTouch`).
 *
 * The design (docs/design/export/handoff): content inside the inset,
 * chips left 94 → right 130 at bottom 64, docks at the same foot, the
 * retry note top-right of the inset, the chalk stack of three, the
 * read-aloud step cards, the tap hint pill.
 */
import { AnimatePresence, motion } from "framer-motion";
import { memo, useState, type CSSProperties, type ReactNode } from "react";
import type { BoardContent } from "@/lib/board";
import type { StageState, AnswerSurface } from "@/lib/choreography";
import type { AnswerMode } from "@/lib/answerMode";
import type { ChoiceSet } from "@/lib/distractors";
import { sinhalaNumberName } from "@/lib/sinhalaNumber";
import { ChoiceChips, type ChipState } from "./ChoiceChips";
import { Whiteboard, type WhiteboardProps } from "./Whiteboard";
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
import { BOARD, FONT_SINHALA, FONT_LABEL, SPRING } from "./tokens";
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
  /** Which surface leads (src/lib/answerMode.ts). */
  answerMode?: AnswerMode;
  /** Three tappable options on the foot of the board. */
  chips?: ChoiceSet;
  /** valueOrPlace with an abacus up: a tap on a rod answers with what that rod shows — its bead count or its digit's value. */
  rodPick?: "count" | "value";
  /** Speech leads: the 🎤 cue above the chips. */
  micCue?: boolean;
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
  /** Lena, bottom-right on the frame. */
  lenaSlot?: ReactNode;
  /** The ✋, on the frame. */
  handSlot?: ReactNode;
  /** The caption line at the foot of the board. */
  caption?: ReactNode;
  /** A sheet over the dimmed board (the ✋ chat, the first-time mic explanation). */
  sheet?: WhiteboardProps["sheet"];
  /** A short hint in the tap-hint pill (top-right of the inset). */
  hint?: string | null;
  /** Zara is mid-sentence: the chalk cursor waits at the end of the newest line. */
  writing?: boolean;
}

/** Kept for callers that sized the old stage; the design has one form. */
export const COMPACT_BELOW_PX = 340;
export const DENSE_BELOW_PX = 300;

/** The chalk stack: up to three lines, the newest at 100 %, older at 60 % (rule a). */
export const CHALK_STACK = 3;

export const BoardStage = memo(function BoardStage({ stage, yourTurn, onAnswer, onTouch, onIdleTouch, onPointerSide, renderLegacy, cornerSlot, lenaSlot, handSlot, caption, sheet, hint = null, writing = false }: BoardStageProps) {
  const base = stage.base;
  const active = yourTurn !== null;
  const soft = yourTurn?.kind === "soft";
  const touchable = Boolean(yourTurn?.touchable);

  // Drafts the child is making on the surface, belonging to THIS turn: a
  // new turn (or none) starts them fresh without an effect having to clear them.
  const [drafts, setDrafts] = useState<{ turn: YourTurn | null; beads: number[] | null; tiles: number[]; padOpen: boolean; picked: number | null; pad: string }>({ turn: null, beads: null, tiles: [], padOpen: false, picked: null, pad: "" });
  const draft = drafts.turn === yourTurn ? drafts : { turn: yourTurn, beads: null, tiles: [], padOpen: Boolean(yourTurn?.padFirst), picked: null, pad: "" };
  const { beads, tiles, padOpen, pad: padDraft } = draft;
  const setBeads = (next: number[]) => setDrafts({ ...draft, turn: yourTurn, beads: next });
  const setTiles = (next: number[]) => setDrafts({ ...draft, turn: yourTurn, tiles: next });
  const setPadOpen = (next: boolean) => setDrafts({ ...draft, turn: yourTurn, padOpen: next });
  const setPadDraft = (next: string) => setDrafts({ ...draft, turn: yourTurn, pad: next });

  // The chip the child last tapped, and the options it belonged to: a
  // wrong chip stays wobbled while the retry note is up; a correct one
  // keeps its ✓ and its siblings veil.
  const [lastPick, setLastPick] = useState<{ index: number; options: string[]; nonce: number } | null>(null);

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

  // The chips along the foot of the board: dealt by the storyboard's
  // choiceChips.show as she asks, or by the turn itself; tappable only
  // while the child's turn is open, and never on a soft check.
  const chipSet = (active && !soft ? (yourTurn?.chips ?? stage.chips) : stage.chips) ?? null;
  const rodPicking = active && !soft && yourTurn?.rodPick !== undefined && yourTurn?.surface === "abacus";
  // The chips glow when they are the only surface; on a rod question the rod glows and the chips stand quiet (one glow at a time).
  const ringed = !!stage.highlight || (base?.kind === "numberCards" && base.ringed !== null);
  const practising = stage.practice !== null && stage.practice.step < 3;
  const chipsLead = active && !soft && !!chipSet && !rodPicking && base?.kind !== "expansion" && !ringed && !practising && (yourTurn?.answerMode === "why" || yourTurn?.answerMode === "valueOrPlace" || yourTurn?.answerMode === "readAloud" || (yourTurn?.chips !== undefined && !touchable));
  // A base the chips answer about (M5: the picker at 38 % while the mistake is judged) veils.
  const baseVeiled = !!chipSet && stage.notes.length > 0 && !touchable;

  // The design's abacus: 280 wide; 240 over its expansion; 200 while the pad docks beneath it (M7).
  const padDocked = active && !soft && !!yourTurn?.numeric && !touchable && !chipSet && !rodPicking;
  const sumBeneath = stage.notes.some((n) => /\d/u.test(n.text));
  // With chips at the foot the inset is 216 px tall: an abacus over its expansion drops to 200 so both fit above the chips.
  const abacusWidth = base?.kind === "abacus" ? (base.expansion ? (chipSet ? 200 : 240) : sumBeneath ? 220 : padDocked ? 200 : 280) : 280;
  // Where the chalk stack sits: beside a card, the picker or the title (G1, G4, M5), beside an abacus when it is only a label (G8), beneath an abacus when a sum is written (G10).
  const notesBeside = stage.notes.length > 0 && (base?.kind === "textCard" || base?.kind === "digitPicker" || base?.kind === "titleCard" || (base?.kind === "abacus" && stage.notes.every((n) => !/\d/u.test(n.text))));
  // The chalk sum the child answers on the pad: its "?" is the answer slot (G2).
  const padAnswersChalk = active && !soft && !!yourTurn?.numeric && !touchable && !chipSet;

  let content: ReactNode = null;
  if (stage.practice) {
    content = <ReadAloudSteps step={stage.practice.step} number={stage.practice.number} />;
  } else if (base) {
    switch (base.kind) {
      case "abacus": {
        const picking = rodPicking;
        const editing = active && touchable && yourTurn?.surface === "abacus" && !picking;
        const shown = editing && beads ? beads : base.shown;
        // What a tapped rod answers with: its beads, or its digit at its place.
        const rodAnswer = (rod: number): string =>
          yourTurn?.rodPick === "count" ? String(shown[rod] ?? 0) : String((base.digits[rod] ?? 0) * 10 ** (base.digits.length - 1 - rod));
        content = (
          <>
            <Abacus
              digits={editing ? base.digits.map(() => 9) : base.digits}
              shown={shown}
              animate={!editing && base.animate}
              glowRods={chipsLead ? [] : base.glowRods}
              childAnswer={base.childAnswer}
              readout={editing ? "live" : base.animate || base.shown.some((n, i) => n < (base.digits[i] ?? 0)) ? "asFilled" : "none"}
              interactive={editing}
              onChange={setBeads}
              width={abacusWidth}
              pickRods={picking}
              onPickRod={(rod) => submit(rodAnswer(rod))}
              glow={editing}
            />
            {base.expansion && (
              <Expansion
                number={base.expansion.number}
                parts={base.expansion.parts}
                fly={base.expansion.fly}
                interactive={active && touchable && yourTurn?.surface === "expansion"}
                onAnswer={(_, value) => submit(value)}
                glowIndex={active && touchable && yourTurn?.surface === "expansion" ? base.expansion.parts.findIndex((p) => p === null) : null}
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
            drawn={base.drawn}
            made={base.made}
            interactive={active && touchable && yourTurn?.surface === "numberCards"}
            onSelect={(value) => value !== null && submit(String(value))}
            size={44}
          />
        );
        break;
      case "chalk":
        content = <ChalkStack lines={base.lines} size={40} writing={writing} answerSlot={padAnswersChalk ? { draft: padDraft, glow: true } : null} />;
        break;
      case "textCard":
        content = <TextCard key={base.text} text={base.text} dimmed={baseVeiled} />;
        break;
      case "titleCard":
        content = base.cards?.length ? (
          <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
            <TitleCard key={base.title} title={base.title} emoji={base.emoji} dimmed />
            {base.cards.map((text, i) => (
              <TextCard key={text} text={text} stacked={i > 0} />
            ))}
          </div>
        ) : (
          <TitleCard key={base.title} title={base.title} emoji={base.emoji} dimmed={stage.notes.length > 0} />
        );
        break;
      case "digitPicker": {
        const editing = active && touchable && yourTurn?.surface === "digitPicker";
        const built = editing ? tiles : pickerBuilt(base.pool, base.built);
        content = (
          <div style={{ opacity: baseVeiled ? 0.38 : 1, transition: "opacity 300ms" }}>
            <DigitPicker
              pool={base.pool}
              built={built}
              builtName={editing || baseVeiled ? null : base.builtName}
              builtBy={base.builtBy}
              interactive={editing}
              onChange={setTiles}
              glow={editing}
              ledger={base.puzzle ? base.ledger : undefined}
            />
          </div>
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
            glowIndex={active && !soft ? base.expansion.parts.findIndex((p) => p === null) : null}
            alone
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
            sparkleAt={stage.feedback.kind === "correct" && stage.feedback.at && "cell" in stage.feedback.at ? stage.feedback.at.cell : null}
            dockPad
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

  const chipStates: Partial<Record<number, ChipState>> = {};
  if (chipSet && lastPick && lastPick.options === chipSet.options) {
    if (stage.feedback.kind === "correct" && stage.feedback.nonce > lastPick.nonce) {
      chipSet.options.forEach((_, i) => (chipStates[i] = i === lastPick.index ? "correct" : "disabled"));
    } else if (stage.retry || (stage.feedback.kind === "wrong" && stage.feedback.nonce > lastPick.nonce)) {
      chipStates[lastPick.index] = "wrong";
    } else if (!active) {
      chipStates[lastPick.index] = "selected";
    }
  }

  const chips = chipSet && !soft ? (
    <ChoiceChips
      key={chipSet.options.join("|")}
      options={chipSet.options}
      interactive={active && !soft}
      onPick={(option, index) => {
        setLastPick({ index, options: chipSet.options, nonce: stage.feedback.nonce });
        submit(option);
      }}
      glow={chipsLead}
      states={chipStates}
    />
  ) : null;

  // The foot: chips, or the build's ✓, or the pad's opener (no reference in the design: styled as its primary button / round paper button).
  const footer =
    chips ??
    (active && !soft && commit ? (
      <button type="button" className="wb-tap" data-testid="turn-commit" onClick={() => submit(commit)} style={{ height: 56, padding: "0 28px", border: 0, borderRadius: 12, background: BOARD.teal, color: "#fff", font: `700 24px/1.5 ${FONT_SINHALA}`, boxShadow: "var(--shadow-button)", cursor: "pointer" }}>
        හරි ✓
      </button>
    ) : active && !soft && yourTurn?.numeric && !touchable && !padOpen ? (
      <button type="button" data-testid="turn-pad-toggle" aria-label="අංක පුවරුව" onClick={() => setPadOpen(true)} className="wb-tap wb-glow" style={{ width: 56, height: 56, border: `2px solid ${BOARD.ink18}`, borderRadius: "50%", background: BOARD.paper, boxShadow: "0 2px 0 #D8D1C2", fontSize: 24, lineHeight: 1, cursor: "pointer" }}>
        🔢
      </button>
    ) : null);

  // A rod-pick or a build waits on a touch: the tap hint, unless a runtime hint is up.
  const tapHint = hint ?? (active && !soft && !stage.retry && (yourTurn?.rodPick !== undefined || (touchable && yourTurn?.surface === "digitPicker")) ? "👆 ඔබන්න" : null);

  const frameSlot = (
    <>
      <AnimatePresence>
        {stage.retry && !active && (
          <motion.button
            key="turn-retry"
            type="button"
            className="wb-tap wb-retry"
            data-testid="turn-retry"
            onClick={() => submit("(retry)")}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={SPRING}
          >
            ↺ ආයෙත් උත්සාහ කරන්න
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {tapHint && !(stage.retry && !active) && (
          <motion.div key={tapHint} className="wb-tap-hint" data-testid="hint" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.3 }}>
            {tapHint}
          </motion.div>
        )}
      </AnimatePresence>
      {active && !soft && yourTurn?.numeric && !touchable && padOpen && <NumberPad mode="number" onCommit={submit} onChange={setPadDraft} onCancel={() => setPadOpen(false)} docked />}
    </>
  );

  return (
    <Whiteboard viewport="stretch" wipeKey={stage.wipe} testId="lesson-board" cornerSlot={sheet ? undefined : cornerSlot} lenaSlot={lenaSlot} handSlot={sheet ? undefined : handSlot} footer={footer} caption={caption} sheet={sheet} frameSlot={frameSlot}>
      <div
        className={active && soft ? "wb-your-turn-soft" : undefined}
        data-soft-tap={soft ? "true" : undefined}
        data-surface={yourTurn?.surface ?? undefined}
        data-answer-mode={yourTurn?.answerMode ?? stage.turn?.answerMode ?? undefined}
        data-turn-surface={stage.turn?.surface ?? undefined}
        onPointerDown={soft ? onTouch : active ? undefined : onIdleTouch}
        style={{ display: "flex", flexDirection: notesBeside ? "row" : "column", alignItems: "center", justifyContent: "center", gap: notesBeside ? (base?.kind === "digitPicker" ? 44 : base?.kind === "abacus" ? 40 : 22) : 10, maxWidth: "100%", width: "100%" }}
      >
        {content}
        {/* the chalk stack beside the base: newest at 100 %, older at 60 %, three at most; beside a card, a line that repeats the card's number writes only its tail (G4) */}
        {!stage.practice && stage.notes.length > 0 && (
          <ChalkStack
            lines={base?.kind === "textCard" ? stage.notes.map((line) => (line.text.startsWith(base.text) && line.text.length > base.text.length ? { ...line, text: line.text.slice(base.text.length).trim(), append: undefined } : line)) : stage.notes}
            size={base?.kind === "textCard" || base?.kind === "digitPicker" || base?.kind === "titleCard" ? 40 : 34}
            writing={writing}
            answerSlot={active && !soft && base?.kind === "abacus" ? { draft: padDraft, glow: !chipsLead } : null}
          />
        )}
      </div>

      <Pointer at={stage.practice ? null : stage.pointer} pulseKey={stage.pointerPulse} parked={stage.parked && !stage.practice} onSide={onPointerSide} />
      <Highlight kind={stage.highlight?.kind ?? null} target={stage.highlight?.target ?? null} />
      <FeedbackFX kind={stage.feedback.kind} at={stage.feedback.at} nonce={stage.feedback.nonce} badge={!(stage.feedback.at && "cell" in stage.feedback.at)} />
    </Whiteboard>
  );
});

/** Up to three chalk lines, top-down: the newest at 100 %, the older at 60 % (rule a); the cursor waits on the newest while she writes. */
function ChalkStack({ lines, size, writing, answerSlot = null }: { lines: Array<{ key: string | number; text: string; append?: string }>; size: number; writing: boolean; answerSlot?: { draft: string; glow: boolean } | null }) {
  const shown = lines.slice(-CHALK_STACK);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
      {shown.map((line, index) => {
        const newest = index === shown.length - 1;
        const label = !/\d/u.test(line.text);
        return <ChalkText key={line.key} text={line.text} append={line.append} size={newest ? size : size - 6} dimmed={!newest || label} cursor={newest && writing && !label} answerSlot={newest ? answerSlot : null} />;
      })}
    </div>
  );
}

/**
 * Read-aloud practice as three step cards (the design's R1): the child's
 * three seconds to say it (saffron, dots, nothing recorded), Zara reading
 * the name herself, then the chips. The step in progress stands at 100 %;
 * the others at 70 %.
 */
function ReadAloudSteps({ step, number }: { step: 1 | 2 | 3; number: number | null }) {
  let name = "";
  if (number !== null) {
    try {
      name = sinhalaNumberName(number);
    } catch {
      name = "";
    }
  }
  const card = (on: boolean, tinted: boolean): CSSProperties => ({
    display: "grid",
    gap: 6,
    justifyItems: "center",
    background: tinted ? BOARD.saffronSoft : BOARD.paper,
    border: `2px solid ${tinted ? BOARD.chalkYellow : BOARD.ink18}`,
    borderRadius: 14,
    padding: "8px 10px",
    opacity: on ? 1 : 0.7,
    transition: "opacity 300ms",
  });
  const label: CSSProperties = { font: `600 20px/1.3 ${FONT_LABEL}`, color: BOARD.inkSoft };
  return (
    <div data-testid="read-aloud-steps" data-step={step} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, width: "100%" }}>
      <div style={card(step === 1, true)}>
        <span style={label}>1 · ඔයා</span>
        <div data-testid="pause-cue" style={{ font: `700 24px/1.4 ${FONT_SINHALA}`, color: BOARD.ink, whiteSpace: "nowrap" }}>🎤 කියන්න බලන්න</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: BOARD.chalkYellow }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: BOARD.chalkYellow, opacity: 0.6 }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: BOARD.chalkYellow, opacity: 0.3 }} />
          <span style={label}>තත්පර 3</span>
        </div>
      </div>
      <div style={card(step === 2, false)}>
        <span style={label}>2 · සාරා</span>
        <div style={{ font: `700 24px/1.4 ${FONT_SINHALA}`, color: BOARD.markerBlue, whiteSpace: "nowrap" }}>{name || "…"}</div>
        <span style={label}>මමත් කියන්නම්</span>
      </div>
      <div style={card(step === 3, false)}>
        <span style={label}>3 · තෝරන්න</span>
        <div style={{ font: `700 24px/1.4 ${FONT_SINHALA}`, color: BOARD.ink, whiteSpace: "nowrap" }}>නම මොකක්ද?</div>
        <span style={label}>පහළ චිප් වලින්</span>
      </div>
    </div>
  );
}
