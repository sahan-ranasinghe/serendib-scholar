import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_RULES, ROLES, USER_RULES, roleAllows, type Operation } from "../cms/roles";

const WRITES: Operation[] = ["create", "update", "delete"];

test("the four roles, in order of what they may do", () => {
  assert.deepEqual([...ROLES], ["admin", "editor", "reviewer", "viewer"]);
});

test("content: admin everything · editor creates and changes but never deletes · reviewer and viewer only read", () => {
  const table = Object.fromEntries(ROLES.map((role) => [role, (["read", ...WRITES] as Operation[]).filter((op) => roleAllows(role, CONTENT_RULES, op))]));
  assert.deepEqual(table, {
    admin: ["read", "create", "update", "delete"],
    editor: ["read", "create", "update"],
    reviewer: ["read"],
    viewer: ["read"],
  });
});

test("users: only an admin makes, changes or removes a user", () => {
  for (const role of ROLES) for (const op of WRITES) assert.equal(roleAllows(role, USER_RULES, op), role === "admin", `${role} ${op}`);
});

test("no role, no access: a missing, empty or unknown role is refused every operation on every collection", () => {
  for (const role of [undefined, null, "", "owner", "ADMIN", 1, {}]) {
    for (const rules of [CONTENT_RULES, USER_RULES]) for (const op of ["read", ...WRITES] as Operation[]) assert.equal(roleAllows(role, rules, op), false, `${JSON.stringify(role)} ${op}`);
  }
});
