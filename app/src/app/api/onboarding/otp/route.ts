import { NextRequest, NextResponse } from "next/server";
import { cookieAttributes } from "@/lib/sessionAuth";

/**
 * Onboarding step 1. There is no SMS provider yet: with
 * DEV_ONBOARDING=stub any six digits pass and the phone is remembered for
 * the profile step (children.parent_contact); without the stub the step
 * reports "not_available" and the screen says ළඟදීම. Nothing here
 * pretends a code was checked.
 */
export const ONBOARDING_PHONE_COOKIE = "ss_onb_phone";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const phone = typeof body.phone === "string" ? body.phone.replace(/\D/gu, "") : "";
  const code = typeof body.code === "string" ? body.code.replace(/\D/gu, "") : "";
  if ((process.env.DEV_ONBOARDING ?? "").trim() !== "stub") {
    return NextResponse.json({ ok: false, error: "not_available" }, { status: 503 });
  }
  if (phone.length < 9 || code.length !== 6) return NextResponse.json({ ok: false, error: "bad_input" }, { status: 400 });
  const response = NextResponse.json({ ok: true, stub: true });
  response.headers.set("Set-Cookie", `${ONBOARDING_PHONE_COOKIE}=${encodeURIComponent(`+94${phone.replace(/^0/u, "").replace(/^94/u, "")}`)}; ${cookieAttributes(60 * 60, process.env.NODE_ENV === "production")}`);
  return response;
}
