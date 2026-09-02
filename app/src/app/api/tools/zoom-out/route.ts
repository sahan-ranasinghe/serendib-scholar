import { NextResponse } from "next/server";

/** Executes the model's zoom_out tool call — returns to the default (unzoomed) view of whatever image is currently shown. See zoom-to-region/route.ts for why this is a viewPatch, not a full board. */
export async function POST() {
  return NextResponse.json({ ok: true, viewPatch: { zoom: 1, zoomFocus: null } });
}
