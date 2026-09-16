/**
 * The design's session frames (docs/design/export/handoff — Session.dc.html,
 * Session B.dc.html, Session Gaps.dc.html) mapped to the beat states that
 * produce them, so the design preview (/admin/design-preview?frame=<id>)
 * can stage each one statically and scripts/design-check.ts can diff it
 * against the reference PNG named by the frame's title.
 *
 * A frame is staged by replaying the storyboard up to a beat (the runtime's
 * own reducer), then applying the frame's extra events (the turn, the
 * chips, a fill, a wrong answer) exactly as the runtime would dispatch them.
 */
import { initialStage, isKnownEvent, reduceStage, type StageState, type Storyboard, type StoryboardEvent, type TableColumn } from "@/lib/choreography";
import type { YourTurn } from "@/components/board/BoardStage";
import type { ZaraState } from "@/components/ZaraCharacter";
import type { LenaState } from "@/components/LenaCharacter";
import type { ConceptStop } from "@/components/ProgressStrip";

export type DesignPage = "Session" | "Session B" | "Session Gaps" | "Session Gaps B";

export interface DesignFrame {
  id: string;
  page: DesignPage;
  /** The frame's label in the export (the PNG is named "<id> - <label> - <note>" or "<id>\n<label>\n<note>"). */
  label: string;
  note: string;
  /** The storyboard beat whose state the frame shows (replayed through the reducer). */
  beat: string;
  /** Events applied after the replay (the frame's own turn / fill / wrong). */
  then?: Array<Pick<StoryboardEvent, "primitive" | "event" | "args">>;
  /** A base staged by hand where the runtime fetches it from the content bank (the textbook tables). */
  legacy?: NonNullable<StageState["base"]>;
  turn?: YourTurn | null;
  /** The last tapped chip and what came of it. */
  chipResult?: { index: number; result: "wrong" | "correct" | "selected" };
  feedback?: { kind: "correct" | "wrong" | "celebrate"; at: StageState["feedback"]["at"] };
  practice?: StageState["practice"];
  zara: ZaraState;
  lena: LenaState;
  caption?: string;
  /** The concept stop that is current (0-based) — the strip shows 8 stops. */
  stop: number;
  sheet?: "mic" | "chat";
  talking?: boolean;
  /** How the frame differs from what the runtime can stage, for the report. */
  knownGap?: string;
}

const CAPTION_WRONG = "හ්ම්, ඒක නෙමෙයි. ආයෙ පොඩ්ඩක් හිතලා බලන්න.";

const BREAKDOWN_COLUMNS: TableColumn[] = [
  { key: "number", label: "සංඛ්‍යාව" },
  { key: "digit", label: "ඉලක්කම" },
  { key: "place", label: "ඉලක්කම පිහිටි ස්ථානය" },
  { key: "placeValue", label: "ස්ථානීය අගය" },
  { key: "valueRepresented", label: "ඉලක්කමෙන් නිරූපිත අගය" },
];
const NUMBER_NAME_COLUMNS: TableColumn[] = [
  { key: "number", label: "සංඛ්‍යාව" },
  { key: "numberName", label: "සංඛ්‍යා නාමය" },
];

/** The textbook place-value table (item 7b58e436) as the design draws it: row 0 worked by Zara. */
export const PLACE_VALUE_TABLE: NonNullable<StageState["base"]> = {
  kind: "blankTable",
  columns: BREAKDOWN_COLUMNS,
  rows: [
    { number: 2348, digit: 2, place: null, placeValue: null, valueRepresented: null },
    { number: 6572, digit: 6, place: null, placeValue: null, valueRepresented: null },
    { number: 5024, digit: 4, place: null, placeValue: null, valueRepresented: null },
    { number: 8700, digit: null, place: null, placeValue: null, valueRepresented: 700 },
    { number: 9605, digit: null, place: "දහයස්ථානය", placeValue: null, valueRepresented: null },
    { number: 7003, digit: null, place: "සියයස්ථානය", placeValue: null, valueRepresented: null },
  ],
  filled: [
    { row: 0, field: "place", value: "දහසස්ථානය", by: "tutor" },
    { row: 0, field: "placeValue", value: "1000", by: "tutor" },
    { row: 0, field: "valueRepresented", value: "2000", by: "tutor" },
  ],
  activeBlank: null,
  itemId: "7b58e436",
};

