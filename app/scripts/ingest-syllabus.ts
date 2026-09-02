/**
 * One-time(ish) syllabus ingestion pipeline.
 *
 * Reads every PDF in docs/syllabus/, docs/teacher-guides/, docs/past-papers/,
 * and docs/original-content/ (relative to the repo root — i.e. ../docs when
 * run from app/, see CONTENT_ROOT below), extracts text, splits it into
 * heading-aware ~200-500 word chunks, embeds each chunk with Gemini's
 * gemini-embedding-001 (truncated to 768 dimensions — see EMBEDDING_MODEL
 * below for why this isn't text-embedding-004), and upserts the result into
 * Supabase's syllabus_chunks table for search_syllabus to query.
 *
 * Run with:  npx tsx scripts/ingest-syllabus.ts
 * (from the app/ directory — see scripts/README.md for env vars, the
 * filename convention PDFs must follow, and what to expect on success.)
 *
 * Idempotency: before processing a file, the script fetches which
 * source_reference values already exist under that file's "<folder>/
 * <filename>#" prefix. Chunk indices already present are skipped (not
 * re-embedded, not duplicated) — this is what makes it safe to re-run after
 * a partial failure (e.g. a rate limit) without redoing already-embedded
 * chunks. Any existing rows under the prefix that no longer correspond to a
 * current chunk index (e.g. the file's content shrank) are deleted. Note
 * this means editing a chunk's *content* without changing the chunk count
 * won't cause it to be re-embedded — delete that row (or all of the file's
 * rows) manually first if you need to force it.
 *
 * Extraction: english PDFs use pdf-parse's direct text-layer extraction.
 * sinhala/tamil PDFs go through Gemini vision-based transcription instead
 * (see extractPdfPagesViaVision below) — these are scans set in legacy
 * (non-Unicode) fonts, and reading their text layer directly yields garbled
 * Latin-keystroke text rather than real Sinhala/Tamil. Rasterizing each page
 * and sending the image to Gemini gets real text instead — and unlike
 * Tesseract (this pipeline's original approach — see git history), it
 * actually understands tables and diagrams rather than flattening them into
 * garbage, at the cost of a real, much slower and non-free API call per
 * page instead of near-instant local OCR.
 *
 * Transcription quality filtering (sinhala/tamil only): kept as a safety
 * net even though Gemini rarely produces the repeated-garbage-character
 * artifacts Tesseract did on tables/worksheets. Before chunking, each
 * transcribed page of a sinhala/tamil file is checked for quality (see
 * assessOcrQuality below); pages that fail are dropped from that file's
 * text entirely (never chunked, embedded, or inserted) and logged with
 * their raw text to scripts/skipped-chunks.log for manual review. English
 * PDFs use direct extraction, so this check doesn't run for them.
 *
 * Page images ("the board"): for sinhala/tamil files, every rasterized page
 * (not just ones with a diagram) is uploaded as-is — never cropped,
 * never AI-generated — to the Supabase Storage "textbook-images" bucket
 * (see uploadPageImage below), so any page can be shown later regardless of
 * what it contains: a diagram, a data table, an exercise, or a blank
 * fill-in worksheet. Each chunk carries the page number it came from (see
 * the Section/Chunk/pageNumber threading through splitPagesIntoSections and
 * chunkSection below) and, when that page's image uploaded successfully,
 * that image's public URL in its image_url column. The board's
 * show_page_image tool (src/app/api/tools/show-page-image/route.ts) looks
 * this up by source_reference + page_number to display the real page image.
 *
 * Worksheet-only chunks: a chunk whose content is essentially just the
 * "[Worksheet - not transcribable]" label (see VISION_TRANSCRIPTION_PROMPT)
 * has no real prose to embed or search — but the page's image is still
 * worth keeping findable, so isWorksheetOnlyChunk below detects these and
 * ingestFile inserts them with a null embedding instead of skipping them
 * entirely (see WORKSHEET_CHUNK_MAX_REMAINING_WORDS). match_syllabus_chunks
 * excludes null-embedding rows from semantic search results.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { PDFParse } from "pdf-parse";
import { supabaseAdmin } from "../src/lib/supabaseAdmin";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// text-embedding-004 (as originally specified) is no longer served on this
// API key/project — ListModels shows only gemini-embedding-001 and
// gemini-embedding-2[-preview] support embedContent now. Using the stable
// gemini-embedding-001, truncated to 768 dims via outputDimensionality to
// match the vector(768) column (its un-truncated default is 3072-dim).
// Truncated vectors aren't unit-length, but pgvector's `<=>` cosine
// operator normalizes internally, so similarity ordering is unaffected.
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const MIN_CHUNK_WORDS = 200;
const MAX_CHUNK_WORDS = 500;

// Gemini's embedContent has a per-project rate limit — firing calls back to
// back starts returning 429 RESOURCE_EXHAUSTED after roughly ~40 calls in
// quick succession. EMBED_CALL_DELAY_MS paces normal calls; the RETRY_*
// constants control retry-with-backoff for that plus other transient
// errors (503 UNAVAILABLE, deadline-exceeded) — see isRetryableApiError.
const EMBED_CALL_DELAY_MS = 1500;
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 5000; // backoff: 5s, 10s, 20s

// Transcription quality filtering for sinhala/tamil PDFs — see the file
// header comment for why. All checks are against a page's non-whitespace
// characters (markdown table syntax stripped first).
//
// Fill-in-the-blank dots/underscores (e.g. "....................") are
// genuine, common worksheet content in these textbooks — real exercises ask
// the child to fill in a blank represented by a run of dots. Real-world
// review of scripts/skipped-chunks.log found dozens of accurate,
// content-rich transcriptions rejected purely for containing these — some
// with well over half their characters being legitimate answer-blank dots.
// So blank-fill characters are excluded from the real-character-ratio
// calculation entirely (measuring quality against the *other* content, not
// against blanks that were never meant to be "real" characters) and from
// the repeated-run check (a long run of dots is expected, not garbled
// output) — they're only grounds for rejection if they dominate the *whole*
// chunk (OCR_MAX_BLANK_FILL_RATIO), which is what still flags a page that's
// basically nothing else.
const OCR_MIN_REAL_CHAR_RATIO = 0.6; // Sinhala/Tamil letters + digits + pipes, min share of content outside blank-fill marks
const OCR_MAX_REPEATED_CHAR_RUN = 5; // any single char (besides table syntax and blank-fill dots/underscores) repeated more than this in a row is filler
const OCR_MAX_BLANK_FILL_RATIO = 0.8; // dots/underscores as a share of the WHOLE chunk — reject only if they're the overwhelming majority

const SKIPPED_CHUNKS_LOG_PATH = path.resolve(__dirname, "skipped-chunks.log");

// Storage bucket for real (never AI-generated, never cropped) rasterized
// page images — see the "Page images" file header comment above.
// Provisioned by supabase/schema.sql (insert into storage.buckets).
const TEXTBOOK_IMAGES_BUCKET = "textbook-images";

// A chunk consisting almost entirely of this label (rather than real
// transcribed prose) has nothing meaningful to embed or search — see the
// "Worksheet-only chunks" file header comment above. This is how many
// non-label words a chunk can still contain (e.g. a short heading) and
// still count as "worksheet-only".
const WORKSHEET_MARKER = "[Worksheet - not transcribable]";
const WORKSHEET_CHUNK_MAX_REMAINING_WORDS = 20;

function isWorksheetOnlyChunk(content: string): boolean {
  if (!content.includes(WORKSHEET_MARKER)) return false;
  const remaining = content.split(WORKSHEET_MARKER).join(" ");
  return countWords(remaining) <= WORKSHEET_CHUNK_MAX_REMAINING_WORDS;
}

// Vision transcription pipeline for sinhala/tamil PDFs (see file header
// comment for why). pdftoppm is an external binary from poppler-utils —
// see scripts/README.md for install steps.
const PAGE_RASTER_DPI = 300;

const VISION_MODEL = "gemini-3.6-flash";
// Keep model "thinking" to the floor — this is a transcription task, not
// one that benefits from extended reasoning, and thinking tokens are
// billed as output and add several seconds of latency per page for no
// quality difference observed in testing. 0 is rejected by this model's
// API; 1 is the practical minimum.
const VISION_THINKING_BUDGET = 1;
const VISION_TRANSCRIPTION_PROMPT =
  "This is a page from a Sri Lankan Grade 5 textbook. Transcribe all readable text accurately, " +
  "preserving structure. If there are tables, represent them as markdown tables. If there are " +
  "diagrams or illustrations, describe what they show and what concept they're teaching, in a " +
  "clearly labeled '[Diagram: ...]' section separate from the transcribed text. If a section is " +
  "a blank fill-in-the-blank worksheet, note it as '[Worksheet - not transcribable]' rather than " +
  "guessing at blank content.";

// The printed page number in the textbook's own footer differs from the
// raw PDF page index once front matter (cover, foreword, contents)
// precedes the numbered pages — e.g. raw PDF page 76 might print "66" in
// its footer. Recovered by looking for a standalone number near this
// recurring footer phrase in the transcribed text (see
// extractPrintedPageNumber below).
export const PRINTED_PAGE_FOOTER_PHRASE = "නොමිලේ බෙදාහැරීම සඳහා";
// How many characters of context on each side of the footer phrase to
// search for a nearby standalone number, for the common case where the
// number sits right next to the phrase (before/after, separated only by
// markup or a short translation gloss like "(For free distribution)").
const PRINTED_PAGE_NUMBER_TIGHT_WINDOW = 35;
// When the phrase sits inside a "[Diagram: ...]" narration (vision
// sometimes describes the footer graphic in a full prose sentence instead
// of transcribing it literally — "...alongside the page number 108 and
// the Sinhala text ..." — putting the real number 40-100+ characters from
// the phrase), how far back a bracket's opening "[" may be from the phrase
// for that bracket to still be considered the one describing this footer.
const PRINTED_PAGE_NUMBER_BRACKET_MAX_GAP = 400;
// When the phrase appears just *after* a bracketed description has already
// closed (rather than inside it), how small the gap between the bracket's
// "]" and the phrase must be to trust that bracket — large enough for a
// stray newline/dash separator, small enough to reject an unrelated
// diagram bracket earlier on the page with unrelated numbers in it.
const PRINTED_PAGE_NUMBER_ADJACENT_GAP = 10;

/**
 * Finds the 1-3 digit standalone number within [rangeStart, rangeEnd) of
 * `text` that's closest to phraseCenter. Matching runs against the full,
 * unsliced text so `\b` sees real word boundaries — slicing first (as an
 * earlier version of this function did) creates a false boundary at the
 * slice edge, which can truncate a multi-digit number that straddles it
 * (e.g. "126" -> "26") instead of rejecting it as too far away.
 */
