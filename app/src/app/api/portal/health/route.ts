import { NextResponse } from "next/server";
import { portalHealth } from "@/lib/portalHealth";

/**
 * Proves the recording path works, end to end, before she finds out it
 * doesn't. Surfaced on /portal/status.
 */
export const runtime = "nodejs";

export async function GET() {
  const health = await portalHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
