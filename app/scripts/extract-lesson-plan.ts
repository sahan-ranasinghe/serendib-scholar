/**
 * Video -> full Sinhala teaching transcript.
 *
 * We already have Grade 5 Maths Lesson 1's textbook *content*
 * (src/data/lessons/lesson1-numbers.ts). What that content doesn't carry is
 * how a lesson is actually *taught* — and specifically, how the teacher
 * actually *speaks*: her exact phrasing, her tone with children, where she
 * slows down, the encouragement she repeats, the questions she puts to the
 * class. This script captures that verbatim, in Sinhala, from recorded DP
 * Education lesson videos (used with permission — see scripts/README.md).
 *
 * This deliberately does NOT summarize. An earlier version of this script
 * compressed 15-minute windows into a few English bullets, which threw away
 * exactly the thing that makes the output useful. Segments are therefore
 * short (SEGMENT_MINUTES) so one request only ever has to render a few
 * minutes of speech in full, and every field except the JSON keys comes
 * back in Sinhala.
 *
 * Run with:  npm run extract:lesson-plan
 * (from the app/ directory. That npm script loads .env.local for
 * GEMINI_API_KEY — plain `npx tsx` does not, see scripts/README.md.)
 *
 * Flags:
 *   --first-segment-only  Extract just the first segment, print it in full,
 *                         and stop — for eyeballing transcript quality
 *                         before committing to a long paid run. The segment
 *                         is checkpointed, so a normal run afterwards picks
 *                         up from segment 2.
 *   --force               Ignore any checkpoint and re-extract from scratch.
 *
 * How it works:
 * - The YouTube URL goes straight to Gemini (fileData.fileUri — the
 *   documented shape for YouTube input). Nothing is downloaded or stored.
 * - The video is processed in SEGMENT_MINUTES windows using the API's own
 *   video offsets (videoMetadata.startOffset/endOffset), not by splitting a
 *   file, then merged in order.
 * - Rate limits and transient 5xx errors retry with the same backoff as the
 *   ingestion pipeline, shared via scripts/lib/geminiRetry.ts.
 *
 * Resumability: every segment is written to a `.partial.json` checkpoint the
 * moment it completes, so a failure partway through a long paid run never
 * loses finished work — re-running skips straight to what's missing.
 *
 * This script only *produces* the transcript. Nothing here is wired into the
 * live tutoring flow.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { sleep, withRetry } from "./lib/geminiRetry";

// Same model as the ingestion pipeline's vision transcription.
const MODEL = "gemini-3.6-flash";

// Short on purpose. The whole point here is a COMPLETE verbatim transcript,
// and the longer a window is, the more the model drifts toward summarising
// it. Three minutes is little enough material that rendering every sentence
// in full is the path of least resistance for the model.
const SEGMENT_MINUTES = 3;

// Frames-per-second the API samples the video at. Kept at the 1.0 default:
// the whiteboard is half the signal (worked steps appear stroke by stroke),
// and sampling more sparsely risks missing board content that was only up
// briefly.
const VIDEO_FPS = 1.0;

// A truncated transcript silently violates the one guarantee this script
// makes, so give the model far more room than a 3-minute window should ever
// need, and treat hitting the ceiling as a hard error (see extractSegment).
const MAX_OUTPUT_TOKENS = 32768;

// Light pacing between segment calls — the real protection against rate
// limits is the shared retry/backoff in ./lib/geminiRetry.ts.
const VIDEO_CALL_DELAY_MS = 2000;

// When a config entry has no durationMinutes we can't know how many
// segments a video needs up front, so we walk forward until the API stops
// serving windows — with this as a hard stop so nothing can loop into an
// unbounded paid run.
const MAX_MINUTES_WITHOUT_DURATION = 240;

// Rough per-segment cost/time estimate for the line printed before a run,
// so a paid run's size is visible up front rather than a surprise.
// Order-of-magnitude only — video is tokenized at roughly 260-300 tokens per
// second at 1fps (frames + audio), and a full verbatim Sinhala transcript
// plus notes runs a few thousand output tokens per 3-minute window. Pricing
// is Gemini 3.6 Flash standard-tier
// (https://ai.google.dev/gemini-api/docs/pricing), matching the constants in
// ingest-syllabus.ts — re-check both if this looks stale.
const VIDEO_TOKENS_PER_SECOND_ESTIMATE = 300;
const OUTPUT_TOKENS_PER_SEGMENT_ESTIMATE = 5000;
const INPUT_COST_PER_MILLION_USD = 0.75;
const OUTPUT_COST_PER_MILLION_USD = 3.75;
const SECONDS_PER_SEGMENT_ESTIMATE = 45; // wall-clock per call, not video length

// Sinhala code block, used to sanity-check that what came back is actually
// Sinhala rather than a translated/summarised English answer.
const SINHALA_CHARACTERS = /[඀-෿]/;

// Both overridable for testing against a scratch config/output directory
// without touching the real ones — same affordance as ingest-syllabus.ts's
// CONTENT_ROOT.
const CONFIG_PATH = process.env.LESSON_VIDEOS_CONFIG
  ? path.resolve(process.env.LESSON_VIDEOS_CONFIG)
  : path.resolve(__dirname, "lesson-videos.json");
const LESSONS_DIR = process.env.LESSON_PLAN_OUT_DIR
  ? path.resolve(process.env.LESSON_PLAN_OUT_DIR)
  : path.resolve(__dirname, "../src/data/lessons");

interface LessonVideoEntry {
  subject: string;
  grade: number;
  lesson: number;
  medium: string;
  youtubeUrl: string;
  /** Optional. Given: exact segment count and a real cost estimate up front. Omitted: segments run until the API stops serving windows (see MAX_MINUTES_WITHOUT_DURATION). */
  durationMinutes?: number;
}

