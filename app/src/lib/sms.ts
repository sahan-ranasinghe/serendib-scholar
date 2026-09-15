import "server-only";
import { readCookie } from "@/lib/sessionAuth";

/**
 * The SMS gateway behind onboarding step 1 (phone + one-time code).
 *
 * Nothing is wired to a real network yet. SMS_PROVIDER picks the adapter:
 *   unset      → no provider: step 1 shows its dev notice, takes any
 *                4-digit code and stores the phone as UNVERIFIED
 *   "dialog" | "mobitel" | "twilio"
 *              → the gateway adapters — TODO: real Dialog / Mobitel
 *                gateway or Twilio calls; today each is a no-op that
 *                reports not_implemented, so the screen can never say a
 *                code was sent
 *   "mock"     → an in-memory double for the harness (DEV_MODE only): the
 *                "sent" code is kept per phone and readable through the
 *                OTP route's DEV_MODE peek
 * In DEV_MODE a device may also switch the mock on with the ss_sms_mock
 * cookie (the harness drills both states against one server).
 *
 * A code is never stored in clear: the OTP route keeps an HMAC of
 * phone + code in a short-lived cookie and compares on verify.
 */
export interface SmsProvider {
  readonly name: string;
  /** Deliver `code` to `phone` (E.164). Resolves ok only when the gateway accepted the message. */
  sendCode(phone: string, code: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

/** TODO: the real gateway (Dialog / Mobitel SMS gateway, or Twilio). Until then every send is refused, honestly. */
class NoopSmsProvider implements SmsProvider {
  constructor(readonly name: string) {}
  async sendCode(phone: string): Promise<{ ok: false; error: string }> {
    console.warn(`[sms:${this.name}] no gateway is wired yet — refusing to pretend a code went to ${phone.slice(0, 5)}…`);
    return { ok: false, error: "not_implemented" };
  }
}

/** The harness's double: records what would have been sent. */
class MockSmsProvider implements SmsProvider {
  readonly name = "mock";
  private static readonly sent = new Map<string, { code: string; sends: number }>();
  async sendCode(phone: string, code: string): Promise<{ ok: true }> {
    const entry = MockSmsProvider.sent.get(phone);
    MockSmsProvider.sent.set(phone, { code, sends: (entry?.sends ?? 0) + 1 });
    return { ok: true };
  }
  static peek(phone: string): { code: string; sends: number } | null {
    return MockSmsProvider.sent.get(phone) ?? null;
  }
}

export const SMS_MOCK_COOKIE = "ss_sms_mock";

export function devMode(): boolean {
  return (process.env.DEV_MODE ?? "").trim() === "on";
}

/** The provider for this request, or null when SMS verification is not active. */
export function resolveSmsProvider(cookieHeader: string | null): SmsProvider | null {
  const configured = (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
  if (devMode() && (configured === "mock" || readCookie(cookieHeader, SMS_MOCK_COOKIE) === "1")) return new MockSmsProvider();
  if (configured === "dialog" || configured === "mobitel" || configured === "twilio") return new NoopSmsProvider(configured);
  if (configured === "mock") console.warn("[sms] SMS_PROVIDER=mock is ignored outside DEV_MODE");
  return null;
}

export function peekMockCode(phone: string): { code: string; sends: number } | null {
  return MockSmsProvider.peek(phone);
}

/** +94XXXXXXXXX from whatever the parent typed (0771234567, 771234567, 94771234567). */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/gu, "").replace(/^0094/u, "94").replace(/^94/u, "").replace(/^0/u, "");
  return digits.length === 9 ? `+94${digits}` : null;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = (process.env.SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ss-otp-v1:${secret}`));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/** `${expiresAt}.${hmac(phone|code|expiresAt)}` — what the OTP cookie holds. */
export async function otpToken(phone: string, code: string, ttlSeconds = 600): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(`${phone}|${code}|${exp}`));
  return `${exp}.${Buffer.from(mac).toString("base64url")}`;
}

export async function otpTokenMatches(token: string | null, phone: string, code: string): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = await otpToken(phone, code, 0).then((t) => t.slice(t.indexOf(".") + 1)).catch(() => "");
  // recompute with the same expiry as the token carries
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(`${phone}|${code}|${exp}`));
  const mine = Buffer.from(mac).toString("base64url");
  const theirs = token.slice(dot + 1);
  if (mine.length !== theirs.length || expected.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < mine.length; i += 1) diff |= mine.charCodeAt(i) ^ theirs.charCodeAt(i);
  return diff === 0;
}

export function newCode(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(1000 + (n[0]! % 9000));
}
