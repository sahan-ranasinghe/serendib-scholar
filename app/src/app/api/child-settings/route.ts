import { NextRequest, NextResponse } from "next/server";
import { requireChild } from "@/lib/requireChild";
import { writeChildExtras } from "@/lib/childStore";

/** The session's සි toggle: persists captions on/off for this child. */
export async function POST(request: NextRequest) {
  const child = await requireChild();
  if (child instanceof NextResponse) return child;
  const childId = child;
  const body = await request.json().catch(() => ({}));
  if (typeof body.captions !== "boolean") return NextResponse.json({ ok: false, error: "captions (boolean) required" }, { status: 400 });
  const written = await writeChildExtras(childId, { settings: { captions: body.captions } });
  return NextResponse.json({ ok: true, settings: written.settings, source: written.source });
}