interface WorkedProblem {
  problem: string;
  solution: string;
  /** Ordered — the individual steps as the teacher showed them, not one blob. */
  stepsShown: string[];
}

interface TeachingNotes {
  toneAndManner: string;
  pacingNotes: string;
  phrasesUsed: string[];
  questionsAsked: string[];
  examplesUsed: string[];
  problemsWorked: WorkedProblem[];
}

interface ExtractedSegment {
  segmentStart: string;
  segmentEnd: string;
  fullTranscript: string;
  boardContent: string;
  teachingNotes: TeachingNotes;
}

/**
 * Structured-output schema for one segment. Everything is `required` so the
 * shape is consistent — an empty array/string is a meaningful "she didn't do
 * this here", whereas a missing key would be ambiguous on review. Every
 * description restates the Sinhala-and-verbatim requirement, since the field
 * descriptions are what the model actually reads while filling each one in.
 */
const SEGMENT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    segmentStart: { type: "string", description: "Start timestamp of this segment in the full video, HH:MM:SS." },
    segmentEnd: { type: "string", description: "End timestamp of this segment in the full video, HH:MM:SS." },
    fullTranscript: {
      type: "string",
      description:
        "The COMPLETE verbatim Sinhala transcript of everything the teacher says in this segment, word for word. Do not summarize, do not translate, do not shorten, do not skip repetitions or filler. Sinhala script only.",
    },
    boardContent: {
      type: "string",
      description:
        "Everything written or shown on the whiteboard during this segment, in Sinhala, exactly as written — numbers, tables, worked steps. Preserve layout with newlines; use markdown tables for tables.",
    },
    teachingNotes: {
      type: "object",
      properties: {
        toneAndManner: {
          type: "string",
          description:
            "In Sinhala: how she speaks here — gentle, encouraging, patient — and the register she uses with children.",
        },
        pacingNotes: {
          type: "string",
          description: "In Sinhala: where she slows down, repeats herself, or pauses to give thinking time.",
        },
        phrasesUsed: {
          type: "array",
          items: { type: "string" },
          description:
            "The recurring Sinhala phrases she uses — encouragement, transitions, checking understanding — verbatim.",
        },
        questionsAsked: {
          type: "array",
          items: { type: "string" },
          description: "Verbatim Sinhala questions she puts to the students.",
        },
        examplesUsed: {
          type: "array",
          items: { type: "string" },
          description: "Any everyday/real-world example or analogy she uses, verbatim in Sinhala.",
        },
        problemsWorked: {
          type: "array",
          description: "Problems worked in this segment, in Sinhala — including any not printed in the textbook.",
          items: {
            type: "object",
            properties: {
              problem: { type: "string", description: "The problem, in Sinhala." },
              solution: { type: "string", description: "The answer, in Sinhala." },
              stepsShown: {
                type: "array",
                items: { type: "string" },
                description: "Ordered solution steps in Sinhala, as spoken/written, including intermediate values.",
              },
            },
            required: ["problem", "solution", "stepsShown"],
          },
        },
      },
      required: [
        "toneAndManner",
        "pacingNotes",
        "phrasesUsed",
        "questionsAsked",
        "examplesUsed",
        "problemsWorked",
      ],
    },
  },
  required: ["segmentStart", "segmentEnd", "fullTranscript", "boardContent", "teachingNotes"],
};

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function buildSegmentPrompt(entry: LessonVideoEntry, startSeconds: number, endSeconds: number): string {
  return [
    `This is a recorded Sri Lankan classroom lesson: Grade ${entry.grade} ${entry.subject}, lesson ${entry.lesson}, taught in ${entry.medium}.`,
    `Work ONLY on the part of the video between ${formatTimestamp(startSeconds)} and ${formatTimestamp(endSeconds)}. Ignore everything outside that window.`,
    "",
    "YOUR MAIN JOB: produce a COMPLETE, VERBATIM Sinhala transcript of everything the teacher says in this window, word for word, in `fullTranscript`.",
    "",
    "- Do NOT summarize. Do NOT paraphrase. Do NOT translate. Do NOT shorten or skip anything.",
    "- Transcribe every sentence she speaks, including repetitions, encouragement, asides, corrections and filler words. If she says something three times, write it three times.",
    "- Write it in Sinhala script, exactly as spoken. Never replace her words with an English description of them.",
    "- This is a ~3 minute window, so a complete transcript is expected to be long. Length is correct; brevity is a failure.",
    "",
    "EVERY field you return must be written in Sinhala. Only the JSON field names are English. This applies to `toneAndManner` and `pacingNotes` as well — describe her manner and pacing in Sinhala, not English.",
    "",
    "Read BOTH the spoken audio AND the visual whiteboard/screen. The board carries digits, tables and worked steps the audio never states out loud — she says \"මේකෙන් අපිට ලැබෙනවා මේක\" while the actual numbers only ever appear on the board. Put that board content in `boardContent`, preserving its layout, and use the real written values in `problemsWorked[].stepsShown`.",
    "",
    "`teachingNotes` captures HOW she teaches: her tone and register with children, where she slows down or repeats, the encouragement and transition phrases she reuses, the questions she asks the class, any everyday example or analogy, and the problems worked (including ones not printed in the textbook).",
    "",
    "Report only what actually happens in the video — never invent content. If this window genuinely contains no speech (an intro card or a silent gap), return an empty `fullTranscript` rather than making something up.",
  ].join("\n");
}