function findClosestNumberNear(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  phraseCenter: number,
): number | null {
  let best: RegExpMatchArray | null = null;
  let bestDistance = Infinity;
  for (const match of text.matchAll(/\b(\d{1,3})\b/g)) {
    const start = match.index ?? 0;
    if (start < rangeStart || start + match[0].length > rangeEnd) continue;
    const distance = Math.abs(start + match[0].length / 2 - phraseCenter);
    if (distance < bestDistance) {
      best = match;
      bestDistance = distance;
    }
  }
  return best ? Number(best[1]) : null;
}

/**
 * Looks for a standalone 1-3 digit number near PRINTED_PAGE_FOOTER_PHRASE
 * in a single page's transcribed text, and returns the one closest to the
 * phrase. Returns null if the phrase isn't found at all (e.g. a
 * front-matter page with no footer), or no number can be confidently
 * attributed to it.
 */
export function extractPrintedPageNumber(text: string): number | null {
  // Vision sometimes wraps the footer in decorative markup, e.g.
  // `<td border="1"><b>65</b></td>` — strip tags (and their attributes)
  // first so an attribute value like the "1" in border="1" never gets
  // mistaken for the real number.
  const cleaned = text.replace(/<[^>]*>/g, " ");
  const phraseIndex = cleaned.indexOf(PRINTED_PAGE_FOOTER_PHRASE);
  if (phraseIndex === -1) return null;
  const phraseEnd = phraseIndex + PRINTED_PAGE_FOOTER_PHRASE.length;
  const phraseCenter = phraseIndex + PRINTED_PAGE_FOOTER_PHRASE.length / 2;

  // If a "[...]" bracket encloses the phrase, or closes immediately before
  // it, confine the search to that bracket's span — it's self-delimited
  // (numbers never span a "[" or "]"), so this is safe even for a number
  // well outside the tight window, and it keeps the search from wandering
  // into unrelated exercise numbers outside the diagram description.
  const bracketOpen = cleaned.lastIndexOf("[", phraseIndex);
  if (bracketOpen !== -1) {
    const bracketClose = cleaned.indexOf("]", bracketOpen);
    if (bracketClose !== -1) {
      const phraseInsideBracket = bracketClose >= phraseIndex;
      const bracketIsRelevant = phraseInsideBracket
        ? phraseIndex - bracketOpen <= PRINTED_PAGE_NUMBER_BRACKET_MAX_GAP
        : phraseIndex - bracketClose <= PRINTED_PAGE_NUMBER_ADJACENT_GAP;
      if (bracketIsRelevant) {
        const match = findClosestNumberNear(
          cleaned,
          bracketOpen,
          Math.max(bracketClose + 1, phraseEnd),
          phraseCenter,
        );
        if (match !== null) return match;
      }
    }
  }

  // No relevant bracket — fall back to a tight window directly around the
  // phrase (handles inline/HTML-wrapped footers with no diagram prose).
  return findClosestNumberNear(
    cleaned,
    Math.max(0, phraseIndex - PRINTED_PAGE_NUMBER_TIGHT_WINDOW),
    Math.min(cleaned.length, phraseEnd + PRINTED_PAGE_NUMBER_TIGHT_WINDOW),
    phraseCenter,
  );
}

