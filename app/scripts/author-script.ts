/**
 * THE ORIGINAL SCRIPT AUTHOR — Zara's own lesson, generated from the
 * design file, never from the recorded teacher's words.
 *
 * Inputs:  docs/design/maths-5-1.json   (what to teach — A + B, with C
 *          described),
 *          docs/design/style-card.md    (how to sound — C, described),
 *          the textbook rows in content_bank (what lands on the board).
 * Output:  src/data/lessons/authored/maths-5-1.json  (approved: false)
 *          docs/review/session-1-original.md         (for a human)
 *
 * HARD GUARANTEES, enforced mechanically per beat:
 *  - numbers: the model writes {number:26147} markers; sinhalaNumberName
 *    substitutes the words. No digit ever survives into spokenText, no
 *    number name is ever model-written, and no denylisted number (the
 *    recorded teacher's inventions) appears anywhere.
 *  - distance: every sentence is compared against every transcript
 *    sentence (char 5-gram Jaccard now; embedding cosine when available)
 *    after stripping digits, number names, vocabulary terms and verbatim
 *    textbook instructions. Jaccard > 0.35 or cosine > 0.88 → the beat is
 *    regenerated with the offending sentences fed back.
 *  - vocabulary: a term never appears before the concept the guide
 *    introduces it in.
 *  - sentences: ≤ 14 words (a number marker counts as one word).
 *  - CHECK_MY_WORK: one per concept with a peer-check step in the guide.
 *
 *   npm run author:script                 # session 1
 *   npm run author:script -- --limit 6    # first beats only, for tuning
 */
import { GoogleGenAI } from "@google/genai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { LESSON_1_NUMBERS_STEPS } from "../src/data/lessons/lesson1-numbers";
import {
  MAX_COSINE,
  MAX_JACCARD,
  charNgrams,
  cosine,
  sentencesOf,
  stripOfficial,
  surfaceSimilarity,
} from "../src/lib/scriptDistance";
import { DESIGN_CONCEPTS, type DesignConceptTag, type LessonDesign, type ConceptDesign } from "../src/lib/lessonDesign";
import { degenerateBeatProblems, degenerateProblems, substituteNumbers, validateSay, type Problem } from "../src/lib/authorGuards";
// (degenerateProblems is used directly for the errorPlanted fallback.)
import { parseAuthoredScript, type AuthoredBeat, type AuthoredBoardIntent, type AuthoredScriptFile } from "../src/lib/authoredScript";
import { renderReviewDoc } from "../src/lib/reviewDoc";
import { withRetry } from "./lib/geminiRetry";

/** gemini-3.1-pro 404s on this API version; the served generateContent id is the -preview one (verified). */
const MODEL = process.env.GEMINI_AUTHOR_MODEL ?? "gemini-3.1-pro-preview";
const EMBED_MODEL = "gemini-embedding-001";
const MAX_ATTEMPTS = 4;
const SECONDS_PER_BEAT = 13;
/** The app session this run fills (~minutes of teaching). */
const SESSION_TARGET_MINUTES = 22;
/** Concepts whose guide activity contains a peer-check step (activity 1 පියවර 1; activity 4 පියවර 2). */
const PEER_CHECK_CONCEPTS: DesignConceptTag[] = ["readWrite4Digit", "expandedForm5Digit"];
const ANALOGY_DOMAINS = [
  "school van fare",
  "cricket score",
  "coins in a till",
  "kottu price",
  "mangoes in a basket",
  "bus ticket",
  "pola vegetables",
  "exercise books in a stack",
];

const DESIGN_PATH = path.join(process.cwd(), "..", "docs", "design", "maths-5-1.json");
const STYLE_PATH = path.join(process.cwd(), "..", "docs", "design", "style-card.md");
const TRANSCRIPT_PATH = path.join(process.cwd(), "src/data/lessons/lesson1-teaching-plan-full.json");
const OUT_PATH = path.join(process.cwd(), "src/data/lessons/authored", "maths-5-1.json");
const REVIEW_PATH = path.join(process.cwd(), "..", "docs", "review", "session-1-original.md");
const EMBED_CACHE_PATH = path.join(process.cwd(), "src/data/lessons/authored", ".transcript-embeddings.json");

function flag(name: string, fallback: string | null = null): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
const LIMIT = Number(flag("limit", "0"));