/** Model output occasionally arrives fenced despite responseMimeType — strip that before parsing. */
function parseSegmentJson(raw: string): Partial<ExtractedSegment> {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

async function extractSegment(
  ai: GoogleGenAI,
  entry: LessonVideoEntry,
  startSeconds: number,
  endSeconds: number,
): Promise<ExtractedSegment> {
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              // YouTube input is passed by URL — no download, no upload. The
              // documented shape omits mimeType for YouTube specifically.
              fileData: { fileUri: entry.youtubeUrl },
              videoMetadata: {
                startOffset: `${startSeconds}s`,
                endOffset: `${endSeconds}s`,
                fps: VIDEO_FPS,
              },
            },
            { text: buildSegmentPrompt(entry, startSeconds, endSeconds) },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: SEGMENT_RESPONSE_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    }),
  );

  // A transcript cut off at the token ceiling isn't "complete" — fail loudly
  // rather than checkpointing a half-finished segment that looks fine.
  // Retrying wouldn't help (same prompt, same ceiling), so this is
  // deliberately not classified as a retryable error.
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new Error(
      `Response hit the ${MAX_OUTPUT_TOKENS}-token output ceiling — the transcript would be truncated. ` +
        `Lower SEGMENT_MINUTES or raise MAX_OUTPUT_TOKENS.`,
    );
  }

  const text = response.text ?? "";
  if (!text.trim()) {
    throw new Error("Empty response from model");
  }

  const parsed = parseSegmentJson(text);
  const notes = parsed.teachingNotes;
  return {
    // The model is asked for both timestamps (they're part of the documented
    // output shape) but we overwrite them with the offsets we actually
    // requested — a model-reported timestamp for its own window is an easy
    // thing to get subtly wrong, and everything downstream indexes on it.
    segmentStart: formatTimestamp(startSeconds),
    segmentEnd: formatTimestamp(endSeconds),
    fullTranscript: typeof parsed.fullTranscript === "string" ? parsed.fullTranscript : "",
    boardContent: typeof parsed.boardContent === "string" ? parsed.boardContent : "",
    teachingNotes: {
      toneAndManner: notes?.toneAndManner ?? "",
      pacingNotes: notes?.pacingNotes ?? "",
      phrasesUsed: Array.isArray(notes?.phrasesUsed) ? notes.phrasesUsed : [],
      questionsAsked: Array.isArray(notes?.questionsAsked) ? notes.questionsAsked : [],
      examplesUsed: Array.isArray(notes?.examplesUsed) ? notes.examplesUsed : [],
      problemsWorked: Array.isArray(notes?.problemsWorked) ? notes.problemsWorked : [],
    },
  };
}

