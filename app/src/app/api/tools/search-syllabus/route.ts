import { NextRequest, NextResponse } from "next/server";
import { paidCallAllowed } from "@/lib/paidCalls";
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabaseClient";
import type { BoardContent } from "@/lib/board";
import { DEFAULT_PAGE_IMAGE_VIEW } from "@/lib/board";
import { filePrefixFromSourceReference } from "@/lib/pageImageLookup";

// Keep in sync with scripts/ingest-syllabus.ts — the query embedding must
// come from the same model/dimensionality as the stored chunk embeddings,
// or the pgvector similarity comparison is meaningless.
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

// Fetch more raw candidates than we ultimately return, so there's enough
// overlap to find adjacent chunks (from the same source file) to merge into
// continuous passages. MAX_RESULTS is what actually reaches the model —
// kept small so it gets one or two well-merged passages to tell properly
// instead of several scattered, disjointed chunks.
const RAW_MATCH_COUNT = 12;
const MAX_RESULTS = 2;

interface SyllabusMatch {
  subject: string;
  topic: string;
  content: string;
  source_reference: string;
  page_number: number;
  printed_page_number: number | null;
  image_url: string | null;
  similarity: number;
}

interface TopImage {
  imageUrl: string;
  pageNumber: number;
  printedPageNumber: number | null;
}

interface MergedMatch extends SyllabusMatch {
  /** Distinct page numbers spanned by this result, ascending — for show_page_image (a merged passage can cover more than one page). */
  pages: number[];
  /**
   * The first (lowest page number) image among this result's underlying
   * chunk(s), if any. Only actually auto-staged on the board when `pages`
   * has exactly one entry (see the "board" field on the POST response
   * below) — confirmed bug: for a multi-page merged passage, this was
   * being auto-staged regardless, so the board could show an earlier
   * related page (e.g. printed page 121) while the model was narrating
   * content from a later page in the same passage (printed page 123). The
   * content itself was accurate; only the auto-selected image was wrong,
   * because "first chunk with an image" has no way to know which specific
   * page the model is about to talk about. For a multi-page result, no
   * image is auto-staged at all — the model must call show_page_image
   * itself with the right page (see the `[Page N]` markers added to
   * multi-page `content` above, and prompt.ts's THE BOARD section).
   */
  topImage: TopImage | null;
}

/** The first chunk (in page/chunk order) among these entries that has a real stored image, if any. */
function findTopImage(entries: { match: SyllabusMatch }[]): TopImage | null {
  for (const { match } of entries) {
    if (match.image_url) {
      return {
        imageUrl: match.image_url,
        pageNumber: match.page_number,
        printedPageNumber: match.printed_page_number,
      };
    }
  }
  return null;
}

// scripts/ingest-syllabus.ts stores source_reference as
// "<folder>/<filename>#chunk-<N>" (1-indexed, in original document order).
const CHUNK_REFERENCE_PATTERN = /^(.+)#chunk-(\d+)$/;

/**
 * Merges matches that share a source file and sit at adjacent chunk indices
 * into one continuous passage, reassembled in original chunk order, instead
 * of returning them as separate, out-of-order results — this is what keeps
 * a story or explanation that spans multiple chunks intact rather than
 * fragmented. Matches whose source_reference doesn't fit the expected
 * pattern are passed through unmerged.
 */
