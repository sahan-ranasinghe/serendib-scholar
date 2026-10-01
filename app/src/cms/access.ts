import type { Access, FieldAccess, PayloadRequest } from "payload";
import { CONTENT_RULES, USER_RULES, isRole, roleAllows, type Operation, type Role } from "./roles";

/**
 * Payload's access functions, from the role rules in roles.ts. Every collection in payload.config.mts takes
 * its create / update / delete (and read) from here — src/lib/cmsCollections.test.ts asserts none is left to
 * Payload's default.
 */
export const roleOf = (req: PayloadRequest): Role | null => {
  const role = (req.user as { role?: unknown } | null)?.role;
  return isRole(role) ? role : null;
};

const by =
  (rules: Record<Operation, readonly Role[]>) =>
  (operation: Operation): Access =>
  ({ req }) =>
    roleAllows(roleOf(req), rules, operation);

/** A content collection's rule for one operation. */
export const content = by(CONTENT_RULES);
/** The users collection's rule for one operation (admin only). */
export const users = by(USER_RULES);

/** Who may sign in to the panel at all: any of the four roles. */
export const anyRole = ({ req }: { req: PayloadRequest }): boolean => roleOf(req) !== null;

/** A field only an admin may set or change (a user's own role, above all). */
export const adminField: FieldAccess = ({ req }) => roleOf(req) === "admin";