/**
 * Cheap post-checks on a segment, reported as warnings rather than failures:
 * a short or English-looking transcript is usually the model having
 * summarised instead of transcribed, which is precisely the failure mode
 * this script exists to avoid — but it's a judgement call, so surface it and
 * let a human decide rather than discarding real work.
 */
function warnIfSuspicious(segment: ExtractedSegment, segmentSeconds: number): void {
  const transcript = segment.fullTranscript.trim();
  if (!transcript) {
    console.warn(`    (warning) empty transcript — check whether this window is silent.`);
    return;
  }
  if (!SINHALA_CHARACTERS.test(transcript)) {
    console.warn(`    (warning) transcript contains no Sinhala characters — it may have been translated.`);
  }
  // ~100+ words/minute of speech; well under ~40 chars per second of video
  // means whole stretches are missing rather than transcribed.
  const charsPerSecond = transcript.length / segmentSeconds;
  if (charsPerSecond < 5) {
    console.warn(
      `    (warning) transcript is only ${transcript.length} chars for ${segmentSeconds}s of video — it may be summarised rather than verbatim.`,
    );
  }
}

interface Checkpoint {
  youtubeUrl: string;
  /** Keyed by the segment's start offset in seconds, so resuming can skip what's done regardless of order. */
  segments: Record<string, ExtractedSegment>;
}

async function readCheckpoint(checkpointPath: string, entry: LessonVideoEntry): Promise<Checkpoint> {
  try {
    const raw = await fs.readFile(checkpointPath, "utf8");
    const parsed = JSON.parse(raw) as Checkpoint;
    if (parsed.youtubeUrl !== entry.youtubeUrl) {
      console.log(`  Checkpoint is for a different video URL — starting fresh.`);
      return { youtubeUrl: entry.youtubeUrl, segments: {} };
    }
    return { youtubeUrl: entry.youtubeUrl, segments: parsed.segments ?? {} };
  } catch {
    return { youtubeUrl: entry.youtubeUrl, segments: {} };
  }
}

function outputFileName(entry: LessonVideoEntry): string {
  return `lesson${entry.lesson}-teaching-plan-full.json`;
}

interface RunOptions {
  force: boolean;
  firstSegmentOnly: boolean;
}

