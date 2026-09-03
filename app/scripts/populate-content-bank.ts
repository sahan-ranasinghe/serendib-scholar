/**
 * Populates the content_bank table from sources we've ALREADY extracted —
 * no API calls, no cost. Two sources:
 *
 * 1. src/data/lessons/lesson1-numbers.ts — the 12 hand-transcribed textbook
 *    steps. Each component instance within a step becomes one bank row (a
 *    step that pairs an ExampleBox with an exercise yields two), tagged to
 *    the textbook step it came from.
 *
 * 2. src/data/lessons/lesson1-teaching-plan-full.json — every
 *    `problemsWorked` entry across the 42 video segments, including her
 *    worked solution and steps, and including problems that never appear in
 *    the textbook. Tagged with the video timestamp it was taught at.
 *
 * Run with:  npm run populate:content-bank
 * (from the app/ directory. That npm script loads .env.local for the
 * Supabase service-role key — plain `npx tsx` does not.)
 *
 * Prerequisite: the content_bank table must exist. It's in
 * supabase/schema.sql; this script only reads/writes rows over the REST
 * API, it can't run DDL — run that table's SQL in the Supabase editor first.
 *
 * Everything lands with verified=false. find_teaching_content only ever
 * returns verified rows, so nothing here reaches a child until a human has
 * reviewed it — which is the entire point of the column.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import {
  LESSON_1_NUMBERS_STEPS,
  type LessonComponent,
  type LessonStep,
} from "../src/data/lessons/lesson1-numbers";

const SUBJECT = "maths";
const GRADE = 5;
const LESSON = 1;
const TEXTBOOK_SOURCE = "textbook:maths_5_sinhala";
const VIDEO_SOURCE = "dp-video";

const TRANSCRIPT_PATH = path.resolve(__dirname, "../src/data/lessons/lesson1-teaching-plan-full.json");

type Difficulty = "intro" | "standard" | "challenge";

interface BankRow {
  subject: string;
  grade: number;
  lesson: number;
  concept_tag: string;
  difficulty: Difficulty;
  component_type: string;
  component_props: unknown;
  answer: unknown;
  /** Only on component_type 'explanation' rows — see buildExplanationRows. */
  explanation?: unknown;
  source: string;
  verified: boolean;
}

// --- Textbook answers ----------------------------------------------------
//
// The textbook gives questions, not answers — blanks are literally null in
// the source. Rather than leave every row answerless (which would make the
// bank far less useful to teach from), answers are DERIVED, but only where
// the derivation is deterministic arithmetic on the row's own verified
// numbers. Anything requiring generated Sinhala prose (a number *name*) or
// having many valid answers (a "write any number" task) is left null on
// purpose — inventing those is exactly what this bank exists to prevent.
// Each derived answer records how it was obtained, so a reviewer can see.

const PLACE_NAMES_ASCENDING = ["එකස්ථානය", "දහයස්ථානය", "සියයස්ථානය", "දහසස්ථානය", "දස දහසස්ථානය"];

/** Splits a number into its place-value parts, most significant first: 5090 -> [5000, 0, 90, 0]. */
function placeValueParts(value: number): number[] {
  const digits = String(value).split("");
  return digits.map((digit, index) => Number(digit) * 10 ** (digits.length - 1 - index));
}

