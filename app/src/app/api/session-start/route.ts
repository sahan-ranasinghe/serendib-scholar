import { NextRequest, NextResponse } from "next/server";
import { getActiveChildId } from "@/lib/activeChild";
import {
  DEVICE_COOKIE,
  DEVICE_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  cookieAttributes,
  mintToken,
  readCookie,
  verifyToken,
} from "@/lib/sessionAuth";

/**
 * The ONE unauthenticated API route: where a sitting gets its session
 * cookie. Everything else under /api/* requires that cookie (see proxy.ts).
 *
 * Device gating: the first time a device calls this it must present the
 * shared ACCESS_CODE; a correct code earns a long-lived signed device
 * cookie, and from then on the device gets a fresh 4h session cookie per
 * sitting without re-entering anything. A stranger who finds the deployed
 * URL gets 401s everywhere and a code prompt here.
 *
 * Fail-secure: in production, no ACCESS_CODE configured means NO sessions
 * are issued (better an obvious outage than a silently open deployment).
 * In development the gate is waived so `npm run dev` keeps working.
 */

/** Constant-time-ish comparison — a shared code should not leak by timing. */
function codesMatch(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const configuredCode = (process.env.ACCESS_CODE ?? "").trim();
  const isProduction = process.env.NODE_ENV === "production";
  if (!configuredCode && isProduction) {
    console.error("[session-start] ACCESS_CODE is not set — refusing to issue sessions in production.");
    return NextResponse.json({ ok: false, error: "This deployment is not configured yet." }, { status: 503 });
  }

  const childId = getActiveChildId();
  const cookieHeader = request.headers.get("cookie");
  const body = await request.json().catch(() => ({}));
  const givenCode = typeof body.access_code === "string" ? body.access_code.trim() : "";

  const device = await verifyToken(readCookie(cookieHeader, DEVICE_COOKIE), "device");
  let deviceAllowed = device !== null;
  if (!deviceAllowed && configuredCode && givenCode) {
    deviceAllowed = codesMatch(givenCode, configuredCode);
    if (!deviceAllowed) {
      console.warn("[session-start] Wrong access code attempt.");
      return NextResponse.json({ ok: false, error: "wrong_code" }, { status: 401 });
    }
  }
  if (!deviceAllowed && !configuredCode && !isProduction) {
    deviceAllowed = true; // dev: no code configured, no gate
  }
  if (!deviceAllowed) {
    return NextResponse.json({ ok: false, error: "code_required" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const secure = isProduction;
  const session = await mintToken({ child_id: childId, exp: now + SESSION_TTL_SECONDS, kind: "session" });
  const deviceGrant = await mintToken({ child_id: childId, exp: now + DEVICE_TTL_SECONDS, kind: "device" });

  const response = NextResponse.json({ ok: true, expires_in: SESSION_TTL_SECONDS });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(session)}; ${cookieAttributes(SESSION_TTL_SECONDS, secure)}`,
  );
  response.headers.append(
    "Set-Cookie",
    `${DEVICE_COOKIE}=${encodeURIComponent(deviceGrant)}; ${cookieAttributes(DEVICE_TTL_SECONDS, secure)}`,
  );
  return response;
}
