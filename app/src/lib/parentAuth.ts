/**
 * The parent zone's door: a 4-digit PIN (hashed per child, see
 * childStore.ts) earns a signed ss_parent cookie for a day. Until a PIN has
 * been set the zone is open to whoever holds the device — the first thing
 * the gate offers is setting one.
 *
 * Same HMAC machinery as the session cookie (WebCrypto only), with its own
 * token kind so a parent cookie never verifies as a child session or the
 * reverse.
 */
import { cookieAttributes, mintToken, readCookie, verifyToken } from "@/lib/sessionAuth";

export const PARENT_COOKIE = "ss_parent";
export const PARENT_TTL_SECONDS = 24 * 60 * 60;
export const CHILD_TTL_SECONDS = 180 * 24 * 60 * 60;

export async function mintParentCookie(childId: string): Promise<string> {
  return mintToken({ child_id: childId, kind: "parent", exp: Math.floor(Date.now() / 1000) + PARENT_TTL_SECONDS });
}

/** True when the request carries a valid parent grant for this child. */
export async function hasParentAccess(cookieHeader: string | null, childId: string): Promise<boolean> {
  const claims = await verifyToken(readCookie(cookieHeader, PARENT_COOKIE), "parent");
  return claims !== null && claims.child_id === childId;
}

export function parentCookieHeader(token: string): string {
  return `${PARENT_COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes(PARENT_TTL_SECONDS, process.env.NODE_ENV === "production")}`;
}

export async function mintChildCookie(childId: string): Promise<string> {
  return mintToken({ child_id: childId, kind: "child", exp: Math.floor(Date.now() / 1000) + CHILD_TTL_SECONDS });
}

export function childCookieHeader(token: string): string {
  return `ss_child=${encodeURIComponent(token)}; ${cookieAttributes(CHILD_TTL_SECONDS, process.env.NODE_ENV === "production")}`;
}

export function clearCookieHeader(name: string): string {
  return `${name}=; ${cookieAttributes(0, process.env.NODE_ENV === "production")}`;
}
