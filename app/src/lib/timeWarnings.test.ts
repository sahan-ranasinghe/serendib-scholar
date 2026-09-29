import { test } from "node:test";
import assert from "node:assert/strict";
import { warningDue, WARN_LAST_SECONDS, WARN_SOON_SECONDS, type TimeWarning } from "./timeWarnings";

/** Walks a countdown second by second, saying each warning as it falls due; returns when each was said. */
function walk(startedWith: number, until = -30): Array<{ warning: TimeWarning; at: number }> {
  const said: TimeWarning[] = [];
  const out: Array<{ warning: TimeWarning; at: number }> = [];
  for (let left = startedWith; left >= until; left -= 1) {
    const due = warningDue(left, { startedWith, said });
    if (due) {
      said.push(due);
      out.push({ warning: due, at: left });
    }
  }
  return out;
}

test("a ten-minute countdown: the heads-up at five minutes, the last call at one, each once", () => {
  assert.deepEqual(walk(600), [
    { warning: "soon", at: WARN_SOON_SECONDS },
    { warning: "last", at: WARN_LAST_SECONDS },
  ]);
});

test("a countdown that began under five minutes skips the heads-up but never the last call", () => {
  assert.deepEqual(walk(180), [{ warning: "last", at: WARN_LAST_SECONDS }]);
  assert.deepEqual(walk(65), [{ warning: "last", at: WARN_LAST_SECONDS }]);
});

test("a countdown that began inside the last minute says the last call at once", () => {
  assert.deepEqual(walk(40), [{ warning: "last", at: 40 }]);
});

test("a limit already passed unannounced still gets the last call — never a close without it", () => {
  assert.equal(warningDue(-20, { startedWith: -20, said: [] }), "last");
  assert.equal(warningDue(-20, { startedWith: 900, said: ["soon"] }), "last");
});

test("a heads-up held back until under a minute (she was talking) gives way to the last call", () => {
  assert.equal(warningDue(50, { startedWith: 600, said: [] }), "last");
  assert.equal(warningDue(40, { startedWith: 600, said: ["last"] }), null);
});

test("no limit, no warning", () => {
  assert.equal(warningDue(Infinity, { startedWith: Infinity, said: [] }), null);
  assert.equal(warningDue(Number.NaN, { startedWith: 600, said: [] }), null);
});
