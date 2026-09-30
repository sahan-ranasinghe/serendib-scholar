/**
 * LESSON DESIGN EXTRACTION — three sources in, one design file out.
 *
 *   A. the teacher's guide  → WHAT to teach: outcomes, activity steps,
 *      official examples, assessment, physical→digital mapping
 *   B. the textbook         → WHAT the child sees: theory boxes, examples,
 *      exercises, in page order
 *   C. the recorded lesson  → HOW it is taught: technique, register,
 *      question rhythm, pacing — DESCRIBED, never quoted
 *
 * Output: docs/design/maths-5-1.json (see ConceptDesign in
 * src/lib/lessonDesign.ts), consumed by scripts/author-script.ts.
 *
 * Guarantees enforced here, mechanically:
 *   - DENYLIST: every number that appears in C but in neither A nor B is
 *     the recorded teacher's own invention and is listed as unusable.
 *   - NO QUOTING: no sentence of 6+ words from C appears anywhere in the
 *     design file (the model is asked to describe technique, and this
 *     assertion is what makes that a fact rather than a hope).
 *   - officialExamples ⊆ numbers(A ∪ B).
 *
 *   npm run extract:design
 */
import { GoogleGenAI } from "@google/genai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { LESSON_1_NUMBERS_STEPS } from "../src/data/lessons/lesson1-numbers";
import { sinhalaNumberName } from "../src/lib/sinhalaNumber";
import {
  CONCEPT_ACTIVITY,
  DESIGN_CONCEPTS,
  TEXTBOOK_STEP_CONCEPT,
  type ConceptDesign,
  type DesignConceptTag,
  type LessonDesign,
} from "../src/lib/lessonDesign";
import { withRetry } from "./lib/geminiRetry";

const MODEL = process.env.GEMINI_DESIGN_MODEL ?? "gemini-3.1-pro-preview";

/** Running token tally, reported at the end (and on a mid-run failure). */
const usage = { input: 0, output: 0, thinking: 0, calls: 0 };
function tallyUsage(response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }) {
  usage.calls += 1;
  usage.input += response.usageMetadata?.promptTokenCount ?? 0;
  usage.output += response.usageMetadata?.candidatesTokenCount ?? 0;
  usage.thinking += response.usageMetadata?.thoughtsTokenCount ?? 0;
}
function printUsage(label: string) {
  console.log(
    `[tokens] ${label}: ${usage.calls} calls — in ${usage.input.toLocaleString()}, ` +
      `out ${usage.output.toLocaleString()}, thinking ${usage.thinking.toLocaleString()}`,
  );
}
const GUIDE_PATH = path.join(process.cwd(), "..", "docs", "design", "maths-5-1-teacher-guide.md");
const TRANSCRIPT_PATH = path.join(process.cwd(), "src/data/lessons/lesson1-teaching-plan-full.json");
const OUT_PATH = path.join(process.cwd(), "..", "docs", "design", "maths-5-1.json");
/** Partial progress, saved after every model call — a 429 mid-run must not burn the finished concepts. */
const CHECKPOINT_PATH = path.join(process.cwd(), "..", "docs", "design", ".maths-5-1.checkpoint.json");

interface TranscriptSegment {
  segmentStart: string;
  segmentEnd: string;
  fullTranscript: string;
  boardContent?: string;
  teachingNotes?: unknown;
}

// --- number harvesting ----------------------------------------------------

/** Digit runs, including the guide/textbook "26 147" grouping style. */
function numbersInText(text: string): Set<number> {
  const found = new Set<number>();
  for (const match of text.matchAll(/\d{1,3}(?:[  ]\d{3})+|\d+/gu)) {
    const value = Number(match[0].replace(/[  ]/gu, ""));
    if (Number.isFinite(value) && value <= 10_000_000) found.add(value);
  }
  return found;
}

function normaliseSinhala(text: string): string {
  return text.replace(/ල/gu, "ළ").replace(/[  ]/gu, " ").replace(/\s+/gu, " ");
}

