import test from "node:test";
import assert from "node:assert/strict";
import { confirmValueFor, transcriptContains, CONFIRM_LIMIT } from "./confirmPolicy";

test("a wrong answer to 999 + 1 never echoes the answer key", () => {
  // The child said "හයසිය" (600); the planner guessed the key, 1000.
  const value = confirmValueFor({
    hearing: { transcript: "හයසිය", number: "600", confidence: 0.5 },
    expected: "1000",
    plannerGuess: "1000",
    confirmsSoFar: 0,
  });
  assert.notEqual(value, "1000");
  assert.equal(value, "600");
});

test("the key is never read back when the child did not say it", () => {
  const value = confirmValueFor({
    hearing: { transcript: "මම දන්නේ නෑ", number: null, confidence: 0.3 },
    expected: "1000",
    plannerGuess: "1000",
    confirmsSoFar: 0,
  });
  assert.equal(value, null);
});

test("a doubtful hearing of a number is echoed as heard", () => {
  const value = confirmValueFor({
    hearing: { transcript: "දෙදාස් තුන්සිය එකොළහ", number: "2311", confidence: 0.4 },
    expected: "2311",
    plannerGuess: null,
    confirmsSoFar: 0,
  });
  // The child DID say it (the name), so echoing the value is honest even though it is the key.
  assert.equal(value, "2311");
});

test("a confident hearing is judged without a CONFIRM", () => {
  const value = confirmValueFor({
    hearing: { transcript: "දෙදාස් තුන්සිය එකොළහ", number: "2311", confidence: 0.95 },
    expected: "2311",
    plannerGuess: null,
    confirmsSoFar: 0,
  });
  assert.equal(value, null);
});

test("the planner's flag on the heard number is honoured", () => {
  const value = confirmValueFor({
    hearing: { transcript: "පනස් හතර", number: "54", confidence: 0.9 },
    expected: "84",
    plannerGuess: "54",
    confirmsSoFar: 0,
  });
  assert.equal(value, "54");
});

test(`after ${CONFIRM_LIMIT} doubtful hearings there is no third "say it again"`, () => {
  const value = confirmValueFor({
    hearing: { transcript: "හයසිය", number: "600", confidence: 0.2 },
    expected: "1000",
    plannerGuess: null,
    confirmsSoFar: CONFIRM_LIMIT,
  });
  assert.equal(value, null);
});

test("transcriptContains sees digits and Sinhala names", () => {
  assert.equal(transcriptContains("මට හිතෙන්නේ අසූ හතර", "84"), true);
  assert.equal(transcriptContains("84 කියලා", "84"), true);
  assert.equal(transcriptContains("හතළිස් අට", "84"), false);
});
