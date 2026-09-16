import { NextResponse } from "next/server";
import { buildInfo } from "@/lib/buildInfo";

/**
 * What build the SERVER is running, right now. A page compares it with its
 * own stamp (the ss-build meta tag) and shows the update banner when they
 * differ. Never cached — by the browser, or by the service worker (every
 * /api/* response is excluded there).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ...buildInfo() }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