/** The numeral ↔ name table (item 4c2aa078). */
export const NAME_TABLE: NonNullable<StageState["base"]> = {
  kind: "blankTable",
  columns: NUMBER_NAME_COLUMNS,
  rows: [
    { number: 6528, numberName: null },
    { number: null, numberName: "දෙදහස් හාරසිය තිහ" },
    { number: null, numberName: "තුන්දහස් එකසියය" },
    { number: 5060, numberName: null },
    { number: null, numberName: "එක්දහස් අට" },
    { number: 9015, numberName: null },
  ],
  filled: [],
  activeBlank: null,
  itemId: "4c2aa078",
};

const chips = (options: string[], correctIndex: number) => ({ primitive: "choiceChips", event: "show", args: { options, correctIndex } });
const yourTurn = (answerMode: string, surface: string) => ({ primitive: "turn", event: "your_turn", args: { answerMode, surface } });
const turnChips = (options: string[], correctIndex: number, answerMode: YourTurn["answerMode"] = "valueOrPlace"): YourTurn => ({ kind: "ask", surface: null, touchable: false, numeric: false, answerMode, chips: { options, correctIndex } });

export const DESIGN_FRAMES: DesignFrame[] = [
  { id: "M1", page: "Session", label: "Opening", note: "title card appears · Zara waves", beat: "authored:opening:0", zara: "wave", lena: "idle", caption: "ආයුබෝවන් පුතේ! අද අපි පහ ශ්‍රේණියේ ගණිත පාඩම් පටන් ගන්නවා නේද?", stop: 0, talking: true },
  { id: "M2", page: "Session", label: "Hook", note: 'soft check — no glow, no mic; Lena perks up so a spoken "ඔව්" feels noticed', beat: "authored:readWrite4Digit:0", then: [{ primitive: "turn", event: "pause", args: { ms: 2000 } }], turn: { kind: "soft", surface: null, touchable: false, numeric: false }, zara: "talking", lena: "alert", caption: "ක්‍රිකට් මැච් එකක් බලද්දී ලකුණු පුවරුවේ තියෙන ලකුණු ඔයා කියවලා තියෙනවා නේද පුතේ?", stop: 0, talking: true },
  {
    id: "M3",
    page: "Session",
    label: "Reading cards",
    note: "chalk ring on 84 · pointer · your turn: three name-chips at the foot of the board",
    beat: "authored:readWrite4Digit:1",
    then: [{ primitive: "numberCards", event: "highlight_ring", args: { value: 84 } }, { primitive: "pointer", event: "move_to", args: { target: { card: 84 } } }, chips(["අසූ හතර", "හතළිස් අට", "අටසිය හතර"], 0), yourTurn("readAloud", "chips")],
    turn: turnChips(["අසූ හතර", "හතළිස් අට", "අටසිය හතර"], 0, "readAloud"),
    zara: "encourage",
    lena: "alert",
    caption: "මෙන්න මේ පුවරුවේ තියෙන මුල්ම සංඛ්‍යාව මොකක්ද කියලා මට කියන්න බලන්න.",
    stop: 0,
    knownGap: "the export rendered every chips frame with the dock inset (bottom 190: Session.dc.html's frame data sets contentBottom twice and the later 190 wins); the README says 124 with chips and the product keeps 124, so the content sits 33 px higher in the export",
  },
  { id: "M4", page: "Session", label: "Building a number", note: "picker glows · pointer parks", beat: "authored:readWrite4Digit:22", turn: { kind: "ask", surface: "digitPicker", touchable: true, numeric: true, answerMode: "build" }, zara: "encourage", lena: "alert", caption: "මේ ඉලක්කම් වලින් ඔයා කැමති සංඛ්‍යාවක් හදලා මට කියන්න.", stop: 1 },
  {
    id: "M5",
    page: "Session",
    label: "Find my mistake",
    note: "chalk writes 84 = 8 + 4 · pointer on 84 · Zara thoughtful · chips from the start (touch only)",
    beat: "authored:readWrite4Digit:31",
    turn: turnChips(["80 + 4 විය යුතුයි", "8 + 40 විය යුතුයි", "වැරැද්දක් නෑ"], 0, "why"),
    then: [chips(["80 + 4 විය යුතුයි", "8 + 40 විය යුතුයි", "වැරැද්දක් නෑ"], 0), yourTurn("why", "chips")],
    zara: "thinking",
    lena: "peek",
    caption: "ඔන්න පුතේ, මම අසූ හතර කියන සංඛ්‍යාව වෙන් කරලා ලිව්වා. ඒත් මගේ වැඩේ පොඩි වැරැද්දක් වුණා වගේ.",
    stop: 1,
    knownGap: "the export rendered every chips frame with the dock inset (bottom 190: Session.dc.html's frame data sets contentBottom twice and the later 190 wins); the README says 124 with chips and the product keeps 124, so the content sits 33 px higher in the export; the hand rests at the chalk where the export parks none",
  },
  { id: "M6", page: "Session", label: "Beads landing", note: "five red beads drop one at a time · digit 5 forms beneath", beat: "authored:placeValue4Digit:34", then: [{ primitive: "abacus", event: "bead_add", args: { rod: 0, count: 5 } }], zara: "pointing", lena: "doze", caption: "දහසස්ථානයේ කූරට අපි පබළු එක, දෙක, තුන, හතර, පහක් දානවා.", stop: 2, talking: true, knownGap: "beads landing glow the rod they fill (G7) where this moment draws no glow; the term label written at :34 stays beside the abacus (G8) where this moment has none; a bead mid-fall cannot be held in a still" },
  {
    id: "M7",
    page: "Session",
    label: "A question on the abacus",
    note: "the 1 rod glows, others veiled · your turn: number pad docks under the rod",
    beat: "authored:placeValue4Digit:44",
    turn: { kind: "ask", surface: "abacus", touchable: false, numeric: true, answerMode: "valueOrPlace", chips: { options: ["0", "2", "1"], correctIndex: 2 }, rodPick: "count" },
    zara: "encourage",
    lena: "alert",
    caption: "එකස්ථානයේ පබළු කීයක් තියෙනවද?",
    stop: 2,
    knownGap: "rule c: a rod question is answered by a rod tap or a chip, so the abacus stands at 280 with chips at the foot where the export docks a pad under a 200 px abacus (resolution recorded in DESIGN.md)",
  },
  { id: "M8", page: "Session", label: "Expansion beneath the abacus", note: "5000 flies from the 1000 rod into the first slot · blue ✎", beat: "authored:placeValue4Digit:67", zara: "talking", lena: "idle", caption: "ඒක පන්දහසයි.", stop: 3, talking: true },
  { id: "M9", page: "Session", label: "The empty rod", note: 'empty 100 rod glows · "+ 0" writes in · pointer on the 0', beat: "authored:placeValue4Digit:80", zara: "pointing", lena: "idle", caption: "කූරේ කිසිම පබළුවක් නෑ. ඒ නිසා එතන අගය බිංදුවයි.", stop: 3, talking: true },
  { id: "M10", page: "Session", label: "The table", note: "row 6572's value cell outlines · number pad docks · pointer on 6572 (pad displaces the caption)", beat: "authored:placeValue4Digit:103", legacy: PLACE_VALUE_TABLE, turn: { kind: "ask", surface: "blankTable", touchable: true, numeric: true, answerMode: "cell" }, zara: "encourage", lena: "alert", stop: 4 },
  {
    id: "R1",
    page: "Session B",
    label: "Read-aloud practice (readAloud beat)",
    note: "three steps on one frame: invitation (no recording, 3 s pause, Lena perks) → three name-chips judged by touch → Zara reads it back; the number row and its ring stay on the board with the step cards docked beneath",
    beat: "authored:readWrite4Digit:1",
    then: [{ primitive: "turn", event: "pause", args: { ms: 3000, cue: "mic", number: 528 } }, chips(["පන්සිය විසි අට", "පන්සිය අටවිස්ස", "පන්දහස් විසි අට"], 0), yourTurn("readAloud", "chips")],
    turn: turnChips(["පන්සිය විසි අට", "පන්සිය අටවිස්ස", "පන්දහස් විසි අට"], 0, "readAloud"),
    practice: { step: 2, number: 528 },
    zara: "encourage",
    lena: "alert",
    stop: 0,
    knownGap: "the export rendered every chips frame with the dock inset (bottom 190: Session.dc.html's frame data sets contentBottom twice and the later 190 wins); the README says 124 with chips and the product keeps 124, so the content sits 33 px higher in the export; and since 16 Sep (docs/qa/session1-triage.md, cluster D) the steps run invite → chips → read-back and dock beneath the number row, which stays on the board with its ring — the export drew the three cards in place of the row, in the old order",
  },
  {
    id: "R2",
    page: "Session B",
    label: "Read-aloud practice on the abacus (app-only frame)",
    note: "placeValue:58 — the ringed abacus stays on the board at the M7 width (200) with the step cards docked beneath and the three name-chips at the foot; the tightest read-aloud composition, so the 800×360 fit check includes it",
    beat: "authored:placeValue4Digit:58",
    then: [{ primitive: "highlight", event: "circle", args: { target: { number: 5421 } } }, { primitive: "turn", event: "pause", args: { ms: 3000, cue: "mic", number: 5421 } }, chips(["පන්දහස් හාරසිය විසි එක", "පන්දහස් දෙසිය හතළිස් එක", "පන්දහස් හාරසිය දොළහ"], 0), yourTurn("readAloud", "chips")],
    turn: turnChips(["පන්දහස් හාරසිය විසි එක", "පන්දහස් දෙසිය හතළිස් එක", "පන්දහස් හාරසිය දොළහ"], 0, "readAloud"),
    practice: { step: 2, number: 5421 },
    zara: "encourage",
    lena: "alert",
    stop: 2,
    knownGap: "an app-only frame: the export has no read-aloud on an abacus, so there is nothing to diff against — it exists for the 800×360 fit check (the abacus + cards + chips must all clear the foot)",
  },
  { id: "S1", page: "Session B", label: "Correct", note: "on M10 — sparkle at the answer, green ✓, chime, Zara celebrates, Lena hops", beat: "authored:placeValue4Digit:103", legacy: PLACE_VALUE_TABLE, then: [{ primitive: "blankTable", event: "cell_fill", args: { row: 1, field: "valueRepresented", value: "6000", by: "child" } }, { primitive: "turn", event: "over", args: {} }], feedback: { kind: "correct", at: { cell: { row: 1, field: "valueRepresented" } } }, zara: "celebrate", lena: "hop", caption: "නියමයි! ඔයා හරියටම කිව්වා!", stop: 4 },
  { id: "S2", page: "Session B", label: "Wrong", note: "on M7 — gentle wobble, low tone, Zara encourages, Lena droops then nudges. Nothing red; retry button always present", beat: "authored:placeValue4Digit:44", then: [{ primitive: "turn", event: "retry", args: {} }], feedback: { kind: "wrong", at: { rod: 3 } }, zara: "encourage", lena: "droop-then-nudge", caption: CAPTION_WRONG, stop: 2, knownGap: "the export freezes the wobble mid-tilt (the abacus drawn rotated, no tray); the app's wobble is a 500 ms motion that ends level, and the rod-tap question keeps its tray and the ↺ note" },
  {
    id: "S2b",
    page: "Session B",
    label: "Wrong on chips",
    note: "on M3 — tapped chip wobbles, low tone, retry button, other chips stay; Zara encourages, Lena droops then nudges",
    beat: "authored:readWrite4Digit:1",
    then: [{ primitive: "numberCards", event: "highlight_ring", args: { value: 84 } }, chips(["අසූ හතර", "හතළිස් අට", "අටසිය හතර"], 0), { primitive: "turn", event: "retry", args: {} }],
    chipResult: { index: 1, result: "wrong" },
    feedback: { kind: "wrong", at: null },
    zara: "encourage",
    lena: "droop-then-nudge",
    caption: CAPTION_WRONG,
    stop: 0,
    knownGap: "the export rendered every chips frame with the dock inset (bottom 190: Session.dc.html's frame data sets contentBottom twice and the later 190 wins); the README says 124 with chips and the product keeps 124, so the content sits 33 px higher in the export",
  },
  { id: "P1", page: "Session B", label: "First-time ✋ — mic permission", note: 'first ever ✋ tap: board dims, Zara (160 px) explains in Sinhala why she listens and that nothing is stored; the system prompt follows only after "හරි"', beat: "authored:placeValue4Digit:54", sheet: "mic", zara: "talking", lena: "idle", stop: 2, talking: true },
  { id: "S3", page: "Session B", label: "✋ chat open", note: "on M7 — board dims, Zara enlarges to 160 px, transcript sheet; the ONLY place the mic exists", beat: "authored:placeValue4Digit:54", sheet: "chat", zara: "talking", lena: "idle", stop: 2, talking: true },
  // --- the gap frames -------------------------------------------------------
  { id: "opening:4–5", page: "Session Gaps", label: "Title card persists; text cards stack beside it", note: "textCard.show ×2 while the title card stays (dimmed to 60 %); pointer on 100 000. Rule (b) persistent board.", beat: "authored:opening:5", zara: "idle", lena: "idle", stop: 1 },
  { id: "readWrite:6–8", page: "Session Gaps", label: "Chalk stack of three (older lines at 60 %) + docked number pad", note: "chalkText.write ×3: 9 + 1 = 10 · 99 + 1 = 100 · 999 + 1 = ▢ — the newest line at 100 %, the blank glowing; the child types on the pad.", beat: "authored:readWrite4Digit:8", turn: { kind: "ask", surface: null, touchable: false, numeric: true, answerMode: "build", padFirst: true }, zara: "encourage", lena: "alert", stop: 1 },
  { id: "readWrite:12–14", page: "Session Gaps", label: "Ten-card row; four cards drawn and lifted; the number they make", note: "numberCards.show 0–9 in one 64 px row (rule d); four lift out; textCard 3058 beside.", beat: "authored:readWrite4Digit:14", zara: "talking", lena: "idle", stop: 1, talking: true, knownGap: "the → and the made card sit a few pixels apart from the export's (the arrow glyph is not in Gemunu Libre and falls back in both renders)" },
  { id: "readWrite:16–17", page: "Session Gaps", label: "Card + chalk append with the place bracketed", note: "textCard 3058 persists; chalkText appends \"- තුන්දහස් පනස් අට\" beside it; pointer on the tens digit. Rule (b).", beat: "authored:readWrite4Digit:16", zara: "pointing", lena: "idle", stop: 1, talking: true },
  { id: "readWrite:18c–18g", page: "Session Gaps", label: "Numeral ↔ name table (item 4c2aa078) — filled AND active at once", note: "second blankTable skin", beat: "authored:readWrite4Digit:18d", legacy: NAME_TABLE, then: [{ primitive: "blankTable", event: "cell_fill", args: { row: 1, field: "number", value: "2430", by: "tutor" } }, { primitive: "blankTable", event: "row_activate", args: { row: 0, field: "numberName" } }], turn: { kind: "ask", surface: "blankTable", touchable: true, numeric: false, answerMode: "cell" }, zara: "encourage", lena: "alert", stop: 0 },
  { id: "readWrite:30–30f", page: "Session Gaps", label: "Textbook digit puzzle (item 7daf0141): five built numbers ledger", note: "digitPicker ledger", beat: "authored:readWrite4Digit:30e", legacy: { kind: "digitPicker", pool: [1, 8, 5, 2, 0, 3, 4, 9, 2, 7, 6], built: null, builtName: null, builtBy: "child", itemId: "7daf0141", ledger: [] }, turn: { kind: "ask", surface: "digitPicker", touchable: true, numeric: true, answerMode: "build" }, zara: "encourage", lena: "alert", caption: "දැන් ඒකට වඩා වෙනස් සංඛ්‍යාවක් හදන්න පුළුවන්ද?", stop: 0, knownGap: "the puzzle's hand is the storyboard's 1 · 3 · 6 · 4 where the export drew an illustrative 3 · 0 · 5 · 8; the fourth row's '46' is the child's own draft; the hand rests at the picker where the export parks none" },
  { id: "placeValue:41", page: "Session Gaps", label: "Two rods glow; beads land on both", note: "abacus.rod_glow with rods [2, 3] (glow group)", beat: "authored:placeValue4Digit:41", zara: "pointing", lena: "idle", stop: 2, talking: true, knownGap: "the term label from :34 stays beside the abacus (G8) where G7 has none; G7 is drawn by hand without the 38 % veil and with a bead mid-air on each rod" },
  { id: "placeValue:34–35 · 42 · 58", page: "Session Gaps", label: "Chalk ring around the whole abacus + chalk label beside it", note: "highlight.circle target {number:5421} on an abacus = ring the frame; chalkText \"ගණක රාමුව\" persists at 60 % beside it.", beat: "authored:placeValue4Digit:42", zara: "pointing", lena: "idle", stop: 2, talking: true, knownGap: "the export drew this abacus at 260 inside a padded wrapper with a hand-placed ellipse; the product rings the 280 px abacus's own box (rule g), so the ring and the abacus sit some 20 px apart from the export's" },
  { id: "placeValue:44 · 48 · 66", page: "Session Gaps", label: "Rod-tap question: glow + 48 px hit columns + chips", note: "surface \"rod\"", beat: "authored:placeValue4Digit:44", turn: { kind: "ask", surface: "abacus", touchable: false, numeric: true, answerMode: "valueOrPlace", chips: { options: ["0", "2", "1"], correctIndex: 2 }, rodPick: "count" }, zara: "encourage", lena: "alert", caption: "එකස්ථානයේ පබළු කීයක් තියෙනවද?", stop: 2, knownGap: "rule c: the abacus stands at 280 with its rod glowing and chips at the foot; the export's dashed hit columns are debug-only and its hand is drawn inverted above the rod" },
  { id: "placeValue:67–74", page: "Session Gaps", label: "Abacus stays while the chalk expansion is written beneath", note: "chalkText.write \"5 421 = 5000 + …\" with appends under a persisting abacus", beat: "authored:placeValue4Digit:71", zara: "pointing", lena: "idle", caption: "ඊළඟට දහයස්ථානයේ තියෙන දෙකෙන් ලැබෙන අගය කීයද?", stop: 3, talking: true, knownGap: "the expansion beneath the abacus is the slot primitive with ✎ badges (M8/M9, storyboard B2) where this gap frame drew the filled parts as bare chalk with a glowing slot; the export's hand sits under the 20" },
  { id: "placeValue:77–81", page: "Session Gaps", label: 'Text card "7000" + chalk appends "+ 0 + 60"', note: "textCard persists while chalkText appends to its right; mid-write cursor shown. Rule (b).", beat: "authored:placeValue4Digit:81", zara: "pointing", lena: "idle", caption: "කූරේ කිසිම පබළුවක් නෑ. ඒ නිසා එතන අගය බිංදුවයි.", stop: 3, talking: true, knownGap: "storyboard B3: the 7 062 abacus persists with the expansion beneath (7000 + 0 with the bare 100 rod glowing) where this gap frame drew a 7000 card with chalk appends" },
  { id: "placeValue:96–101", page: "Session Gaps B", label: "Expansion primitive alone: one part revealed, next slot glows, chips", note: "expansion.show with parts [null×4] and NO abacus", beat: "authored:placeValue4Digit:101", then: [chips(["6", "4", "5"], 2), yourTurn("valueOrPlace", "chips")], turn: turnChips(["6", "4", "5"], 2), chipResult: { index: 2, result: "selected" }, zara: "encourage", lena: "alert", caption: "මේකෙ දහසස්ථානයේ තියෙන ඉලක්කම මොකක්ද පුතේ?", stop: 4, knownGap: "the export rendered every chips frame with the dock inset (bottom 190: Session.dc.html's frame data sets contentBottom twice and the later 190 wins); the README says 124 with chips and the product keeps 124, so the content sits 33 px higher in the export" },
  { id: "placeValue:103–107", page: "Session Gaps B", label: "Place-value table: worked row + child-filled cell + active cell + pointer", note: "row 1 valueRepresented filled green ✓ (from 103) while row 2 is active with a caret (105); pointer on 5024.", beat: "authored:placeValue4Digit:105", legacy: PLACE_VALUE_TABLE, then: [{ primitive: "blankTable", event: "cell_fill", args: { row: 1, field: "valueRepresented", value: "6000", by: "child" } }, { primitive: "blankTable", event: "row_activate", args: { row: 2, field: "valueRepresented" } }, { primitive: "pointer", event: "move_to", args: { target: { cell: { row: 2, field: "number" } } } }], turn: { kind: "ask", surface: "blankTable", touchable: true, numeric: true, answerMode: "cell" }, zara: "encourage", lena: "alert", stop: 4, knownGap: "the active cell is row 3 of 6: with the pad docked the table scrolls it fully above the dock (the export drew it 18 px behind the pad), so the rows on screen start one lower" },
  { id: "placeValue:70 · 79 · 88 · 92 · 98", page: "Session Gaps B", label: "Chalk line alone + chips (no primitive to tap)", note: "valueOrPlace / surface chips with only chalk on the board — chips carry the whole answer; chalk cursor waits for the append.", beat: "authored:placeValue4Digit:70", then: [chips(["200", "20", "2"], 1), yourTurn("valueOrPlace", "chips")], turn: turnChips(["200", "20", "2"], 1), zara: "encourage", lena: "alert", caption: "ඊළඟට දහයස්ථානයේ තියෙන දෙකෙන් ලැබෙන අගය කීයද?", stop: 3, talking: true, knownGap: "the export rendered every chips frame with the dock inset (bottom 190: Session.dc.html's frame data sets contentBottom twice and the later 190 wins); the README says 124 with chips and the product keeps 124, so the content sits 33 px higher in the export; storyboard B2: the abacus persists with its expansion beneath where this gap frame drew the chalk line alone" },
];

