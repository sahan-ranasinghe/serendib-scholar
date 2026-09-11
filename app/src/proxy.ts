import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE, SESSION_COOKIE, readCookie, verifyToken } from "@/lib/sessionAuth";
import { hasPortalAccess } from "@/lib/portalAuth";

/**
 * The API's front door (Next 16's proxy — the artist formerly known as
 * middleware). Two jobs, both deny-by-default:
 *
 * 1. AUTHENTICATION. Every /api/* request must carry a valid signed
 *    session cookie (see src/lib/sessionAuth.ts). The ONLY exception is
 *    /api/session-start, where that cookie comes from. New routes are
 *    protected the day they are created — nobody has to remember to add a
 *    check.
 *
 *    /api/portal/* is the one branch gated DIFFERENTLY rather than not at
 *    all: it needs the voice actor's own cookie (PORTAL_PASSWORD, see
 *    src/lib/portalAuth.ts) and specifically NOT a child session. She is
 *    not a child and must not have to start a lesson to earn a cookie
 *    before she can record; equally, a child's session must not open the
 *    door to the recording tools. Neither cookie is accepted for the
 *    other's routes.
 *
 * 2. PER-IP RATE LIMIT: 60 requests/min across all API routes, counted in
 *    the api_rate_limits table (see supabase/schema.sql) so the count
 *    holds across serverless instances. The check fails OPEN on a DB
 *    error or slow response (>400ms): a rate limiter must never become
 *    the outage, and every failure is logged loudly. Every 429 is logged.
 */

const PUBLIC_API_ROUTES = new Set(["/api/session-start"]);
const IP_LIMIT_PER_MINUTE = 60;
const RATE_CHECK_TIMEOUT_MS = 400;

async function takeIpToken(ip: string): Promise<"allowed" | "limited" | "unknown"> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return "unknown";
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  const bucket = `ip:${ip}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RATE_CHECK_TIMEOUT_MS);
  try {
    const rowResponse = await fetch(
      `${supabaseUrl}/rest/v1/api_rate_limits?bucket=eq.${encodeURIComponent(bucket)}&select=window_started_at,count`,
      { headers, signal: controller.signal },
    );
    if (!rowResponse.ok) throw new Error(`lookup ${rowResponse.status}`);
    const rows = (await rowResponse.json()) as Array<{ window_started_at: string; count: number }>;
    const now = Date.now();
    const row = rows[0];
    const windowExpired = !row || now - new Date(row.window_started_at).getTime() > 60_000;
    if (!windowExpired && row.count >= IP_LIMIT_PER_MINUTE) return "limited";
    // Not atomic — two racing requests can both count as the same slot.
    // Fine for a limiter meant to stop abuse, not to bill by the request.
    const write = windowExpired
      ? { bucket, window_started_at: new Date(now).toISOString(), count: 1 }
      : { bucket, window_started_at: row.window_started_at, count: row.count + 1 };
    await fetch(`${supabaseUrl}/rest/v1/api_rate_limits`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(write),
      signal: controller.signal,
    });
    return "allowed";
  } catch (error) {
    console.error(`[proxy] IP rate check unavailable (failing open): ${String(error).slice(0, 120)}`);
    return "unknown";
  } finally {
    clearTimeout(timeout);
  }
}

export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/api/")) return NextResponse.next();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const verdict = await takeIpToken(ip);
  if (verdict === "limited") {
    console.warn(`[proxy] 429 ip-limit ${ip} ${path}`);
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "පොඩ්ඩක් ඉන්න — ටිකකින් ආයෙ උත්සාහ කරන්න." },
      { status: 429 },
    );
  }

  if (PUBLIC_API_ROUTES.has(path)) return NextResponse.next();

  // The actor's routes: her cookie, and only hers. /api/portal/enter is
  // where that cookie is minted, so it cannot require one.
  if (path.startsWith("/api/portal/")) {
    if (path === "/api/portal/enter") return NextResponse.next();
    if (await hasPortalAccess(request.headers.get("cookie"))) return NextResponse.next();
    return NextResponse.json({ ok: false, error: "portal_locked" }, { status: 401 });
  }

  const cookieHeader = request.headers.get("cookie");
  const session = await verifyToken(readCookie(cookieHeader, SESSION_COOKIE), "session");
  if (session) return NextResponse.next();

  // The parent zone and onboarding are used without a lesson running, so a
  // lesson's 4h session cookie is not the right key. The device grant (this
  // device passed the ACCESS_CODE gate) is; the routes themselves then check
  // the parent's PIN cookie where one has been set. In development with no
  // ACCESS_CODE configured, session-start waives the gate — so do these.
  if (path.startsWith("/api/parent/") || path.startsWith("/api/onboarding/")) {
    const device = await verifyToken(readCookie(cookieHeader, DEVICE_COOKIE), "device");
    const waived = !(process.env.ACCESS_CODE ?? "").trim() && process.env.NODE_ENV !== "production";
    if (device || waived) return NextResponse.next();
  }
  return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
}

export const config = {
  matcher: "/api/:path*",
};
