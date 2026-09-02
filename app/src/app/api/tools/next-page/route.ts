import { NextRequest, NextResponse } from "next/server";
import type { BoardContent } from "@/lib/board";
import { DEFAULT_PAGE_IMAGE_VIEW } from "@/lib/board";
import { lookupAdjacentPageImage } from "@/lib/pageImageLookup";

/**
 * Executes the model's next_page tool call. Declared with no parameters in
 * geminiLiveTools.ts — the model just says "next page," it doesn't track
 * technical IDs — so useGeminiLive.ts injects source_reference and
 * current_page_number from the board's own tracked state before this
 * route ever sees the request (see its TOOL_ENDPOINTS handling).
 */
export async function POST(request: NextRequest) {
  const { source_reference, current_page_number } = await request.json();

  if (typeof source_reference !== "string" || !source_reference || typeof current_page_number !== "number") {
    return NextResponse.json(
      { ok: false, error: "No page is currently shown to navigate from." },
      { status: 400 },
    );
  }

  let image;
  try {
    image = await lookupAdjacentPageImage(source_reference, current_page_number, "next");
  } catch (error) {
    console.error("[next-page] Supabase error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
  }

  if (!image) {
    return NextResponse.json({ ok: false, error: "This is already the last page with an image in this file." });
  }

  const board: BoardContent = {
    type: "page_image",
    imageUrl: image.imageUrl,
    pageNumber: image.pageNumber,
    printedPageNumber: image.printedPageNumber,
    sourceReference: source_reference,
    view: DEFAULT_PAGE_IMAGE_VIEW,
  };
  return NextResponse.json({ ok: true, board });
}
