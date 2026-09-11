"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Abacus,
  BlankTable,
  ChoiceChips,
  ChalkText,
  Clock,
  DigitPicker,
  Expansion,
  FeedbackFX,
  FractionBar,
  Highlight,
  Money,
  NumberCards,
  NumberPad,
  PlaceValueStrip,
  Pointer,
  TextCard,
  TitleCard,
  Whiteboard,
  HandNumber,
  BOARD,
  type ChipState,
} from "@/components/board";
import { ChalkHand } from "@/components/board/Pointer";
import ZaraCharacter, { type ZaraState } from "@/components/ZaraCharacter";
import LenaCharacter, { type LenaState } from "@/components/LenaCharacter";
import { ProgressStrip } from "@/components/ProgressStrip";
import { stopsFor } from "@/lib/designFrames";

/** The export's cell: board paper, radius 12, padding 20, a caption in 12 px Inter beneath. */
const CELL: CSSProperties = { background: "var(--color-board)", borderRadius: 12, padding: 20, display: "grid", gap: 10, alignContent: "start" };
const CAPTION: CSSProperties = { font: "12px/1.4 var(--font-latin)", color: "var(--color-ink-70)" };
const HEADING: CSSProperties = { font: "700 18px/1.2 var(--font-latin)" };

function Cell({ caption, children, style, center }: { caption: string; children: ReactNode; style?: CSSProperties; center?: boolean }) {
  return (
    <div style={{ ...CELL, ...(center ? { justifyItems: "center" } : {}), ...style }} data-design-cell>
      <Whiteboard viewport="cell" showTray={false}>
        {children}
      </Whiteboard>
      <span style={{ ...CAPTION, textAlign: center ? "center" : undefined }}>{caption}</span>
    </div>
  );
}

function Section({ title, columns, children, style }: { title: string; columns?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "grid", gap: 12, ...style }} data-design-section={title}>
      <div style={HEADING}>{title}</div>
      <div style={columns ? { display: "grid", gridTemplateColumns: columns, gap: 16 } : undefined}>{children}</div>
    </div>
  );
}

const ZARA_STATES: Array<{ id: ZaraState; side?: "left" | "right"; cue: string; label: string }> = [
  { id: "idle", cue: "breath · glance · weight shift (three variants)", label: "idle" },
  { id: "talking", cue: "mouth 1 · 2 · 3 from amplitude", label: "talking" },
  { id: "listening", cue: "the child's turn", label: "listening" },
  { id: "thinking", cue: "judging", label: "thinking" },
  { id: "encourage", cue: "after a wrong answer", label: "encourage" },
  { id: "celebrate", cue: "after a right answer", label: "celebrate" },
  { id: "pointing", side: "left", cue: "pointer on the left", label: "pointing-left" },
  { id: "pointing", side: "right", cue: "pointer on the right", label: "pointing-right" },
  { id: "wave", cue: "the opening", label: "wave" },
];
const LENA_STATES: Array<{ id: LenaState; cue: string }> = [
  { id: "idle", cue: "resting" },
  { id: "alert", cue: "the child's turn · soft check" },
  { id: "peek", cue: "Zara thinking" },
  { id: "hop", cue: "a right answer" },
  { id: "droop-then-nudge", cue: "a wrong answer" },
  { id: "doze", cue: "a long explanation" },
  { id: "wake", cue: "the turn after a doze" },
  { id: "hold-flame", cue: "a star landed" },
];

