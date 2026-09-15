import { NextRequest, NextResponse } from "next/server";
import { cookieAttributes, readCookie } from "@/lib/sessionAuth";
import { SMS_MOCK_COOKIE, devMode, newCode, normalisePhone, otpToken, otpTokenMatches, peekMockCode, resolveSmsProvider } from "@/lib/sms";

/**
 * Onboarding step 1 — the phone number and its one-time code.
 *
 *   { action: "send", phone }          a provider is configured: a fresh
 *                                      4-digit code goes out through it;
 *                                      200 only when the gateway accepted
 *                                      it (else 502 send_failed — the
 *                                      screen never says "sent")
 *   { action: "verify", phone, code }  with a provider: the code must
 *                                      match the one sent (10 min); with
 *                                      none: any 4-digit code, and the
 *                                      phone is stored UNVERIFIED
 *   { action: "mock", on }             DEV_MODE only: switch this device
 *                                      onto the mock gateway (harness)
 *   GET ?peek=<phone>                  DEV_MODE + mock only: the last code
 *
 * The verified phone reaches the profile step through the ss_onb_phone
 * cookie as "+94…|1" (verified) or "+94…|0" (unverified).
 */
export const ONBOARDING_PHONE_COOKIE = "ss_onb_phone";
const OTP_COOKIE = "ss_onb_otp";
const secure = () => process.env.NODE_ENV === "production";

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("peek");
  if (!devMode() || !phone) return NextResponse.json({ ok: false, error: "not_available" }, { status: 404 });
  const normalised = normalisePhone(phone);
  const entry = normalised ? peekMockCode(normalised) : null;
  return NextResponse.json({ ok: true, phone: normalised, code: entry?.code ?? null, sends: entry?.sends ?? 0 });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "verify";
  const cookieHeader = request.headers.get("cookie");

  if (action === "mock") {
    if (!devMode()) return NextResponse.json({ ok: false, error: "dev_mode_off" }, { status: 403 });
    const response = NextResponse.json({ ok: true, mock: body.on === true });
    response.headers.set("Set-Cookie", `${SMS_MOCK_COOKIE}=${body.on === true ? "1" : ""}; ${cookieAttributes(body.on === true ? 60 * 60 : 0, secure())}`);
    return response;
  }

  const phone = normalisePhone(typeof body.phone === "string" ? body.phone : "");
  if (!phone) return NextResponse.json({ ok: false, error: "bad_phone" }, { status: 400 });
  const provider = resolveSmsProvider(cookieHeader);

  if (action === "send") {
    if (!provider) return NextResponse.json({ ok: false, error: "no_provider" }, { status: 409 });
    const code = newCode();
    const sent = await provider.sendCode(phone, code);
    if (!sent.ok) return NextResponse.json({ ok: false, error: "send_failed", detail: sent.error, provider: provider.name }, { status: 502 });
    const response = NextResponse.json({ ok: true, sent: true, provider: provider.name, expires_in: 600 });
    response.headers.set("Set-Cookie", `${OTP_COOKIE}=${encodeURIComponent(await otpToken(phone, code))}; ${cookieAttributes(600, secure())}`);
    return response;
  }

  // verify
  const code = typeof body.code === "string" ? body.code.replace(/\D/gu, "") : "";
  if (code.length !== 4) return NextResponse.json({ ok: false, error: "bad_code" }, { status: 400 });
  let verified = false;
  if (provider) {
    if (!(await otpTokenMatches(readCookie(cookieHeader, OTP_COOKIE), phone, code))) return NextResponse.json({ ok: false, error: "wrong_code" }, { status: 401 });
    verified = true;
  }
  const response = NextResponse.json({ ok: true, verified, stub: !provider });
  response.headers.append("Set-Cookie", `${ONBOARDING_PHONE_COOKIE}=${encodeURIComponent(`${phone}|${verified ? 1 : 0}`)}; ${cookieAttributes(60 * 60, secure())}`);
  if (provider) response.headers.append("Set-Cookie", `${OTP_COOKIE}=; ${cookieAttributes(0, secure())}`);
  return response;
}
