import { NextRequest, NextResponse } from "next/server";
import { getActiveChildId } from "@/lib/activeChild";
import { hashPin, pinMatches, pinWellFormed, readChildExtras, writeChildExtras } from "@/lib/childStore";
import { mintParentCookie, parentCookieHeader } from "@/lib/parentAuth";

/**
 * The parent zone's door. POST the PIN, get a day's cookie. When no PIN
 * exists yet the first POST SETS it (the gate's first use) and unlocks.
 */
export async function POST(request: NextRequest) {
  const childId = await getActiveChildId();
  const body = await request.json().catch(() => ({}));
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!pinWellFormed(pin)) return NextResponse.json({ ok: false, error: "bad_pin" }, { status: 400 });
  const extras = await readChildExtras(childId);
  let created = false;
  if (!extras.parentPinHash) {
    await writeChildExtras(childId, { parentPinHash: await hashPin(pin, childId) });
    created = true;
  } else if (!(await pinMatches(pin, childId, extras.parentPinHash))) {
    return NextResponse.json({ ok: false, error: "wrong_pin" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, created });
  response.headers.set("Set-Cookie", parentCookieHeader(await mintParentCookie(childId)));
  return response;
}
