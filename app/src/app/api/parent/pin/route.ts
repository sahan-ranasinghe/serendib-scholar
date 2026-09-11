import { NextRequest, NextResponse } from "next/server";
import { hashPin, pinMatches, pinWellFormed, writeChildExtras } from "@/lib/childStore";
import { mintParentCookie, parentCookieHeader } from "@/lib/parentAuth";
import { parentGuard } from "../_guard";

/** Change (or first set) the parent PIN: { current?, pin }. */
export async function POST(request: NextRequest) {
  const guard = await parentGuard(request);
  if (guard instanceof NextResponse) return guard;
  const body = await request.json().catch(() => ({}));
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
