import { NextRequest, NextResponse } from "next/server";
import { parseRegionHint } from "@/lib/regionHint";

const MAX_REGION_LENGTH = 200;

/**
 * Executes the model's zoom_to_region tool call. This is a view-state patch,
 * not new content — the route has no idea what's currently on the board
 * (stateless, no session), so unlike show_page_image etc. it returns a
 * `viewPatch` for the board patcher to merge into whatever page_image is
 * already displayed, rather than a full `board` object.
 */
export async function POST(request: NextRequest) {
  const { region } = await request.json();

  if (region !== undefined && typeof region !== "string") {
    return NextResponse.json({ ok: false, error: "region, if provided, must be a string" }, { status: 400 });
  }
  if (typeof region === "string" && region.length > MAX_REGION_LENGTH) {
    return NextResponse.json({ ok: false, error: `region is too long (max ${MAX_REGION_LENGTH} chars)` }, { status: 400 });
  }

  const zoomFocus = parseRegionHint(region);
  return NextResponse.json({ ok: true, viewPatch: { zoom: 2, zoomFocus } });
}