export function designFrame(id: string): DesignFrame | undefined {
  return DESIGN_FRAMES.find((f) => f.id === id);
}

/** The eight concept stops the strip shows, with `current` lit. */
export function stopsFor(current: number): ConceptStop[] {
  return Array.from({ length: 8 }, (_, i) => ({ tag: `c${i}`, title: `concept ${i + 1}`, status: i < current ? (i % 2 === 0 ? "mastered" : "done") : i === current ? "current" : "upcoming", fraction: i < current ? 1 : i === current ? 0.4 : 0 }));
}

export interface StagedFrame {
  stage: StageState;
  yourTurn: YourTurn | null;
}

/** The board state the frame shows: the storyboard replayed to its beat, then the frame's own events. */
export function stageDesignFrame(storyboard: Storyboard, frame: DesignFrame): StagedFrame {
  const index = storyboard.beats.findIndex((b) => b.id === frame.beat);
  if (index < 0) throw new Error(`${frame.beat} is not in the storyboard`);
  let stage = initialStage();
  const ctx = { legacy: frame.legacy, lastBuilt: 1364 };
  for (const beat of storyboard.beats.slice(0, index + 1)) {
    for (const event of beat.events) if (isKnownEvent(event)) stage = reduceStage(stage, event, ctx);
    // The puzzle's ledger: what the child built before this hand (the runtime fills it from their answers).
    if (frame.id === "readWrite:30–30f" && beat.id === "authored:readWrite4Digit:30d") {
      stage = { ...stage, pickerLedgers: { ...stage.pickerLedgers, "1346": ["1364", "6431", "3146"] } };
    }
  }
  for (const event of frame.then ?? []) stage = reduceStage(stage, event, ctx);
  if (frame.feedback) stage = { ...stage, feedback: { kind: frame.feedback.kind, at: frame.feedback.at, nonce: stage.feedback.nonce + 1 } };
  if (frame.practice !== undefined) stage = { ...stage, practice: frame.practice };
  if (frame.turn && frame.turn.kind === "ask") stage = { ...stage, parked: true };
  if (frame.id === "readWrite:30–30f" && stage.base?.kind === "digitPicker") stage = { ...stage, base: { ...stage.base, ledger: ["1364", "6431", "3146"] } };
  return { stage, yourTurn: frame.turn ?? null };
}
