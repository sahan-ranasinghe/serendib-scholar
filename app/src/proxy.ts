import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE, SESSION_COOKIE, readCookie, verifyToken } from "@/lib/sessionAuth";
import { hasPortalAccess } from "@/lib/portalAuth";
import { HARNESS_HEADER } from "@/lib/harness";
import { t } from "@/lib/appCopy";
import { cmsArea, cmsGateVerdict } from "@/cms/routes";

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
 *
 *    THE HARNESS IS NOT A CHILD. One headless session walks a whole
 *    lesson in twenty minutes and spends hundreds of requests doing it;
 *    a check that was killed leaves a browser polling behind it. Sharing
 *    the 60/min bucket with the phone in the room meant three runs hung
 *    on a limit that was never meant for them. So harness traffic carries
 *    its own identity — the header in src/lib/harness.ts, holding the value of
 *    HARNESS_TOKEN — and is counted in its own per-IP bucket at
 *    HARNESS_LIMIT_PER_MINUTE. This is a BUDGET, not a door: it changes
 *    which bucket the request is counted in and nothing else. Every
 *    authentication check below still applies, unchanged.
 *
 *    HARNESS_TOKEN unset (the production default) means the header is
 *    ignored entirely — there is no way to opt into the bigger bucket on
 *    a server that has not deliberately configured one.
 *
 * 3. THE CMS (30 Sep 2026, docs/cms/SETUP.md). Payload's panel (/admin) and
 *    its API (/api/payload) are a third door with a lock of their own: the
 *    DEVICE grant — the ss_device cookie a device earns by entering
 *    ACCESS_CODE once — and nothing else. A child's session cookie does not
 *    open it and the actor's portal cookie does not either. Past this door
 *    Payload asks for its own login, so the panel needs both. A page view
 *    with no grant is sent to /device-gate (the app's own access-code entry)
 *    and returned afterwards; every other request is refused with a 401.
 *    "Create first user" and its endpoint are closed to everyone (403): the
 *    first admin comes from the seed script, never from the panel.
 *    The app's QA galleries under /admin are not Payload's and are left as
 *    they were (src/cms/routes.ts names them). The panel's API is counted in
 *    its own per-IP bucket: an editor's afternoon must not spend the 60/min
 *    a child's phone on the same wifi lives on, nor the reverse.
 */

// /api/build carries no child data — it is the running build's identity, and
// the update banner must be able to ask for it before any session exists.
const PUBLIC_API_ROUTES = new Set(["/api/session-start", "/api/build"]);
const IP_LIMIT_PER_MINUTE = 60;
/** A whole headless lesson, its drills and its screenshots, with room for a second check on the same machine. */
const HARNESS_LIMIT_PER_MINUTE = 6_000;
/** The CMS panel's API: a person editing, not a lesson — list views, preferences and document locks add up. */
const CMS_LIMIT_PER_MINUTE = 300;
const RATE_CHECK_TIMEOUT_MS = 400;

/**
 * Is this request a harness's? Only when the server has a HARNESS_TOKEN
 * configured AND the header carries exactly it. The comparison is a plain
 * one: the secret guards a rate BUDGET, not data, so the timing of a
 * mismatch tells an attacker nothing worth having.
 */
function isHarness(request: NextRequest): boolean {
  const token = (process.env.HARNESS_TOKEN ?? "").trim();
  return token.length > 0 && request.headers.get(HARNESS_HEADER) === token;
}

async function takeIpToken(ip: string, limit: number, bucketPrefix: string): Promise<"allowed" | "limited" | "unknown"> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return "unknown";
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  const bucket = `${bucketPrefix}:${ip}`;
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
    if (!windowExpired && row.count >= limit) return "limited";
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

/** Has this device passed the ACCESS_CODE gate? (Development with no code configured has no gate — as in /api/session-start.) */
async function deviceGrant(cookieHeader: string | null): Promise<{ granted: boolean; waived: boolean }> {
  const device = await verifyToken(readCookie(cookieHeader, DEVICE_COOKIE), "device");
  const waived = !(process.env.ACCESS_CODE ?? "").trim() && process.env.NODE_ENV !== "production";
  return { granted: device !== null, waived };
}

export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const cms = cmsArea(path);
  // Payload's panel: the device gate, then Payload's own login. (Pages are not rate-limited here, the panel's included.)
  if (cms === "panel") {
    const { granted, waived } = await deviceGrant(request.headers.get("cookie"));
    const gate = cmsGateVerdict({ path, search: request.nextUrl.search, method: request.method, deviceGranted: granted, waived });
    if (gate.action === "pass") return NextResponse.next();
    if (gate.action === "redirect") return NextResponse.redirect(new URL(gate.to, request.url));
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  if (!path.startsWith("/api/")) return NextResponse.next();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const harness = isHarness(request);
  const verdict = harness
    ? await takeIpToken(ip, HARNESS_LIMIT_PER_MINUTE, "harness")
    : cms === "api"
      ? await takeIpToken(ip, CMS_LIMIT_PER_MINUTE, "cms")
      : await takeIpToken(ip, IP_LIMIT_PER_MINUTE, "ip");
  if (verdict === "limited") {
    console.warn(`[proxy] 429 ${harness ? "harness-limit" : "ip-limit"} ${ip} ${path}`);
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: t("app.rateLimited") },
      { status: 429 },
    );
  }

  if (PUBLIC_API_ROUTES.has(path)) return NextResponse.next();

  // Payload's API: the device grant and only it; Payload then checks its own user and that user's role.
  if (cms === "api") {
    const { granted, waived } = await deviceGrant(request.headers.get("cookie"));
    const gate = cmsGateVerdict({ path, method: request.method, deviceGranted: granted, waived });
    if (gate.action === "pass") return NextResponse.next();
    return NextResponse.json({ ok: false, error: gate.action === "deny" ? gate.error : "device_required" }, { status: gate.action === "deny" ? gate.status : 401 });
  }

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
  if (path.startsWith("/api/parent/") || path.startsWith("/api/onboarding/") || path.startsWith("/api/child/")) {
    const device = await verifyToken(readCookie(cookieHeader, DEVICE_COOKIE), "device");
    const waived = !(process.env.ACCESS_CODE ?? "").trim() && process.env.NODE_ENV !== "production";
    if (device || waived) return NextResponse.next();
  }
  return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*"],
};