async function processEntry(ai: GoogleGenAI, entry: LessonVideoEntry, options: RunOptions): Promise<boolean> {
  const label = `${entry.subject} grade ${entry.grade} lesson ${entry.lesson} (${entry.medium})`;
  console.log(`\n${label}`);
  console.log(`  ${entry.youtubeUrl}`);

  const outputPath = path.join(LESSONS_DIR, outputFileName(entry));
  const checkpointPath = outputPath.replace(/\.json$/, ".partial.json");
  const segmentSeconds = SEGMENT_MINUTES * 60;

  const knownSegmentCount = entry.durationMinutes ? Math.ceil(entry.durationMinutes / SEGMENT_MINUTES) : null;
  const plannedSegments = knownSegmentCount ?? Math.ceil(MAX_MINUTES_WITHOUT_DURATION / SEGMENT_MINUTES);

  const estimatedCostUsd =
    (plannedSegments *
      (segmentSeconds * VIDEO_TOKENS_PER_SECOND_ESTIMATE * INPUT_COST_PER_MILLION_USD +
        OUTPUT_TOKENS_PER_SEGMENT_ESTIMATE * OUTPUT_COST_PER_MILLION_USD)) /
    1_000_000;
  const estimatedMinutes = (plannedSegments * SECONDS_PER_SEGMENT_ESTIMATE) / 60;
  console.log(
    `  ${knownSegmentCount ? `${plannedSegments} segment(s)` : `up to ${plannedSegments} segment(s) (duration unknown)`}` +
      ` of ${SEGMENT_MINUTES} min ~ ${estimatedMinutes.toFixed(1)} minutes, ` +
      `${plannedSegments} API call(s) (~$${estimatedCostUsd.toFixed(2)} estimated)`,
  );
  if (options.firstSegmentOnly) {
    console.log(`  --first-segment-only: stopping after segment 1 so its output can be checked.`);
  }

  const checkpoint = options.force
    ? { youtubeUrl: entry.youtubeUrl, segments: {} }
    : await readCheckpoint(checkpointPath, entry);
  const alreadyDone = Object.keys(checkpoint.segments).length;
  if (alreadyDone > 0) {
    console.log(`  Resuming — ${alreadyDone} segment(s) already captured, skipping those.`);
  }

  let failures = 0;
  let extractedThisRun = 0;
  for (let index = 0; index < plannedSegments; index++) {
    const startSeconds = index * segmentSeconds;
    const endSeconds = entry.durationMinutes
      ? Math.min((index + 1) * segmentSeconds, Math.ceil(entry.durationMinutes * 60))
      : (index + 1) * segmentSeconds;
    if (startSeconds >= endSeconds) break;

    const key = String(startSeconds);
    if (checkpoint.segments[key]) continue;

    const window = `${formatTimestamp(startSeconds)}-${formatTimestamp(endSeconds)}`;
    console.log(`  Extracting ${window} (segment ${index + 1}/${plannedSegments})...`);

    let segment: ExtractedSegment;
    try {
      segment = await extractSegment(ai, entry, startSeconds, endSeconds);
    } catch (error) {
      // Asking for a window past the end of the video doesn't come back as
      // an empty response — the API returns a persistent 500 INTERNAL that
      // survives all three retries (confirmed on a real 2-hour run). So in
      // unknown-duration mode, a segment failing *after* we've already
      // captured content is the end of the video, not a failure — a genuine
      // outage would have taken the earlier segments down too.
      if (!knownSegmentCount && Object.keys(checkpoint.segments).length > 0) {
        console.log(
          `  ${window} isn't available after retries — treating as the end of the video. ` +
            `If the video really is longer, set "durationMinutes" in lesson-videos.json to keep going.`,
        );
        break;
      }
      failures++;
      console.error(`  FAILED ${window}: ${error instanceof Error ? error.message : error}`);
      if (!knownSegmentCount) {
        console.error(`  Stopping this video — nothing extracted yet, so this looks like a real failure.`);
        break;
      }
      continue;
    }

    checkpoint.segments[key] = segment;
    extractedThisRun++;
    await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), "utf8");
    console.log(
      `  ${window} — ${segment.fullTranscript.length} chars of transcript, ` +
        `${segment.teachingNotes.questionsAsked.length} question(s), ` +
        `${segment.teachingNotes.problemsWorked.length} problem(s)`,
    );
    warnIfSuspicious(segment, endSeconds - startSeconds);

    if (options.firstSegmentOnly) {
      console.log(`\n${"=".repeat(72)}`);
      console.log(`FIRST SEGMENT (${window}) — full output for review:`);
      console.log(`${"=".repeat(72)}`);
      console.log(JSON.stringify(segment, null, 2));
      console.log(`${"=".repeat(72)}`);
      console.log(
        `\nStopped after segment 1 as requested. It's saved in ` +
          `${path.relative(process.cwd(), checkpointPath)}, so re-running without ` +
          `--first-segment-only continues from segment 2.`,
      );
      return true;
    }

    await sleep(VIDEO_CALL_DELAY_MS);
  }

  const segments = Object.keys(checkpoint.segments)
    .map(Number)
    .sort((a, b) => a - b)
    .map((startSeconds) => checkpoint.segments[String(startSeconds)]);

  if (segments.length === 0) {
    console.error(`  Nothing extracted — no output written.`);
    return false;
  }

  const plan = {
    lesson: {
      subject: entry.subject,
      grade: entry.grade,
      lesson: entry.lesson,
      medium: entry.medium,
      youtubeUrl: entry.youtubeUrl,
    },
    source: {
      provider: "DP Education",
      usage: "Lesson video content used with permission from DP Education.",
    },
    extractedAt: new Date().toISOString(),
    model: MODEL,
    segmentMinutes: SEGMENT_MINUTES,
    segments,
  };

  await fs.mkdir(LESSONS_DIR, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(plan, null, 2), "utf8");

  const totalChars = segments.reduce((total, segment) => total + segment.fullTranscript.length, 0);
  console.log(
    `  Wrote ${path.relative(process.cwd(), outputPath)} — ` +
      `${segments.length} segment(s), ${totalChars.toLocaleString()} chars of transcript` +
      `${extractedThisRun > 0 ? `, ${extractedThisRun} new this run` : ""}` +
      `${failures > 0 ? `, ${failures} failed segment(s)` : ""}.`,
  );
  if (failures > 0) {
    console.log(`  Checkpoint kept at ${path.relative(process.cwd(), checkpointPath)} — re-run to retry just the failures.`);
  }
  return failures === 0;
}

