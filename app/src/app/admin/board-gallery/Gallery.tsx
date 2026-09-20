"use client";

/**
 * The gallery: one section per primitive, each on its own Whiteboard,
 * with a button for every vocabulary event (and every state worth
 * seeing). Sections carry `data-primitive`, the board `data-board`, and
 * two designated buttons — `data-action="animate-in"` (the state to
 * photograph) and `data-action="reset"` — so scripts/board-check.ts can
 * drive it without knowing anything else.
 */
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { sinhalaNumberName } from "@/lib/sinhalaNumber";
import {
  Abacus,
  BlankTable,
  ChoiceChips,
  ChalkText,
  DigitPicker,
  DURATION_MS,
  Expansion,
  FeedbackFX,
  Highlight,
  Money,
  NumberCards,
  PlaceValueStrip,
  Pointer,
  setMuted,
  TextCard,
  TitleCard,
  useMuted,
  VOCABULARY,
  Whiteboard,
  type EventName,
  type ExpansionFlight,
  type FeedbackKind,
  type FilledCell,
  type Primitive,
  type Target,
  type Viewport,
} from "@/components/board";

interface Action {
  label: string;
  /** The vocabulary event this button fires, for the QA harness. */
  event?: string;
  run: () => void;
  role?: "animate-in" | "reset";
}

const PAGE_CSS = `
  .bg-page { background: #E9E2D3; color: #2A2418; min-height: 100vh; font-family: system-ui, sans-serif; }
  .bg-top { position: static; top: 0; z-index: 20; background: rgba(233,226,211,0.94); backdrop-filter: blur(6px); border-bottom: 1px solid rgba(42,36,24,0.15); padding: 10px 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; }
  @media (min-height: 560px) { .bg-top { position: sticky; } }
  .bg-top h1 { font-size: 17px; margin: 0; font-weight: 800; }
  .bg-seg { display: inline-flex; border-radius: 10px; overflow: hidden; box-shadow: inset 0 0 0 1.5px #1E4C99; }
  .bg-seg button { min-height: 40px; padding: 0 14px; border: 0; background: transparent; color: #1E4C99; font-weight: 700; cursor: pointer; }
  .bg-seg button[aria-pressed="true"] { background: #1E4C99; color: #F6F1E4; }
  .bg-main { max-width: 1120px; margin: 0 auto; padding: 8px 8px 80px; display: flex; flex-direction: column; gap: 34px; }
  .bg-section { display: flex; flex-direction: column; gap: 10px; }
  .bg-section h2 { margin: 0; font-size: 20px; font-weight: 800; }
  .bg-section h2 code { font-size: 15px; background: rgba(30,76,153,0.1); padding: 2px 6px; border-radius: 6px; }
  .bg-blurb { margin: 0; font-size: 14px; color: rgba(42,36,24,0.75); max-width: 70ch; }
  .bg-events { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: rgba(42,36,24,0.7); }
  .bg-events li { background: rgba(255,255,255,0.5); border-radius: 6px; padding: 2px 7px; }
  .bg-toolbar { display: flex; flex-wrap: wrap; gap: 6px; }
  .bg-toolbar button { min-height: 40px; padding: 0 12px; border-radius: 10px; border: 0; background: #FFFDF7; color: #1E4C99; font-weight: 700; font-size: 13px; box-shadow: 0 1px 0 rgba(0,0,0,0.15), inset 0 0 0 1.5px rgba(30,76,153,0.35); cursor: pointer; }
  .bg-toolbar button[data-action="animate-in"] { background: #1E4C99; color: #F6F1E4; }
  .bg-toolbar button[data-action="reset"] { background: transparent; box-shadow: inset 0 0 0 1.5px rgba(42,36,24,0.3); color: #2A2418; }
  .bg-toolbar button[aria-pressed="true"] { background: #2F7A4D; color: #fff; }
  .bg-note { font-size: 12px; color: rgba(42,36,24,0.6); margin: 0; }
  .bg-pill { font-size: 12px; padding: 4px 9px; border-radius: 8px; background: rgba(255,255,255,0.55); }
`;