function collectAllowedNumbers(guide: string, candidates: Iterable<number>): Set<number> {
  const allowed = numbersInText(guide);
  // The textbook: every number in every component's props counts…
  const textbookJson = JSON.stringify(LESSON_1_NUMBERS_STEPS);
  for (const value of numbersInText(textbookJson)) {
    allowed.add(value);
    // The before/after exercise's ANSWERS are official content too: the
    // child computes n−1 and n+1 of the printed numbers (step 10).
    allowed.add(value - 1);
    allowed.add(value + 1);
  }
  // …and so does every number the textbook shows only as a NAME (the
  // answer cells of the name↔numeral exercises: "දෙදහස් හාරසිය තිහ" IS
  // 2430, an official number even though the digits never appear).
  const searchable = normaliseSinhala(`${textbookJson}\n${guide}`);
  for (const value of candidates) {
    if (allowed.has(value) || value < 0 || value > 100_000 || !Number.isInteger(value)) continue;
    if (searchable.includes(normaliseSinhala(sinhalaNumberName(value)))) allowed.add(value);
  }
  return allowed;
}

function collectTranscriptNumbers(segments: TranscriptSegment[]): Set<number> {
  const seen = new Set<number>();
  for (const segment of segments) {
    for (const value of numbersInText(
      `${segment.fullTranscript}\n${segment.boardContent ?? ""}\n${JSON.stringify(segment.teachingNotes ?? "")}`,
    )) {
      seen.add(value);
    }
  }
  return seen;
}

// --- the no-quoting assertion --------------------------------------------

function transcriptSentences(segments: TranscriptSegment[]): string[] {
  return segments
    .flatMap((segment) => segment.fullTranscript.split(/(?<=[.!?…؟])\s+|\n/u))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/u).length >= 6);
}

function assertNoTranscriptSentences(designJson: string, sentences: string[]): void {
  const offenders = sentences.filter((sentence) => designJson.includes(sentence));
  if (offenders.length > 0) {
    throw new Error(
      `The design file quotes ${offenders.length} transcript sentence(s) — it must describe, not quote. First: "${offenders[0].slice(0, 90)}"`,
    );
  }
}

// --- model stages ---------------------------------------------------------

const SEGMENT_MAP_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "string" },
          concept: { type: "string", description: "One of the concept tags, or 'opening' or 'other'." },
        },
        required: ["start", "concept"],
      },
    },
  },
  required: ["segments"],
} as const;

async function mapSegmentsToConcepts(
  ai: GoogleGenAI,
  segments: TranscriptSegment[],
): Promise<Map<string, string>> {
  const catalogue = segments
    .map(
      (segment) =>
        `${segment.segmentStart}: ${segment.fullTranscript.slice(0, 260).replace(/\n/gu, " ")} || board: ${String(segment.boardContent ?? "").slice(0, 120).replace(/\n/gu, " ")}`,
    )
    .join("\n");
  const prompt = [
    "A recorded Grade 5 maths lesson (Sinhala) is split into 3-minute segments. Assign each segment to the",
    "concept it is mainly teaching. The concepts, in lesson order:",
    "  readWrite4Digit    — reading/writing/naming numbers up to 9 999; forming numbers from digit cards",
    "  placeValue4Digit   — place value in 4-digit numbers; the abacus; digit/place/place-value/value tables",
    "  expandedForm4Digit — writing 4-digit numbers as thousands+hundreds+tens+ones",
    "  beyond9999         — 9 999 + 1 = 10 000; the ten-thousands sequence to 100 000; before/after",
    "  digitGroupingRule  — writing big numbers with a space every three digits",
    "  tenThousandsPlace  — the ten-thousands PLACE; reading/writing/naming 5-digit numbers",
    "  placeValueTable5Digit — 5-digit place-value tables; building numbers from stated places",
    "  expandedForm5Digit — expanding 5-digit numbers",
    "Use 'opening' for greetings/framing and 'other' for anything else. Segments, one per line:",
    "",
    catalogue,
  ].join("\n");
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", responseJsonSchema: SEGMENT_MAP_SCHEMA, maxOutputTokens: 65536 },
    }),
  );
  tallyUsage(response);
  if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    throw new Error("segment mapping truncated (MAX_TOKENS) — raise maxOutputTokens");
  }
  const parsed = JSON.parse((response.text ?? "").trim()) as { segments: Array<{ start: string; concept: string }> };
  return new Map(parsed.segments.map((entry) => [entry.start, entry.concept]));
}

