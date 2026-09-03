/**
 * Teaching transcript -> speaking-style guide.
 *
 * scripts/extract-lesson-plan.ts gives us a complete verbatim Sinhala
 * transcript of a real Grade 5 teacher (DP Education, used with permission).
 * This script distils *how she speaks* out of it — her address forms,
 * encouragement, the way she checks understanding, her pacing — into
 * src/data/lessons/teaching-style-guide.json, which prompt.ts loads to give
 * the tutor its voice.
 *
 * Run with:  npm run extract:teaching-style
 * (from the app/ directory. That npm script loads .env.local for
 * GEMINI_API_KEY — plain `npx tsx` does not, see scripts/README.md.)
 *
 * Two things this deliberately is NOT:
 *
 * - It is not a content extract. Only speech-bearing fields are sent
 *   (transcripts, phrases, questions, tone/pacing notes); boardContent and
 *   problemsWorked are excluded at the corpus level, not merely discouraged
 *   in the prompt, so lesson content can't leak into a style guide.
 *
 * - It is not a script to recite. The output is a register to inhabit. The
 *   source is also a teacher addressing a whole classroom while our tutor
 *   speaks to one child, so the extraction converts plural/classroom address
 *   into natural singular one-to-one Sinhala and drops anything about
 *   managing a room (see SINGULAR_CONVERSION_INSTRUCTIONS).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { withRetry } from "./lib/geminiRetry";

const MODEL = "gemini-3.6-flash";

// The whole style-relevant corpus for a 2-hour lesson is ~80k characters,
// which fits in one request — and one request is *better* than several here,
// because judging which phrasings are genuinely characteristic depends on
// seeing how often they recur across the whole lesson. Batching only kicks in
// for inputs too large for that, and then a consolidation pass merges the
// per-batch candidates back into one guide.
const MAX_CHARS_PER_BATCH = Number(process.env.STYLE_MAX_CHARS_PER_BATCH ?? 150_000);

const MAX_OUTPUT_TOKENS = 16384;

// Rough estimate for the pre-run log — Sinhala runs a bit under one token per
// character. Pricing is Gemini 3.6 Flash standard-tier, matching the other
// scripts' constants.
const INPUT_TOKENS_PER_CHAR_ESTIMATE = 0.8;
const OUTPUT_TOKENS_PER_CALL_ESTIMATE = 3000;
const INPUT_COST_PER_MILLION_USD = 0.75;
const OUTPUT_COST_PER_MILLION_USD = 3.75;

const TRANSCRIPT_PATH = process.env.TEACHING_TRANSCRIPT
  ? path.resolve(process.env.TEACHING_TRANSCRIPT)
  : path.resolve(__dirname, "../src/data/lessons/lesson1-teaching-plan-full.json");
const OUTPUT_PATH = process.env.TEACHING_STYLE_OUT
  ? path.resolve(process.env.TEACHING_STYLE_OUT)
  : path.resolve(__dirname, "../src/data/lessons/teaching-style-guide.json");

/** Only the speech-bearing parts of a segment — see the module doc on why content fields are left out. */
interface TranscriptSegment {
  segmentStart: string;
  fullTranscript: string;
  teachingNotes: {
    toneAndManner: string;
    pacingNotes: string;
    phrasesUsed: string[];
    questionsAsked: string[];
  };
}

interface TranscriptFile {
  lesson?: { subject?: string; grade?: number; medium?: string };
  segments: TranscriptSegment[];
}

export interface TeachingStyleGuide {
  addressForms: string[];
  openingPhrases: string[];
  encouragementPhrases: string[];
  checkingUnderstanding: string[];
  transitionPhrases: string[];
  explainingPatterns: string[];
  handlingConfusion: string[];
  pacingCharacteristics: string;
}