function deriveAnswer(component: LessonComponent): unknown {
  switch (component.type) {
    case "ExpansionExercise": {
      const rows = component.props.rows.map((row) => {
        if (typeof row.prompt === "number") {
          return { prompt: row.prompt, parts: placeValueParts(row.prompt) };
        }
        // Step 7's rows are expressions like "69 999 + 1". The resulting
        // number is deterministic; its Sinhala NAME is not, so only the
        // number is recorded.
        const match = /^([\d\s]+)\+\s*1$/.exec(row.prompt);
        if (!match) return { prompt: row.prompt, parts: null };
        return { prompt: row.prompt, result: Number(match[1].replace(/\s/g, "")) + 1, numberName: null };
      });
      return { rows, derivedBy: "computed-place-value-decomposition" };
    }

    case "SequenceTable": {
      const rows = component.props.rows.map((row) => {
        // Any one of the three columns pins the other two.
        const anchor = row.number ?? (row.before !== null ? row.before + 1 : row.after !== null ? row.after - 1 : null);
        if (anchor === null) return { before: null, number: null, after: null };
        return { before: anchor - 1, number: anchor, after: anchor + 1 };
      });
      return { rows, derivedBy: "computed-predecessor-successor" };
    }

    case "PlaceValueTable": {
      if (component.props.variant === "numberName") {
        // Converting a numeral to its Sinhala name is language generation,
        // not arithmetic — deliberately not derived.
        return null;
      }
      const rows = component.props.rows.map((row) => {
        if (row.number === null || row.digit === null) return null;
        const digits = String(row.number).split("").map(Number);
        const positions = digits.flatMap((d, i) => (d === row.digit ? [digits.length - 1 - i] : []));
        // A digit appearing twice (e.g. 2 in 24150... ) makes "which place"
        // ambiguous from the data alone — skip rather than guess.
        if (positions.length !== 1) return null;
        const power = positions[0];
        return {
          number: row.number,
          digit: row.digit,
          place: PLACE_NAMES_ASCENDING[power] ?? null,
          placeValue: 10 ** power,
          valueRepresented: row.digit * 10 ** power,
        };
      });
      return rows.some(Boolean) ? { rows, derivedBy: "computed-place-of-digit" } : null;
    }

    case "AbacusDiagram":
      // The source states both, so this is quoted rather than derived.
      return { numeral: component.props.numeral, label: component.props.label, derivedBy: "stated-in-source" };

    case "ExampleBox":
      // A worked example already contains its own answer in the content.
      return { content: component.props.content, derivedBy: "stated-in-source" };

    // DigitPickerPuzzle is open-ended (many valid four-digit numbers), and
    // NumberedQuestionList's answers simply aren't in the textbook data.
    default:
      return null;
  }
}

/**
 * Difficulty for a textbook row, from the lesson's own structure rather than
 * a judgement call: a worked example is an `intro`; the first exercise on a
 * concept is `standard`; a later step revisiting the same conceptTag is a
 * `challenge` — which matches the lesson's real shape, since the revisits
 * (steps 8, 11, 12) are the same skills on bigger numbers.
 */
function textbookDifficulty(component: LessonComponent, isFirstStepForConcept: boolean): Difficulty {
  if (component.type === "ExampleBox") return "intro";
  return isFirstStepForConcept ? "standard" : "challenge";
}

function buildTextbookRows(steps: LessonStep[]): BankRow[] {
  const rows: BankRow[] = [];
  const conceptSeen = new Set<string>();

  for (const step of steps) {
    const isFirstStepForConcept = !conceptSeen.has(step.conceptTag);
    conceptSeen.add(step.conceptTag);

    for (const [index, component] of step.components.entries()) {
      rows.push({
        subject: SUBJECT,
        grade: GRADE,
        lesson: LESSON,
        concept_tag: step.conceptTag,
        difficulty: textbookDifficulty(component, isFirstStepForConcept),
        component_type: component.type,
        component_props: component.props,
        answer: deriveAnswer(component),
        source: `${TEXTBOOK_SOURCE}:step-${step.stepNumber}${step.components.length > 1 ? `:${index + 1}` : ""}`,
        verified: false,
      });
    }
  }
  return rows;
}

// --- Video-sourced rows --------------------------------------------------

/**
 * Maps a worked problem from the video to one of the lesson's concept tags
 * by matching characteristic Sinhala terms. Deliberately keyword-based
 * rather than another model call (this step is meant to cost nothing), and
 * deliberately willing to return null: a problem it can't place confidently
 * is tagged `unclassified` for the reviewer to sort out, which is more
 * useful than a confidently wrong tag on material a child will be taught
 * from.
 *
 * Patterns are kept specific on purpose. An earlier draft matched bare
 * number-words like "දහස්", which classified more rows but would fire on any
 * problem that merely mentions a number — precision matters more than
 * coverage when the output is what a child gets taught.
 *
 * Order matters — the more specific patterns are tried first.
 * Measured coverage on the current transcript: see the run's own report,
 * which prints how many rows ended up 'unclassified'.
 */
const CONCEPT_PATTERNS: [string, RegExp][] = [
  ["abacusRepresentation", /ගණක රාමුව|ඇබකස/],
  ["numberExpansion", /විහිදව|විහිදු/],
  ["roundNumberRollover", /999|\+\s*1\s*=/],
  ["numberSequence", /පෙර සංඛ්|පසු සංඛ්|මීළඟ සංඛ්|ඊළඟ සංඛ්/],
  ["digitConstruction", /ඉලක්කම් ඇසුරෙන්|ඉලක්කම්.*සාදා|ඉලක්කම් භාවිත|ඉලක්කම්වලින්|සංඛ්‍යා සෑදීම/],
  ["placeValueConstruction", /ලෙස වන සංඛ්‍යාව/],
  [
    "placeValueBreakdown",
    /ස්ථානීය අගය|නිරූපිත අගය|පිහිටි ස්ථාන|ස්ථානය සොයන්|ස්ථානය සෙවීම|සංඛ්‍යා පෙත|නිරූපණය වන අගය|දක්වන අගය|ස්ථාන හඳුනා|අගය සෙවීම|අගය සොයන/,
  ],
  ["placeValueReading", /සංඛ්‍යා නාමය|නාමය ලිවීම|වචනයෙන් ලිය|සංඛ්‍යාංකයෙන් ලිය|නාමය/],
];

