/**
 * The actor's own front door.
 *
 * /portal and /api/portal/* are gated by PORTAL_PASSWORD and nothing else.
 * Deliberately NOT the child's ACCESS_CODE session: the actor is a
 * different person doing a different job, often on her own phone, and she
 * should never have to open a child's lesson to get a cookie before she
 * can record. The two gates are independent — neither grants the other.
 *
 * A correct password mints a signed cookie good for 30 days, so a two-hour
 * session never interrupts her, and next week's session does not start
 * with a password prompt.
 *
 * Signed with the same HMAC machinery as the session cookie (WebCrypto
 * only, so this runs in the proxy as well as in route handlers), with a
 * distinct token kind so a portal cookie can never be replayed as a child
 * session or the other way round.
 */
import { cookieAttributes, mintToken, readCookie, verifyToken } from "@/lib/sessionAuth";

export const PORTAL_COOKIE = "ss_portal";
export const PORTAL_TTL_SECONDS = 30 * 24 * 60 * 60;

/** The actor is one known person; the cookie only records that she passed the gate. */
const PORTAL_SUBJECT = "voice-actor";

export function portalPasswordConfigured(): boolean {
  return (process.env.PORTAL_PASSWORD ?? "").trim().length > 0;
}

/**
 * Constant-time-ish comparison. Not a defence against a local attacker
 * with a stopwatch — it is one shared password over TLS — but there is no
 * reason to leak the prefix length either.
 */
export function portalPasswordMatches(supplied: string): boolean {
  const configured = (process.env.PORTAL_PASSWORD ?? "").trim();
  if (!configured) return false;
  const a = new TextEncoder().encode(configured);
  const b = new TextEncoder().encode(supplied.trim());
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function mintPortalCookie(): Promise<string> {
  return mintToken({ child_id: PORTAL_SUBJECT, kind: "portal", exp: Math.floor(Date.now() / 1000) + PORTAL_TTL_SECONDS });
}

/** True when this request carries a valid, unexpired portal cookie. */
export async function hasPortalAccess(cookieHeader: string | null): Promise<boolean> {
  const token = readCookie(cookieHeader, PORTAL_COOKIE);
  if (!token) return false;
  return (await verifyToken(token, "portal")) !== null;
}

export function portalCookieHeader(token: string): string {
  return `${PORTAL_COOKIE}=${token}; ${cookieAttributes(PORTAL_TTL_SECONDS, process.env.NODE_ENV === "production")}`;
}
