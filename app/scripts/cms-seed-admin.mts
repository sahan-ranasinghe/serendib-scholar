/**
 * `npm run cms:seed-admin` — makes the CMS's FIRST admin from the environment (docs/cms/SETUP.md).
 *
 *   ADMIN_EMAIL              who signs in
 *   ADMIN_INITIAL_PASSWORD   a password for the first sign-in only (12 characters or more)
 *
 * Both live in the server's environment (.env.local here), never in the repo. The panel cannot do this itself:
 * "create first user" is closed at the gate (src/cms/routes.ts), so whoever makes the first admin is someone who
 * holds the environment. Safe to run again — an account that already exists is left exactly as it is, password
 * included. Neither value is ever printed.
 *
 * `.mts` and run through `payload run`: Payload is ESM-only, and this project is CommonJS everywhere else.
 */
import config from "@payload-config";
import { getPayload } from "payload";

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_INITIAL_PASSWORD ?? "";
/** Enough of the address to recognise it in a terminal that may be shared; the whole of it stays in the environment. */
const masked = (address: string) => address.replace(/^(.).*(@.*)$/u, "$1•••$2");

const missing = [!email && "ADMIN_EMAIL", !password && "ADMIN_INITIAL_PASSWORD"].filter(Boolean);
if (missing.length > 0) {
  console.error(`cms:seed-admin — not set: ${missing.join(", ")}. Add ${missing.length > 1 ? "them" : "it"} to .env.local (never to the repo) and run this again. Nothing was changed.`);
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email)) {
  console.error("cms:seed-admin — ADMIN_EMAIL is not an email address. Nothing was changed.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("cms:seed-admin — ADMIN_INITIAL_PASSWORD is shorter than 12 characters. Nothing was changed.");
  process.exit(1);
}

const payload = await getPayload({ config });
const existing = await payload.find({ collection: "users", where: { email: { equals: email } }, limit: 1, depth: 0 });
const found = existing.docs[0];

if (found) {
  console.log(`cms:seed-admin — ${masked(email)} already has an account (role: ${found.role}). Left as it is: the password was NOT changed.`);
  if (found.role !== "admin") console.log("  It is not an admin. An admin changes a role on /admin/collections/users; this script never alters an existing account.");
} else {
  const made = await payload.create({ collection: "users", data: { email, password, role: "admin" } });
  console.log(`cms:seed-admin — created the admin ${masked(email)} (id ${made.id}).`);
}

console.log(`
Change the password on the first sign-in:
  1. Open /admin on a device that has passed the app's access-code gate, and sign in with ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD.
  2. Open the account page — /admin/account (the avatar, bottom of the left-hand menu).
  3. "Change Password": type the new password twice, then Save. Every other session of this account is signed out.
  4. Remove ADMIN_INITIAL_PASSWORD from the environment. It is only ever read by this script, and only for an account that does not exist yet.`);
process.exit(0);