export function Gallery({ initialViewport }: { initialViewport: Viewport }) {
  const [viewport, setViewport] = useState<Viewport>(initialViewport);
  const muted = useMuted();
  const reduced = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);

  return (
    <div className="bg-page">
      <style>{PAGE_CSS}</style>
      <div className="bg-top">
        <h1>Board gallery</h1>
        <div className="bg-seg" role="group" aria-label="viewport">
          {(["phone", "desktop", "fill"] as Viewport[]).map((v) => (
            <button key={v} type="button" aria-pressed={viewport === v} onClick={() => setViewport(v)} data-viewport-choice={v}>
              {v === "phone" ? "390×844 landscape" : v === "desktop" ? "desktop" : "fill"}
            </button>
          ))}
        </div>
        <button type="button" className="bg-pill" onClick={() => setMuted(!muted)} aria-pressed={muted} style={{ border: 0, cursor: "pointer" }}>
          sound: {muted ? "off" : "on"}
        </button>
        <span className="bg-pill">reduced motion: {reduced ? "on" : "off"}</span>
        <span className="bg-pill">contract: docs/design/board-vocabulary.md</span>
      </div>
      <main className="bg-main">
        <PointerSection viewport={viewport} />
        <AbacusSection viewport={viewport} />
        <ExpansionSection viewport={viewport} />
        <PlaceValueStripSection viewport={viewport} />
        <DigitPickerSection viewport={viewport} />
        <ChalkTextSection viewport={viewport} />
        <NumberCardsSection viewport={viewport} />
        <HighlightSection viewport={viewport} />
        <MoneySection viewport={viewport} />
        <TitleCardSection viewport={viewport} />
        <TextCardSection viewport={viewport} />
        <BlankTableSection viewport={viewport} />
        <ChoiceChipsSection viewport={viewport} />
        <TurnSection viewport={viewport} />
        <FeedbackSection viewport={viewport} />
      </main>
    </div>
  );
}

