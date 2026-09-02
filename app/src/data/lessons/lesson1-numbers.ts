/**
 * ============================================================================
 * TEMPORARY PROOF-OF-CONCEPT — Lesson 1 (සංඛ්‍යා - 1, Numbers - 1) hardcoded content
 * ============================================================================
 *
 * This is a focused POC for teaching exactly one lesson with real, manually
 * transcribed textbook content — no database, no ingestion pipeline, no
 * embedding/API cost. See src/app/api/tools/teach-lesson1-step/route.ts (the
 * tool that serves this data) and prompt.ts's "TEST MODE — LESSON 1 ONLY"
 * section for the other two pieces of this POC.
 *
 * To remove this POC later: delete this file, its directory, the
 * teach-lesson1-step/check-answer/submit-blank-answer/set-active-blank
 * routes, the lesson/ components directory, LessonProgress.tsx, their tool
 * declarations in geminiLiveTools.ts, their entries in useGeminiLive.ts's
 * TOOL_ENDPOINTS/FULL_CONTENT_BOARD_TOOL_NAMES/VIEW_PATCH_BOARD_TOOL_NAMES
 * (plus currentLessonStepNumber/submitTypedAnswer state and the
 * lesson_step branch in applyViewPatch), the `lesson_step` BoardContent
 * variant in src/lib/board.ts, the "TEST MODE" section plus the
 * conceptTag/multi-blank/typed-answer TEACHING STRUCTURE rules in
 * prompt.ts, and GeminiLiveClient.sendTextInput in geminiLiveClient.ts
 * (only ever called by submitTypedAnswer). CharacterState.tsx is NOT part
 * of this POC — it's a general UI component, keep it. Note: the THINKING
 * TIME / "do not rush" prompt.ts rules are also NOT part of this POC —
 * they're general teaching guidance, keep those too.
 *
 * The content below was manually transcribed by the user from real textbook
 * photos — it is verified ground truth, encoded here exactly as given.
 * Nothing here is generated, rounded, or "corrected."
 */

// --- Component prop shapes ---------------------------------------------
//
// None of these 7 board component types existed anywhere in the codebase
// before this POC (confirmed: not in the working tree, not in git history,
// not on any branch) — their shapes below were designed from scratch to fit
// this lesson's real data, not adapted from a pre-existing design. See the
// summary given alongside this change for the specific shape decisions that
// needed adapting from the original request (PlaceValueTable's two distinct
// row shapes; ExpansionExercise's prompt/parts generalization to also cover
// step 7's expression-and-blanks rows).

export interface DigitPickerPuzzleProps {
  availableDigits: number[];
  exampleAnswer: string;
  instructions: string;
}

export interface PlaceValueNumberNameRow {
  number: number | null;
  numberName: string | null;
}

export interface PlaceValueBreakdownRow {
  number: number | null;
  digit: number | null;
  place: string | null;
  placeValue: number | null;
  valueRepresented: number | null;
}

// ADAPTATION: the request describes PlaceValueTable in two shapes — a plain
// number<->name table (step 2) and a 5-column digit/place/place-value
// breakdown (steps 3, 11) — explicitly permitting "a distinct simple
// 2-column table using the same visual style" if one component can't cover
// both. Modeled here as one component with a `variant` discriminant instead
// of two separate component types, since "PlaceValueTable" was named as one
// of exactly 7 components — same visual family, two row shapes.
export type PlaceValueTableProps =
  | { variant: "numberName"; rows: PlaceValueNumberNameRow[] }
  | { variant: "breakdown"; rows: PlaceValueBreakdownRow[] };

export interface AbacusDiagramProps {
  digits: number[];
  label: string;
  numeral: string;
}

export interface ExampleBoxProps {
  variant: "pink" | "yellow" | "green";
  label: string;
  /** Always an array, even for a single line — step 6 needs multiple lines in one box. */
  content: string[];
}