/** Actual spend, tallied from every response and printed at the end. */
const usage = { genCalls: 0, embedCalls: 0, input: 0, output: 0, thinking: 0 };
function tallyGen(response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }) {
  usage.genCalls += 1;
  usage.input += response.usageMetadata?.promptTokenCount ?? 0;
  usage.output += response.usageMetadata?.candidatesTokenCount ?? 0;
  usage.thinking += response.usageMetadata?.thoughtsTokenCount ?? 0;
}

// --- corpus ---------------------------------------------------------------

interface CorpusEntry {
  sentence: string;
  grams: Set<string>;
  embedding: number[] | null;
  strippedLength: number;
}

/** Every string the textbook itself shows — verbatim-safe, stripped before comparing. */
function textbookVerbatim(): string[] {
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(LESSON_1_NUMBERS_STEPS);
  return strings.filter((text) => text.length >= 8);
}

async function buildCorpus(ai: GoogleGenAI, verbatim: string[]): Promise<{ corpus: CorpusEntry[]; cosineReady: boolean }> {
  const plan = JSON.parse(await readFile(TRANSCRIPT_PATH, "utf8")) as { segments: Array<{ fullTranscript: string }> };
  const sentences = [
    ...new Set(
      plan.segments
        .flatMap((segment) => sentencesOf(segment.fullTranscript))
        .map((sentence) => sentence.trim())
        .filter((sentence) => stripOfficial(sentence, verbatim).length >= 12),
    ),
  ];
  console.log(`Distance corpus: ${sentences.length} transcript sentences.`);

  let cache: Record<string, number[]> = {};
  try {
    cache = JSON.parse(await readFile(EMBED_CACHE_PATH, "utf8")) as Record<string, number[]>;
  } catch {
    cache = {};
  }
  let cosineReady = true;
  const missing = sentences.filter((sentence) => !cache[sentence]);
  if (missing.length > 0) {
    console.log(`Embedding ${missing.length} corpus sentences with ${EMBED_MODEL}…`);
    try {
      for (let i = 0; i < missing.length; i += 20) {
        const batch = missing.slice(i, i + 20);
        await Promise.all(
          batch.map(async (sentence) => {
            const response = await withRetry(() =>
              ai.models.embedContent({
                model: EMBED_MODEL,
                contents: stripOfficial(sentence, verbatim),
                config: { outputDimensionality: 768 },
              }),
            );
            usage.embedCalls += 1;
            cache[sentence] = response.embeddings?.[0]?.values ?? [];
          }),
        );
        // Flush after EVERY batch: a failure later (network, billing) must
        // never cost these embeddings a second time.
        await mkdir(path.dirname(EMBED_CACHE_PATH), { recursive: true });
        await writeFile(EMBED_CACHE_PATH, JSON.stringify(cache), "utf8");
        if ((i / 20) % 10 === 0) process.stdout.write(`\r  embedded ${Math.min(i + 20, missing.length)}/${missing.length}`);
      }
      console.log(`\r  embedded ${missing.length}/${missing.length}  (cache flushed per batch)`);
    } catch (error) {
      cosineReady = false;
      console.error(
        `EMBEDDINGS UNAVAILABLE (${String(error).slice(0, 100)}) — the cosine gate cannot run; ` +
          `Jaccard still enforced. Re-run when the API is available.`,
      );
    }
  }
  return {
    corpus: sentences.map((sentence) => {
      const stripped = stripOfficial(sentence, verbatim);
      return { sentence, grams: charNgrams(stripped), embedding: cache[sentence] ?? null, strippedLength: stripped.length };
    }),
    cosineReady,
  };
}

