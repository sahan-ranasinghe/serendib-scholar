import { NextRequest, NextResponse } from "next/server";
import type { BoardContent } from "@/lib/board";
import { DEFAULT_PAGE_IMAGE_VIEW } from "@/lib/board";
import { lookupAdjacentPageImage } from "@/lib/pageImageLookup";

/**
 * Executes the model's previous_page tool call — see next-page/route.ts's
 * comment (same no-parameter-from-the-model design, mirrored direction).
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
    image = await lookupAdjacentPageImage(source_reference, current_page_number, "previous");
  } catch (error) {
    console.error("[previous-page] Supabase error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
  }

  if (!image) {
    return NextResponse.json({ ok: false, error: "This is already the first page with an image in this file." });
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