export function DesignGallery() {
  const [chipState] = useState<ChipState>("idle");
  void chipState;
  const stateRows: Array<{ label: string; chips: Array<[string, ChipState]> }> = [
    { label: "idle · pressed · selected", chips: [["අසූ හතර", "idle"], ["හතළිස් අට", "pressed"], ["අටසිය හතර", "selected"]] },
    { label: "correct + disabled siblings", chips: [["අසූ හතර", "correct"], ["හතළිස් අට", "disabled"], ["අටසිය හතර", "disabled"]] },
    { label: "wrong (wobble frame)", chips: [["80 + 4 විය යුතුයි", "idle"], ["8 + 40 විය යුතුයි", "wrong"], ["වැරැද්දක් නෑ", "idle"]] },
  ];
  const tableRows = [
    { number: 2348, digit: 2, place: null, placeValue: null, valueRepresented: null },
    { number: 6572, digit: 6, place: "...............", placeValue: "...........", valueRepresented: null },
    { number: 5024, digit: 4, place: "දහයස්ථානය", placeValue: 10, valueRepresented: null },
  ];
  return (
    <div style={{ padding: "32px 40px", fontFamily: "var(--font-latin)", color: "var(--color-ink)", display: "grid", gap: 28, background: "#EDE8DD", minHeight: "100vh" }} data-design-gallery>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ font: "600 12px/1.4 var(--font-latin)", color: "var(--color-teal)", letterSpacing: ".04em" }}>SERENDIB SCHOLAR · COMPONENTS</div>
        <h1 style={{ margin: 0, font: "700 28px/1.2 var(--font-latin)" }}>Board primitives, app controls — every listed state</h1>
      </div>

      <Section title="Abacus" columns="repeat(3, minmax(0, 1fr))">
        <Cell caption="rods bare, bead tray beside"><Abacus digits={[0, 0, 0, 0]} shown={[0, 0, 0, 0]} interactive width={260} /></Cell>
        <Cell caption="beads landing one at a time (5th mid-fall, lift shadow) — digit forming beneath"><Abacus digits={[5, 0, 0, 0]} shown={[5, 0, 0, 0]} animate width={260} /></Cell>
        <Cell caption="one rod glowing (others veiled to 38 %)"><Abacus digits={[5, 4, 2, 1]} shown={[5, 4, 2, 1]} glowRods={[3]} width={260} /></Cell>
        <Cell caption="child's number written beneath in green"><Abacus digits={[5, 4, 2, 1]} shown={[5, 4, 2, 1]} childAnswer="5421" width={260} /></Cell>
        <Cell caption="a bead mid-drag with lift shadow"><Abacus digits={[9, 9, 9, 9]} shown={[5, 4, 2, 0]} interactive readout="live" width={260} /></Cell>
        <Cell caption="the number forming under the rods as they fill (Zara's, blue)"><Abacus digits={[5, 4, 2, 1]} shown={[5, 4, 0, 0]} readout="asFilled" width={260} /></Cell>
      </Section>

      <Section title="Place-value strip" columns="repeat(2, minmax(0, 1fr))">
        <Cell caption="empty"><PlaceValueStrip digits={[null, null, null, null, null]} /></Cell>
        <Cell caption="a digit dropping into the සියයේ column"><PlaceValueStrip digits={[null, null, null, null, null]} dropping={{ column: 2, digit: 6 }} /></Cell>
        <Cell caption="a column glowing — your turn"><PlaceValueStrip digits={[null, null, null, null, null]} glowColumn={3} /></Cell>
        <Cell caption="digit pad docked under the tapped එකේ column (keys 56×48)"><PlaceValueStrip digits={[2, 6, 1, 4, null]} byChild={[0, 1, 2, 3]} interactive /></Cell>
      </Section>

      <Section title="Expansion (drawn beneath the abacus, never replacing it)" columns="repeat(2, minmax(0, 1fr))">
        <Cell caption="blanks"><Expansion number={5421} parts={[null, null, null, null]} /></Cell>
        <Cell caption="a value flying from its rod into its slot"><Expansion number={5421} parts={[null, null]} glowIndex={0} /></Cell>
        <Cell caption="a part written by Zara in marker blue with ✎"><Expansion number={5421} parts={["5000", null]} /></Cell>
        <Cell caption="a tapped blank awaiting the pad (glow)"><Expansion number={5421} parts={["5000", null]} glowIndex={1} /></Cell>
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        <Section title="Digit picker" columns="repeat(2, minmax(0, 1fr))">
          <Cell center caption="pool — chalk circle, four tiles"><DigitPicker pool={[1, 3, 6, 4]} built={[]} /></Cell>
          <Cell center caption="a tile lifting into the slot row (picker glowing: your turn)"><DigitPicker pool={[1, 3, 6, 4]} built={[]} interactive glow /></Cell>
          <Cell center caption="built number with its Sinhala name beneath — child's in green"><DigitPicker pool={[1, 3, 6, 4]} built={[0, 1, 2, 3]} builtName="එක්දහස් තුන්සිය හැට හතර" builtBy="child" /></Cell>
          <Cell center caption="tiles mid-reorder by drag (Zara's example name in blue)"><DigitPicker pool={[1, 3, 6, 4]} built={[2, 3, 1, 0]} builtName="හයදහස් හාරසිය තිස් එක" builtBy="tutor" /></Cell>
        </Section>
        <Section title="Number cards" columns="repeat(2, minmax(0, 1fr))">
          <Cell center caption="dealing in, left to right (4th still sliding)"><NumberCards values={[84, 101, 528, 997]} size={34} /></Cell>
          <Cell center caption="one card ringed in chalk saffron"><NumberCards values={[84, 101, 528, 997]} ringed={84} size={34} /></Cell>
          <Cell center caption="a card lifted on tap"><NumberCards values={[84, 101, 528, 997]} selected={101} size={34} /></Cell>
          <Cell center caption="cards mid-reorder by drag"><NumberCards values={[84, 528, 101, 997]} selected={101} size={34} /></Cell>
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
        <Section title="Chalk text">
          <div style={{ ...CELL, gap: 18 }} data-design-cell>
            <div style={{ display: "grid", gap: 6 }}><ChalkText text="84 = 8 +" size={36} cursor /><span style={CAPTION}>mid-write (stroke draws on, chalk scratch)</span></div>
            <div style={{ display: "grid", gap: 6 }}><ChalkText text="84 = 8 + 4 අසූ හතර" size={36} /><span style={CAPTION}>complete — Sinhala words wipe on in Gemunu Libre</span></div>
            <div style={{ display: "grid", gap: 6 }}><div style={{ position: "relative", display: "flex", alignItems: "center", height: 40 }}><div style={{ opacity: 0.25 }}><ChalkText text="84 = 8 + 4" size={36} /></div><div style={{ position: "absolute", left: 60, top: -6, width: 110, height: 52, background: "rgba(247,243,234,.85)", borderRadius: 8, boxShadow: "inset 0 0 0 2px rgba(27,27,27,.06)" }} /><div className="wb-eraser" style={{ position: "absolute", left: 150, top: 2 }} /></div><span style={CAPTION}>erased by a felt sweep</span></div>
          </div>
        </Section>
        <Section title="Pointer (Zara's chalk hand)">
          <div style={{ ...CELL, gridTemplateColumns: "repeat(3, 1fr)", gap: 12, justifyItems: "center", alignItems: "end" }} data-design-cell>
            <div style={{ display: "grid", gap: 8, justifyItems: "center" }}><ChalkHand /><span style={{ ...CAPTION, textAlign: "center" }}>resting</span></div>
            <div style={{ display: "grid", gap: 8, justifyItems: "center" }}><div style={{ position: "relative" }}><div style={{ position: "absolute", left: 8, top: -10, width: 24, height: 24, borderRadius: "50%", border: `3px solid ${BOARD.chalkYellow}`, transform: "scale(1.7)", opacity: 0.45 }} /><ChalkHand /></div><span style={{ ...CAPTION, textAlign: "center" }}>pulsing</span></div>
            <div style={{ display: "grid", gap: 8, justifyItems: "center" }}><div style={{ width: 40, height: 52, border: `2px dashed ${BOARD.ink18}`, borderRadius: 8 }} /><span style={{ ...CAPTION, textAlign: "center" }}>hidden</span></div>
          </div>
        </Section>
        <Section title="Highlight">
          <div style={{ ...CELL, gap: 18, justifyItems: "center" }} data-design-cell>
            <Whiteboard viewport="cell" showTray={false}>
              <div style={{ display: "grid", gap: 18, justifyItems: "center" }}>
                <div style={{ padding: "8px 16px" }}><HandNumber text="528" size={36} color={BOARD.ink} draw={false} targetKeys={["text:ring528"]} /></div>
                <div style={{ padding: "2px 0" }}><HandNumber text="528" size={36} color={BOARD.ink} draw={false} targetKeys={["text:underline528"]} /></div>
              </div>
              <Highlight kind="circle" target={{ text: "ring528" }} />
              <Highlight kind="underline" target={{ text: "underline528" }} />
            </Whiteboard>
            <span style={CAPTION}>chalk ring · underline (both saffron, 3.5 px, slightly wobbly path)</span>
          </div>
        </Section>
        <Section title="Title card">
          <div style={{ ...CELL, justifyItems: "center" }} data-design-cell>
            <TitleCard title="සංඛ්‍යා - 1" emoji="🔢" />
            <span style={CAPTION}>one heading, one emoji, chalk-drawn frame</span>
          </div>
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 40 }}>
        <Section title="Money (stylised, Sri Lankan)">
          <div style={{ ...CELL, gap: 18 }} data-design-cell>
            <Money items={[{ denomination: 1000, count: 3 }, { denomination: 100, count: 1 }, { denomination: 10, count: 1 }, { denomination: 1, count: 1 }]} counted={0} />
            <span style={CAPTION}>a stack of Rs. 1000 notes; Rs. 100 note; Rs. 10 and Rs. 1 coins</span>
            <Money items={[{ denomination: 1000, count: 2 }]} counted={2} />
            <span style={CAPTION}>one item sliding aside as it's counted; running total beneath</span>
          </div>
        </Section>
        <Section title="Blank table (textbook place-value table)">
          <div style={{ ...CELL }} data-design-cell>
            <Whiteboard viewport="cell" showTray={false}>
              <BlankTable
                columns={[{ key: "number", label: "සංඛ්‍යාව" }, { key: "digit", label: "ඉලක්කම" }, { key: "place", label: "ඉලක්කම පිහිටි ස්ථානය" }, { key: "placeValue", label: "ස්ථානීය අගය" }, { key: "valueRepresented", label: "ඉලක්කමෙන් නිරූපිත අගය" }]}
                rows={tableRows}
                filled={[{ row: 0, field: "place", value: "දහසස්ථානය", by: "tutor" }, { row: 0, field: "placeValue", value: "1000", by: "tutor" }, { row: 0, field: "valueRepresented", value: "2000", by: "tutor" }, { row: 2, field: "valueRepresented", value: "40", by: "child" }]}
                activeBlank={{ row: 1, field: "valueRepresented" }}
              />
            </Whiteboard>
            <span style={CAPTION}>row 1: Zara's worked row (blue ✎) · row 2: a cell outlined as active (saffron) · row 3: a cell the child filled (green ✓)</span>
          </div>
        </Section>
      </div>

      <Section title="Choice chips (choiceChips) — the judged step, touch only">
        <div style={{ ...CELL, gap: 18 }} data-design-cell>
          {stateRows.map((row) => (
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 16 }}>
              <span style={CAPTION}>{row.label}</span>
              <div style={{ padding: "6px 0" }}>
                <ChoiceChips options={row.chips.map(([t]) => t)} states={Object.fromEntries(row.chips.map(([, s], i) => [i, s]))} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Feedback" columns="repeat(3, minmax(0, 1fr))">
        <div style={{ ...CELL, padding: "28px 20px", gap: 14, justifyItems: "center" }} data-design-cell>
          <Whiteboard viewport="cell" showTray={false}>
            <div style={{ position: "relative", minWidth: 88, height: 64, padding: "0 12px", background: BOARD.paper, border: `2px solid ${BOARD.markerGreen}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-paper)" }}>
              <HandNumber text="6000" size={34} color={BOARD.successText} draw={false} targetKeys={["text:fxcorrect"]} />
            </div>
            <FeedbackFX kind="correct" at={{ text: "fxcorrect" }} nonce={1} />
          </Whiteboard>
          <span style={{ ...CAPTION, textAlign: "center" }}>correct — soft chime, saffron sparkle settles at the answer, green ✓</span>
        </div>
        <div style={{ ...CELL, padding: "28px 20px", gap: 14, justifyItems: "center" }} data-design-cell>
          <div style={{ minWidth: 88, height: 64, padding: "0 12px", background: BOARD.paper, border: `2px solid ${BOARD.ink18}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-paper)", transform: "translateX(5px) rotate(3deg)" }}>
            <HandNumber text="600" size={34} color={BOARD.ink} draw={false} />
          </div>
          <span style={{ ...CAPTION, textAlign: "center" }}>wrong — gentle wobble (±6 px, ±3°, 500 ms) + low tone. No red, no face.</span>
        </div>
        <div style={{ ...CELL, padding: "28px 20px", gap: 14, justifyItems: "center" }} data-design-cell>
          <Whiteboard viewport="cell" showTray={false}>
            <div style={{ position: "relative", width: 180, height: 64 }} />
            <FeedbackFX kind="celebrate" at={null} nonce={1} />
          </Whiteboard>
          <span style={{ ...CAPTION, textAlign: "center" }}>celebrate — one burst per concept, bead colours only</span>
        </div>
      </Section>

      <Section title="Stretch primitives — proof the system holds (5.6b)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
          <Cell center caption="whole"><FractionBar parts={1} shaded={0} /></Cell>
          <Cell center caption="split into 4 parts"><FractionBar parts={4} shaded={0} /></Cell>
          <Cell center caption="three parts shaded (saffron) = 3/4"><FractionBar parts={4} shaded={3} /></Cell>
          <Cell center caption="a part being dragged out (lift) — bar glowing: your turn"><FractionBar parts={4} shaded={3} lifted={2} glow /></Cell>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginTop: 16 }}>
          <Cell center caption="clock — hands at 12:15; wood rim, hour hand wood-dark, minute hand teal"><Clock hour={12} minute={15} /></Cell>
          <Cell center caption="minute hand being dragged — ghost of the old position, saffron grip ring (48 px hit), lift shadow"><Clock hour={12} minute={20} interactive /></Cell>
        </div>
      </Section>

      <Section title="App controls — buttons, chips, cards">
        <div style={{ background: "var(--color-paper)", borderRadius: 20, padding: 24, boxShadow: "var(--shadow-card)", display: "grid", gap: 24 }} data-design-cell>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" style={{ height: 56, padding: "0 28px", border: 0, borderRadius: 12, background: "var(--color-teal)", color: "#fff", font: "700 24px/1.5 var(--font-display)", boxShadow: "var(--shadow-button)" }}>පටන් ගමු</button>
            <button type="button" style={{ height: 56, padding: "0 28px", border: 0, borderRadius: 12, background: "var(--color-teal)", color: "#fff", font: "700 24px/1.5 var(--font-display)", boxShadow: "none", transform: "translateY(3px)" }}>පටන් ගමු</button>
            <button type="button" style={{ height: 56, padding: "0 28px", border: 0, borderRadius: 12, background: "var(--color-teal)", color: "#fff", font: "700 24px/1.5 var(--font-display)", boxShadow: "var(--shadow-button)", opacity: 0.45 }}>පටන් ගමු</button>
            <button type="button" className="wb-retry" style={{ position: "static" }}>↺ ආයෙත් උත්සාහ කරන්න</button>
            <button type="button" className="wb-hand" style={{ position: "static" }}>✋</button>
            <span style={CAPTION}>primary · pressed · disabled · retry (secondary) · icon (paper)</span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={CAPTION}>Concept-stop strip (8 concepts: 3 done, 2 mastered ★, current saffron)</div>
            <div style={{ display: "flex", alignItems: "center", background: "var(--color-teal)", padding: "6px 2px", borderRadius: 999, width: "max-content" }}><ProgressStrip stops={stopsFor(3)} /></div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={CAPTION}>Number pad — docked, two rows of six, keys 56×56 (1–5 ⌫ / 6–0 ✓; ✓ is the only teal key)</div>
            <NumberPad mode="number" onCommit={() => {}} />
          </div>
        </div>
      </Section>

      <Section title="Zara — face A, the eight states (+ wave for the opening)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, background: "var(--color-board)", borderRadius: 12, padding: 16 }} data-design-cell>
          {ZARA_STATES.map((s) => (
            <div key={s.label} style={{ display: "grid", gap: 10, justifyItems: "center", alignContent: "start" }}>
              <ZaraCharacter state={s.id} amplitude={s.id === "talking" ? 0.5 : 0} side={s.side ?? null} size={140} />
              <ZaraCharacter state={s.id} amplitude={s.id === "talking" ? 0.5 : 0} side={s.side ?? null} size={64} portrait />
              <span style={{ font: "600 12px/1.3 var(--font-latin)", color: "var(--color-ink)", textAlign: "center" }}>{s.label}</span>
              <span style={{ font: "11px/1.3 var(--font-latin)", color: "var(--color-ink-70)", textAlign: "center" }}>{s.cue}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "center", background: "var(--color-board)", borderRadius: 12, padding: 16, marginTop: 16 }} data-design-cell>
          <ZaraCharacter state="talking" amplitude={0.12} size={64} portrait />
          <ZaraCharacter state="talking" amplitude={0.35} size={64} portrait />
          <ZaraCharacter state="talking" amplitude={0.8} size={64} portrait />
          <span style={{ font: "11px/1.3 var(--font-latin)", color: "var(--color-ink-70)" }}>talking — mouth shapes 1 · 2 · 3 (small o · open · wide ah)</span>
        </div>
      </Section>

      <Section title="Lena (ලේනා) — three-striped palm squirrel, eight states">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, background: "var(--color-board)", borderRadius: 12, padding: 16 }} data-design-cell>
          {LENA_STATES.map((s) => (
            <div key={s.id} style={{ display: "grid", gap: 10, justifyItems: "center", alignContent: "start" }}>
              <LenaCharacter state={s.id} size={132} />
              <LenaCharacter state={s.id} size={48} />
              <span style={{ font: "600 12px/1.3 var(--font-latin)", color: "var(--color-ink)", textAlign: "center" }}>{s.id}</span>
              <span style={{ font: "11px/1.3 var(--font-latin)", color: "var(--color-ink-70)", textAlign: "center" }}>{s.cue}</span>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ display: "none" }}>
        <TextCard text="3058" />
        <Pointer at={null} pulseKey={0} parked={false} />
      </div>
    </div>
  );
}