// ADAPTATION: step 7's rows ({expr, answerNumber, answerName}) are a
// different shape from step 5/12's rows ({number, parts: number[]}) — both
// are fundamentally "a prompt on the left, blank(s) to fill in on the
// right," so ExpansionExercise is generalized to that shared shape rather
// than adding an 8th component type.
export interface ExpansionExerciseRow {
  /** The number to expand (steps 5, 12), or the expression to evaluate (step 7, e.g. "69 999 + 1"). */
  prompt: number | string;
  /** Blank-to-fill-in cells — place-value parts (steps 5, 12) or [answerNumber, answerName] (step 7). Null = blank for the child to fill in. */
  parts: (number | string | null)[];
}

export interface ExpansionExerciseProps {
  rows: ExpansionExerciseRow[];
}

export interface NumberedQuestionSubPart {
  letter: string;
  text: string;
}

export interface NumberedQuestion {
  number: number;
  /** A question has either plain `text` or `subParts` (a, b, c...), never both. */
  text?: string;
  subParts?: NumberedQuestionSubPart[];
}

export interface NumberedQuestionListProps {
  questions: NumberedQuestion[];
}

export interface SequenceTableRow {
  before: number | null;
  number: number | null;
  after: number | null;
}

export interface SequenceTableProps {
  rows: SequenceTableRow[];
}

// --- The 7 components, as a discriminated union --------------------------

export type LessonComponent =
  | { type: "DigitPickerPuzzle"; props: DigitPickerPuzzleProps }
  | { type: "PlaceValueTable"; props: PlaceValueTableProps }
  | { type: "AbacusDiagram"; props: AbacusDiagramProps }
  | { type: "ExampleBox"; props: ExampleBoxProps }
  | { type: "ExpansionExercise"; props: ExpansionExerciseProps }
  | { type: "NumberedQuestionList"; props: NumberedQuestionListProps }
  | { type: "SequenceTable"; props: SequenceTableProps };

// ADAPTATION: the request describes each step as having one componentType +
// componentProps, but several steps (5, 7, 8, 9, 12) genuinely pair an
// ExampleBox with a second component (an exercise or question list) as one
// cohesive teaching step — modeled below as an array of 1-2 components
// rather than a single componentType/componentProps pair.
export interface LessonStep {
  stepNumber: number;
  /** Usually one component; two for a step that pairs an ExampleBox with an exercise/question list (see the module doc's ADAPTATION note). */
  components: LessonComponent[];
  /** English, for the AI's own reference — not shown to the child. */
  teachingNote: string;
  /**
   * Identifies the underlying skill this step exercises. Present on every
   * step (not just steps that are "new," per the request's wording) so
   * prompt.ts's TEACHING STRUCTURE rule always has an explicit signal: teach
   * the concept in full the first time a tag is seen this session, then
   * just briefly remind on a later step reusing the same tag — e.g. step 3
   * introduces "placeValueBreakdown" with 4-digit numbers, step 11 reuses
   * the same tag with 5-digit numbers (a reminder, not a re-teach).
   * Deliberately carries no authored explanation text — see the module doc:
   * the AI generates the actual teaching live, in its own words, from
   * conceptDescription's one-line pointer, since hand-authoring a script
   * per concept doesn't scale to future lessons/subjects.
   */
  conceptTag: string;
  /** One-line English description of the concept, for the AI's own reference — not a script to read aloud. */
  conceptDescription: string;
}

/**
 * A single filled-in blank on the current lesson step's board — see
 * submit_blank_answer, src/app/api/tools/submit-blank-answer/route.ts.
 * `field` is a component-specific cell identifier (documented per
 * component in LessonComponents.tsx): "number"/"numberName" for
 * PlaceValueTable's numberName variant; "digit"/"place"/"placeValue"/
 * "valueRepresented" for its breakdown variant; "part0".."partN" for
 * ExpansionExercise; "before"/"number"/"after" for SequenceTable.
 * Keyed by (rowIndex, field) — submitting again for the same pair replaces
 * the previous value rather than duplicating it.
 */
export interface FilledAnswer {
  rowIndex: number;
  field: string;
  value: string | number;
}

export const LESSON_1_NUMBERS_TITLE = "සංඛ්‍යා - 1 (Numbers - 1)";