// Sinhala number words, used only for the structural rule below.
const SINHALA_NUMBER_WORD = /දහස්|සිය|විස්ස|විසි|තිස්|හතළිස්|පනස්|හැට|හැත්තෑ|අසූ|අනූ|දහ|නවය|දොළහ/;

function classifyConcept(problem: string): string {
  const matched = CONCEPT_PATTERNS.find(([, pattern]) => pattern.test(problem))?.[0];
  if (matched) return matched;

  // Several of her practice items are just a Sinhala number name on its own
  // ("විසි අට දහස් පන්සියය") — the task being to write it in digits. That's
  // name-to-numeral reading, but there's no instruction word to match on, so
  // it's identified structurally instead: number words and no digits at all.
  if (!/\d/.test(problem) && SINHALA_NUMBER_WORD.test(problem)) return "placeValueReading";

  return "unclassified";
}

/**
 * Difficulty for a video-sourced problem. The teacher demonstrates before
 * she sets practice, so how much scaffolding she showed is the honest
 * signal available here: a problem she walked through in many steps was
 * being taught from scratch; a terse one was quick practice on something
 * already established.
 */
function videoDifficulty(stepCount: number): Difficulty {
  if (stepCount >= 5) return "intro";
  if (stepCount >= 2) return "standard";
  return "challenge";
}

interface TranscriptFile {
  segments: {
    segmentStart: string;
    teachingNotes: {
      problemsWorked: { problem: string; solution: string; stepsShown: string[] }[];
    };
  }[];
}

function buildVideoRows(file: TranscriptFile): BankRow[] {
  const rows: BankRow[] = [];

  for (const segment of file.segments) {
    for (const worked of segment.teachingNotes.problemsWorked) {
      if (!worked.problem?.trim()) continue;
      rows.push({
        subject: SUBJECT,
        grade: GRADE,
        lesson: LESSON,
        concept_tag: classifyConcept(worked.problem),
        difficulty: videoDifficulty(worked.stepsShown?.length ?? 0),
        // Rendered as a worked example on the board. The problem alone goes
        // in the props; the solution and steps live in `answer`, so the
        // tutor can pose it first and reveal the working afterwards rather
        // than showing a child the answer alongside the question.
        component_type: "ExampleBox",
        component_props: {
          variant: "green",
          label: "ප්‍රශ්නය",
          content: [worked.problem],
        },
        answer: {
          solution: worked.solution,
          stepsShown: worked.stepsShown ?? [],
          derivedBy: "stated-in-source",
        },
        source: `${VIDEO_SOURCE}:${segment.segmentStart}`,
        verified: false,
      });
    }
  }
  return rows;
}

// --- Explanation rows ----------------------------------------------------
//
// A practice problem tells you what she ASSIGNED; these rows capture how she
// TAUGHT it. They have to join our two extractions, because neither has
// everything:
//   - the 15-minute extraction (lesson1-teaching-plan.json) is the only one
//     with teachingSequence / explanationDetail / realWorldExamplesUsed;
//   - the 3-minute extraction (lesson1-teaching-plan-full.json) is the only
//     one with her verbatim Sinhala (fullTranscript).
// So rows are built per 3-minute segment (that's what carries the transcript)
// and the structural summary is pulled from whichever 15-minute concept
// covers that timestamp.

const OLD_PLAN_PATH = path.resolve(__dirname, "../src/data/lessons/lesson1-teaching-plan.json");

interface OldPlanConcept {
  conceptName: string;
  teachingSequence: string[];
  explanationDetail: string;
  realWorldExamplesUsed: string[];
}

interface OldPlanFile {
  segments: { segmentStart: string; concepts: OldPlanConcept[] }[];
}

/**
 * The 15-minute extraction named its concepts in English, so the Sinhala
 * keyword classifier above can't read them — these map those names onto the
 * same tags. Names often combine several concepts ("Place Value, Abacus
 * Representation, Expanded Form, and Number Names"), so this is only ever
 * used as a secondary signal to pick between concepts already known to cover
 * the right slice of video.
 */