// Vision calls are already slow (several seconds of model latency per
// page), so this is a light safety-margin pace rather than the primary
// throttle — retry-with-backoff (via the same isRetryableApiError as
// embed() below) does the real handling of rate limits and transient
// server errors.
const VISION_CALL_DELAY_MS = 1000;

// Rough per-page cost/time estimate for the "N pages ~ X minutes" log
// printed before transcribing a file, so a long run's cost is visible up
// front rather than a surprise. Not tied to real per-call usage — just
// order-of-magnitude, based on empirical testing against real textbook
// pages. Pricing is Gemini 3.6 Flash standard-tier
// (https://ai.google.dev/gemini-api/docs/pricing), valid through
// 2026-12-31 — re-check and update if this estimate looks stale.
const VISION_SECONDS_PER_PAGE_ESTIMATE = 15;
const VISION_INPUT_TOKENS_PER_PAGE_ESTIMATE = 1200;
const VISION_OUTPUT_TOKENS_PER_PAGE_ESTIMATE = 1200;
const VISION_INPUT_COST_PER_MILLION_USD = 0.75;
const VISION_OUTPUT_COST_PER_MILLION_USD = 3.75;

function estimateVisionCost(pageCount: number): { estimatedMinutes: number; estimatedCostUsd: number } {
  const estimatedCostUsd =
    (pageCount *
      (VISION_INPUT_TOKENS_PER_PAGE_ESTIMATE * VISION_INPUT_COST_PER_MILLION_USD +
        VISION_OUTPUT_TOKENS_PER_PAGE_ESTIMATE * VISION_OUTPUT_COST_PER_MILLION_USD)) /
    1_000_000;
  return {
    estimatedMinutes: (pageCount * VISION_SECONDS_PER_PAGE_ESTIMATE) / 60,
    estimatedCostUsd,
  };
}

// Override with CONTENT_ROOT for testing against a scratch directory
// (containing the same four subfolders) without touching the real docs/.
const CONTENT_ROOT = process.env.CONTENT_ROOT
  ? path.resolve(process.env.CONTENT_ROOT)
  : path.resolve(__dirname, "../../docs");

interface ContentFolder {
  /** Stored as a prefix in source_reference, e.g. "teacher-guides/foo.pdf#chunk-1". */
  label: string;
  dir: string;
}

const CONTENT_FOLDERS: ContentFolder[] = [
  { label: "syllabus", dir: path.join(CONTENT_ROOT, "syllabus") },
  { label: "teacher-guides", dir: path.join(CONTENT_ROOT, "teacher-guides") },
  { label: "past-papers", dir: path.join(CONTENT_ROOT, "past-papers") },
  { label: "original-content", dir: path.join(CONTENT_ROOT, "original-content") },
];

type Medium = "sinhala" | "tamil" | "english";

interface FileMeta {
  subject: string;
  grade: number;
  medium: Medium;
  label: string | null;
}

