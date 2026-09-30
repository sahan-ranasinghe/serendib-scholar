/**
 * The lesson design vocabulary — the fixed frame the design extraction,
 * the script author, and the distance guard all share.
 *
 * Three sources feed a lesson, each used for what it is good at:
 *   A. the official TEACHER'S GUIDE  — what to teach, in what order,
 *      with which worked examples (docs/design/maths-5-1-teacher-guide.md)
 *   B. the TEXTBOOK                  — everything the child sees on the
 *      board (lesson1-numbers.ts / content_bank / syllabus_chunks)
 *   C. the RECORDED LESSON           — technique and register ONLY; her
 *      sentences, invented examples and hook are never reused
 *
 * The concept list below follows the guide's four activities, in order.
 */

import DESIGN_DATA_JSON from "@/data/lessons/design/maths-5-1.json";

/** The guide-derived concepts, in teaching order. */
export const DESIGN_CONCEPTS = [
  "readWrite4Digit",
  "placeValue4Digit",
  "expandedForm4Digit",
  "beyond9999",
  "digitGroupingRule",
  "tenThousandsPlace",
  "placeValueTable5Digit",
  "expandedForm5Digit",
] as const;

export type DesignConceptTag = (typeof DESIGN_CONCEPTS)[number];

/** Which guide activity (1-4) each concept belongs to. */
export const CONCEPT_ACTIVITY: Record<DesignConceptTag, 1 | 2 | 3 | 4> = {
  readWrite4Digit: 1,
  placeValue4Digit: 2,
  expandedForm4Digit: 2,
  beyond9999: 3,
  digitGroupingRule: 3,
  tenThousandsPlace: 3,
  placeValueTable5Digit: 3,
  expandedForm5Digit: 4,
};

/**
 * The design file's concepts, as the app reads them: generated from docs/design/maths-5-1.json by
 * `npm run generate:design` (the design file is the one source; src/lib/lessonDesign.test.ts fails if the two drift).
 */
const DESIGN_DATA = DESIGN_DATA_JSON as { concepts: Array<{ conceptTag: DesignConceptTag; description: string; objective: string; vocabularyIntroduced: string[] }> };

/**
 * The guide's vocabulary terms, each pinned to the concept that INTRODUCES
 * it — each concept's `vocabularyIntroduced` in the design file. The author
 * asserts a term never appears in any earlier concept's speech —
 * introducing දස දහසස්ථානය while still on 4-digit numbers is exactly the
 * kind of drift a generator will do unchecked.
 *
 * සංඛ්‍යාංකය is deliberately ABSENT. It is a guide term, but both native
 * reviewers independently struck it from every beat that used it, without
 * being asked: said aloud to one child it is a bookish way of pointing at
 * ඉලක්කම්. The child still meets it — it is printed in the textbook — but
 * from the page, not from Zara. The design file lists it under
 * `vocabularyNotSpoken` instead, so the gate never expects speech that
 * should not exist.
 */
export const VOCABULARY_INTRODUCED_BY: Record<string, DesignConceptTag> = Object.fromEntries(
  DESIGN_DATA.concepts.flatMap((concept) => concept.vocabularyIntroduced.map((term) => [term, concept.conceptTag])),
);

/**
 * One English line per design concept — what it teaches, for the lesson's goal lines, the close card's preview and
 * the ✋ chat's context. From the design file's `description` (they used to be keyed by the pre-design concept tags,
 * so every design concept got none).
 */
export const CONCEPT_DESCRIPTIONS: Record<DesignConceptTag, string> = Object.fromEntries(
  DESIGN_DATA.concepts.map((concept) => [concept.conceptTag, concept.description]),
) as Record<DesignConceptTag, string>;

/**
 * Textbook step → design concept. The textbook is walked in page order
 * WITHIN each guide activity; this mapping is also what the content_bank
 * re-map applies (scripts/remap-concept-tags.ts).
 */
export const TEXTBOOK_STEP_CONCEPT: Record<number, DesignConceptTag> = {
  1: "readWrite4Digit", // digit picker: form 4-digit numbers
  2: "readWrite4Digit", // numeral ↔ name, 4-digit
  3: "placeValue4Digit", // breakdown table, 4-digit
  4: "placeValue4Digit", // abacus 2311
  5: "expandedForm4Digit", // expansion, 4-digit
  6: "beyond9999", // the සටහන box: 9999+1, ten-thousands sequence
  7: "beyond9999", // rollover practice 69 999 + 1 …
  8: "tenThousandsPlace", // 5-digit names ↔ numerals
  9: "placeValueTable5Digit", // build a number from stated places
  10: "beyond9999", // before/number/after across 10 000
  11: "placeValueTable5Digit", // breakdown table, 5-digit
  12: "expandedForm5Digit", // expansion, 5-digit
};

/** Old (video-derived) concept tags → new design concepts, for the re-map. */
export const OLD_TAG_CONCEPT: Record<string, DesignConceptTag | "lessonOpening"> = {
  lessonOpening: "lessonOpening",
  digitConstruction: "readWrite4Digit",
  placeValueReading: "readWrite4Digit",
  abacusRepresentation: "placeValue4Digit",
  placeValueBreakdown: "placeValue4Digit", // 5-digit rows are re-split by step, see the remap script
  numberExpansion: "expandedForm4Digit",
  roundNumberRollover: "beyond9999",
  placeValueConstruction: "placeValueTable5Digit",
  numberSequence: "beyond9999",
};

// --- the design file the extraction produces ------------------------------

export interface ConceptDesign {
  conceptTag: DesignConceptTag;
  activity: 1 | 2 | 3 | 4;
  /** From A: the ඉගෙනුම් ඵල this concept serves. */
  objective: string;
  /** Hand-written: one English line on what the concept teaches (the goal lines, the close card, the chat). */
  description?: string;
  /** From A, in the order A introduces them — THE source of VOCABULARY_INTRODUCED_BY. */
  vocabularyIntroduced: string[];
  /** Hand-written: guide terms Zara must never say, with why (authoredLines.test enforces it on the reteach lines). */
  vocabularyNotSpoken?: { terms: string[]; why: string };
  /** A's පියවර for this activity — official text, verbatim-safe. */
  guideSteps: string[];
  /** From B: pages, theory boxes, examples, exercise ids, in page order. */
  textbookContent: Array<{
    step: number;
    contentBankIds: string[];
    printedPages: number[];
    summary: string;
  }>;
  /** From A and B — allowed, expected. */
  officialExamples: string[];
  /** From C: the ordered explanation moves she performs — described, never quoted. */
  techniqueSequence: string[];
  /** From C: how numbers and places are said aloud. */
  sinhalaHandling: string[];
  /** From C: kinds of questions and where they land; rhetorical vs soft vs real. */
  questionPatterns: string[];
  /** From A and C: the misconceptions to stop, and how. */
  misconceptionStops: string[];
  /** From C: the ROLE an everyday example plays here (not which example). */
  analogySlot: string;
  /** From C: her minutes on this activity's material. */
  timeWeightMinutes: number;
  /** From A section 4: how each physical step becomes a board action. */
  digitalActivities: string[];
  /** From A. */
  assessment: string;
}

export interface LessonDesign {
  subject: string;
  grade: number;
  lesson: number;
  extractedAt: string;
  model: string;
  /** Numbers that appear in C but in neither A nor B — never usable. */
  denylistNumbers: number[];
  concepts: ConceptDesign[];
}
