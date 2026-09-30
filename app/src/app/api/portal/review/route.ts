import { NextRequest, NextResponse } from "next/server";
import { setTakeReview } from "@/lib/actorStore";
import { portalLineById } from "@/lib/portalLines";

/**
 * A reviewer's verdict on a kept take — approve or reject — from /portal/status (29 Sep 2026). Behind the portal
 * password like every /api/portal/* route (src/proxy.ts). Only an APPROVED take is served to a child under
 * VOICE_PROFILE=human; a rejected one stays in storage (and in the portal, to be recorded again) but is never served.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const lineId = typeof body.line_id === "string" ? body.line_id : "";
  const verdict = body.verdict === "approve" ? "approved" : body.verdict === "reject" ? "rejected" : null;
  if (!lineId || !verdict) return NextResponse.json({ ok: false, error: "line_id and verdict (approve | reject) are required" }, { status: 400 });
  const line = await portalLineById(lineId);
  if (!line) return NextResponse.json({ ok: false, error: `no such line: ${lineId}` }, { status: 404 });
  const changed = await setTakeReview(line.clipKey, verdict);
  if (changed === 0) return NextResponse.json({ ok: false, error: "no kept take of this line to review" }, { status: 409 });
  return NextResponse.json({ ok: true, verdict, takes: changed });
}
