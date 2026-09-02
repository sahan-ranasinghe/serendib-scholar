import { NextRequest, NextResponse } from "next/server";
import { parseRegionHint } from "@/lib/regionHint";

const MAX_DESCRIPTION_LENGTH = 200;

/**
 * Executes the model's highlight_region tool call — a simple, approximate
 * overlay label (+ optional focus point via the same directional heuristic
 * as zoom_to_region, see src/lib/regionHint.ts) marking whatever part of
 * the current image or table the model is talking about. Applies to either
 * board content type — useGeminiLive.ts merges this viewPatch into
 * whichever one is currently shown (see zoom-to-region/route.ts for why
 * this route returns a patch rather than a full board).
 */
export async function POST(request: NextRequest) {
  const { description } = await request.json();

  if (typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ ok: false, error: "description (non-empty string) is required" }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `description is too long (max ${MAX_DESCRIPTION_LENGTH} chars)` },
      { status: 400 },
    );
  }

  const focus = parseRegionHint(description);
  return NextResponse.json({ ok: true, viewPatch: { highlight: { label: description, focus } } });
}