async function distanceProblems(
  ai: GoogleGenAI,
  spoken: string,
  corpus: CorpusEntry[],
  verbatim: string[],
  cosineReady: boolean,
): Promise<{ problems: Problem[]; max: { jaccard: number; cosine: number | null; closest: string } }> {
  const hits = surfaceSimilarity(spoken, corpus, verbatim);
  const problems: Problem[] = [];
  let maxJaccard = 0;
  let maxCosine: number | null = null;
  let closest = "";
  for (const hit of hits) {
    if (hit.jaccard > maxJaccard) {
      maxJaccard = hit.jaccard;
      closest = hit.closestTranscript;
    }
    if (hit.jaccard > MAX_JACCARD) {
      problems.push({
        rule: "distance-surface",
        detail: `"${hit.sentence.slice(0, 70)}" is too close to her "${hit.closestTranscript.slice(0, 70)}" — say it a genuinely different way.`,
      });
    }
  }
  if (cosineReady) {
    for (const sentence of sentencesOf(spoken)) {
      const stripped = stripOfficial(sentence, verbatim);
      // Cosine needs a real authored remnant on BOTH sides (≥24 chars):
      // embeddings of tiny fragments collapse to topic identity, and the
      // topic — the official lesson — is shared by design. (The surface
      // Jaccard check keeps its lower 12-char floor.)
      if (stripped.length < 24) continue;
      const response = await withRetry(() =>
        ai.models.embedContent({ model: EMBED_MODEL, contents: stripped, config: { outputDimensionality: 768 } }),
      );
      usage.embedCalls += 1;
      const vector = response.embeddings?.[0]?.values ?? [];
      for (const entry of corpus) {
        if (!entry.embedding || entry.embedding.length === 0 || entry.strippedLength < 24) continue;
        const score = cosine(vector, entry.embedding);
        if (maxCosine === null || score > maxCosine) {
          maxCosine = score;
          if (score > maxJaccard) closest = entry.sentence;
        }
        if (score > MAX_COSINE) {
          problems.push({
            rule: "distance-meaning",
            detail: `"${sentence.slice(0, 70)}" mirrors her "${entry.sentence.slice(0, 70)}" too closely in shape — restructure it.`,
          });
          break;
        }
      }
    }
  }
  return { problems, max: { jaccard: maxJaccard, cosine: maxCosine, closest } };
}

// --- generation -----------------------------------------------------------

const BEATS_SCHEMA = {
  type: "object",
  properties: {
    hookCandidates: { type: "array", items: { type: "string" }, description: "ONLY for the first chunk of a concept: 3 original hook options." },
    analogyDomain: { type: "string" },
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", description: "HOOK | EXPLAIN | SOFT_CHECK | ASK | SHOW_BOARD | REVEAL_PART | TRANSITION | CHECK_MY_WORK" },
          say: { type: "string", description: "Spoken Sinhala. Numbers ONLY as {number:26147} markers. {address} allowed." },
          pauseType: { type: "string", description: "RHETORICAL | SOFT_CHECK | ASK | NONE" },
          board: {
            type: "object",
            properties: {
              kind: { type: "string", description: "none | title | text | abacus | abacus_add | exercise" },
              title: { type: "string" },
              text: { type: "string" },
              digits: { type: "array", items: { type: "number" } },
              animate: { type: "boolean" },
              startEmpty: { type: "boolean" },
              rod: { type: "number" },
              count: { type: "number" },
              itemId: { type: "string" },
            },
            required: ["kind"],
          },
          expectedAnswer: { type: "string" },
          guideStep: { type: "string" },
          errorPlanted: { type: "string" },
        },
        required: ["type", "say", "pauseType", "board"],
      },
    },
  },
  required: ["beats"],
} as const;

class TruncatedError extends Error {
  constructor(message = "generation hit the output-token cap (runaway)") {
    super(message);
  }
}

interface RawBeat {
  type: string;
  say: string;
  pauseType: string;
  board: Record<string, unknown> & { kind: string };
  expectedAnswer?: string;
  guideStep?: string;
  errorPlanted?: string;
}

