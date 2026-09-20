import { NextResponse } from "next/server";
import { paidCallCounts } from "@/lib/paidCalls";

export const dynamic = "force-dynamic";

/**
 * GET /api/paid-calls — what this server process has allowed and refused at the paid-call gate (src/lib/paidCalls.ts)
 * since it started. Counts only, no content: the harnesses read it to assert a full session spent nothing
 * (allowed must be empty, or hold only `chat`).
 */
export async function GET() {
  return NextResponse.json({ ok: true, ...paidCallCounts(), switches: { CLIP_RENDER: process.env.CLIP_RENDER === "on" ? "on" : "off", VOICE_ASSESSMENT: process.env.VOICE_ASSESSMENT === "on" ? "on" : "off" } }, { headers: { "Cache-Control": "no-store" } });
}
