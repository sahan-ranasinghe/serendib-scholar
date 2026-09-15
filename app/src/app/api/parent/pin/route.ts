import { NextRequest, NextResponse } from "next/server";
import { hashPin, pinMatches, pinWellFormed, writeChildExtras } from "@/lib/childStore";
import { PARENT_COOKIE, clearCookieHeader, mintParentCookie, parentCookieHeader } from "@/lib/parentAuth";
import { getActiveChildId } from "@/lib/activeChild";
import { parentGuard } from "../_guard";

/** Constant-time-ish comparison for the device's access code. */
function codesMatch(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Create / change the parent PIN: { current?, pin }. Reset a forgotten one:
 * { reset: true, access_code } — the device's ACCESS_CODE (the parent who
 * set the device up knows it) clears the hash; the zone then asks to
 * create a PIN again. In development with no ACCESS_CODE configured the
 * reset is waived, as the device gate is.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (body.reset === true) {
    const childId = await getActiveChildId();
    const configured = (process.env.ACCESS_CODE ?? "").trim();
    const given = typeof body.access_code === "string" ? body.access_code.trim() : "";
    const waived = !configured && process.env.NODE_ENV !== "production";
    if (!waived && !codesMatch(given, configured)) return NextResponse.json({ ok: false, error: "wrong_code" }, { status: 401 });
    const written = await writeChildExtras(childId, { parentPinHash: null });
    const response = NextResponse.json({ ok: true, reset: true, source: written.source });
    response.headers.set("Set-Cookie", clearCookieHeader(PARENT_COOKIE));
    return response;
  }
  const guard = await parentGuard(request);
  if (guard instanceof NextResponse) return guard;
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const current = typeof body.current === "string" ? body.current.trim() : "";
  if (!pinWellFormed(pin)) return NextResponse.json({ ok: false, error: "bad_pin" }, { status: 400 });
  if (guard.extras.parentPinHash && !(await pinMatches(current, guard.childId, guard.extras.parentPinHash))) {
    return NextResponse.json({ ok: false, error: "wrong_pin" }, { status: 401 });
  }
  const written = await writeChildExtras(guard.childId, { parentPinHash: await hashPin(pin, guard.childId) });
  const response = NextResponse.json({ ok: true, source: written.source });
  response.headers.set("Set-Cookie", parentCookieHeader(await mintParentCookie(guard.childId)));
  return response;
}
