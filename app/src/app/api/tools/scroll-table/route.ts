import { NextRequest, NextResponse } from "next/server";

/**
 * Executes the model's scroll_table tool call — scrolls a currently-shown
 * wide table left/right. Simplified to "jump to that edge" rather than
 * modeling an incremental scroll amount, since that would need the current
 * scroll position tracked and round-tripped from the client; a table wide
 * enough to need this is short enough that "start"/"end" covers the real
 * use case. See zoom-to-region/route.ts for why this returns a viewPatch.
 */
export async function POST(request: NextRequest) {
  const { direction } = await request.json();

  if (direction !== "left" && direction !== "right") {
    return NextResponse.json({ ok: false, error: 'direction must be "left" or "right"' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, viewPatch: { scrollTo: direction === "left" ? "start" : "end" } });
}
