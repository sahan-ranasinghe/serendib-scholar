import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../cms/collections";
import { ROLES, type Role } from "../cms/roles";

/** A request as Payload hands it to an access function — only the part the rules read. */
const as = (role: Role | null, id = 7) => ({ req: { user: role ? { id, role } : null } }) as never;
const WRITES = ["create", "update", "delete"] as const;

test("every collection names its own read / create / update / delete rule — none is left to Payload's default", () => {
  assert.deepEqual(COLLECTIONS.map((c) => c.slug), ["users", "media"]);
  for (const collection of COLLECTIONS) for (const op of ["read", ...WRITES] as const) assert.equal(typeof collection.access?.[op], "function", `${collection.slug}.${op}`);
});

test("signed out: every operation on every collection is refused", async () => {
  for (const collection of COLLECTIONS) for (const op of ["read", ...WRITES] as const) assert.equal(await collection.access![op]!(as(null)), false, `${collection.slug}.${op}`);
});

test("media (content): admin all · editor creates and changes · reviewer and viewer read only", async () => {
  const media = COLLECTIONS.find((c) => c.slug === "media")!;
  const table: Record<string, string[]> = {};
  for (const role of ROLES) table[role] = (await Promise.all((["read", ...WRITES] as const).map(async (op) => ((await media.access![op]!(as(role))) === true ? op : "")))).filter(Boolean);
  assert.deepEqual(table, { admin: ["read", "create", "update", "delete"], editor: ["read", "create", "update"], reviewer: ["read"], viewer: ["read"] });
});

test("users: only an admin creates; everyone else reads and changes only their own record; nobody deletes themselves", async () => {
  const users = COLLECTIONS.find((c) => c.slug === "users")!;
  for (const role of ROLES) assert.equal(await users.access!.create!(as(role)), role === "admin", `create as ${role}`);
  assert.equal(await users.access!.read!(as("admin")), true);
  assert.equal(await users.access!.update!(as("admin")), true);
  for (const role of ["editor", "reviewer", "viewer"] as const) {
    assert.deepEqual(await users.access!.read!(as(role, 7)), { id: { equals: 7 } }, `read as ${role}`);
    assert.deepEqual(await users.access!.update!(as(role, 7)), { id: { equals: 7 } }, `update as ${role}`);
    assert.equal(await users.access!.delete!(as(role)), false, `delete as ${role}`);
  }
  assert.deepEqual(await users.access!.delete!(as("admin", 3)), { id: { not_equals: 3 } });
});

test("a role is set only by an admin, and every role may sign in to the panel", async () => {
  const users = COLLECTIONS.find((c) => c.slug === "users")!;
  const role = users.fields.find((f) => "name" in f && f.name === "role") as { access?: { create?: (a: never) => unknown; update?: (a: never) => unknown }; options?: Array<{ value: string }>; defaultValue?: unknown; required?: boolean };
  assert.deepEqual(role.options?.map((o) => o.value), [...ROLES]);
  assert.equal(role.defaultValue, "viewer");
  assert.equal(role.required, true);
  for (const r of ROLES) {
    assert.equal(await role.access!.create!(as(r)), r === "admin", `set role on create as ${r}`);
    assert.equal(await role.access!.update!(as(r)), r === "admin", `change role as ${r}`);
    assert.equal(await users.access!.admin!(as(r)), true, `panel as ${r}`);
  }
  assert.equal(await users.access!.admin!(as(null)), false);
  // Login is by email: Payload's default, with no username login switched on.
  assert.equal(typeof users.auth === "object" && "loginWithUsername" in users.auth, false);
});