async function generateChunk(
  ai: GoogleGenAI,
  styleCard: string,
  design: LessonDesign,
  concept: ConceptDesign,
  chunk: { label: string; instructions: string; targetBeats: number; wantHooks: boolean; wantCheckMyWork: boolean },
  itemCatalogue: string,
  usedAnalogies: string[],
  feedback: Problem[],
): Promise<{ beats: RawBeat[]; hookCandidates: string[]; analogyDomain: string }> {
  const prompt = [
    "You are writing an ORIGINAL Sinhala lesson script for Zara, a warm voice tutor for one Grade 5 child.",
    "You have a lesson DESIGN (what to teach — from the official teacher's guide and textbook) and a STYLE",
    "CARD (how to sound). The recorded teacher this design was studied from must NOT be echoed: your",
    "sentences are checked against her transcript and rejected if they are close. Write like a different",
    "teacher teaching the same official material.",
    "",
    "ABSOLUTE RULES:",
    "- Numbers: write EVERY number as a {number:26147} marker — digits only inside the marker. Never write",
    "  a Sinhala number name yourself; the marker is replaced by the official name automatically. Numbers",
    "  the child should SEE (board digits, exercise ids) go in the board object, not in `say`.",
    `- NEVER use these numbers (the recorded teacher's own inventions): ${[...design.denylistNumbers].slice(0, 60).join(", ")}…`,
    "  Official examples (from the guide/textbook) are expected; extra practice may use NEW numbers not on",
    "  that denylist.",
    "- ≤ 14 words per sentence (a {number:...} marker counts as one word). Short, warm, spoken Sinhala only;",
    "  {address} as the vocative; no English.",
    "- pauseType per beat: RHETORICAL (tag questions, no stop), SOFT_CHECK (brief 'with me?' — any murmur",
    "  fine), ASK (a real answer required — give expectedAnswer). NONE for plain narration.",
    "- Follow the design's techniqueSequence and questionPatterns for this concept; land every",
    "  misconceptionStop as an explicit teaching moment.",
    "- Vocabulary terms may be USED only if this concept or an earlier one introduces them:",
    `  this concept introduces: ${concept.vocabularyIntroduced.join(", ") || "(none)"}.`,
    "- board per beat: {kind:'none'} (keep current), {kind:'title',title}, {kind:'text',text} (chalk lines,",
    "  digits allowed here), {kind:'abacus',digits:[...],animate?,startEmpty?}, {kind:'abacus_add',rod,count}",
    "  (rod 0 = thousands/leftmost), or {kind:'exercise',itemId} using an id from the catalogue below.",
    "- Textbook instructions may be read verbatim (they are official text) — numbers still as markers.",
    chunk.wantHooks
      ? "- hookCandidates: THREE original one-or-two-sentence hooks for this concept, each from a DIFFERENT\n" +
        "  everyday Sri Lankan child's life moment, none resembling the recorded teacher's hook. Each may ask\n" +
        "  a small question. Beat 1 of your beats should BE the first candidate (type HOOK, pauseType ASK\n" +
        "  with expectedAnswer when it genuinely asks, else SOFT_CHECK)."
      : "",
    chunk.wantCheckMyWork
      ? "- Include exactly ONE CHECK_MY_WORK beat: Zara works a problem on the board WITH one deliberate,\n" +
        "  plausible error (a dropped zero, a digit in the wrong place), then asks the child to find her\n" +
        "  mistake. Set errorPlanted to what the error is and expectedAnswer to what the child should spot."
      : "",
    `- analogyDomain: the ONE everyday analogy this concept uses. Choose from: ${ANALOGY_DOMAINS.filter((domain) => !usedAnalogies.includes(domain)).join("; ")}.`,
    `  (${usedAnalogies.length > 0 ? `Already used, do not repeat: ${usedAnalogies.join("; ")}.` : "First concept — free choice."})`,
    "  Use it where the design's analogySlot says an everyday example belongs.",
    "",
    `TARGET: about ${chunk.targetBeats} beats for this part. THIS PART: ${chunk.label}`,
    chunk.instructions,
    "",
    "=== THE DESIGN ENTRY (follow it) ===",
    JSON.stringify(concept, null, 1).slice(0, 20_000),
    "",
    "=== BOARD EXERCISE CATALOGUE (usable itemIds) ===",
    itemCatalogue,
    "",
    "=== STYLE CARD ===",
    styleCard,
    feedback.length > 0
      ? ["", "YOUR PREVIOUS ATTEMPT WAS REJECTED — fix exactly these, keep everything else:", ...feedback.map((p) => `- [${p.rule}] ${p.detail}`)].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // 16K is ample for a dozen beats of JSON; a runaway now dies cheap
      // instead of billing 65K tokens per meltdown (observed: 151K output
      // tokens across three runaway attempts on one chunk).
      config: { responseMimeType: "application/json", responseJsonSchema: BEATS_SCHEMA, maxOutputTokens: 16384 },
    }),
  );
  tallyGen(response);
  if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    // A runaway generation (observed live: one call burned 60K+ output
    // tokens looping). Retryable like any other rejected attempt.
    throw new TruncatedError();
  }
  let parsed: { beats: RawBeat[]; hookCandidates?: string[]; analogyDomain?: string };
  try {
    parsed = JSON.parse((response.text ?? "").trim());
  } catch {
    // An empty or malformed body (safety block, stream hiccup) is a
    // generation defect like truncation — retry the attempt, don't crash.
    throw new TruncatedError("generation returned no parseable JSON");
  }
  return { beats: parsed.beats ?? [], hookCandidates: parsed.hookCandidates ?? [], analogyDomain: parsed.analogyDomain ?? "" };
}

