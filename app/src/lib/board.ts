// The board component shapes content_bank rows are stored in — see the
// `lesson_content` variant below and lesson1-numbers.ts's module doc.
import type { LessonComponent, FilledAnswer } from "@/data/lessons/lesson1-numbers";

/**
 * A highlighted region on the current image/table (see highlight_region,
 * src/app/api/tools/highlight-region/route.ts) — `focus` is the same
 * normalized-coordinate heuristic used by zoom_to_region (see
 * src/lib/regionHint.ts), null meaning "no specific position could be
 * inferred, just show the label." Not pixel-precise by design.
 */
export interface BoardHighlight {
  label: string;
  focus: { x: number; y: number } | null;
}

export type MarkerShape = "circle" | "underline" | "arrow" | "box";

/**
 * A hand-drawn-style annotation on the current page image — see
 * draw_marker, src/app/api/tools/draw-marker/route.ts. Same approximate
 * `focus` heuristic as BoardHighlight (src/lib/regionHint.ts) — this is
 * "point and mark like a teacher's pen," not a precise UI element, so
 * TeachingBoard.tsx renders each shape with a deliberately sketchy,
 * slightly imperfect look rather than a crisp geometric shape.
 */
export interface BoardMarker {
  shape: MarkerShape;
  label: string;
  focus: { x: number; y: number } | null;
}

/** Programmatic view state for a page_image board — see zoom_to_region/zoom_out/draw_marker. */
export interface PageImageView {
  /** 1 = default (unzoomed); >1 = zoomed in by that factor. */
  zoom: number;
  /** Normalized 0-1 focus point the zoom is centered on; null = image center. */
  zoomFocus: { x: number; y: number } | null;
  highlight: BoardHighlight | null;
  marker: BoardMarker | null;
}

/** Programmatic view state for a table board — see scroll_table/highlight_region. */
export interface TableBoardView {
  /** Which horizontal edge to scroll to; null = leave at its current/default position. */
  scrollTo: "start" | "end" | null;
  highlight: BoardHighlight | null;
}

export const DEFAULT_PAGE_IMAGE_VIEW: PageImageView = { zoom: 1, zoomFocus: null, highlight: null, marker: null };
export const DEFAULT_TABLE_VIEW: TableBoardView = { scrollTo: null, highlight: null };

/**
 * Shared "the board" content shape — what a board tool route
 * (src/app/api/tools/show-*.ts, clear-board) returns to describe what
 * should be displayed, and what TeachingBoard.tsx renders. Kept in one
 * place so the API routes (producers) and the component (consumer) can't
 * drift apart on the shape.
 *
 * Every variant renders deterministically from real data the model already
 * has (transcribed text/tables, or a real stored page image) — never
 * anything AI-generated.
 */
export type BoardContent =
  | {
      type: "page_image";
      imageUrl: string;
      /** Raw PDF page index — used only for internal purposes (e.g. re-fetching); never shown to the child directly. */
      pageNumber: number;
      /** The textbook's own printed page number, if confidently parsed during ingestion (see extractPrintedPageNumber in scripts/ingest-syllabus.ts) — display this when present, falling back to pageNumber only when it's null. */
      printedPageNumber: number | null;
      /** The file this page belongs to (source_reference's file prefix) — needed by next_page/previous_page to look up an adjacent page for the same document. */
      sourceReference: string;
      view: PageImageView;
    }
  | { type: "table"; markdownTableText: string; view: TableBoardView }
  | { type: "exercise"; questionText: string; subparts: string[] }
  | { type: "vocabulary_card"; word: string; meaning: string; language: string }
  // One item from the content bank (see find-teaching-content/route.ts),
  // rendered with the component types defined in
  // src/data/lessons/lesson1-numbers.ts. Replaced the old `lesson_step`
  // variant when the 12-step lesson structure was removed — the board now
  // shows whatever material the bank hands back, not a numbered step.
  | {
      type: "lesson_content";
      /** The content_bank row id this came from — submit_blank_answer includes it so a stray/late response can't patch the wrong item's board (see applyViewPatch in useGeminiLive.ts). */
      itemId: string;
      components: LessonComponent[];
      /** Blanks the child has answered so far on this item, keyed by (rowIndex, field) — see submit_blank_answer / FilledAnswer. */
      filledAnswers: FilledAnswer[];
      /** Which blank (if any) the AI is currently asking the child about — see set_active_blank. Null once answered or when no blank is currently being discussed. */
      activeBlank: { rowIndex: number; field: string } | null;
    }
  // A big friendly card for beats that have no exercise on screen (lesson
  // goals, transitions, session close, a concept's opening explanation) —
  // the board is never just empty during a lesson.
  | { type: "title_card"; title: string; emoji?: string }
  | { type: "empty" };

/** True when there's real content to show — used by TeachingBoard.tsx to render/collapse, and HostScreen.tsx's mobile character/board view toggle. */
export function hasVisibleBoardContent(content: BoardContent | null): content is Exclude<BoardContent, { type: "empty" }> {
  return content !== null && content.type !== "empty";
}

// A markdown table separator row (e.g. "| :--- | :---: |") — pure
// structural syntax, skipped when parsing rows. Same pattern used to strip
// these before quality-checking transcribed text in scripts/ingest-syllabus.ts.
const TABLE_SEPARATOR_LINE = /^\s*\|?[\s:|-]+\|?\s*$/;

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Parses real markdown table text (as produced by vision transcription —
 * see scripts/ingest-syllabus.ts) into headers + rows for TeachingBoard to
 * render as a proper HTML <table>, generically for any subject. Returns
 * null if the text doesn't look like a table at all (e.g. empty).
 */
export function parseMarkdownTable(markdown: string): { headers: string[]; rows: string[][] } | null {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  const headers = splitMarkdownTableRow(lines[0]);
  if (headers.length === 0 || (headers.length === 1 && headers[0] === "")) return null;

  const rows = lines
    .slice(1)
    .filter((line) => !TABLE_SEPARATOR_LINE.test(line))
    .map(splitMarkdownTableRow);

  return { headers, rows };
}
