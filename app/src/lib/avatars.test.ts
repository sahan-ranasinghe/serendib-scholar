import { test } from "node:test";
import assert from "node:assert/strict";
import { AVATAR_IDS, avatarIdOf, avatarName, isAvatarId } from "./avatars";
import { COPY } from "./appCopy";

test("every avatar id has its name in the copy sheet", () => {
  for (const id of AVATAR_IDS) assert.ok(`avatar.${id}` in COPY, `avatar.${id} missing from COPY`);
  assert.equal(new Set(AVATAR_IDS.map(avatarName)).size, AVATAR_IDS.length, "names are distinct");
});

test("a stored id stays itself; a legacy display name maps to its id; anything else is null", () => {
  assert.equal(avatarIdOf("squirrel"), "squirrel");
  assert.equal(avatarIdOf("ලේනා"), "squirrel");
  assert.equal(avatarIdOf("කොටියා"), "leopard");
  assert.equal(avatarIdOf("Peacock"), "peacock");
  assert.equal(avatarIdOf("dragon"), null);
  assert.equal(avatarIdOf(null), null);
  assert.ok(isAvatarId("fish") && !isAvatarId("මාළුවා"));
});