const STYLE_GUIDE_SCHEMA = {
  type: "object",
  properties: {
    addressForms: {
      type: "array",
      items: { type: "string" },
      description:
        "How she addresses the child, in Sinhala, converted to SINGULAR one-to-one address (e.g. 'පුංචි දූලා පුතාලා' -> 'පුතේ' / 'දුවේ'). Never plural.",
    },
    openingPhrases: {
      type: "array",
      items: { type: "string" },
      description: "How she opens a topic or session, in singular Sinhala.",
    },
    encouragementPhrases: {
      type: "array",
      items: { type: "string" },
      description: "Praise and reassurance, verbatim Sinhala, converted to singular address.",
    },
    checkingUnderstanding: {
      type: "array",
      items: { type: "string" },
      description: "How she checks whether the child is following, in singular Sinhala.",
    },
    transitionPhrases: {
      type: "array",
      items: { type: "string" },
      description: "How she moves between topics or steps, in singular Sinhala.",
    },
    explainingPatterns: {
      type: "array",
      items: { type: "string" },
      description:
        "Recurring ways she builds an explanation step by step, described in Sinhala — the shape of her explanations, not specific lesson content.",
    },
    handlingConfusion: {
      type: "array",
      items: { type: "string" },
      description: "What she says when something needs re-explaining or the child is stuck, in singular Sinhala.",
    },
    pacingCharacteristics: {
      type: "string",
      description: "In Sinhala: her rhythm, where she slows down, and how she uses pauses.",
    },
  },
  required: [
    "addressForms",
    "openingPhrases",
    "encouragementPhrases",
    "checkingUnderstanding",
    "transitionPhrases",
    "explainingPatterns",
    "handlingConfusion",
    "pacingCharacteristics",
  ],
};

/**
 * The single most important instruction here, repeated in both the per-batch
 * and consolidation prompts: the source teacher is talking to a room full of
 * children, and our tutor talks to exactly one.
 */
const SINGULAR_CONVERSION_INSTRUCTIONS = [
  "CRITICAL — plural to singular conversion:",
  "This teacher is addressing a whole classroom. The tutor that will use this guide speaks to ONE child, one to one. So:",
  "- Convert every plural/classroom address into natural singular Sinhala. 'පුංචි දූලා පුතාලා' becomes 'පුතේ' or 'දුවේ'; 'ඔයාලා' becomes 'ඔයා'; 'හැමෝම' either becomes 'ඔයා' or is dropped.",
  "- Adjust the verb forms to match, so each phrase reads as natural spoken Sinhala said to a single child — not as a plural sentence with the noun swapped out.",
  "- EXCLUDE anything classroom-specific: addressing a group, managing a room, comparing children to each other, 'everyone look here', 'let's all say it together', instructions to a class, references to other students, or anything that only makes sense with an audience.",
  "- If a phrase cannot be made to work one-to-one, leave it out entirely rather than forcing it.",
].join("\n");

const STYLE_GUIDE_FRAMING = [
  "Extract a STYLE GUIDE: how this teacher SPEAKS. Not what she teaches.",
  "- No lesson content. No numbers, no place-value tables, no worked examples, no topic names. If a phrase only makes sense attached to one specific exercise, leave it out or generalise it.",
  "- Prefer phrasings that recur across the lesson over one-offs — you are capturing her habitual manner, not every sentence she ever said.",
  "- Keep her actual words. Verbatim Sinhala, in Sinhala script. Do not translate, and do not smooth her register into formal/textbook Sinhala.",
  "- `explainingPatterns` describes the SHAPE of her explanations (how she builds one up step by step, what she does first/next), written in Sinhala — not the content of any particular explanation.",
  "- `pacingCharacteristics` is a single Sinhala paragraph on her rhythm: where she slows down, how she uses pauses and repetition.",
  "Every value must be in Sinhala. Only the JSON field names are English.",
].join("\n");