const ENGLISH_CONCEPT_PATTERNS: [string, RegExp][] = [
  ["abacusRepresentation", /abacus/i],
  ["numberExpansion", /expanded form|expansion/i],
  ["numberSequence", /preceding|succeeding|predecessor|successor|before and after|sequence/i],
  ["roundNumberRollover", /adding 1|rollover/i],
  ["placeValueConstruction", /forming numbers from|from given place value|extracting digit place/i],
  ["placeValueReading", /number name|converting sinhala/i],
  ["placeValueBreakdown", /place value|represented value|digit value/i],
  ["digitConstruction", /forming|digit/i],
];

/**
 * Returns ALL tags a concept name covers, not just the first match. These
 * names routinely span several concepts at once ("Reading Abacus and
 * Writing Numbers in Expanded Form" is both abacusRepresentation and
 * numberExpansion), so stopping at the first hit would wrongly rule the
 * concept out for every other tag it genuinely teaches.
 */
function classifyConceptsFromEnglish(conceptName: string): string[] {
  return ENGLISH_CONCEPT_PATTERNS.filter(([, pattern]) => pattern.test(conceptName)).map(([tag]) => tag);
}

function toSeconds(timestamp: string): number {
  const [h, m, s] = timestamp.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

interface FullSegment {
  segmentStart: string;
  segmentEnd: string;
  fullTranscript: string;
  teachingNotes: {
    examplesUsed: string[];
    problemsWorked: { problem: string; solution: string; stepsShown: string[] }[];
  };
}

function buildExplanationRows(
  segments: FullSegment[],
  oldPlan: OldPlanFile,
): { rows: BankRow[]; withStructure: number } {
  // Index the 15-minute concepts by the window they belong to.
  const windows = oldPlan.segments.map((segment) => ({
    start: toSeconds(segment.segmentStart),
    end: toSeconds(segment.segmentStart) + 15 * 60,
    concepts: segment.concepts,
  }));

  const rows: BankRow[] = [];
  let withStructure = 0;

  for (const segment of segments) {
    if (!segment.fullTranscript?.trim()) continue;

    // Which concepts does this three minutes actually explain? Taken from
    // the problems she works in it — a segment covering two concepts yields
    // a row for each.
    const tags = [
      ...new Set(
        segment.teachingNotes.problemsWorked
          .map((worked) => classifyConcept(worked.problem))
          .filter((tag) => tag !== "unclassified"),
      ),
    ];
    if (tags.length === 0) continue; // e.g. the opening welcome — nothing being taught yet

    const start = toSeconds(segment.segmentStart);
    const window = windows.find((w) => start >= w.start && start < w.end);

    for (const tag of tags) {
      // Attach the structural summary only on a confident match: the
      // covering window's concept that classifies to this same tag, or its
      // only concept if there's just one. Otherwise leave those fields null
      // rather than bolt on another concept's teaching sequence — the
      // verbatim transcript is the part that must be right.
      const candidates = window?.concepts ?? [];
      const matched =
        candidates.find((concept) => classifyConceptsFromEnglish(concept.conceptName).includes(tag)) ??
        (candidates.length === 1 ? candidates[0] : undefined);
      if (matched) withStructure++;

      rows.push({
        subject: SUBJECT,
        grade: GRADE,
        lesson: LESSON,
        concept_tag: tag,
        // An explanation is what you show BEFORE practice — it's the MODE 1
        // demonstration material, so it's always an intro.
        difficulty: "intro",
        component_type: "explanation",
        component_props: {
          conceptName: matched?.conceptName ?? null,
          segmentStart: segment.segmentStart,
          segmentEnd: segment.segmentEnd,
        },
        answer: null,
        explanation: {
          teachingSequence: matched?.teachingSequence ?? null,
          explanationDetail: matched?.explanationDetail ?? null,
          realWorldExamplesUsed: matched?.realWorldExamplesUsed ?? segment.teachingNotes.examplesUsed ?? [],
          // Her own words, exactly as extracted — never summarised or
          // translated. This is the whole point of the row.
          transcriptExcerpt: segment.fullTranscript,
        },
        source: `${VIDEO_SOURCE}:${segment.segmentStart}`,
        verified: false,
      });
    }
  }

  return { rows, withStructure };
}

// --- Insertion -----------------------------------------------------------

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — see scripts/README.md.");
    process.exit(1);
  }
  const replace = process.argv.includes("--replace");

  const { count: existing, error: countError } = await supabaseAdmin
    .from("content_bank")
    .select("*", { count: "exact", head: true })
    .eq("subject", SUBJECT)
    .eq("grade", GRADE)
    .eq("lesson", LESSON);

  if (countError) {
    console.error(
      `Couldn't read content_bank: ${countError.message}\n` +
        `If the table doesn't exist yet, run its SQL from supabase/schema.sql in the Supabase editor first.`,
    );
    process.exit(1);
  }

  if ((existing ?? 0) > 0 && !replace) {
    console.error(
      `content_bank already has ${existing} row(s) for ${SUBJECT} grade ${GRADE} lesson ${LESSON}.\n` +
        `Re-running would duplicate them. Pass --replace to delete and repopulate — but note that\n` +
        `discards any verified=true flags a reviewer has already set on those rows.`,
    );
    process.exit(1);
  }

  const textbookRows = buildTextbookRows(LESSON_1_NUMBERS_STEPS);
  const transcript: TranscriptFile = JSON.parse(await fs.readFile(TRANSCRIPT_PATH, "utf8"));
  const videoRows = buildVideoRows(transcript);
  const oldPlan: OldPlanFile = JSON.parse(await fs.readFile(OLD_PLAN_PATH, "utf8"));
  const { rows: explanationRows, withStructure } = buildExplanationRows(
    transcript.segments as unknown as FullSegment[],
    oldPlan,
  );
  const allRows = [...textbookRows, ...videoRows, ...explanationRows];

  console.log(`Built ${allRows.length} row(s):`);
  console.log(`  textbook problems (${LESSON_1_NUMBERS_STEPS.length} steps): ${textbookRows.length}`);
  console.log(`  video problems (${transcript.segments.length} segments): ${videoRows.length}`);
  console.log(
    `  video explanations: ${explanationRows.length} ` +
      `(${withStructure} with a teachingSequence/explanationDetail matched from the 15-min extraction, ` +
      `${explanationRows.length - withStructure} transcript-only)`,
  );

  if (replace && (existing ?? 0) > 0) {
    console.log(`  --replace: deleting ${existing} existing row(s) first...`);
    const { error } = await supabaseAdmin
      .from("content_bank")
      .delete()
      .eq("subject", SUBJECT)
      .eq("grade", GRADE)
      .eq("lesson", LESSON);
    if (error) {
      console.error(`  Delete failed: ${error.message}`);
      process.exit(1);
    }
  }

  const { error: insertError } = await supabaseAdmin.from("content_bank").insert(allRows);
  if (insertError) {
    console.error(`Insert failed: ${insertError.message}`);
    process.exit(1);
  }

  // --- Report ---
  const byConcept = new Map<string, { problems: number; explanations: number }>();
  for (const row of allRows) {
    const entry = byConcept.get(row.concept_tag) ?? { problems: 0, explanations: 0 };
    if (row.component_type === "explanation") entry.explanations++;
    else entry.problems++;
    byConcept.set(row.concept_tag, entry);
  }

  const countBy = (rows: BankRow[], key: "difficulty") =>
    rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] ?? 0) + 1 }), {});

  const problemRows = [...textbookRows, ...videoRows];
  console.log(`\nInserted ${allRows.length} row(s), all verified=false.`);
  console.log(`\nBy type:`);
  console.log(`  problem:     ${problemRows.length}  (difficulty: ${JSON.stringify(countBy(problemRows, "difficulty"))})`);
  console.log(`  explanation: ${explanationRows.length}  (all intro — an explanation is MODE 1 material)`);
  console.log(`\nBy source:`);
  console.log(`  textbook: ${textbookRows.length}  (difficulty: ${JSON.stringify(countBy(textbookRows, "difficulty"))})`);
  console.log(`  video:    ${videoRows.length + explanationRows.length}  (${videoRows.length} problems, ${explanationRows.length} explanations)`);
  console.log(`\nBy concept_tag:`);
  for (const [tag, entry] of [...byConcept.entries()].sort(
    (a, b) => b[1].problems + b[1].explanations - (a[1].problems + a[1].explanations),
  )) {
    console.log(
      `  ${tag.padEnd(24)} problems ${String(entry.problems).padStart(3)}  explanations ${String(entry.explanations).padStart(2)}`,
    );
  }
  const withAnswers = problemRows.filter((row) => row.answer !== null).length;
  console.log(
    `\n${withAnswers}/${problemRows.length} problem row(s) have an answer; the rest need one supplied during review.`,
  );
  const unclassified = byConcept.get("unclassified");
  if (unclassified) {
    console.log(
      `${unclassified.problems + unclassified.explanations} row(s) are 'unclassified' — the keyword mapping couldn't ` +
        `place them confidently, so they need a concept_tag during review.`,
    );
  }
  console.log(`\nNothing is teachable yet: find_teaching_content only returns verified rows. After reviewing, run:`);
  console.log(`  update content_bank set verified = true where id in (...);`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