const CONCEPT_SCHEMA = {
  type: "object",
  properties: {
    objective: { type: "string" },
    guideSteps: { type: "array", items: { type: "string" } },
    officialExamples: { type: "array", items: { type: "string" } },
    techniqueSequence: { type: "array", items: { type: "string" } },
    sinhalaHandling: { type: "array", items: { type: "string" } },
    questionPatterns: { type: "array", items: { type: "string" } },
    misconceptionStops: { type: "array", items: { type: "string" } },
    analogySlot: { type: "string" },
    digitalActivities: { type: "array", items: { type: "string" } },
    assessment: { type: "string" },
  },
  required: [
    "objective",
    "guideSteps",
    "officialExamples",
    "techniqueSequence",
    "sinhalaHandling",
    "questionPatterns",
    "misconceptionStops",
    "analogySlot",
    "digitalActivities",
    "assessment",
  ],
} as const;

async function extractConcept(
  ai: GoogleGenAI,
  guide: string,
  conceptTag: DesignConceptTag,
  conceptSegments: TranscriptSegment[],
  quotedBefore: string[] = [],
): Promise<Omit<ConceptDesign, "conceptTag" | "activity" | "vocabularyIntroduced" | "textbookContent" | "timeWeightMinutes">> {
  const transcript = conceptSegments
    .map((segment) => `[${segment.segmentStart}] ${segment.fullTranscript}`)
    .join("\n\n")
    .slice(0, 120_000);
  const prompt = [
    "You are extracting a LESSON DESIGN entry for one concept of a Grade 5 Sinhala maths lesson, from two",
    "sources with strictly different roles:",
    "",
    "SOURCE A — the official teacher's guide (below). Use it for: objective (the ඉගෙනුම් ඵල this concept",
    "serves), guideSteps (the පියවර of the matching activity, as faithful short renderings of the guide's own",
    "instructions — official text, fine to keep close), officialExamples (every worked example number/digit-set",
    "the guide gives for this activity), digitalActivities (its section 4 mapping for this activity's steps),",
    "and assessment.",
    "",
    "SOURCE C — the recorded teacher's transcript for the SAME material (below). Use it ONLY to DESCRIBE her",
    "craft, in English:",
    "  techniqueSequence — the ordered explanation moves she performs (e.g. 'sets beads one rod at a time,",
    "    counting each aloud, then names the digit, then the place, then the value'), as reusable directions.",
    "  sinhalaHandling — how she says numbers and places aloud: spoken vs written forms, how she chunks a big",
    "    number, what she repeats.",
    "  questionPatterns — the KINDS of questions and where in the sequence they land; classify rhetorical",
    "    (no answer expected) vs soft check-in (any murmur fine) vs real ask (answer required).",
    "  misconceptionStops — where children stumble here and what she does about it (combine with the guide's",
    "    own flagged points).",
    "  analogySlot — the ROLE an everyday example plays at this point (motivation? concretising? none?),",
    "    WITHOUT naming her example.",
    "NEVER quote her sentences. NEVER include her invented example numbers. Everything from C must be",
    "description in your own words — a director's notes, not a script.",
    "",
    `THE CONCEPT: ${conceptTag} (guide activity ${CONCEPT_ACTIVITY[conceptTag]})`,
    conceptTag === "digitGroupingRule"
      ? "Note: this concept is the guide's explicit grouping-in-threes teaching point inside activity 3 — a short, rule-focused moment."
      : "",
    "",
    "=== SOURCE A: the teacher's guide ===",
    guide,
    "",
    "=== SOURCE C: her transcript for this material ===",
    transcript || "(no segments mapped — rely on the guide alone and leave C-fields as best-practice descriptions)",
    ...(quotedBefore.length > 0
      ? [
          "",
          "YOUR PREVIOUS ATTEMPT QUOTED HER. These sentences appeared verbatim and are FORBIDDEN — describe the",
          "move they perform instead of reproducing them:",
          ...quotedBefore.map((sentence) => `- ${sentence}`),
        ]
      : []),
  ].join("\n");

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", responseJsonSchema: CONCEPT_SCHEMA, maxOutputTokens: 65536 },
    }),
  );
  tallyUsage(response);
  return JSON.parse((response.text ?? "").trim());
}