interface Paragraph {
  text: string;
  /** The page this paragraph was transcribed/extracted from. */
  pageNumber: number;
  /** The textbook's own printed page number for that page, if confidently found (see extractPrintedPageNumber) — null for english (never parsed) or an unrecognized/front-matter page. */
  printedPageNumber: number | null;
}

interface Section {
  heading: string | null;
  paragraphs: Paragraph[];
}

interface Chunk {
  heading: string | null;
  content: string;
  /** The page its first contributing paragraph came from (a chunk only spans more than one page in the rare case a merge/split crosses a page boundary). */
  pageNumber: number;
  /** printedPageNumber of that same first contributing paragraph — see Paragraph.printedPageNumber. */
  printedPageNumber: number | null;
}

interface PdfPage {
  pageNumber: number;
  text: string;
  printedPageNumber: number | null;
}

interface OcrQualityVerdict {
  ok: boolean;
  reason?: string;
}

// Expected filename convention: <subject>_<grade>_<medium>[_<label>].pdf
// e.g. maths_5_sinhala.pdf, environmental-studies_5_english_water-cycle.pdf
// (Positional capture groups, not named ones — named groups need an ES2018+
// TS target, and this project's tsconfig targets ES2017 for the Next.js
// build; not worth bumping just for this script.)
const FILENAME_PATTERN =
  /^([a-z]+(?:-[a-z]+)*)_(\d{1,2})_(sinhala|tamil|english)(?:_([a-z0-9-]+))?\.pdf$/i;

function toTitleCase(kebab: string): string {
  return kebab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseFilenameMetadata(filename: string): FileMeta | null {
  const match = FILENAME_PATTERN.exec(filename);
  if (!match) return null;
  const [, subject, grade, medium, label] = match;
  return {
    subject: toTitleCase(subject.toLowerCase()),
    grade: Number(grade),
    medium: medium.toLowerCase() as Medium,
    label: label ? toTitleCase(label.toLowerCase()) : null,
  };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 90) return false;
  if (/[.,;:]$/.test(trimmed)) return false; // sentences end in punctuation; headings usually don't
  if (/^(chapter|unit|lesson|topic|section)\s+\d+/i.test(trimmed)) return true;
  if (/^(\d+\.){1,3}\d*\s*\S/.test(trimmed)) return true; // "1.", "1.2", "2.3.1 Fractions"

  const words = trimmed.split(/\s+/);
  if (words.length <= 8 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    return true; // short ALL CAPS line
  }
  return false;
}

/**
 * Splits every page's text into sections, breaking on heading-like lines,
 * tagging each paragraph with the page it came from. Pages were previously
 * joined with "\n\n" into one string before splitting — that blank line
 * forced a paragraph flush at every page boundary, so a paragraph never
 * spanned two pages. Processing page-by-page and force-flushing at the end
 * of each page's lines replicates that exactly (identical section/paragraph
 * grouping), just with page provenance attached to each paragraph.
 */
function splitPagesIntoSections(pages: PdfPage[]): Section[] {
  const sections: Section[] = [{ heading: null, paragraphs: [] }];
  let currentParagraphLines: string[] = [];
  let currentParagraphPage: number | null = null;
  let currentParagraphPrintedPage: number | null = null;

  const flushParagraph = () => {
    const text = currentParagraphLines.join(" ").replace(/\s+/g, " ").trim();
    if (text && currentParagraphPage !== null) {
      sections[sections.length - 1].paragraphs.push({
        text,
        pageNumber: currentParagraphPage,
        printedPageNumber: currentParagraphPrintedPage,
      });
    }
    currentParagraphLines = [];
    currentParagraphPage = null;
    currentParagraphPrintedPage = null;
  };

  for (const page of pages) {
    const lines = page.text.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim());
    for (const line of lines) {
      if (!line) {
        flushParagraph();
        continue;
      }
      if (isHeadingLine(line)) {
        flushParagraph();
        sections.push({ heading: line, paragraphs: [] });
        continue;
      }
      currentParagraphLines.push(line);
      currentParagraphPage = page.pageNumber;
      currentParagraphPrintedPage = page.printedPageNumber;
    }
    flushParagraph();
  }

  return sections.filter((section) => section.paragraphs.length > 0);
}

/** Splits an over-long paragraph (no heading breaks) into ~maxWords pieces on sentence boundaries. */
function splitParagraphIntoWordChunks(paragraph: string, maxWords: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]*/g) ?? [paragraph];
  const chunks: string[] = [];
  let current: string[] = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    if (wordCount > 0 && wordCount + sentenceWords > maxWords) {
      chunks.push(current.join(" ").trim());
      current = [];
      wordCount = 0;
    }
    current.push(sentence.trim());
    wordCount += sentenceWords;
  }
  if (current.length) chunks.push(current.join(" ").trim());
  return chunks;
}

interface ChunkPiece {
  content: string;
  pageNumber: number;
  printedPageNumber: number | null;
}

/**
 * Merges a section's paragraphs into ~200-500 word pieces, never crossing a
 * heading boundary. Each piece is tagged with the page (and printed page
 * number, if any) its first contributing paragraph came from.
 */
