/**
 * Session authentication for the API surface.
 *
 * Every /api/* route except /api/session-start requires a signed session
 * cookie (enforced centrally in proxy.ts, and again inside the routes that
 * spend money). The cookie is minted once per sitting by /api/session-start,
 * is HttpOnly, HMAC-signed, bound to the child it was issued for, and
 * expires after four hours.
 *
 * Device gating: until real parent auth exists, session-start itself is
 * gated by ACCESS_CODE — a shared code entered once per device and then
 * remembered in a second signed cookie — so the deployed URL is useless to
 * a stranger who finds it.
 *
 * Everything here uses WebCrypto only (no node:crypto): the same module
 * runs in the proxy (edge-style runtime) and in Node route handlers.
 */

export const SESSION_COOKIE = "ss_session";
export const DEVICE_COOKIE = "ss_device";
export const SESSION_TTL_SECONDS = 4 * 60 * 60;
export const DEVICE_TTL_SECONDS = 180 * 24 * 60 * 60;

export interface SessionClaims {
  /** The child this session was issued for. */
  child_id: string;
  /** Unix seconds. */
  exp: number;
  /**
   * What kind of grant this is. "portal" is the voice actor's own gate
   * (PORTAL_PASSWORD, src/lib/portalAuth.ts) — a separate door for a
   * separate person, and listing it here is what stops a portal cookie
   * from ever verifying as a child session, or the reverse. "child" is the
   * onboarding grant (which child this device belongs to — see
   * activeChild.ts) and "parent" the PIN grant for the parent zone.
   */
  kind: "session" | "device" | "portal" | "child" | "parent";
}

/**
 * The signing secret. SESSION_SECRET when configured; otherwise derived
 * from the service-role key (already a high-entropy server-only secret),
 * so nothing breaks in environments that predate this file — but the
 * derivation is one-way and never exposes the key itself.
 */
async function signingKey(): Promise<CryptoKey> {
  const configured = (process.env.SESSION_SECRET ?? "").trim();
  const base = configured || `derived:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
  if (!configured && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("No SESSION_SECRET and no SUPABASE_SERVICE_ROLE_KEY — cannot sign sessions.");
  }
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ss-cookie-v1:${base}`));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** payload.signature — payload is base64url JSON, signature is HMAC-SHA256 over it. */
export async function mintToken(claims: SessionClaims): Promise<string> {
  const payload = base64url(new TextEncoder().encode(JSON.stringify(claims)).buffer as ArrayBuffer);
  const key = await signingKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${base64url(signature)}`;
}

/** Returns the claims if the token is genuine and unexpired, else null. */
export async function verifyToken(token: string | undefined | null, kind: SessionClaims["kind"]): Promise<SessionClaims | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  try {
    const key = await signingKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(signature).buffer as ArrayBuffer,
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as SessionClaims;
    if (claims.kind !== kind) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    if (typeof claims.child_id !== "string" || !claims.child_id) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Reads one cookie's value from a Cookie header (proxy) or cookie string. */
export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** The Set-Cookie attributes both cookies share. HttpOnly always; Secure off localhost. */
export function cookieAttributes(maxAgeSeconds: number, secure: boolean): string {
  return `Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * Route-level verification (defense in depth behind the proxy): returns the
 * session claims or null. Routes that spend money call this themselves so a
 * proxy matcher mistake can never silently open them.
 */
export async function requireSession(request: Request): Promise<SessionClaims | null> {
  return verifyToken(readCookie(request.headers.get("cookie"), SESSION_COOKIE), "session");
}
