/**
 * THE CMS'S ROLES AND WHAT EACH MAY DO (30 Sep 2026, docs/cms/SETUP.md). Pure: no Payload import, so the rules are
 * unit-tested by themselves (src/lib/cmsRoles.test.ts) and access.ts only wraps them for Payload.
 *
 *   admin     everything, including the users themselves;
 *   editor    creates and changes content; deletes nothing;
 *   reviewer  reads; (Phase 2: approves — a field of its own, not a wider write);
 *   viewer    reads.
 *
 * No role, no access: a request with no signed-in user, or a user whose role is not one of these four, is refused
 * every operation. Deny by default — a collection that names no rule gets CONTENT_RULES, never Payload's own
 * "any signed-in user" default.
 */
export const ROLES = ["admin", "editor", "reviewer", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export type Operation = "read" | "create" | "update" | "delete";

export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);

/** What a content collection (the media library today; lessons, copy and lines in Phase 2) allows. */
export const CONTENT_RULES: Record<Operation, readonly Role[]> = {
  read: ROLES,
  create: ["admin", "editor"],
  update: ["admin", "editor"],
  delete: ["admin"],
};

/** The users collection: only an admin makes, changes or removes a user. (Reading and updating ONE'S OWN record is the collection's own rule — collections/Users.ts.) */
export const USER_RULES: Record<Operation, readonly Role[]> = {
  read: ["admin"],
  create: ["admin"],
  update: ["admin"],
  delete: ["admin"],
};

/** May this role do this? An unknown or missing role never may. */
export function roleAllows(role: unknown, rules: Record<Operation, readonly Role[]>, operation: Operation): boolean {
  return isRole(role) && rules[operation].includes(role);
}
