import { NextRequest, NextResponse } from "next/server";
import type { MarkerShape } from "@/lib/board";
import { parseRegionHint } from "@/lib/regionHint";

const MAX_DESCRIPTION_LENGTH = 200;
const VALID_SHAPES: MarkerShape[] = ["circle", "underline", "arrow", "box"];

/**
 * Executes the model's draw_marker tool call — a hand-drawn-style
 * circle/underline/arrow/box over the currently-shown page image, using
 * the same directional-keyword heuristic as zoom_to_region/highlight_region
 * (src/lib/regionHint.ts) for placement — no vision call, not
 * pixel-precise. See zoom-to-region/route.ts for why this is a viewPatch,
 * not a full board (the route doesn't know what's currently displayed).
 */
export async function POST(request: NextRequest) {
  const { shape, description } = await request.json();

  if (typeof shape !== "string" || !VALID_SHAPES.includes(shape as MarkerShape)) {
    return NextResponse.json(
      { ok: false, error: `shape must be one of: ${VALID_SHAPES.join(", ")}` },
      { status: 400 },
    );
  }
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
  return NextResponse.json({
    ok: true,
    viewPatch: { marker: { shape: shape as MarkerShape, label: description, focus } },
  });
}