async function loadConfig(): Promise<LessonVideoEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(CONFIG_PATH, "utf8");
  } catch {
    throw new Error(`No config at ${path.relative(process.cwd(), CONFIG_PATH)} — see scripts/README.md.`);
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${path.relative(process.cwd(), CONFIG_PATH)} must be a non-empty array of lesson video entries.`);
  }

  for (const entry of parsed) {
    const valid =
      entry &&
      typeof entry.subject === "string" &&
      typeof entry.grade === "number" &&
      typeof entry.lesson === "number" &&
      typeof entry.medium === "string" &&
      typeof entry.youtubeUrl === "string" &&
      (entry.durationMinutes === undefined || typeof entry.durationMinutes === "number");
    if (!valid) {
      throw new Error(
        `Invalid entry in lesson-videos.json: ${JSON.stringify(entry)} — ` +
          `needs subject (string), grade (number), lesson (number), medium (string), youtubeUrl (string), and optionally durationMinutes (number).`,
      );
    }
  }

  // Output files are named by lesson number alone, so two entries sharing a
  // lesson number would silently overwrite each other. Fail loudly instead
  // of picking a winner.
  const byFileName = new Map<string, LessonVideoEntry>();
  for (const entry of parsed as LessonVideoEntry[]) {
    const fileName = outputFileName(entry);
    const clash = byFileName.get(fileName);
    if (clash) {
      throw new Error(
        `Two entries both write to ${fileName}: ` +
          `${clash.subject}/grade ${clash.grade} and ${entry.subject}/grade ${entry.grade}. ` +
          `Give them distinct lesson numbers, or extend outputFileName() to include subject/grade.`,
      );
    }
    byFileName.set(fileName, entry);
  }

  return parsed as LessonVideoEntry[];
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set — see scripts/README.md for the env vars this needs.");
    process.exit(1);
  }

  const options: RunOptions = {
    force: process.argv.includes("--force"),
    firstSegmentOnly: process.argv.includes("--first-segment-only"),
  };
  const entries = await loadConfig();
  console.log(`Found ${entries.length} lesson video(s) in ${path.relative(process.cwd(), CONFIG_PATH)}`);
  if (options.force) console.log("--force: ignoring any existing checkpoints, re-extracting from scratch.");

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let clean = 0;
  for (const entry of entries) {
    try {
      if (await processEntry(ai, entry, options)) clean++;
    } catch (error) {
      console.error(`  FAILED: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (!options.firstSegmentOnly) {
    console.log(`\nDone. ${clean}/${entries.length} video(s) extracted without failures.`);
  }
  if (clean < entries.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
