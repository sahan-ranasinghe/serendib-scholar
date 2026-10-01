import type { Access, CollectionConfig } from "payload";
import { ROLES } from "../roles";
import { adminField, anyRole, roleOf, users } from "../access";

/** An admin reads and changes every user; anyone else only their own record (their password, on /admin/account). */
const adminOrSelf: Access = ({ req }) => {
  if (roleOf(req) === "admin") return true;
  return req.user ? { id: { equals: req.user.id } } : false;
};
/** An admin removes any user but themselves — the panel can never be left with no admin by a slip of the hand. */
const adminNotSelf: Access = ({ req }) => (roleOf(req) === "admin" && req.user ? { id: { not_equals: req.user.id } } : false);

/**
 * The people who may sign in to /admin. Login is by email (Payload's default; no usernames). The first admin is
 * made by scripts/cms-seed-admin.mts from ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD, never through the panel.
 */
export const Users: CollectionConfig = {
  slug: "users",
  admin: { useAsTitle: "email", defaultColumns: ["email", "role", "updatedAt"] },
  auth: {
    // Five wrong passwords lock the account for ten minutes; a session lasts a working day.
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    tokenExpiration: 8 * 60 * 60,
    cookies: { sameSite: "Lax", secure: process.env.NODE_ENV === "production" },
  },
  access: {
    admin: anyRole,
    read: adminOrSelf,
    create: users("create"),
    update: adminOrSelf,
    delete: adminNotSelf,
    unlock: users("update"),
  },
  fields: [
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "viewer",
      options: ROLES.map((role) => ({ label: role, value: role })),
      // In the token, so every request knows the role without a second query.
      saveToJWT: true,
      // Nobody promotes themselves: only an admin sets or changes a role.
      access: { create: adminField, update: adminField },
    },
  ],
};