function buildCorpus(segments: TranscriptSegment[]): string {
  const transcripts = segments
    .map((segment) => `[${segment.segmentStart}]\n${segment.fullTranscript}`)
    .join("\n\n");

  // Phrases and questions are already derived from the transcripts, so they
  // go in deduplicated with a count — that frequency is exactly the signal
  // for "is this characteristic of her, or did she say it once".
  const countOccurrences = (values: string[]): string => {
    const counts = new Map<string, number>();
    for (const value of values) {
      const key = value.trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => (count > 1 ? `${value}  (×${count})` : value))
      .join("\n");
  };

  const phrases = countOccurrences(segments.flatMap((segment) => segment.teachingNotes.phrasesUsed));
  const questions = countOccurrences(segments.flatMap((segment) => segment.teachingNotes.questionsAsked));
  const tone = segments.map((segment) => segment.teachingNotes.toneAndManner).filter(Boolean).join("\n");
  const pacing = segments.map((segment) => segment.teachingNotes.pacingNotes).filter(Boolean).join("\n");

  return [
    "=== VERBATIM TRANSCRIPT ===",
    transcripts,
    "",
    "=== RECURRING PHRASES (with how often each appeared) ===",
    phrases,
    "",
    "=== QUESTIONS SHE ASKED (with how often each appeared) ===",
    questions,
    "",
    "=== PER-SEGMENT NOTES ON HER TONE AND MANNER ===",
    tone,
    "",
    "=== PER-SEGMENT NOTES ON HER PACING ===",
    pacing,
  ].join("\n");
}

/** Splits segments into batches whose combined corpus stays under the char budget. */
function batchSegments(segments: TranscriptSegment[]): TranscriptSegment[][] {
  const batches: TranscriptSegment[][] = [];
  let current: TranscriptSegment[] = [];
  let currentChars = 0;

  for (const segment of segments) {
    const segmentChars =
      segment.fullTranscript.length +
      segment.teachingNotes.toneAndManner.length +
      segment.teachingNotes.pacingNotes.length +
      segment.teachingNotes.phrasesUsed.join("").length +
      segment.teachingNotes.questionsAsked.join("").length;

    if (current.length > 0 && currentChars + segmentChars > MAX_CHARS_PER_BATCH) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(segment);
    currentChars += segmentChars;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function parseJsonResponse(raw: string): TeachingStyleGuide {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

async function requestStyleGuide(ai: GoogleGenAI, prompt: string): Promise<TeachingStyleGuide> {
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: STYLE_GUIDE_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    }),
  );

  if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    throw new Error(`Response hit the ${MAX_OUTPUT_TOKENS}-token ceiling — raise MAX_OUTPUT_TOKENS.`);
  }
  const text = response.text ?? "";
  if (!text.trim()) throw new Error("Empty response from model");
  return parseJsonResponse(text);
}

function extractionPrompt(corpus: string, lessonLabel: string, batchNote: string): string {
  return [
    `The following is a verbatim Sinhala transcript of a real Sri Lankan teacher teaching ${lessonLabel}, plus notes on her tone and pacing.${batchNote}`,
    "",
    STYLE_GUIDE_FRAMING,
    "",
    SINGULAR_CONVERSION_INSTRUCTIONS,
    "",
    corpus,
  ].join("\n");
}