function Section({
  id,
  primitive,
  title,
  blurb,
  actions,
  viewport,
  wipeKey,
  children,
}: {
  id: string;
  primitive: Primitive | "feedbackFX";
  title: string;
  blurb: string;
  actions: Action[];
  viewport: Viewport;
  wipeKey?: number;
  children: ReactNode;
}) {
  const events = primitive === "feedbackFX" ? ["correct", "wrong", "celebrate"] : VOCABULARY[primitive];
  return (
    <section className="bg-section" data-primitive={id}>
      <h2>
        <code>{primitive}</code> {title}
      </h2>
      <p className="bg-blurb">{blurb}</p>
      <ul className="bg-events">
        {events.map((event) => (
          <li key={event}>
            {event}
            {primitive !== "feedbackFX" && ` ≤ ${DURATION_MS[`${primitive}.${event}` as EventName]} ms`}
          </li>
        ))}
      </ul>
      <div className="bg-toolbar">
        {actions.map((action) => (
          <button key={action.label} type="button" data-action={action.role} data-event={action.event} onClick={action.run}>
            {action.label}
          </button>
        ))}
      </div>
      <Whiteboard viewport={viewport} wipeKey={wipeKey} testId={`board-${id}`}>
        {children}
      </Whiteboard>
    </section>
  );
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(listener: () => void): () => void {
  const media = window.matchMedia(REDUCED);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
function readReducedMotion(): boolean {
  return window.matchMedia(REDUCED).matches;
}

// ---------------------------------------------------------------------------

function PointerSection({ viewport }: { viewport: Viewport }) {
  const [at, setAt] = useState<Target | null>(null);
  const [pulse, setPulse] = useState(0);
  const move = (target: Target, label: string, role?: Action["role"]): Action => ({
    label: `move_to ${label}`,
    event: "pointer.move_to",
    run: () => setAt(target),
    role,
  });
  return (
    <Section
      id="pointer"
      primitive="pointer"
      title="— Zara's chalk hand"
      blurb="On the board whenever she talks about something on the board. It can aim at a rod, a column, a card, a cell, a part, a digit, a text span, or a number wherever it is — every target the vocabulary names."
      viewport={viewport}
      actions={[
        { label: "reset", run: () => setAt(null), role: "reset" },
        move({ card: 101 }, "{card:101}", "animate-in"),
        move({ card: 101, place: "ද" }, "{card:101, place:ද}"),
        move({ number: 80 }, "{number:80}"),
        move({ number: 528 }, "{number:528}"),
        move({ rod: 2 }, "{rod:2}"),
        move({ text: "84 = 80 + 4" }, '{text:"84 = 80 + 4"}'),
        move({ text: "84 = 80 + 4", place: "එ" }, "{text:…, place:එ}"),
        move({ text: "abacus" }, '{text:"abacus"}'),
        { label: "pulse", event: "pointer.pulse", run: () => setPulse((p) => p + 1) },
        { label: "hide", event: "pointer.hide", run: () => setAt(null) },
      ]}
    >
      <NumberCards values={[84, 101, 528, 997]} size={28} />
      <ChalkText text="84 = 80 + 4" size={30} />
      <Abacus digits={[5, 4, 2, 1]} shown={[5, 4, 2, 1]} compact readout="none" />
      <Pointer at={at} pulseKey={pulse} />
    </Section>
  );
}

function AbacusSection({ viewport }: { viewport: Viewport }) {
  const [digits, setDigits] = useState([5, 4, 2, 1]);
  const [shown, setShown] = useState([0, 0, 0, 0]);
  const [animate, setAnimate] = useState(false);
  const [glow, setGlow] = useState<number | null>(null);
  const [child, setChild] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  const add = (adds: Array<[number, number]>) =>
    setShown((s) => s.map((n, rod) => Math.min(digits[rod] ?? 9, n + (adds.find(([r]) => r === rod)?.[1] ?? 0))));
  const bare = () => {
    setDigits([5, 4, 2, 1]);
    setShown([0, 0, 0, 0]);
    setAnimate(false);
    setGlow(null);
    setChild(null);
  };
  return (
    <Section
      id="abacus"
      primitive="abacus"
      title="— the bead abacus"
      blurb="Rods දා · සි · ද · එ on a wooden base. Beads slide down one at a time with a click; the number forms beneath as each rod completes. Touch: drag a bead from the tray onto a rod, tap a rod's beads to take the top one off."
      viewport={viewport}
      actions={[
        { label: "show 5 421, rods bare", event: "abacus.show", run: bare, role: "reset" },
        {
          label: "animate → beads land",
          event: "abacus.show",
          role: "animate-in",
          run: () => {
            bare();
            setAnimate(true);
          },
        },
        { label: "bead_add දා ×5", event: "abacus.bead_add", run: () => add([[0, 5]]) },
        { label: "bead_add සි ×4", event: "abacus.bead_add", run: () => add([[1, 4]]) },
        {
          label: "bead_add ද ×2 + එ ×1",
          event: "abacus.bead_add",
          run: () =>
            add([
              [2, 2],
              [3, 1],
            ]),
        },
        ...[0, 1, 2, 3].map((rod) => ({ label: `rod_glow ${["දා", "සි", "ද", "එ"][rod]}`, event: "abacus.rod_glow", run: () => setGlow(rod) })),
        { label: "glow off", event: "abacus.rod_glow", run: () => setGlow(null) },
        { label: "child_answer_overlay 5421", event: "abacus.child_answer_overlay", run: () => setChild("5421") },
        { label: "child_answer_overlay 5412", event: "abacus.child_answer_overlay", run: () => setChild("5412") },
        { label: "clear_overlay", event: "abacus.clear_overlay", run: () => setChild(null) },
        {
          label: "show 7 062 complete",
          event: "abacus.show",
          run: () => {
            setDigits([7, 0, 6, 2]);
            setShown([7, 0, 6, 2]);
            setAnimate(false);
          },
        },
        {
          label: `touch mode: ${touch ? "on" : "off"}`,
          run: () => {
            setTouch((t) => !t);
            setAnimate(false);
            setDigits([9, 9, 9, 9]);
            setShown([0, 0, 0, 0]);
          },
        },
      ]}
    >
      <Abacus
        digits={digits}
        shown={shown}
        animate={animate}
        glowRods={glow === null ? [] : [glow]}
        childAnswer={child}
        readout={touch ? "live" : "asFilled"}
        interactive={touch}
        onChange={setShown}
      />
    </Section>
  );
}

function ExpansionSection({ viewport }: { viewport: Viewport }) {
  const [number, setNumber] = useState(5421);
  const [parts, setParts] = useState<Array<string | null>>([null, null, null, null]);
  const [fly, setFly] = useState<ExpansionFlight | null>(null);
  const [glow, setGlow] = useState<number | null>(null);
  const [touch, setTouch] = useState(false);
  const [answered, setAnswered] = useState<Array<string | null>>([null, null, null, null]);
  const digits = String(number).split("").map(Number);
  const show = (n: number) => {
    setNumber(n);
    setParts([null, null, null, null]);
    setAnswered([null, null, null, null]);
    setFly(null);
    setGlow(null);
  };
  const flyFrom = (rod: number) => {
    setGlow(rod);
    setFly({ fromRod: rod, index: rod, key: Date.now() });
  };
  return (
    <Section
      id="expansion"
      primitive="expansion"
      title="— the expanded form, beneath the abacus"
      blurb="5 421 = ▢ + ▢ + ▢ + ▢ staged UNDER the abacus, never instead of it. part_reveal writes a part in; part_fly floats the value from its rod into its slot — so the two expansion runs keep the abacus visible while she names rods, including the empty rod in 7 062."
      viewport={viewport}
      actions={[
        { label: "show 5 421", event: "expansion.show", run: () => show(5421), role: "reset" },
        { label: "part_fly දා → 5000", event: "expansion.part_fly", run: () => flyFrom(0), role: "animate-in" },
        { label: "part_fly සි → 400", event: "expansion.part_fly", run: () => flyFrom(1) },
        { label: "part_fly ද → 20", event: "expansion.part_fly", run: () => flyFrom(2) },
        { label: "part_fly එ → 1", event: "expansion.part_fly", run: () => flyFrom(3) },
        ...[0, 1, 2, 3].map((index) => ({
          label: `part_reveal ${index} = ${digits[index]! * 10 ** (3 - index)}`,
          event: "expansion.part_reveal",
          run: () => setParts((p) => p.map((v, i) => (i === index ? String(digits[index]! * 10 ** (3 - index)) : v))),
        })),
        { label: "7 062 run (the empty rod)", event: "expansion.show", run: () => show(7062) },
        { label: "part_fly සි → 0", event: "expansion.part_fly", run: () => flyFrom(1) },
        {
          label: `touch mode: ${touch ? "on" : "off"}`,
          run: () => {
            setTouch((t) => !t);
            show(number);
          },
        },
      ]}
    >
      <Abacus digits={digits} shown={digits} compact glowRods={glow === null ? [] : [glow]} />
      <Expansion
        number={number}
        parts={parts}
        fly={fly}
        onFlyDone={(index, value) => {
          setParts((p) => p.map((v, i) => (i === index ? value : v)));
          setGlow(null);
        }}
        interactive={touch}
        answered={answered}
        onAnswer={(index, value) => setAnswered((a) => a.map((v, i) => (i === index ? value : v)))}
      />
    </Section>
  );
}

function PlaceValueStripSection({ viewport }: { viewport: Viewport }) {
  const [digits, setDigits] = useState<Array<number | null>>([null, null, null, null, null]);
  const [glow, setGlow] = useState<number | null>(null);
  const [touch, setTouch] = useState(false);
  const target = [2, 5, 4, 2, 1];
  const labels = ["දසදා", "දා", "සි", "ද", "එ"];
  const drop = (column: number, digit: number) => setDigits((d) => d.map((v, i) => (i === column ? digit : v)));
  return (
    <Section
      id="placeValueStrip"
      primitive="placeValueStrip"
      title="— the place-value chart"
      blurb="Five labelled columns with one digit slot each. digit_drop bounces a digit in from above; column_glow brightens one column. Touch: tap a column and a digit pad opens beneath it."
      viewport={viewport}
      actions={[
        {
          label: "show, empty",
          event: "placeValueStrip.show",
          run: () => {
            setDigits([null, null, null, null, null]);
            setGlow(null);
          },
          role: "reset",
        },
        {
          label: "drop 2 5 4 2 1",
          event: "placeValueStrip.digit_drop",
          role: "animate-in",
          run: () => {
            setDigits([null, null, null, null, null]);
            target.forEach((digit, column) => setTimeout(() => drop(column, digit), column * 140));
          },
        },
        ...target.map((digit, column) => ({ label: `digit_drop ${labels[column]} ← ${digit}`, event: "placeValueStrip.digit_drop", run: () => drop(column, digit) })),
        ...[0, 1, 2, 3, 4].map((column) => ({ label: `column_glow ${labels[column]}`, event: "placeValueStrip.column_glow", run: () => setGlow(column) })),
        { label: "glow off", event: "placeValueStrip.column_glow", run: () => setGlow(null) },
        { label: `touch mode: ${touch ? "on" : "off"}`, run: () => setTouch((t) => !t) },
      ]}
    >
      <PlaceValueStrip digits={digits} glowColumn={glow} interactive={touch} onDigit={drop} />
    </Section>
  );
}

function DigitPickerSection({ viewport }: { viewport: Viewport }) {
  const pool = [1, 3, 6, 4];
  const [built, setBuilt] = useState<number[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [by, setBy] = useState<"child" | "tutor">("child");
  const [touch, setTouch] = useState(false);
  const builtNumber = Number(built.map((i) => pool[i]).join("") || "0");
  return (
    <Section
      id="digitPicker"
      primitive="digitPicker"
      title="— build a number from digit tiles"
      blurb="A chalk circle of tiles; a tap lifts a tile into the slot row above. built_number writes the child's number and its Sinhala name beneath — on top of the picker, not instead of it. Touch: tap tiles in and out, drag slot tiles to reorder."
      viewport={viewport}
      actions={[
        {
          label: "show pool 1 3 6 4",
          event: "digitPicker.show",
          run: () => {
            setBuilt([]);
            setName(null);
          },
          role: "reset",
        },
        {
          label: "build 1364 + name",
          event: "digitPicker.built_number",
          role: "animate-in",
          run: () => {
            setBy("child");
            setBuilt([]);
            setName(null);
            [0, 1, 2, 3].forEach((index, order) => setTimeout(() => setBuilt((b) => [...b, index]), 60 + order * 110));
            setTimeout(() => setName(sinhalaNumberName(1364)), 560);
          },
        },
        ...pool.map((digit, index) => ({
          label: `tap ${digit}`,
          event: "digitPicker.tap",
          run: () => setBuilt((b) => (b.includes(index) || b.length >= 4 ? b : [...b, index])),
        })),
        {
          label: "built_number (the child's)",
          event: "digitPicker.built_number",
          run: () => {
            setBy("child");
            setName(built.length ? sinhalaNumberName(builtNumber) : null);
          },
        },
        {
          label: "built_number by Zara — example 1364",
          event: "digitPicker.built_number",
          run: () => {
            setBy("tutor");
            setBuilt([0, 1, 2, 3]);
            setName(sinhalaNumberName(1364));
          },
        },
        {
          label: "clear_built",
          event: "digitPicker.clear_built",
          run: () => {
            setBuilt([]);
            setName(null);
          },
        },
        { label: `touch mode: ${touch ? "on" : "off"}`, run: () => setTouch((t) => !t) },
      ]}
    >
      <DigitPicker
        pool={pool}
        built={built}
        builtName={name}
        builtBy={by}
        interactive={touch}
        onChange={(next) => {
          setBuilt(next);
          setName(next.length === 4 ? sinhalaNumberName(Number(next.map((i) => pool[i]).join(""))) : null);
        }}
      />
    </Section>
  );
}

function NumberCardsSection({ viewport }: { viewport: Viewport }) {
  const [values, setValues] = useState([84, 101, 528, 997]);
  const [dealKey, setDealKey] = useState(0);
  const [ringed, setRinged] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [touch, setTouch] = useState(false);
  const deal = (next: number[]) => {
    setValues(next);
    setRinged(null);
    setSelected(null);
    setDealKey((k) => k + 1);
  };
  return (
    <Section
      id="numberCards"
      primitive="numberCards"
      title="— real cards, dealt in a row"
      blurb="Every කාඩ්පත් in the script is one of these: the 0–9 deck (readWrite4Digit:12), the four picked from it (:13), the hand of 1 · 3 · 8 · 6 (placeValue4Digit:85), the row to read (:1). Cards deal in left to right; highlight_ring draws a chalk-yellow ring round one. Each digit of a card is a pointer target too ({card:101, place:ද}). Touch: tap to select (it lifts), drag onto another card to reorder."
      viewport={viewport}
      actions={[
        { label: "show 84 · 101 · 528 · 997", event: "numberCards.show", run: () => deal([84, 101, 528, 997]), role: "reset" },
        {
          label: "show + ring 101",
          event: "numberCards.highlight_ring",
          role: "animate-in",
          run: () => {
            deal([84, 101, 528, 997]);
            setTimeout(() => setRinged(101), 450);
          },
        },
        ...[84, 101, 528, 997].map((value) => ({ label: `highlight_ring ${value}`, event: "numberCards.highlight_ring", run: () => setRinged(value) })),
        { label: "ring_off", event: "numberCards.ring_off", run: () => setRinged(null) },
        { label: "show the deck 0 … 9", event: "numberCards.show", run: () => deal([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) },
        { label: "show the picked four 3 · 0 · 5 · 8", event: "numberCards.show", run: () => deal([3, 0, 5, 8]) },
        { label: "show the hand 1 · 3 · 8 · 6", event: "numberCards.show", run: () => deal([1, 3, 8, 6]) },
        { label: `touch mode: ${touch ? "on" : "off"}`, run: () => setTouch((t) => !t) },
      ]}
    >
      <NumberCards key={dealKey} values={values} ringed={ringed} selected={selected} interactive={touch} onSelect={setSelected} onReorder={setValues} />
    </Section>
  );
}

function ChalkTextSection({ viewport }: { viewport: Viewport }) {
  const [lines, setLines] = useState<Array<{ key: number; text: string; append?: string }>>([]);
  const [wipe, setWipe] = useState(0);
  const write = (text: string) => setLines((l) => [...l, { key: Date.now() + l.length, text }]);
  const append = (tail: string) =>
    setLines((l) => {
      const last = l[l.length - 1];
      if (!last) return [{ key: Date.now(), text: tail }];
      return [...l.slice(0, -1), { ...last, text: last.text + " " + tail, append: tail }];
    });
  const erase = () => {
    setWipe((w) => w + 1);
    setTimeout(() => setLines([]), 180);
  };
  return (
    <Section
      id="chalkText"
      primitive="chalkText"
      title="— marker writing, left to right"
      blurb="A sum, a sentence, a term, written in ≤ 600 ms: numbers and signs as drawn strokes, Sinhala words wiped on in Noto Sans Sinhala. With `append`, the head stays and only the tail writes. erase runs the felt across the board. NOT for cards: anything the script calls කාඩ්පත් — a deck, a hand of digits, a row to read — is numberCards (or digitPicker), never chalk."
      viewport={viewport}
      wipeKey={wipe}
      actions={[
        { label: "clear", run: () => setLines([]), role: "reset" },
        {
          label: "write 5 421 = 5000 + 400 + 20 + 1",
          event: "chalkText.write",
          role: "animate-in",
          run: () => {
            setLines([]);
            setTimeout(() => write("5 421 = 5000 + 400 + 20 + 1"), 30);
          },
        },
        { label: "write 9 + 1 = 10", event: "chalkText.write", run: () => write("9 + 1 = 10") },
        { label: "write 999 + 1 = ?", event: "chalkText.write", run: () => write("999 + 1 = ?") },
        { label: "write සංඛ්‍යා නාමය", event: "chalkText.write", run: () => write("සංඛ්‍යා නාමය") },
        { label: "write 3058", event: "chalkText.write", run: () => write("3058") },
        { label: "append - තුන්දහස් පනස් අට", event: "chalkText.write", run: () => append("- තුන්දහස් පනස් අට") },
        { label: "write 84 = 80 + 4", event: "chalkText.write", run: () => write("84 = 80 + 4") },
        { label: "erase", event: "chalkText.erase", run: erase },
      ]}
    >
      {lines.map((line) => (
        <ChalkText key={line.key} text={line.text} append={line.append} size={viewport === "phone" ? 30 : 36} />
      ))}
    </Section>
  );
}

function HighlightSection({ viewport }: { viewport: Viewport }) {
  const [mark, setMark] = useState<{ kind: "circle" | "underline"; target: Target } | null>(null);
  const on = (kind: "circle" | "underline", target: Target, label: string, role?: Action["role"]): Action => ({
    label: `${kind} ${label}`,
    event: `highlight.${kind}`,
    run: () => setMark({ kind, target }),
    role,
  });
  return (
    <Section
      id="highlight"
      primitive="highlight"
      title="— a chalk mark on something already there"
      blurb="A ring or an underline drawn as a chalk-yellow stroke round or under any target."
      viewport={viewport}
      actions={[
        { label: "off", event: "highlight.off", run: () => setMark(null), role: "reset" },
        on("circle", { number: 5421 }, "{number:5421}", "animate-in"),
        on("circle", { card: 101 }, "{card:101}"),
        on("circle", { text: "84 = 80 + 4", place: "ද" }, "{text:…, place:ද}"),
        on("underline", { text: "84 = 80 + 4" }, '{text:"84 = 80 + 4"}'),
        on("underline", { number: 80 }, "{number:80}"),
        on("underline", { text: "ලොකු සංඛ්‍යා" }, '{text:"ලොකු සංඛ්‍යා"}'),
      ]}
    >
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <TextCard text="5 421" size={36} />
        <TextCard text="ලොකු සංඛ්‍යා" size={36} />
      </div>
      <ChalkText text="84 = 80 + 4" size={30} />
      <NumberCards values={[84, 101]} size={26} />
      <Highlight kind={mark?.kind ?? null} target={mark?.target ?? null} />
    </Section>
  );
}

function MoneySection({ viewport }: { viewport: Viewport }) {
  const till = [
    { denomination: 1000, count: 2 },
    { denomination: 100, count: 3 },
    { denomination: 10, count: 1 },
    { denomination: 1, count: 4 },
  ];
  const coins = [
    { denomination: 10, count: 3 },
    { denomination: 1, count: 5 },
  ];
  const [items, setItems] = useState(till);
  const [showKey, setShowKey] = useState(0);
  const [counted, setCounted] = useState(0);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const show = (next: typeof till) => {
    setItems(next);
    setCounted(0);
    setShowKey((k) => k + 1);
  };
  return (
    <Section
      id="money"
      primitive="money"
      title="— notes and coins"
      blurb="Rs 1000 and Rs 100 notes, Rs 10 and Rs 1 coins, stackable, for the hooks and the coins-in-a-till analogy. count slides one item aside per step so a total can be counted aloud; the running total is written beneath."
      viewport={viewport}
      actions={[
        { label: "show 2×1000, 3×100, 1×10, 4×1", event: "money.show", run: () => show(till), role: "animate-in" },
        { label: "reset", run: () => show(items), role: "reset" },
        { label: "count +1", event: "money.count", run: () => setCounted((c) => Math.min(total, c + 1)) },
        { label: "count all", event: "money.count", run: () => setCounted(total) },
        { label: "count 0", event: "money.count", run: () => setCounted(0) },
        { label: "show coins: 3×10, 5×1", event: "money.show", run: () => show(coins) },
      ]}
    >
      <Money key={showKey} items={items} counted={counted} />
    </Section>
  );
}

function TitleCardSection({ viewport }: { viewport: Viewport }) {
  const [card, setCard] = useState<{ key: number; title: string; emoji?: string } | null>(null);
  const show = (title: string, emoji?: string) => setCard({ key: Date.now(), title, emoji });
  return (
    <Section
      id="titleCard"
      primitive="titleCard"
      title="— a big friendly card"
      blurb="One heading, one emoji, in 300 ms. Titles a concept."
      viewport={viewport}
      actions={[
        { label: "clear", run: () => setCard(null), role: "reset" },
        { label: "show ස්ථානීය අගය 🧮", event: "titleCard.show", run: () => show("ස්ථානීය අගය", "🧮"), role: "animate-in" },
        { label: "show සංඛ්‍යා කියවමු 🔢", event: "titleCard.show", run: () => show("සංඛ්‍යා කියවමු", "🔢") },
        { label: "show සංඛ්‍යා - 1 (no emoji)", event: "titleCard.show", run: () => show("සංඛ්‍යා - 1") },
      ]}
    >
      {card && <TitleCard key={card.key} title={card.title} emoji={card.emoji} />}
    </Section>
  );
}

function TextCardSection({ viewport }: { viewport: Viewport }) {
  const [cards, setCards] = useState<Array<{ key: number; text: string }>>([]);
  const show = (text: string) => setCards((c) => [...c, { key: Date.now() + c.length, text }]);
  return (
    <Section
      id="textCard"
      primitive="textCard"
      title="— a plain card, no write animation"
      blurb='Short text ("100 000", "ලොකු සංඛ්‍යා"): a chalk card that appears at once. Numbers still use the hand face.'
      viewport={viewport}
      actions={[
        { label: "clear", run: () => setCards([]), role: "reset" },
        {
          label: "show 100 000",
          event: "textCard.show",
          role: "animate-in",
          run: () => {
            setCards([]);
            setTimeout(() => show("100 000"), 20);
          },
        },
        { label: "show ලොකු සංඛ්‍යා", event: "textCard.show", run: () => show("ලොකු සංඛ්‍යා") },
        { label: "show 7 062", event: "textCard.show", run: () => show("7 062") },
        { label: "show 3058", event: "textCard.show", run: () => show("3058") },
      ]}
    >
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
        {cards.map((card) => (
          <TextCard key={card.key} text={card.text} />
        ))}
      </div>
    </Section>
  );
}

const TABLE_COLUMNS = [
  { key: "number", label: "සංඛ්‍යාව" },
  { key: "digit", label: "ඉලක්කම" },
  { key: "place", label: "ස්ථානය" },
  { key: "valueRepresented", label: "අගය" },
];
const TABLE_ROWS = [
  { number: "5 421", digit: 4, place: "සියයස්ථානය", valueRepresented: null },
  { number: "5 421", digit: 2, place: null, valueRepresented: null },
  { number: "7 062", digit: 0, place: "සියයස්ථානය", valueRepresented: null },
];

function BlankTableSection({ viewport }: { viewport: Viewport }) {
  const [shown, setShown] = useState(true);
  const [filled, setFilled] = useState<FilledCell[]>([]);
  const [active, setActive] = useState<{ row: number; field: string } | null>(null);
  const [touch, setTouch] = useState(false);
  const fill = (cell: FilledCell) => setFilled((f) => [...f.filter((c) => !(c.row === cell.row && c.field === cell.field)), cell]);
  const reset = () => {
    setFilled([]);
    setActive(null);
    setShown(false);
    setTimeout(() => setShown(true), 20);
  };
  return (
    <Section
      id="blankTable"
      primitive="blankTable"
      title="— the textbook's table with blanks"
      blurb="row_activate outlines the cell the pad points at; cell_fill writes the answer — a green tick for the child, a blue pen for Zara. Touch: tap a blank to answer it on the pad."
      viewport={viewport}
      actions={[
        { label: "show", event: "blankTable.show", run: reset, role: "reset" },
        {
          label: "show + row_activate 2 · අගය",
          event: "blankTable.row_activate",
          role: "animate-in",
          run: () => {
            reset();
            setTimeout(() => setActive({ row: 1, field: "valueRepresented" }), 400);
          },
        },
        { label: "row_activate 1 · අගය", event: "blankTable.row_activate", run: () => setActive({ row: 0, field: "valueRepresented" }) },
        { label: "cell_fill 1 · අගය = 400 (child)", event: "blankTable.cell_fill", run: () => fill({ row: 0, field: "valueRepresented", value: 400, by: "child" }) },
        { label: "cell_fill 2 · ස්ථානය = දහයස්ථානය (tutor)", event: "blankTable.cell_fill", run: () => fill({ row: 1, field: "place", value: "දහයස්ථානය", by: "tutor" }) },
        { label: "cell_fill 2 · අගය = 20 (tutor)", event: "blankTable.cell_fill", run: () => fill({ row: 1, field: "valueRepresented", value: 20, by: "tutor" }) },
        { label: "cell_fill 3 · අගය = 0 (child)", event: "blankTable.cell_fill", run: () => fill({ row: 2, field: "valueRepresented", value: 0, by: "child" }) },
        { label: "deactivate", event: "blankTable.row_activate", run: () => setActive(null) },
        { label: `touch mode: ${touch ? "on" : "off"}`, run: () => setTouch((t) => !t) },
      ]}
    >
      {shown && (
        <BlankTable
          columns={TABLE_COLUMNS}
          rows={TABLE_ROWS}
          filled={filled}
          activeBlank={active}
          interactive={touch}
          onAnswer={(row, field, value) => fill({ row, field, value, by: "child" })}
        />
      )}
    </Section>
  );
}

function FeedbackSection({ viewport }: { viewport: Viewport }) {
  const [fx, setFx] = useState<{ kind: FeedbackKind; at: Target | null; nonce: number }>({ kind: "correct", at: null, nonce: 0 });
  const fire = (kind: FeedbackKind, at: Target | null) => setFx((f) => ({ kind, at, nonce: f.nonce + 1 }));
  return (
    <Section
      id="feedbackFX"
      primitive="feedbackFX"
      title="— what the board does when the child answers"
      blurb="correct: a soft chime and a short sparkle at the answer, then it settles. wrong: a gentle side-to-side wobble and a low tone — nothing red, nothing punitive. celebrate: one confetti burst per concept, never per answer."
      viewport={viewport}
      actions={[
        { label: "reset", run: () => setFx({ kind: "correct", at: null, nonce: 0 }), role: "reset" },
        { label: "correct at {card:101}", role: "animate-in", run: () => fire("correct", { card: 101 }) },
        { label: "wrong at {card:528}", run: () => fire("wrong", { card: 528 }) },
        { label: "correct at {text:abacus}", run: () => fire("correct", { text: "abacus" }) },
        { label: "celebrate", run: () => fire("celebrate", null) },
      ]}
    >
      <NumberCards values={[84, 101, 528]} size={30} />
      <Abacus digits={[5, 4, 2, 1]} shown={[5, 4, 2, 1]} compact readout="none" />
      <FeedbackFX kind={fx.kind} at={fx.at} nonce={fx.nonce} />
    </Section>
  );
}

function ChoiceChipsSection({ viewport }: { viewport: Viewport }) {
  const [chips, setChips] = useState<{ options: string[] } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [touch, setTouch] = useState(true);
  return (
    <Section
      id="choiceChips"
      primitive="choiceChips"
      title="— three options along the foot of the board"
      blurb="show deals three chips made by the distractor engine (a phrase's findings, three number names, three values); the correct one is never marked. A readAloud question puts the 🎤 කියන්න cue above them — speech leads, the chips are for a child who would rather tap. Touch: every chip is ≥ 48 px."
      viewport={viewport}
      actions={[
        { label: "clear", event: "choiceChips.clear", run: () => { setChips(null); setPicked(null); }, role: "reset" },
        { label: "show 3 findings", event: "choiceChips.show", role: "animate-in", run: () => { setPicked(null); setChips({ options: ["අටේ අගය අසූවයි, අට නෙවෙයි", "හතරේ අගය හතළිහයි", "අසූ හතර හරියටම හරි"] }); } },
        { label: "show 3 number names (a read-aloud question: the chips ARE the question)", event: "choiceChips.show", run: () => { setPicked(null); setChips({ options: [sinhalaNumberName(5421), sinhalaNumberName(5412), sinhalaNumberName(5241)] }); } },
        { label: "show 5000 · 500 · 5", event: "choiceChips.show", run: () => { setPicked(null); setChips({ options: ["500", "5000", "5"] }); } },
        { label: touch ? "touch: on" : "touch: off", run: () => setTouch((t) => !t) },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontFamily: "var(--font-sinhala, sans-serif)", color: "#2b1d12", fontSize: 18 }}>{picked ? `tapped: ${picked}` : "the question is on the board above the chips"}</div>
        {chips && <ChoiceChips options={chips.options} interactive={touch} glow={touch} onPick={(option) => setPicked(option)} />}
      </div>
    </Section>
  );
}

function TurnSection({ viewport }: { viewport: Viewport }) {
  const [turn, setTurn] = useState<"rod" | "beads" | "pause" | "retry" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [shown, setShown] = useState([5, 4, 2, 1]);
  return (
    <Section
      id="turn"
      primitive="turn"
      title="— where the child's turn lands"
      blurb="your_turn { answerMode, surface } is not drawn itself: it says which surface leads, so the glow goes there and nowhere else. On `rod` every rod becomes a button (a tap answers with what that rod shows); on `beads` the whole abacus breathes. pause { ms, cue } is reading practice (a faint 🎤, nothing recorded) or a soft check (no cue). over ends it."
      viewport={viewport}
      actions={[
        { label: "over", event: "turn.over", run: () => { setTurn(null); setPicked(null); }, role: "reset" },
        { label: "your_turn valueOrPlace on rod", event: "turn.your_turn", role: "animate-in", run: () => { setPicked(null); setTurn("rod"); } },
        { label: "your_turn build on beads", event: "turn.your_turn", run: () => { setPicked(null); setShown([0, 0, 0, 0]); setTurn("beads"); } },
        { label: "pause 2 s (a soft check — the board shows nothing; the pause is time, not a cue)", event: "turn.pause", run: () => { setPicked(null); setTurn("pause"); } },
        { label: "retry (paper button)", event: "turn.retry", run: () => { setTurn("retry"); setPicked(null); } },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}>
        <Abacus
          digits={turn === "beads" ? [9, 9, 9, 9] : [5, 4, 2, 1]}
          shown={shown}
          readout={turn === "beads" ? "live" : "asFilled"}
          interactive={turn === "beads"}
          onChange={setShown}
          pickRods={turn === "rod"}
          onPickRod={(rod) => setPicked(`rod ${rod} → ${[5, 4, 2, 1][rod]! * 10 ** (3 - rod)}`)}
          glow={turn === "beads"}
          compact={viewport === "phone"}
        />
        {picked && <div style={{ fontFamily: "var(--font-sinhala, sans-serif)", color: "#1e4c99", fontWeight: 700 }}>{picked}</div>}
        {turn === "pause" && <div data-testid="turn-pause" style={{ font: "600 16px/1.4 var(--font-label, sans-serif)", color: "rgba(27,27,27,.55)" }}>(a 2 s pause — nothing is drawn)</div>}
        {turn === "retry" && (
          <button type="button" className="wb-tap wb-retry" data-testid="turn-retry" onClick={() => { setTurn("rod"); setPicked("retry → the rods reopen"); }}>
            ආයෙත් උත්සාහ කරන්න
          </button>
        )}
      </div>
    </Section>
  );
}
