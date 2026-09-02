import { NextRequest, NextResponse } from "next/server";
import type { BoardContent } from "@/lib/board";
import { DEFAULT_TABLE_VIEW } from "@/lib/board";

// Generous cap — real transcribed tables are small (a textbook page's worth
// of rows), this just guards against something pathological breaking layout.
const MAX_MARKDOWN_TABLE_LENGTH = 4000;

/**
 * Executes the model's show_table tool call — passes real markdown table
 * text (as produced by vision transcription, see scripts/ingest-syllabus.ts)
 * through for the board to parse and render as an HTML table. No rendering
 * happens here; TeachingBoard.tsx does the markdown -> table parsing
 * (src/lib/board.ts's parseMarkdownTable) so this stays a plain data pass-through.
 */
export async function POST(request: NextRequest) {
  const { markdown_table_text } = await request.json();

  if (typeof markdown_table_text !== "string" || !markdown_table_text.trim()) {
    return NextResponse.json(
      { ok: false, error: "markdown_table_text (non-empty string) is required" },
      { status: 400 },
    );
  }
  if (markdown_table_text.length > MAX_MARKDOWN_TABLE_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `markdown_table_text is too long (max ${MAX_MARKDOWN_TABLE_LENGTH} chars)` },
      { status: 400 },
    );
  }

  const board: BoardContent = { type: "table", markdownTableText: markdown_table_text, view: DEFAULT_TABLE_VIEW };
  return NextResponse.json({ ok: true, board });
}