function chunkSection(section: Section): ChunkPiece[] {
  const chunks: ChunkPiece[] = [];
  let current: string[] = [];
  let currentPageNumber: number | null = null;
  let currentPrintedPageNumber: number | null = null;
  let wordCount = 0;

  const flush = () => {
    if (current.length) {
      chunks.push({
        content: current.join("\n\n").trim(),
        pageNumber: currentPageNumber!,
        printedPageNumber: currentPrintedPageNumber,
      });
      current = [];
      currentPageNumber = null;
      currentPrintedPageNumber = null;
      wordCount = 0;
    }
  };

  for (const paragraph of section.paragraphs) {
    const paragraphWords = countWords(paragraph.text);

    if (paragraphWords > MAX_CHUNK_WORDS) {
      flush();
      for (const piece of splitParagraphIntoWordChunks(paragraph.text, MAX_CHUNK_WORDS)) {
        chunks.push({
          content: piece,
          pageNumber: paragraph.pageNumber,
          printedPageNumber: paragraph.printedPageNumber,
        });
      }
      continue;
    }

    if (wordCount > 0 && wordCount + paragraphWords > MAX_CHUNK_WORDS) {
      flush();
    }

    if (current.length === 0) {
      currentPageNumber = paragraph.pageNumber;
      currentPrintedPageNumber = paragraph.printedPageNumber;
    }
    current.push(paragraph.text);
    wordCount += paragraphWords;

    if (wordCount >= MIN_CHUNK_WORDS) {
      flush();
    }
  }
  flush();

  // Fold a too-small trailing fragment into the previous chunk rather than
  // leaving a near-empty chunk dangling. Keeps the earlier chunk's page
  // number — the fragment is a minor tail addition, not a new topic.
  if (chunks.length >= 2 && countWords(chunks[chunks.length - 1].content) < 100) {
    const last = chunks.pop()!;
    const previous = chunks[chunks.length - 1];
    chunks[chunks.length - 1] = { ...previous, content: `${previous.content}\n\n${last.content}` };
  }

  return chunks;
}

function chunkSections(sections: Section[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const section of sections) {
    for (const { content, pageNumber, printedPageNumber } of chunkSection(section)) {
      if (content.trim()) {
        chunks.push({
          heading: section.heading,
          content: section.heading ? `${section.heading}\n\n${content}` : content,
          pageNumber,
          printedPageNumber,
        });
      }
    }
  }
  return chunks;
}

/**
 * Direct text-layer extraction — used for english PDFs only (see file
 * header comment). printedPageNumber is always null here: it's only ever
 * parsed from vision-transcribed sinhala/tamil text (see
 * extractPrintedPageNumber) — english PDFs' own page numbering isn't
 * currently known to need this distinction.
 */
async function extractPdfPages(filePath: string): Promise<PdfPage[]> {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    return result.pages.map((page, index) => ({
      pageNumber: index + 1,
      text: page.text,
      printedPageNumber: null,
    }));
  } finally {
    await parser.destroy();
  }
}

async function transcribePageWithVision(ai: GoogleGenAI, imageBuffer: Buffer): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: VISION_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/png", data: imageBuffer.toString("base64") } },
              { text: VISION_TRANSCRIPTION_PROMPT },
            ],
          },
        ],
        config: { thinkingConfig: { thinkingBudget: VISION_THINKING_BUDGET } },
      });
      return response.text ?? "";
    } catch (error) {
      const retryReason = classifyRetryableApiError(error);
      if (!retryReason || attempt >= RETRY_MAX_ATTEMPTS) {
        throw error;
      }
      const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `  ${retryReason}, retrying in ${delayMs / 1000}s... (attempt ${attempt + 1}/${RETRY_MAX_ATTEMPTS})`,
      );
      await sleep(delayMs);
    }
  }
}

/**
 * Uploads a page's real, already-rasterized PNG (no cropping, no AI
 * generation) to the textbook-images bucket, keyed so re-running ingestion
 * for the same page cleanly overwrites rather than accumulating copies.
 * Returns null (and logs a warning) on failure — a storage hiccup shouldn't
 * fail the whole file, it just means that page's chunk(s) won't get an
 * image_url.
 */
async function uploadPageImage(
  folderLabel: string,
  filename: string,
  pageNumber: number,
  imageBuffer: Buffer,
): Promise<string | null> {
  const storagePath = `${folderLabel}/${filename.replace(/\.pdf$/i, "")}/page-${pageNumber}.png`;
  const { error } = await supabaseAdmin.storage
    .from(TEXTBOOK_IMAGES_BUCKET)
    .upload(storagePath, imageBuffer, { contentType: "image/png", upsert: true });
  if (error) {
    console.warn(`  Warning: couldn't upload page image for page ${pageNumber}: ${error.message}`);
    return null;
  }
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(TEXTBOOK_IMAGES_BUCKET).getPublicUrl(storagePath);
  return publicUrl;
}

/**
 * Vision-based transcription — used for sinhala/tamil PDFs (see file header
 * comment for why direct text extraction doesn't work for these). Rasterizes
 * each page to a PNG with pdftoppm, sends each image to Gemini for
 * transcription (see VISION_MODEL / VISION_TRANSCRIPTION_PROMPT above), and
 * uploads every page's real image (see the "Page images" file header
 * comment) — not just ones with a diagram, since a data table, exercise, or
 * blank worksheet is just as worth showing on the board.
 */
