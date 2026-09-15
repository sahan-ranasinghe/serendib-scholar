import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGiveUpBeat, type Beat } from "./lessonOrchestrator";
import { exampleAnswerFor, firstValidExample } from "./answerCheck";

/**
 * Issue 12 (docs/qa/session1-triage.md, cluster G): the give-up reveal once
 * spoke a predicate answer's JSON — "kind permutation of digits 1, 3, 6, 4".
 * A predicate is revealed as one concrete valid example, never its shape.
 */
const FORBIDDEN = ["{", "kind", "permutation"];

function askedWith(expectedAnswer: string): Beat {
  return {
    id: "authored:readWrite4Digit:30",
    type: "ASK",
    conceptTag: "readWrite4Digit",
    sessionIndex: 0,
    mode: 3,
    itemId: "7daf0141",
    segmentIndex: 0,
    goal: "Ask for a four-digit number built from the digits.",
    maxSentences: 2,
    boardDescription: "a digit-choice puzzle",
    board: { kind: "none" },
    expectedAnswer,
    endBy: "asking",
  } as Beat;
}

test("the give-up reveal of a permutation predicate is a concrete example, never the JSON", () => {
  const beat = buildGiveUpBeat(askedWith(JSON.stringify({ kind: "permutationOf", digits: [1, 3, 6, 4], length: 4 })));
  assert.ok(beat.spokenText?.includes("1364"), `speaks a valid number: ${beat.spokenText}`);
  // {address} is the vocative filled at delivery — the one legitimate brace.
  const spoken = (beat.spokenText ?? "").replace(/\{address\}/gu, "");
  for (const bad of FORBIDDEN) assert.ok(!spoken.includes(bad), `no "${bad}" in: ${spoken}`);
});

test("a plain answer is revealed as itself", () => {
  const beat = buildGiveUpBeat(askedWith("5421"));
  assert.ok(beat.spokenText?.includes("5421"));
});

test("the first valid example never leads with a zero", () => {
  assert.equal(firstValidExample({ kind: "permutationOf", digits: [0, 4, 1, 9], length: 4 }), "4019");
  assert.equal(firstValidExample({ kind: "permutationOf", digits: [1, 3, 6, 4], length: 4 }), "1364");
  assert.equal(exampleAnswerFor(JSON.stringify({ kind: "permutationOf", digits: [0, 0, 5, 2], length: 4 })), "5002");
  assert.equal(exampleAnswerFor("84"), "84");
});
