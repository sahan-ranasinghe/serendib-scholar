import { NextRequest, NextResponse } from "next/server";
import {
  hasPortalAccess,
  mintPortalCookie,
  portalCookieHeader,
  portalPasswordConfigured,
  portalPasswordMatches,
} from "@/lib/portalAuth";

/**
 * The actor's door. POST the password, get a 30-day cookie.
 *
 * GET reports whether this device already has one, so the portal can go
 * straight to the lines instead of asking her again — she should type this
 * once and then not think about it for a month.
 *
 * Fail-secure: no PORTAL_PASSWORD configured means nobody gets in, rather
 * than everybody. The recording tools can rewrite what a child hears.
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    ok: true,
    unlocked: await hasPortalAccess(request.headers.get("cookie")),
    configured: portalPasswordConfigured(),
  });
}

export async function POST(request: NextRequest) {
  if (!portalPasswordConfigured()) {
    console.error("[portal] PORTAL_PASSWORD is not set — refusing to unlock the portal.");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const body = await request.json().catch(() => ({}));
  const supplied = typeof body.password === "string" ? body.password : "";
  if (!portalPasswordMatches(supplied)) {
    return NextResponse.json({ ok: false, error: "wrong_password" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, unlocked: true });
  response.headers.set("Set-Cookie", portalCookieHeader(await mintPortalCookie()));
  return response;
}