function consolidationPrompt(candidates: TeachingStyleGuide[]): string {
  return [
    "Below are several partial style guides, each extracted from a different stretch of the same teacher's lesson. Merge them into ONE final style guide.",
    "",
    "- Remove duplicates and near-duplicates, keeping the most natural phrasing of each.",
    "- Prefer entries that appear across several of the partial guides — those are her habits rather than one-off moments.",
    "- Keep each list focused: the most characteristic entries, not everything.",
    "- `pacingCharacteristics` should be one coherent Sinhala paragraph, not a concatenation.",
    "",
    STYLE_GUIDE_FRAMING,
    "",
    SINGULAR_CONVERSION_INSTRUCTIONS,
    "",
    JSON.stringify(candidates, null, 2),
  ].join("\n");
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set — see scripts/README.md for the env vars this needs.");
    process.exit(1);
  }

  let file: TranscriptFile;
  try {
    file = JSON.parse(await fs.readFile(TRANSCRIPT_PATH, "utf8"));
  } catch {
    console.error(
      `Couldn't read ${path.relative(process.cwd(), TRANSCRIPT_PATH)} — run \`npm run extract:lesson-plan\` first.`,
    );
    process.exit(1);
  }

  const segments = (file.segments ?? []).filter((segment) => segment.fullTranscript?.trim());
  if (segments.length === 0) {
    console.error(`No transcript content in ${path.relative(process.cwd(), TRANSCRIPT_PATH)}.`);
    process.exit(1);
  }

  const lessonLabel = file.lesson
    ? `Grade ${file.lesson.grade} ${file.lesson.subject} in ${file.lesson.medium}`
    : "a Grade 5 maths lesson in Sinhala";

  const batches = batchSegments(segments);
  const totalChars = batches.reduce((total, batch) => total + buildCorpus(batch).length, 0);
  // One call per batch, plus a consolidation call when there's more than one.
  const calls = batches.length + (batches.length > 1 ? 1 : 0);
  const estimatedCostUsd =
    (totalChars * INPUT_TOKENS_PER_CHAR_ESTIMATE * INPUT_COST_PER_MILLION_USD +
      calls * OUTPUT_TOKENS_PER_CALL_ESTIMATE * OUTPUT_COST_PER_MILLION_USD) /
    1_000_000;

  console.log(`Read ${segments.length} segment(s) from ${path.relative(process.cwd(), TRANSCRIPT_PATH)}`);
  console.log(
    `  ${totalChars.toLocaleString()} chars of style-relevant text in ${batches.length} batch(es), ` +
      `${calls} API call(s) (~$${estimatedCostUsd.toFixed(2)} estimated)`,
  );

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const candidates: TeachingStyleGuide[] = [];
  for (const [index, batch] of batches.entries()) {
    const batchNote =
      batches.length > 1
        ? ` This is part ${index + 1} of ${batches.length} of the lesson (${batch[0].segmentStart} onward).`
        : "";
    console.log(`  Extracting style from batch ${index + 1}/${batches.length}...`);
    candidates.push(await requestStyleGuide(ai, extractionPrompt(buildCorpus(batch), lessonLabel, batchNote)));
  }

  let guide: TeachingStyleGuide;
  if (candidates.length === 1) {
    guide = candidates[0];
  } else {
    console.log(`  Consolidating ${candidates.length} partial guides into one...`);
    guide = await requestStyleGuide(ai, consolidationPrompt(candidates));
  }

  const output = {
    source: {
      provider: "DP Education",
      usage: "Derived from lesson video content used with permission from DP Education.",
      derivedFrom: path.basename(TRANSCRIPT_PATH),
    },
    extractedAt: new Date().toISOString(),
    model: MODEL,
    note: "A register to speak in, not lines to recite. Address is singular one-to-one; classroom-specific speech is deliberately excluded.",
    guide,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`\n${"=".repeat(72)}`);
  console.log(`STYLE GUIDE — ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`${"=".repeat(72)}`);
  console.log(JSON.stringify(guide, null, 2));
  console.log(`${"=".repeat(72)}`);

  const counts = [
    `addressForms ${guide.addressForms.length}`,
    `openingPhrases ${guide.openingPhrases.length}`,
    `encouragementPhrases ${guide.encouragementPhrases.length}`,
    `checkingUnderstanding ${guide.checkingUnderstanding.length}`,
    `transitionPhrases ${guide.transitionPhrases.length}`,
    `explainingPatterns ${guide.explainingPatterns.length}`,
    `handlingConfusion ${guide.handlingConfusion.length}`,
  ].join(", ");
  console.log(`\nDone. ${counts}.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
