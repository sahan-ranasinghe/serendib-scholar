import test from "node:test";
import assert from "node:assert/strict";
import { mouthShapeFor, MOUTH_SILENCE } from "./ZaraCharacter";

/**
 * Lip sync (cluster F): the mouth is driven per frame from the clip's own
 * amplitude — closed on silence, three open shapes by band. A known
 * envelope (a syllable rising and falling, a pause, a louder syllable,
 * then the clip's silent tail) must pass through at least three distinct
 * open states and end closed.
 */
const ENVELOPE = [0, 0.005, 0.02, 0.04, 0.08, 0.12, 0.2, 0.16, 0.09, 0.03, 0.008, 0.002, 0, 0, 0.03, 0.07, 0.18, 0.25, 0.1, 0.04, 0.01, 0.003, 0, 0];

test("a spoken envelope passes through three open mouth shapes and closes on the tail", () => {
  const states = ENVELOPE.map(mouthShapeFor);
  const open = new Set(states.filter((s) => s !== 0));
  assert.ok(open.size >= 3, `expected ≥ 3 distinct open shapes, saw ${[...open].join(",")}`);
  assert.equal(states[states.length - 1], 0, "the mouth closes on the clip's silent tail");
  assert.equal(states[0], 0, "the mouth is closed before the first sound");
});

test("silence is closed, not a small o", () => {
  assert.equal(mouthShapeFor(0), 0);
  assert.equal(mouthShapeFor(MOUTH_SILENCE / 2), 0);
  assert.equal(mouthShapeFor(MOUTH_SILENCE * 2), 1);
});

test("the bands are ordered by loudness", () => {
  assert.ok(mouthShapeFor(0.02) < mouthShapeFor(0.08));
  assert.ok(mouthShapeFor(0.08) < mouthShapeFor(0.3));
});