// --- textbook content, deterministic --------------------------------------

async function textbookContentFor(conceptTag: DesignConceptTag): Promise<ConceptDesign["textbookContent"]> {
  const steps = Object.entries(TEXTBOOK_STEP_CONCEPT)
    .filter(([, tag]) => tag === conceptTag)
    .map(([step]) => Number(step))
    .sort((a, b) => a - b);
  if (steps.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("content_bank")
    .select("id, source")
    .eq("subject", "maths")
    .eq("grade", 5)
    .eq("lesson", 1)
    .like("source", "textbook%");
  const rows = data ?? [];

  // Locate each step's printed page by searching the syllabus chunks for a
  // number distinctive to that step.
  const stepNumbers: Record<number, string> = {
    1: "3058", 2: "6528", 3: "2348", 4: "2311", 5: "4031", 6: "9999",
    7: "59 999", 8: "72 932", 9: "27 394", 10: "59600", 11: "38237", 12: "19435",
  };

  const content: ConceptDesign["textbookContent"] = [];
  for (const step of steps) {
    const ids = rows
      .filter((row) => new RegExp(`:step-${step}(?::|$)`).test(row.source))
      .map((row) => row.id);
    const probe = stepNumbers[step];
    let printedPages: number[] = [];
    if (probe) {
      const { data: chunks } = await supabaseAdmin
        .from("syllabus_chunks")
        .select("printed_page_number")
        .ilike("source_reference", "%maths%")
        .ilike("content", `%${probe}%`)
        .not("printed_page_number", "is", null)
        .lte("printed_page_number", 8);
      printedPages = [...new Set((chunks ?? []).map((chunk) => chunk.printed_page_number as number))].sort();
    }
    const stepData = LESSON_1_NUMBERS_STEPS.find((s) => s.stepNumber === step);
    content.push({
      step,
      contentBankIds: ids,
      printedPages,
      summary: stepData?.teachingNote ?? "",
    });
  }
  return content;
}

// --- main -----------------------------------------------------------------

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const ai = new GoogleGenAI({ apiKey });

  const guide = await readFile(GUIDE_PATH, "utf8");
  const plan = JSON.parse(await readFile(TRANSCRIPT_PATH, "utf8")) as { segments: TranscriptSegment[] };
  const segments = plan.segments;

  // Denylist: C's numbers minus (A ∪ B)'s — where B's numbers include the
  // values it writes as Sinhala names, not just digits.
  const transcriptNumbers = collectTranscriptNumbers(segments);
  const allowed = collectAllowedNumbers(guide, transcriptNumbers);
  const denylist = [...transcriptNumbers].filter((n) => !allowed.has(n)).sort((a, b) => a - b);
  console.log(`Allowed numbers (A ∪ B): ${allowed.size}. Transcript numbers: denylisting ${denylist.length}.`);

  interface Checkpoint {
    segmentMap?: Array<[string, string]>;
    concepts?: ConceptDesign[];
  }
  let checkpoint: Checkpoint = {};
  try {
    checkpoint = JSON.parse(await readFile(CHECKPOINT_PATH, "utf8")) as Checkpoint;
    console.log(`Resuming from checkpoint (${checkpoint.concepts?.length ?? 0} concept(s) already extracted).`);
  } catch {
    checkpoint = {};
  }
  const saveCheckpoint = async () =>
    writeFile(CHECKPOINT_PATH, JSON.stringify(checkpoint), "utf8");

  let segmentMap: Map<string, string>;
  if (checkpoint.segmentMap) {
    segmentMap = new Map(checkpoint.segmentMap);
  } else {
    console.log(`Mapping ${segments.length} segments to concepts with ${MODEL}…`);
    segmentMap = await mapSegmentsToConcepts(ai, segments);
    checkpoint.segmentMap = [...segmentMap.entries()];
    await saveCheckpoint();
  }
  const minutes: Record<string, number> = {};
  for (const concept of segmentMap.values()) minutes[concept] = (minutes[concept] ?? 0) + 3;
  console.log("Her minutes per concept:", JSON.stringify(minutes));

  const concepts: ConceptDesign[] = checkpoint.concepts ?? [];
  // The design file is the source of each concept's vocabulary, description and never-say terms (the app derives
  // VOCABULARY_INTRODUCED_BY from it): a re-extraction keeps what a person wrote there rather than overwriting it.
  const previous = new Map<string, ConceptDesign>();
  try {
    for (const concept of (JSON.parse(await readFile(OUT_PATH, "utf8")) as LessonDesign).concepts) previous.set(concept.conceptTag, concept);
  } catch {
    // no design file yet: the extraction starts it
  }
  for (const conceptTag of DESIGN_CONCEPTS) {
    if (concepts.some((concept) => concept.conceptTag === conceptTag)) continue; // checkpointed
    const own = segments.filter((segment) => segmentMap.get(segment.segmentStart) === conceptTag);
    console.log(`  extracting ${conceptTag} (${own.length} segments)…`);
    let extracted = await extractConcept(ai, guide, conceptTag, own);
    // The no-quoting rule, enforced per concept with one fed-back retry.
    const sentences = transcriptSentences(segments);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const quoted = sentences.filter((sentence) => JSON.stringify(extracted).includes(sentence));
      if (quoted.length === 0) break;
      if (attempt === 1) throw new Error(`${conceptTag} still quotes the transcript after a retry: "${quoted[0].slice(0, 80)}"`);
      console.warn(`    ${conceptTag} quoted ${quoted.length} transcript sentence(s) — retrying with them forbidden.`);
      extracted = await extractConcept(ai, guide, conceptTag, own, quoted);
    }
    // officialExamples must never smuggle in a transcript-only number.
    const cleanedExamples = extracted.officialExamples.filter((example) => {
      const nums = [...numbersInText(example)];
      const ok = nums.every((n) => allowed.has(n));
      if (!ok) console.warn(`    dropped non-official example "${example}" from ${conceptTag}`);
      return ok;
    });
    concepts.push({
      conceptTag,
      activity: CONCEPT_ACTIVITY[conceptTag],
      vocabularyIntroduced: previous.get(conceptTag)?.vocabularyIntroduced ?? [],
      ...(previous.get(conceptTag)?.description ? { description: previous.get(conceptTag)!.description } : {}),
      ...(previous.get(conceptTag)?.vocabularyNotSpoken ? { vocabularyNotSpoken: previous.get(conceptTag)!.vocabularyNotSpoken } : {}),
      textbookContent: await textbookContentFor(conceptTag),
      timeWeightMinutes: minutes[conceptTag] ?? 0,
      ...extracted,
      officialExamples: cleanedExamples,
    });
    checkpoint.concepts = concepts;
    await saveCheckpoint();
  }

  const design: LessonDesign = {
    subject: "maths",
    grade: 5,
    lesson: 1,
    extractedAt: new Date().toISOString(),
    model: MODEL,
    denylistNumbers: denylist,
    concepts,
  };

  const designJson = JSON.stringify(design, null, 2);
  assertNoTranscriptSentences(designJson, transcriptSentences(segments));
  console.log("PASS: no transcript sentence of 6+ words appears in the design file.");

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${designJson}\n`, "utf8");
  await writeFile(CHECKPOINT_PATH, "{}", "utf8"); // done — clear the checkpoint
  console.log(`\nWrote ${path.relative(process.cwd(), OUT_PATH)} (${concepts.length} concepts).`);
  printUsage("extraction total");
}

main().catch((error) => {
  // A depleted-credits failure mid-run: the checkpoint holds what finished —
  // report progress and spend rather than retrying into a wall.
  if (/prepayment credits|spending cap/iu.test(String(error))) {
    console.error("STOPPED: API credits exhausted mid-run. Completed work is checkpointed.");
  }
  printUsage("at failure");
  console.error(error);
  process.exit(1);
});
