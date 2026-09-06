import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readCookie, verifyToken } from "@/lib/sessionAuth";

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

  const session = await verifyToken(readCookie(request.headers.get("cookie"), SESSION_COOKIE), "session");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