export const LESSON_1_NUMBERS_STEPS: LessonStep[] = [
  {
    stepNumber: 1,
    components: [
      {
        type: "DigitPickerPuzzle",
        props: {
          availableDigits: [1, 8, 5, 2, 0, 3, 4, 9, 2, 7, 6],
          exampleAnswer: "3058",
          instructions:
            "පහත කොටුවේ ඇති ඉලක්කම්වලින් හතරක් බැගින් භාවිත කර ඉලක්කම් හතරේ සංඛ්‍යා පහක් ලියන්න.",
        },
      },
    ],
    teachingNote:
      "Warm-up: child picks 4 digits at a time from the pool to build five different 4-digit numbers. exampleAnswer (3058) is a worked example, not the only correct answer.",
    conceptTag: "digitConstruction",
    conceptDescription: "building a multi-digit number by choosing a digit for each place",
  },
  {
    stepNumber: 2,
    components: [
      {
        type: "PlaceValueTable",
        props: {
          variant: "numberName",
          rows: [
            { number: 6528, numberName: null },
            { number: null, numberName: "දෙදහස් හාරසිය තිහ" },
            { number: null, numberName: "තුන්දහස් එකසියය" },
            { number: 5060, numberName: null },
            { number: null, numberName: "එක්දහස් අට" },
            { number: 9015, numberName: null },
          ],
        },
      },
    ],
    teachingNote:
      "Practice converting between a numeral and its Sinhala number-name, both directions. Null cells are what the child fills in.",
    conceptTag: "placeValueReading",
    conceptDescription: "reading place values to convert a number into its Sinhala name",
  },
  {
    stepNumber: 3,
    components: [
      {
        type: "PlaceValueTable",
        props: {
          variant: "breakdown",
          rows: [
            { number: 2348, digit: 2, place: "දහසස්ථානය", placeValue: 1000, valueRepresented: 2000 },
            { number: 6572, digit: 6, place: null, placeValue: null, valueRepresented: null },
            { number: 5024, digit: 4, place: null, placeValue: null, valueRepresented: null },
            { number: 8700, digit: null, place: null, placeValue: null, valueRepresented: 700 },
            { number: 9605, digit: null, place: "දහයස්ථානය", placeValue: null, valueRepresented: null },
            { number: 7003, digit: null, place: "සියයස්ථානය", placeValue: null, valueRepresented: null },
          ],
        },
      },
    ],
    teachingNote:
      "Full place-value breakdown: for a given digit within a number, find its place name, the place's value (e.g. 1000), and the value that digit represents there (e.g. 2000). First row is the fully worked example.",
    conceptTag: "placeValueBreakdown",
    conceptDescription: "finding a digit's place name, its place-value, and the value it represents in a number",
  },
  {
    stepNumber: 4,
    components: [
      {
        type: "AbacusDiagram",
        props: { digits: [2, 3, 1, 1], label: "දෙදහස් තුන්සිය එකොළහ", numeral: "2311" },
      },
    ],
    teachingNote:
      "Worked example only, on purpose — practice exercises for this abacus activity are omitted pending bead-count verification from the source image, per the user's explicit instruction not to guess at unverified data.",
    conceptTag: "abacusRepresentation",
    conceptDescription: "representing a number's place values physically as bead counts on an abacus",
  },
  {
    stepNumber: 5,
    components: [
      {
        type: "ExampleBox",
        props: { variant: "pink", label: "උදාහරණය", content: ["4031 → 4000 + 0 + 30 + 1"] },
      },
      {
        type: "ExpansionExercise",
        props: {
          rows: [
            { prompt: 7658, parts: [7000, null, 50, 8] },
            { prompt: 5090, parts: [null, null, 90, 0] },
            { prompt: 8027, parts: [null, null, 20, null] },
            { prompt: 1200, parts: [1000, null, null, null] },
            { prompt: 6005, parts: [null, null, null, null] },
          ],
        },
      },
    ],
    teachingNote:
      "Expand a 4-digit number into thousands/hundreds/tens/ones parts. Worked example first, then practice rows (null = blank for the child).",
    conceptTag: "numberExpansion",
    conceptDescription: "expanding a whole number into the sum of its place-value parts",
  },
  {
    stepNumber: 6,
    components: [
      {
        type: "ExampleBox",
        props: {
          variant: "yellow",
          label: "සටහන",
          content: [
            "9999 + 1 = 10 000 - දස දහස",
            "10 000 - දස දහස",
            "20 000 - විසි දහස",
            "30 000 - තිස් දහස",
            "40 000 - හතළිස් දහස",
            "50 000 - පනස් දහස",
            "60 000 - හැට දහස",
            "70 000 - හැත්තෑ දහස",
            "80 000 - අසූ දහස",
            "90 000 - අනූ දහස",
            "99 999 + 1 = 100 000 - සියක් දහස",
          ],
        },
      },
    ],
    teachingNote:
      "Reference note (not an exercise): naming round ten-thousands from 10,000 to 100,000, bracketed by the two 9999+1/99999+1 rollover facts.",
    conceptTag: "roundNumberRollover",
    conceptDescription: "recognizing how a string of 9s rolls over to the next round number, and naming round ten-thousands",
  },
  {
    stepNumber: 7,
    components: [
      {
        type: "ExampleBox",
        props: { variant: "green", label: "උදාහරණය", content: ["59 999 + 1 = 60 000 - හැට දහස"] },
      },
      {
        type: "ExpansionExercise",
        props: {
          rows: [
            { prompt: "69 999 + 1", parts: [null, null] },
            { prompt: "79 999 + 1", parts: [null, null] },
            { prompt: "89 999 + 1", parts: [null, null] },
            { prompt: "99 999 + 1", parts: [null, null] },
          ],
        },
      },
    ],
    teachingNote:
      "Continue the rollover pattern from the worked example — for each expression, the child fills in the resulting round number and its Sinhala name (both blank cells in `parts`).",
    // Same tag as step 6 on purpose — this step practices, rather than
    // introduces, the rollover concept: a brief reminder, not a re-teach.
    conceptTag: "roundNumberRollover",
    conceptDescription: "recognizing how a string of 9s rolls over to the next round number, and naming round ten-thousands",
  },
  {
    stepNumber: 8,
    components: [
      {
        type: "ExampleBox",
        props: { variant: "green", label: "උදාහරණය", content: ["හැත්තෑ දෙදහස් නවසිය තිස් දෙක = 72 932"] },
      },
      {
        type: "NumberedQuestionList",
        props: {
          questions: [
            { number: 1, text: "දස දහස් එකසිය දොළහ" },
            { number: 2, text: "දහ තුන්දහස් දෙසිය විස්ස" },
            { number: 3, text: "විසි අවදහස් පන්සියය" },
            { number: 4, text: "හතලිස් එක්දහස් හාරසිය අසූ පහ" },
            { number: 5, text: "හැට නවදහස් තුන්සිය හැත්තෑ හත" },
            { number: 6, text: "තිස් පන්දහස් දහනවය" },
            { number: 7, text: "පනස් දහස් පහ" },
          ],
        },
      },
    ],
    teachingNote: "Convert each Sinhala number-name into its numeral, following the worked example.",
    // Same tag as step 2 — same underlying skill (name<->numeral via place
    // values), now name-to-numeral only and with larger numbers.
    conceptTag: "placeValueReading",
    conceptDescription: "reading place values to convert a number into its Sinhala name",
  },
  {
    stepNumber: 9,
    components: [
      {
        type: "ExampleBox",
        props: {
          variant: "green",
          label: "උදාහරණය",
          content: [
            "දස දහසස්ථානය 2, දහසස්ථානය 7, සියයස්ථානය 3, දහයස්ථානය 9 හා එකස්ථානය 4 ලෙස වන සංඛ්‍යාව කුමක් ද? → 27 394",
          ],
        },
      },
      {
        type: "NumberedQuestionList",
        props: {
          questions: [
            {
              number: 1,
              subParts: [
                {
                  letter: "a",
                  text: "දස දහසස්ථානය 3, දහසස්ථානය 5, සියයස්ථානය 1, දහයස්ථානය 4 හා එකස්ථානය 7 ලෙස වන සංඛ්‍යාව කුමක් ද?",
                },
                {
                  letter: "b",
                  text: "එකස්ථානය 6, දහයස්ථානය 0, සියයස්ථානය 4, දහසස්ථානය 2 හා දස දහසස්ථානය 8 ලෙස වන සංඛ්‍යාව කුමක් ද?",
                },
                {
                  letter: "c",
                  text: "දස දහසස්ථානය 4, දහසස්ථානය 0, සියයස්ථානය 1, දහයස්ථානය ඕනෑ ම ඉලක්කමක් දෙකක් ලෙස වන සංඛ්‍යාවක් ලියන්න.",
                },
              ],
            },
          ],
        },
      },
    ],
    teachingNote:
      "Word problems: build a number from stated place values, given out of order. Part (c) is open-ended (any two digits at the tens place all satisfy it) — treat multiple correct answers as valid.",
    // A new, distinct skill from placeValueBreakdown (step 3/11): that's
    // "given a number, find a digit's place value" (analysis); this is the
    // inverse — "given place values, build the number" (synthesis).
    conceptTag: "placeValueConstruction",
    conceptDescription: "constructing a number when its digits' place values are given, possibly out of order",
  },
  {
    stepNumber: 10,
    components: [
      {
        type: "SequenceTable",
        props: {
          rows: [
            { before: 9999, number: 10000, after: 10001 },
            { before: null, number: 40000, after: null },
            { before: null, number: null, after: 70000 },
            { before: null, number: 59600, after: null },
            { before: 85099, number: null, after: null },
            { before: null, number: null, after: 100000 },
          ],
        },
      },
    ],
    teachingNote:
      "Before/number/after sequence practice — given any one of the three columns, the child fills in the other two (before = number - 1, after = number + 1). First row is the fully worked example.",
    conceptTag: "numberSequence",
    conceptDescription: "finding the number immediately before and after a given number",
  },
  {
    stepNumber: 11,
    components: [
      {
        type: "PlaceValueTable",
        props: {
          variant: "breakdown",
          rows: [
            { number: 38237, digit: 3, place: "දස දහසස්ථානය", placeValue: 10000, valueRepresented: 30000 },
            { number: 24150, digit: 5, place: null, placeValue: null, valueRepresented: null },
            { number: 40856, digit: 0, place: null, placeValue: null, valueRepresented: null },
            { number: 67400, digit: 4, place: null, placeValue: null, valueRepresented: null },
            { number: 79008, digit: null, place: "සියයස්ථානය", placeValue: null, valueRepresented: null },
            { number: 97541, digit: null, place: null, placeValue: null, valueRepresented: 7000 },
          ],
        },
      },
    ],
    teachingNote:
      "Same place-value breakdown drill as step 3, now with 5-digit numbers (introduces දස දහසස්ථානය — ten-thousands place).",
    // Same tag as step 3 — same skill, extended to 5 digits: a reminder
    // (mention the new ten-thousands place), not a full re-teach.
    conceptTag: "placeValueBreakdown",
    conceptDescription: "finding a digit's place name, its place-value, and the value it represents in a number",
  },
  {
    stepNumber: 12,
    components: [
      {
        type: "ExampleBox",
        props: { variant: "pink", label: "උදාහරණය", content: ["99 999 = 90 000 + 9 000 + 900 + 90 + 9"] },
      },
      {
        type: "ExpansionExercise",
        props: {
          rows: [
            { prompt: 19435, parts: [null, null, null, null, null] },
            { prompt: 38249, parts: [null, null, null, null, null] },
            { prompt: 56080, parts: [null, null, null, null, null] },
            { prompt: 69100, parts: [null, null, null, null, null] },
            { prompt: 81577, parts: [null, null, null, null, null] },
          ],
        },
      },
    ],
    teachingNote:
      "Same expansion drill as step 5, now with 5-digit numbers (ten-thousands + thousands + hundreds + tens + ones) — all five rows are fully open practice, nothing pre-filled.",
    // Same tag as step 5 — same skill, extended to 5 digits.
    conceptTag: "numberExpansion",
    conceptDescription: "expanding a whole number into the sum of its place-value parts",
  },
];
