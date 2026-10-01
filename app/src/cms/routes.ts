/**
 * WHERE THE CMS LIVES, AND WHO MAY KNOCK (30 Sep 2026, docs/cms/SETUP.md). Pure — no imports — because three things
 * read it: payload.config.mts (the routes Payload mounts), src/proxy.ts (the device gate in front of them) and
 * src/lib/cmsGate.test.ts.
 *
 * The panel is /admin and its API /api/payload. BOTH sit behind the app's device gate — the signed ss_device cookie a
 * device earns by entering ACCESS_CODE once (src/lib/sessionAuth.ts) — and only then behind Payload's own login. A
 * stranger with the URL sees neither the panel nor its login form; a device that has passed the gate still needs a
 * Payload user.
 */
export const CMS_ADMIN_ROUTE = "/admin";
export const CMS_API_ROUTE = "/api/payload";
/** Where a device with no grant is sent: the app's own access-code entry, then back to where it was going. */
export const DEVICE_GATE_ROUTE = "/device-gate";

/**
 * The app's own pages that happen to live under /admin: the QA galleries the design and board harnesses photograph.
 * They are not Payload's, carry fixture data only, and stay exactly as reachable as they were.
 */
export const APP_ADMIN_PAGES = ["/admin/board-gallery", "/admin/design-gallery", "/admin/design-preview"] as const;

/**
 * The first admin is made by `npm run cms:seed-admin` from ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD — by someone who
 * holds the server's environment — and never through the panel. With no users Payload would offer "create first
 * user" to whoever reaches it, so that page and its endpoint are closed to everyone, grant or no grant.
 */
export const SEED_ONLY_ROUTES = [`${CMS_ADMIN_ROUTE}/create-first-user`, `${CMS_API_ROUTE}/users/first-register`] as const;

const under = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`);
/**
 * A path as Payload will read it. Next matches the mount points (/admin, /api/payload) exactly, but beneath them
 * Payload matches its own endpoints without regard to case — /api/payload/users/First-Register IS first-register
 * (seen on 3.90.2, 1 Oct 2026) — and a path can arrive percent-encoded. Both are folded before a route is compared.
 */
const folded = (path: string): string => {
  try {
    return decodeURIComponent(path).toLowerCase();
  } catch {
    return path.toLowerCase();
  }
};

/** Which part of the CMS a path belongs to — or null: not the CMS's, the proxy's existing rules apply. */
export function cmsArea(path: string): "panel" | "api" | null {
  if (under(path, CMS_API_ROUTE)) return "api";
  if (under(path, CMS_ADMIN_ROUTE) && !APP_ADMIN_PAGES.some((page) => under(path, page))) return "panel";
  return null;
}

export type CmsGateVerdict = { action: "pass" } | { action: "redirect"; to: string } | { action: "deny"; status: 401 | 403; error: "device_required" | "seed_only" };

/**
 * The device gate's verdict for a CMS request. With the grant (or where the gate is waived: development with no
 * ACCESS_CODE configured, exactly as /api/session-start waives it) the request goes on to Payload, which asks for
 * its own login. Without it: a page view is sent to the gate and comes back afterwards; anything else — the API, a
 * form post, a server action — is refused outright.
 */
export function cmsGateVerdict(input: { path: string; search?: string; method: string; deviceGranted: boolean; waived: boolean }): CmsGateVerdict {
  if (input.deviceGranted || input.waived) {
    return SEED_ONLY_ROUTES.some((route) => under(folded(input.path), route)) ? { action: "deny", status: 403, error: "seed_only" } : { action: "pass" };
  }
  const pageView = cmsArea(input.path) === "panel" && (input.method === "GET" || input.method === "HEAD");
  if (!pageView) return { action: "deny", status: 401, error: "device_required" };
  return { action: "redirect", to: `${DEVICE_GATE_ROUTE}?next=${encodeURIComponent(`${input.path}${input.search ?? ""}`)}` };
}

/** After the gate: only ever back into the panel — never to a URL someone else composed. */
export function afterGate(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return CMS_ADMIN_ROUTE;
  const path = next.split(/[?#]/u)[0] ?? "";
  return cmsArea(path) === "panel" ? next : CMS_ADMIN_ROUTE;
}