function mergeAdjacentChunks(matches: SyllabusMatch[]): MergedMatch[] {
  const byFile = new Map<string, { match: SyllabusMatch; chunkIndex: number }[]>();
  const merged: MergedMatch[] = [];

  for (const match of matches) {
    const parsed = CHUNK_REFERENCE_PATTERN.exec(match.source_reference);
    if (!parsed) {
      merged.push({ ...match, pages: [match.page_number], topImage: findTopImage([{ match }]) });
      continue;
    }
    const fileKey = parsed[1];
    const list = byFile.get(fileKey) ?? [];
    list.push({ match, chunkIndex: Number(parsed[2]) });
    byFile.set(fileKey, list);
  }

  for (const [fileKey, entries] of byFile) {
    entries.sort((a, b) => a.chunkIndex - b.chunkIndex);

    let runStart = 0;
    for (let i = 1; i <= entries.length; i++) {
      const runEnds = i === entries.length || entries[i].chunkIndex !== entries[i - 1].chunkIndex + 1;
      if (!runEnds) continue;

      const run = entries.slice(runStart, i);
      runStart = i;

      if (run.length === 1) {
        merged.push({ ...run[0].match, pages: [run[0].match.page_number], topImage: findTopImage(run) });
        continue;
      }

      const first = run[0];
      const last = run[run.length - 1];
      const pages = [...new Set(run.map((entry) => entry.match.page_number))].sort((a, b) => a - b);
      // A merged passage spanning more than one distinct page is exactly
      // where auto-staging previously picked the wrong image (see the
      // `topImage`/board-gating comment below) — label each contributing
      // chunk's content with the raw page_number it actually came from, so
      // the model can tell which page to pass to show_page_image for
      // whatever part of this passage it's currently narrating, instead of
      // guessing or defaulting to the first page.
      const spansMultiplePages = pages.length > 1;
      merged.push({
        subject: first.match.subject,
        topic: first.match.topic,
        content: spansMultiplePages
          ? run.map((entry) => `[Page ${entry.match.page_number}]\n${entry.match.content}`).join("\n\n")
          : run.map((entry) => entry.match.content).join("\n\n"),
        source_reference: `${fileKey}#chunk-${first.chunkIndex}-${last.chunkIndex}`,
        page_number: first.match.page_number,
        printed_page_number: first.match.printed_page_number,
        image_url: first.match.image_url,
        pages,
        topImage: findTopImage(run),
        similarity: Math.max(...run.map((entry) => entry.match.similarity)),
      });
    }
  }

  return merged.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Executes the model's search_syllabus tool call: embeds the query, runs a
 * pgvector cosine-similarity search against syllabus_chunks (optionally
 * scoped to `subject`), and returns the top matching excerpts' content.
 */
export async function POST(request: NextRequest) {
  const { subject, topic } = await request.json();

  if (!subject || !topic) {
    return NextResponse.json(
      { error: "subject and topic are required" },
      { status: 400 },
    );
  }

  // Embedding the question is a paid call outside the Live session: off unless SYLLABUS_SEARCH=on. The chat is given the
  // lesson, the board and the teaching instructions up front (src/lib/chatContext.ts), so she answers from those.
  const apiKey = paidCallAllowed("syllabusEmbedding") ? process.env.GEMINI_API_KEY : undefined;
  if (!apiKey) {
    if (process.env.SYLLABUS_SEARCH === "on") console.error("[search-syllabus] GEMINI_API_KEY is not configured");
    return NextResponse.json({ results: [], found: false });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const embedRes = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: `${subject}: ${topic}`,
      config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    const queryEmbedding = embedRes.embeddings?.[0]?.values;
    if (!queryEmbedding) {
      throw new Error("No embedding returned for query");
    }

    const { data, error } = await supabaseAdmin.rpc("match_syllabus_chunks", {
      query_embedding: queryEmbedding,
      match_subject: subject,
      match_count: RAW_MATCH_COUNT,
    });

    if (error) throw error;

    const rawMatches = (data ?? []) as SyllabusMatch[];
    const results = mergeAdjacentChunks(rawMatches).slice(0, MAX_RESULTS);

    // Auto-stage the top result's image on the board as a direct
    // consequence of retrieval — the model doesn't have to remember a
    // separate show_page_image call for the common case. Only safe to do
    // when the result is unambiguously one page: for a result merged from
    // multiple pages, "first chunk with an image" isn't necessarily the
    // page the model is about to narrate from (see the topImage comment
    // above), so no image is auto-staged and the model must call
    // show_page_image itself with the correct page.
    const topResult = results[0];
    const topImage = topResult && topResult.pages.length === 1 ? topResult.topImage : null;
    const board: BoardContent | undefined = topImage
      ? {
          type: "page_image",
          imageUrl: topImage.imageUrl,
          pageNumber: topImage.pageNumber,
          printedPageNumber: topImage.printedPageNumber,
          sourceReference: filePrefixFromSourceReference(topResult.source_reference),
          view: DEFAULT_PAGE_IMAGE_VIEW,
        }
      : undefined;

    return NextResponse.json({
      results: results.map((row) => ({
        subject: row.subject,
        topic: row.topic,
        // When this result spans more than one page (pages.length > 1),
        // content is prefixed per-chunk with "[Page N]" markers so the
        // model can tell which page each part came from — required before
        // calling show_page_image for whatever it's currently narrating,
        // since the board isn't auto-staged for a multi-page result (see
        // the board field below).
        content: row.content,
        source_reference: row.source_reference,
        // Page(s) this content came from — pass one of these as page_number
        // to show_page_image (along with this search_syllabus result's
        // "pages" list — not used for the ambiguity check below, which is
        // scoped to just the top result.
        pages: row.pages,
        // The same image data the "board" field below auto-stages from —
        // exposed for every result (not just when it's unambiguous enough
        // to auto-stage) so useGeminiLive.ts can still stage *something*
        // real if this turns out to be a genuine topic change from
        // whatever's currently on the board, rather than leave a stale,
        // unrelated page up just because this particular result was
        // multi-page (see its topic-change handling in onToolCall).
        image: row.topImage
          ? {
              imageUrl: row.topImage.imageUrl,
              pageNumber: row.topImage.pageNumber,
              printedPageNumber: row.topImage.printedPageNumber,
              sourceReference: filePrefixFromSourceReference(row.source_reference),
            }
          : null,
      })),
      found: results.length > 0,
      ...(board ? { board } : {}),
    });
  } catch (error) {
    console.error("[search-syllabus] search failed:", error);
    return NextResponse.json({ results: [], found: false });
  }
}