async function extractPdfPagesViaVision(
  ai: GoogleGenAI,
  filePath: string,
  folderLabel: string,
  filename: string,
): Promise<{ pages: PdfPage[]; pageImageUrls: Map<number, string> }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-syllabus-vision-"));
  try {
    const imagePrefix = path.join(tempDir, "page");
    await execFileAsync("pdftoppm", ["-png", "-r", String(PAGE_RASTER_DPI), filePath, imagePrefix]);

    const imageFiles = (await fs.readdir(tempDir))
      .filter((name) => name.endsWith(".png"))
      .sort();
    if (imageFiles.length === 0) {
      throw new Error("pdftoppm produced no page images");
    }

    const { estimatedMinutes, estimatedCostUsd } = estimateVisionCost(imageFiles.length);
    console.log(
      `  ${imageFiles.length} pages ~ ${estimatedMinutes.toFixed(1)} minutes, ` +
        `${imageFiles.length} API calls (~$${estimatedCostUsd.toFixed(2)} estimated)`,
    );

    const pages: PdfPage[] = [];
    const pageImageUrls = new Map<number, string>();
    for (const [index, imageFile] of imageFiles.entries()) {
      const pageNumber = index + 1;
      console.log(`  Transcribing page ${pageNumber}/${imageFiles.length}...`);
      const imageBuffer = await fs.readFile(path.join(tempDir, imageFile));
      const text = await transcribePageWithVision(ai, imageBuffer);
      pages.push({ pageNumber, text, printedPageNumber: extractPrintedPageNumber(text) });

      const imageUrl = await uploadPageImage(folderLabel, filename, pageNumber, imageBuffer);
      if (imageUrl) pageImageUrls.set(pageNumber, imageUrl);

      await sleep(VISION_CALL_DELAY_MS);
    }
    return { pages, pageImageUrls };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

// Real letters for these two scripts (Tamil U+0B80-U+0BFF, Sinhala
// U+0D80-U+0DFF), plus digits (both are shared with the occasional
// Latin-numeral figure/date in these textbooks) and pipes (the column
// separator in the markdown tables we now ask Gemini to produce — a
// legitimate, expected character, not noise).
const REAL_CHAR_PATTERN = /[஀-௿඀-෿A-Za-z0-9|]/g;
// Dots and underscores: legitimate fill-in-the-blank worksheet content (see
// the constants comment above) — excluded from the real-character-ratio
// calculation's content entirely, and only grounds for rejection on their
// own if they dominate the whole chunk (OCR_MAX_BLANK_FILL_RATIO below).
const BLANK_FILL_PATTERN = /[._]/g;
// Structural markdown table separator characters (e.g. the "| :--- | :---: |"
// row), plus blank-fill dots/underscores — none of these should, on their
// own, count as a repeated-character garbled-output signal.
const REPEATED_RUN_EXCLUDED_CHARS = "-|:._";
// A markdown table separator row is pure structural syntax with zero
// informational content (e.g. "| :--- | :---: |") — stripped before the
// checks below run, so its dash/colon/pipe density can't skew the
// real-character ratio for an otherwise cleanly transcribed table.
const MARKDOWN_TABLE_SEPARATOR_LINE = /^\s*\|?[\s:|-]+\|?\s*$/;

/** Quality gate for a single sinhala/tamil page's transcribed text, applied before chunking — a safety net against garbled output (see file header comment). */
function assessOcrQuality(rawText: string): OcrQualityVerdict {
  const text = rawText
    .split("\n")
    .filter((line) => !MARKDOWN_TABLE_SEPARATOR_LINE.test(line))
    .join("\n");
  const nonWhitespace = text.replace(/\s+/g, "");
  if (nonWhitespace.length === 0) {
    return { ok: false, reason: "no extractable text" };
  }

  const repeatedRun = new RegExp(
    `([^${REPEATED_RUN_EXCLUDED_CHARS}])\\1{${OCR_MAX_REPEATED_CHAR_RUN},}`,
    "u",
  ).exec(nonWhitespace);
  if (repeatedRun) {
    return {
      ok: false,
      reason: `"${repeatedRun[1]}" repeats ${repeatedRun[0].length}x in a row`,
    };
  }

  const blankFillRatio = (nonWhitespace.match(BLANK_FILL_PATTERN) ?? []).length / nonWhitespace.length;
  if (blankFillRatio > OCR_MAX_BLANK_FILL_RATIO) {
    return {
      ok: false,
      reason: `${(blankFillRatio * 100).toFixed(0)}% of the chunk is fill-in-the-blank dots/underscores, with little else (max ${OCR_MAX_BLANK_FILL_RATIO * 100}%)`,
    };
  }

  // Measure real-character density against the content outside blank-fill
  // marks, not the whole chunk — a worksheet's answer blanks are expected,
  // legitimate content, not something that should count against how "real"
  // the surrounding transcription is.
  const contentExcludingBlanks = nonWhitespace.replace(BLANK_FILL_PATTERN, "");
  if (contentExcludingBlanks.length === 0) {
    return { ok: false, reason: "no real content outside fill-in-the-blank marks" };
  }
  const realCharRatio =
    (contentExcludingBlanks.match(REAL_CHAR_PATTERN) ?? []).length / contentExcludingBlanks.length;
  if (realCharRatio < OCR_MIN_REAL_CHAR_RATIO) {
    return {
      ok: false,
      reason: `only ${(realCharRatio * 100).toFixed(0)}% real characters outside fill-in-the-blank marks (need ${OCR_MIN_REAL_CHAR_RATIO * 100}%)`,
    };
  }

  return { ok: true };
}

async function logSkippedOcrPage(context: {
  folderLabel: string;
  filename: string;
  pageNumber: number;
  reason: string;
  text: string;
}): Promise<void> {
  const block =
    `--- ${context.folderLabel}/${context.filename} — page ${context.pageNumber} ---\n` +
    `Reason: ${context.reason}\n` +
    `${context.text.trim() || "(empty)"}\n\n`;
  await fs.appendFile(SKIPPED_CHUNKS_LOG_PATH, block, "utf8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Classifies an error from the @google/genai SDK as retryable (matching its
 * ApiError shape's numeric `status` field, or the equivalent text in a bare
 * Error's message) and returns a short reason for the retry log line, or
 * null if it isn't one of these known-transient cases:
 *   - 429 RESOURCE_EXHAUSTED — rate limit.
 *   - 503 UNAVAILABLE / 504 deadline-exceeded — transient server-side
 *     timeouts, not a quota problem, but just as safe to retry the same way.
 */
function classifyRetryableApiError(error: unknown): string | null {
  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429 || /RESOURCE_EXHAUSTED|\b429\b/i.test(message)) {
    return "rate limited";
  }
  if (
    status === 503 ||
    status === 504 ||
    /UNAVAILABLE|\b503\b|DEADLINE_EXCEEDED|deadline exceeded/i.test(message)
  ) {
    return "transient server error";
  }
  return null;
}

async function embed(
  ai: GoogleGenAI,
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  title?: string,
): Promise<number[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          taskType,
          outputDimensionality: EMBEDDING_DIMENSIONS,
          ...(title ? { title } : {}),
        },
      });
      const values = response.embeddings?.[0]?.values;
      if (!values || values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Expected a ${EMBEDDING_DIMENSIONS}-dim embedding, got ${values?.length ?? "none"}`,
        );
      }
      return values;
    } catch (error) {
      const retryReason = classifyRetryableApiError(error);
      if (!retryReason || attempt >= RETRY_MAX_ATTEMPTS) {
        throw error;
      }
      const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `  ${retryReason}, retrying in ${delayMs / 1000}s... (attempt ${attempt + 1}/${RETRY_MAX_ATTEMPTS})`,
      );
      await sleep(delayMs);
    }
  }
}

async function ingestFile(
  ai: GoogleGenAI,
  filePath: string,
  folderLabel: string,
): Promise<{ inserted: number; failed: number; skipped: number; ocrRejected: number }> {
  const filename = path.basename(filePath);
  const meta = parseFilenameMetadata(filename);

  if (!meta) {
    console.warn(
      `  SKIPPED — filename doesn't match <subject>_<grade>_<medium>[_<label>].pdf ` +
        `(e.g. maths_5_sinhala.pdf). See scripts/README.md.`,
    );
    return { inserted: 0, failed: 0, skipped: 0, ocrRejected: 0 };
  }

  // Check before doing any extraction/transcription work — re-transcribing
  // a whole PDF via Gemini vision just to then skip every chunk at the
  // per-chunk "already inserted" check below (much further down) wastes the
  // most expensive part of the pipeline. Deliberately simple: a file is
  // "done" if it has ANY existing rows, "not done" if it has none. This
  // relies on chunking/embedding/insertion only starting after every page
  // has been transcribed, so a run that fails during transcription (the
  // common failure mode — a page exhausting its retries) never inserts any
  // rows, leaving zero behind to correctly re-trigger a full reprocess.
  // It does NOT distinguish a fully-ingested file from one that inserted
  // some rows before being interrupted mid-insertion (e.g. the process was
  // killed) — that rarer case would be wrongly treated as "done" here. If
  // that happens, delete that file's rows manually to force a redo.
  const sourcePrefix = `${folderLabel}/${filename}#`;
  const { count: existingChunkCount, error: existingCountError } = await supabaseAdmin
    .from("syllabus_chunks")
    .select("*", { count: "exact", head: true })
    .like("source_reference", `${sourcePrefix}%`);
  if (existingCountError) {
    console.warn(
      `  Warning: couldn't check existing ingestion status: ${existingCountError.message}`,
    );
  } else if (existingChunkCount && existingChunkCount > 0) {
    console.log(`  already ingested (${existingChunkCount} chunks), skipping`);
    return { inserted: 0, failed: 0, skipped: existingChunkCount, ocrRejected: 0 };
  }

  const isVisionMedium = meta.medium === "sinhala" || meta.medium === "tamil";
  const { pages, pageImageUrls } = isVisionMedium
    ? await extractPdfPagesViaVision(ai, filePath, folderLabel, filename)
    : { pages: await extractPdfPages(filePath), pageImageUrls: new Map<number, string>() };

  let ocrRejected = 0;
  let keptPages = pages;
  if (isVisionMedium) {
    keptPages = [];
    for (const page of pages) {
      const verdict = assessOcrQuality(page.text);
      if (verdict.ok) {
        keptPages.push(page);
        continue;
      }
      ocrRejected++;
      await logSkippedOcrPage({
        folderLabel,
        filename,
        pageNumber: page.pageNumber,
        reason: verdict.reason ?? "low-quality transcription",
        text: page.text,
      });
    }
    if (ocrRejected > 0) {
      console.warn(
        `  ${ocrRejected} page(s) skipped due to low-quality transcription (safety net, rarely needed with vision transcription)`,
      );
    }
  }

  const chunks = chunkSections(splitPagesIntoSections(keptPages));
  console.log(
    `  ${meta.subject} · Grade ${meta.grade} · ${meta.medium} — ${chunks.length} chunk(s) extracted`,
  );

  if (chunks.length === 0) {
    console.warn("  SKIPPED — no extractable text (scanned/image-only PDF?)");
    return { inserted: 0, failed: 0, skipped: 0, ocrRejected };
  }

  const expectedReferences = chunks.map((_, index) => `${sourcePrefix}chunk-${index + 1}`);
  const expectedReferenceSet = new Set(expectedReferences);

  const { data: existingRows, error: fetchError } = await supabaseAdmin
    .from("syllabus_chunks")
    .select("source_reference")
    .like("source_reference", `${sourcePrefix}%`);
  if (fetchError) {
    console.warn(`  Warning: couldn't check for already-inserted chunks: ${fetchError.message}`);
  }
  const existingReferences = new Set(
    (existingRows ?? []).map((row) => row.source_reference as string),
  );

  // Clean up rows left over from a previous run that produced more chunks
  // than this run did (e.g. the file's content shrank) — anything under
  // this prefix that isn't one of the chunk indices we expect now.
  const staleReferences = [...existingReferences].filter((ref) => !expectedReferenceSet.has(ref));
  if (staleReferences.length > 0) {
    const { error: staleDeleteError } = await supabaseAdmin
      .from("syllabus_chunks")
      .delete()
      .in("source_reference", staleReferences);
    if (staleDeleteError) {
      console.warn(`  Warning: couldn't clear stale chunks for this file: ${staleDeleteError.message}`);
    }
  }

  let inserted = 0;
  let failed = 0;
  let skipped = 0;

  for (const [index, chunk] of chunks.entries()) {
    const topic = chunk.heading?.replace(/^(\d+\.)+\s*/, "").trim() || meta.label || meta.subject;
    const sourceReference = expectedReferences[index];
    const imageUrl = pageImageUrls.get(chunk.pageNumber) ?? null;

    if (existingReferences.has(sourceReference)) {
      skipped++;
      console.log(`  [${index + 1}/${chunks.length}] already inserted, skipping — ${sourceReference}`);
      continue;
    }

    // Worksheet-only chunks have no real prose to embed (see the
    // "Worksheet-only chunks" file header comment) — insert with a null
    // embedding instead of spending an API call on it.
    if (isWorksheetOnlyChunk(chunk.content)) {
      const { error } = await supabaseAdmin.from("syllabus_chunks").insert({
        subject: meta.subject,
        grade: meta.grade,
        topic,
        medium: meta.medium,
        content: chunk.content,
        source_reference: sourceReference,
        page_number: chunk.pageNumber,
        printed_page_number: chunk.printedPageNumber,
        image_url: imageUrl,
        embedding: null,
      });
      if (error) {
        failed++;
        console.error(`  [${index + 1}/${chunks.length}] FAILED (${sourceReference}):`, error.message);
      } else {
        inserted++;
        console.log(`  [${index + 1}/${chunks.length}] inserted (worksheet, no embedding) — topic: ${topic}`);
      }
      continue;
    }

    try {
      const embedding = await embed(ai, chunk.content, "RETRIEVAL_DOCUMENT", topic);
      const { error } = await supabaseAdmin.from("syllabus_chunks").insert({
        subject: meta.subject,
        grade: meta.grade,
        topic,
        medium: meta.medium,
        content: chunk.content,
        source_reference: sourceReference,
        page_number: chunk.pageNumber,
        printed_page_number: chunk.printedPageNumber,
        image_url: imageUrl,
        embedding,
      });
      if (error) throw error;
      inserted++;
      console.log(
        `  [${index + 1}/${chunks.length}] inserted (${countWords(chunk.content)} words) — topic: ${topic}`,
      );
    } catch (error) {
      failed++;
      console.error(
        `  [${index + 1}/${chunks.length}] FAILED (${sourceReference}):`,
        error instanceof Error ? error.message : error,
      );
    } finally {
      await sleep(EMBED_CALL_DELAY_MS);
    }
  }

  return { inserted, failed, skipped, ocrRejected };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set. See scripts/README.md.");
    process.exit(1);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY is not set. See scripts/README.md.",
    );
    process.exit(1);
  }

  const entries: Array<{ filePath: string; folderLabel: string }> = [];
  for (const { label, dir } of CONTENT_FOLDERS) {
    let filesInFolder: string[];
    try {
      filesInFolder = (await fs.readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
        .map((entry) => path.join(dir, entry.name))
        .sort();
    } catch {
      console.warn(`Could not read ${dir} — does it exist? Skipping.`);
      continue;
    }
    for (const filePath of filesInFolder) {
      entries.push({ filePath, folderLabel: label });
    }
  }

  if (entries.length === 0) {
    console.log(`No PDFs found under ${CONTENT_ROOT}. Nothing to do.`);
    return;
  }

  console.log(`Found ${entries.length} PDF(s) under ${CONTENT_ROOT}\n`);

  await fs.writeFile(
    SKIPPED_CHUNKS_LOG_PATH,
    `Skipped low-quality transcription pages — run started ${new Date().toISOString()}\n\n`,
    "utf8",
  );

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let filesProcessed = 0;
  let filesSkipped = 0;
  let totalInserted = 0;
  let totalFailed = 0;
  let totalSkippedChunks = 0;
  let totalOcrRejected = 0;

  for (const { filePath, folderLabel } of entries) {
    console.log(`\n${folderLabel}/${path.basename(filePath)}`);
    try {
      const { inserted, failed, skipped, ocrRejected } = await ingestFile(ai, filePath, folderLabel);
      totalInserted += inserted;
      totalFailed += failed;
      totalSkippedChunks += skipped;
      totalOcrRejected += ocrRejected;
      if (inserted > 0 || failed > 0 || skipped > 0 || ocrRejected > 0) filesProcessed++;
      else filesSkipped++;
    } catch (error) {
      filesSkipped++;
      console.error("  FAILED to process file:", error instanceof Error ? error.message : error);
    }
  }

  if (totalOcrRejected > 0) {
    console.log(
      `\n${totalOcrRejected} chunk(s) skipped due to low-quality transcription — ` +
        `see ${path.relative(process.cwd(), SKIPPED_CHUNKS_LOG_PATH)} for details.`,
    );
  }

  console.log(
    `\nDone. ${filesProcessed} file(s) processed, ${totalInserted} chunk(s) inserted, ` +
      `${totalSkippedChunks} chunk(s) already up to date, ${totalOcrRejected} chunk(s) skipped ` +
      `(low-quality transcription), ${totalFailed} chunk failure(s), ${filesSkipped} file(s) skipped.`,
  );

  if (totalFailed > 0 || filesSkipped > 0) {
    process.exitCode = 1;
  }
}

// Guarded so scripts/ingest-syllabus.test.ts can import extractPrintedPageNumber
// (and other pure helpers) without triggering a full ingestion run as a
// side effect of the import.
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
