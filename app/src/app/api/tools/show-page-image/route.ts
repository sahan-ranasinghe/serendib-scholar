import { NextRequest, NextResponse } from "next/server";
import type { BoardContent } from "@/lib/board";
import { DEFAULT_PAGE_IMAGE_VIEW } from "@/lib/board";
import { filePrefixFromSourceReference, lookupPageImage } from "@/lib/pageImageLookup";

/**
 * Executes the model's show_page_image tool call — looks up the real
 * stored page image (see scripts/ingest-syllabus.ts) for a specific page
 * within a search_syllabus result, and returns it for the board to display.
 */
export async function POST(request: NextRequest) {
  const { source_reference, page_number } = await request.json();

  if (typeof source_reference !== "string" || !source_reference || typeof page_number !== "number") {
    return NextResponse.json(
      { ok: false, error: "source_reference (string) and page_number (number) are required" },
      { status: 400 },
    );
  }

  const filePrefix = filePrefixFromSourceReference(source_reference);
  let image;
  try {
    image = await lookupPageImage(filePrefix, page_number);
  } catch (error) {
    console.error("[show-page-image] Supabase error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
  }

  if (!image) {
    return NextResponse.json({ ok: false, error: "No image available for this page." });
  }

  const board: BoardContent = {
    type: "page_image",
    imageUrl: image.imageUrl,
    pageNumber: image.pageNumber,
    printedPageNumber: image.printedPageNumber,
    sourceReference: filePrefix,
    // Fresh content — any zoom/highlight left over from a previous page
    // doesn't carry forward.
    view: DEFAULT_PAGE_IMAGE_VIEW,
  };
  return NextResponse.json({ ok: true, board });
}