/** The comparison's single-beat CHECK_MY_WORK brief, which the model handles reliably. */
async function generateCheckMyWork(
  ai: GoogleGenAI,
  styleCard: string,
  design: LessonDesign,
  concept: ConceptDesign,
  denylist: Set<number>,
  corpus: CorpusEntry[],
  verbatim: string[],
  cosineReady: boolean,
): Promise<Omit<AuthoredBeat, "id"> | null> {
  const example = concept.officialExamples.find((ex) => /\d/.test(ex)) ?? concept.officialExamples[0] ?? "";
  let feedback: Problem[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const prompt = [
      "You are writing ONE beat of an original Sinhala lesson for Zara, a warm voice tutor for one Grade 5 child.",
      "THE BEAT (type CHECK_MY_WORK): Zara works a problem on the board but makes ONE deliberate, plausible",
      `error (a dropped zero, a digit in the wrong place). Use an official example if one fits: ${example}.`,
      "She asks the child to find her mistake. expectedAnswer = what the child should spot (a few words).",
      "errorPlanted (optional) = ONE short Sinhala sentence naming the error — omit it if unsure.",
      "RULES: numbers ONLY as {number:26147} markers; ≤14 words per sentence (marker = one word); 2-4",
      `sentences; warm spoken Sinhala; {address} as vocative; no English; never these numbers: ${[...denylist].slice(0, 40).join(", ")}.`,
      "board: {kind:'text',text:'...'} showing her (wrong) working — digits allowed on the board.",
      "",
      "=== STYLE CARD ===",
      styleCard,
      feedback.length > 0
        ? ["", "PREVIOUS ATTEMPT REJECTED — fix exactly these:", ...feedback.map((p) => `- [${p.rule}] ${p.detail}`)].join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json", responseJsonSchema: BEATS_SCHEMA, maxOutputTokens: 4096 },
        }),
      );
      tallyGen(response);
      if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new TruncatedError();
      const parsed = JSON.parse((response.text ?? "").trim()) as { beats: RawBeat[] };
      const raw = parsed.beats?.[0];
      if (!raw?.say) throw new TruncatedError("no beat in response");
      // A degenerate errorPlanted is DROPPED, not fatal: the field is
      // derivable from expectedAnswer, and this model loops on it.
      let errorPlanted = raw.errorPlanted;
      if (errorPlanted && degenerateProblems("errorPlanted", errorPlanted).length > 0) {
        console.warn(`  [note] dropping degenerate errorPlanted (${errorPlanted.length} chars) — deriving from expectedAnswer.`);
        errorPlanted = undefined;
      }
      if (!errorPlanted && raw.expectedAnswer) errorPlanted = `වැරැද්ද: ${raw.expectedAnswer}`;
      const problems = [
        ...validateSay(raw.say, concept.conceptTag, denylist),
        ...degenerateBeatProblems({
          say: raw.say,
          expectedAnswer: raw.expectedAnswer,
          boardText: typeof raw.board?.text === "string" ? raw.board.text : undefined,
        }),
      ];
      let spoken = "";
      let numbers: number[] = [];
      try {
        const substituted = substituteNumbers(raw.say);
        spoken = substituted.spoken;
        numbers = substituted.numbers;
      } catch (error) {
        problems.push({ rule: "number", detail: String(error).slice(0, 120) });
      }
      const distance = spoken
        ? await distanceProblems(ai, spoken, corpus, verbatim, cosineReady)
        : { problems: [], max: { jaccard: 0, cosine: null, closest: "" } };
      problems.push(...distance.problems);
      if (problems.length === 0) {
        return {
          conceptTag: concept.conceptTag,
          type: "CHECK_MY_WORK",
          sourceText: raw.say,
          spokenText: spoken,
          numbers,
          pauseType: "ASK",
          boardIntent: (raw.board as unknown as AuthoredBoardIntent) ?? { kind: "none" },
          expectedAnswer: raw.expectedAnswer,
          errorPlanted,
          guideStep: "peer-check (guide) → find Zara's mistake",
          maxSimilarity: distance.max,
        };
      }
      feedback = problems.slice(0, 8);
      for (const problem of feedback) {
        console.warn(`  [reject] model=${MODEL} concept=${concept.conceptTag} check-my-work ${problem.rule}: ${problem.detail.slice(0, 110)}`);
      }
    } catch (error) {
      if (!(error instanceof TruncatedError)) throw error;
      feedback = [{ rule: "generation", detail: "Output was unusable. Emit ONLY the compact JSON beat." }];
      console.warn(`  [reject] model=${MODEL} concept=${concept.conceptTag} check-my-work generation: ${error.message}`);
    }
  }
  return null;
}

// --- main -----------------------------------------------------------------

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const ai = new GoogleGenAI({ apiKey });

  const design = JSON.parse(await readFile(DESIGN_PATH, "utf8")) as LessonDesign;
  const styleCard = await readFile(STYLE_PATH, "utf8");
  const denylist = new Set(design.denylistNumbers);
  const verbatim = textbookVerbatim();
  const { corpus, cosineReady } = await buildCorpus(ai, verbatim);

  // Session 1 = the leading concepts up to the session budget.
  const sessionConcepts: ConceptDesign[] = [];
  let minutes = 0;
  for (const tag of DESIGN_CONCEPTS) {
    const concept = design.concepts.find((c) => c.conceptTag === tag);
    if (!concept) continue;
    if (minutes >= 18 && sessionConcepts.length > 0) break;
    sessionConcepts.push(concept);
    minutes += concept.timeWeightMinutes;
  }
  const scale = Math.min(1, SESSION_TARGET_MINUTES / Math.max(1, minutes));
  console.log(
    `Session 1 concepts: ${sessionConcepts.map((c) => c.conceptTag).join(", ")} ` +
      `(her ${minutes} min, scaled ×${scale.toFixed(2)} to ~${SESSION_TARGET_MINUTES} min).`,
  );

  // The exercise catalogue the model may stage.
  const { data: bankRows } = await supabaseAdmin
    .from("content_bank")
    .select("id, source, component_type, concept_tag")
    .eq("subject", "maths")
    .eq("grade", 5)
    .eq("lesson", 1)
    .like("source", "textbook%");

  // Resume: accepted chunks from an interrupted run are never re-billed.
  const previous = parseAuthoredScript(await readFile(OUT_PATH, "utf8").catch(() => null));
  const resuming = Boolean(previous && !previous.approved && previous.model === MODEL && previous.completedChunks?.length);
  const file: AuthoredScriptFile = resuming
    ? { ...previous!, generatedAt: new Date().toISOString(), concepts: sessionConcepts.map((c) => c.conceptTag) }
    : {
        subject: "maths",
        grade: 5,
        lesson: 1,
        approved: false,
        model: MODEL,
        generatedAt: new Date().toISOString(),
        sessionsAuthored: [1],
        concepts: sessionConcepts.map((c) => c.conceptTag),
        completedChunks: [],
        hookCandidates: {},
        analogies: {},
        beats: [],
      };
  if (resuming) console.log(`Resuming: ${file.beats.length} beats from ${file.completedChunks!.length} completed chunk(s).`);
  const usedAnalogies: string[] = Object.values(file.analogies).filter((a): a is string => Boolean(a));

  for (const concept of sessionConcepts) {
    const conceptBudget = Math.max(8, Math.round((concept.timeWeightMinutes * scale * 60) / SECONDS_PER_BEAT));
    const steps = concept.guideSteps.length > 0 ? concept.guideSteps : ["(the whole activity)"];
    const perStep = Math.max(4, Math.round(conceptBudget / steps.length));
    console.log(`\n${concept.conceptTag}: ~${conceptBudget} beats across ${steps.length} guide step(s).`);

    const itemCatalogue = (bankRows ?? [])
      .filter((row) => concept.textbookContent.some((entry) => entry.contentBankIds.includes(row.id)))
      .map((row) => `${row.id} — ${row.source} (${row.component_type})`)
      .join("\n") || "(no board exercises for this concept)";

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
      const chunkKey = `${concept.conceptTag}:${stepIndex}`;
      if (file.completedChunks?.includes(chunkKey)) continue; // checkpointed
      const chunk = {
        label: `guide step ${stepIndex + 1} of ${steps.length}: ${steps[stepIndex].slice(0, 160)}`,
        instructions:
          stepIndex === 0
            ? "Open the concept (hook first), then teach this step following the techniqueSequence."
            : "Continue the concept with this step. No new hook.",
        targetBeats: perStep,
        wantHooks: stepIndex === 0,
        wantCheckMyWork: false, // generated separately — see generateCheckMyWork
      };

      let feedback: Problem[] = [];
      let accepted: AuthoredBeat[] | null = null;
      let hooks: string[] = [];
      let analogy = "";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let generated;
        try {
          generated = await generateChunk(ai, styleCard, design, concept, chunk, itemCatalogue, usedAnalogies, feedback);
        } catch (error) {
          if (!(error instanceof TruncatedError)) throw error;
          console.warn(`  [reject] model=${MODEL} concept=${concept.conceptTag} step=${stepIndex + 1} generation: ${error.message} — regenerating.`);
          feedback = [{ rule: "generation", detail: "Your previous output was unusable (truncated or unparseable). Emit ONLY the compact JSON — no repetition, no filler." }];
          continue;
        }
        hooks = generated.hookCandidates;
        analogy = generated.analogyDomain;
        const problems: Problem[] = [];
        const beats: AuthoredBeat[] = [];
        // Degenerate-output guard on the chunk-level fields too.
        for (const candidate of generated.hookCandidates) {
          for (const problem of degenerateProblems("hookCandidate", candidate, { expectSinhala: true })) {
            problems.push({ rule: problem.rule, detail: `(hook candidate) ${problem.detail}` });
          }
        }
        problems.push(...degenerateProblems("analogyDomain", generated.analogyDomain));
        for (let beatIndex = 0; beatIndex < generated.beats.length; beatIndex += 1) {
          const raw = generated.beats[beatIndex];
          const sayProblems = validateSay(raw.say, concept.conceptTag, denylist);
          // EVERY generated field is checked for model-shaped garbage —
          // the comparison run put 230 words of English scaffolding into
          // an analogy field and it sailed through content checks.
          sayProblems.push(
            ...degenerateBeatProblems({
              say: raw.say,
              expectedAnswer: raw.expectedAnswer,
              errorPlanted: raw.errorPlanted,
              guideStep: raw.guideStep,
              boardText: typeof raw.board.text === "string" ? raw.board.text : undefined,
              boardTitle: typeof raw.board.title === "string" ? raw.board.title : undefined,
            }),
          );
          let spoken = "";
          let spokenNumbers: number[] = [];
          try {
            const substituted = substituteNumbers(raw.say);
            spoken = substituted.spoken;
            spokenNumbers = substituted.numbers;
          } catch (error) {
            sayProblems.push({ rule: "number", detail: String(error).slice(0, 120) });
          }
          const distance = spoken
            ? await distanceProblems(ai, spoken, corpus, verbatim, cosineReady)
            : { problems: [], max: { jaccard: 0, cosine: null, closest: "" } };
          const beatProblems = [...sayProblems, ...distance.problems];
          if (beatProblems.length > 0) {
            problems.push(...beatProblems.map((p) => ({ rule: p.rule, detail: `(beat ${beatIndex + 1}) ${p.detail}` })));
            continue;
          }
          beats.push({
            id: `authored:${concept.conceptTag}:${file.beats.length + beats.length}`,
            conceptTag: concept.conceptTag,
            type: (raw.type as AuthoredBeat["type"]) ?? "EXPLAIN",
            // The line as the model wrote it, markers intact: spokenText is
            // derived from it, so the joiner can be fixed and every beat
            // re-rendered later without regenerating the lesson.
            sourceText: raw.say,
            spokenText: spoken,
            numbers: spokenNumbers,
            pauseType: raw.pauseType === "NONE" ? null : (raw.pauseType as AuthoredBeat["pauseType"]),
            boardIntent: raw.board as unknown as AuthoredBoardIntent,
            expectedAnswer: raw.expectedAnswer,
            guideStep: raw.guideStep ?? chunk.label,
            errorPlanted: raw.errorPlanted,
            maxSimilarity: distance.max,
          });
        }
        if (problems.length === 0 && beats.length > 0) {
          accepted = beats;
          break;
        }
        feedback = problems.slice(0, 12);
        // Every rejection logged with the model and the beat, as promised.
        for (const problem of problems) {
          console.warn(`  [reject] model=${MODEL} concept=${concept.conceptTag} step=${stepIndex + 1} ${problem.rule}: ${problem.detail.slice(0, 110)}`);
        }
        console.warn(`  step ${stepIndex + 1} attempt ${attempt}: ${problems.length} problem(s) — regenerating.`);
      }
      if (!accepted) throw new Error(`${concept.conceptTag} step ${stepIndex + 1} failed after ${MAX_ATTEMPTS} attempts.`);
      if (chunk.wantHooks && hooks.length >= 3) file.hookCandidates[concept.conceptTag] = hooks.slice(0, 3);
      if (analogy && !usedAnalogies.includes(analogy)) {
        usedAnalogies.push(analogy);
        file.analogies[concept.conceptTag] = analogy;
      }
      file.beats.push(...accepted);
      file.completedChunks = [...(file.completedChunks ?? []), chunkKey];
      // Flush after every accepted chunk — an interruption costs nothing.
      await mkdir(path.dirname(OUT_PATH), { recursive: true });
      await writeFile(OUT_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
      console.log(`  step ${stepIndex + 1}: ${accepted.length} beats accepted (total ${file.beats.length}, checkpointed).`);
      if (LIMIT > 0 && file.beats.length >= LIMIT) break;
    }
    // CHECK_MY_WORK, as its own small focused call: inside a large chunk
    // the model reliably melted down on errorPlanted (three runs, 40-80K
    // char fields); as a single beat — the comparison's exact brief — it
    // was flawless. One per peer-check concept.
    const cmwKey = `${concept.conceptTag}:check-my-work`;
    if (
      PEER_CHECK_CONCEPTS.includes(concept.conceptTag) &&
      !file.completedChunks?.includes(cmwKey) &&
      (LIMIT === 0 || file.beats.length < LIMIT)
    ) {
      const cmw = await generateCheckMyWork(ai, styleCard, design, concept, denylist, corpus, verbatim, cosineReady);
      if (cmw) {
        file.beats.push({ ...cmw, id: `authored:${concept.conceptTag}:${file.beats.length}` });
        file.completedChunks = [...(file.completedChunks ?? []), cmwKey];
        await writeFile(OUT_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
        console.log(`  CHECK_MY_WORK accepted (total ${file.beats.length}, checkpointed).`);
      } else {
        console.warn(`  WARNING: ${concept.conceptTag} CHECK_MY_WORK failed after ${MAX_ATTEMPTS} attempts — authored without it.`);
      }
    }
    if (LIMIT > 0 && file.beats.length >= LIMIT) break;
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await writeReviewDoc(file, design);

  const worstJaccard = Math.max(0, ...file.beats.map((beat) => beat.maxSimilarity.jaccard));
  const worstCosine = Math.max(0, ...file.beats.map((beat) => beat.maxSimilarity.cosine ?? 0));
  console.log(`\n${file.beats.length} beats authored. Max Jaccard ${worstJaccard.toFixed(3)} (gate ${MAX_JACCARD}); max cosine ${worstCosine ? worstCosine.toFixed(3) : "n/a"} (gate ${MAX_COSINE}).`);
  if (worstJaccard > MAX_JACCARD) throw new Error("DISTANCE GATE FAILED — a beat exceeds the Jaccard ceiling.");
  console.log(`Words:  ${path.relative(process.cwd(), OUT_PATH)} (approved: false)`);
  console.log(`Review: docs/review/session-1-original.md`);
  console.log(
    `[tokens] ${usage.genCalls} generation calls (${MODEL}): in ${usage.input.toLocaleString()}, ` +
      `out ${usage.output.toLocaleString()}, thinking ${usage.thinking.toLocaleString()}; ` +
      `${usage.embedCalls} embedding calls.`,
  );
}

async function writeReviewDoc(file: AuthoredScriptFile, design: LessonDesign): Promise<void> {
  await mkdir(path.dirname(REVIEW_PATH), { recursive: true });
  await writeFile(REVIEW_PATH, renderReviewDoc(file, design), "utf8");
}

main().catch((error) => {
  console.log(
    `[tokens at failure] ${usage.genCalls} generation calls: in ${usage.input.toLocaleString()}, ` +
      `out ${usage.output.toLocaleString()}, thinking ${usage.thinking.toLocaleString()}; ${usage.embedCalls} embeds.`,
  );
  console.error(error);
  process.exit(1);
});
