import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseTruth, type TruthLog, type TruthSource } from "./audioTruth";

/** A context that runs from wall 0 (clock 0) with the given state changes: [wall ms, clock s, state]. */
function context(changes: Array<[number, number, string]> = []): TruthLog["contexts"][number] {
  return { id: 0, rate: 24000, anchors: [{ p: 0, c: 0, s: "running" }, ...changes.map(([p, c, s]) => ({ p, c, s }))] };
}

function source(id: number, S: number, seconds: number, extra: Partial<TruthSource> = {}): TruthSource {
  return { id, ctx: 0, kind: "buffer", label: `clip${id}`, p: S * 1000, c: S, state: "running", S, E: S + seconds, stopAt: null, discC: null, endedP: null, endedC: null, ...extra };
}

const log = (sources: TruthSource[], changes: Array<[number, number, string]> = [], now = 20_000): TruthLog => ({ now, contexts: [context(changes)], sources, media: [] });

test("two clips one after the other: one at a time", () => {
  const summary = analyseTruth(log([source(0, 0, 2), source(1, 2.5, 2)]), 0, 10_000);
  assert.equal(summary.maxConcurrent, 1);
  assert.deepEqual(summary.overlaps, []);
  assert.equal(summary.starts.length, 2);
});

test("a second clip started over the first: two at once, and how long", () => {
  const summary = analyseTruth(log([source(0, 0, 3), source(1, 1, 3)]), 0, 10_000);
  assert.equal(summary.maxConcurrent, 2);
  assert.equal(summary.overlaps.length, 1);
  assert.equal(summary.overlaps[0]!.ms, 2000);
});

test("a clip stopped while paused never sounds again: the next one is alone", () => {
  // Clip 0 plays from 0; the context is suspended at wall 1 s (clock 1); clip 0 is stopped at clock 1 while suspended;
  // the context runs again at wall 5 s; clip 1 starts then.
  const summary = analyseTruth(log([source(0, 0, 3, { stopAt: 1 }), source(1, 1, 2, { p: 5000 })], [[1000, 1, "suspended"], [5000, 1, "running"]]), 0, 10_000);
  assert.equal(summary.maxConcurrent, 1);
});

test("THE DEVICE BUG: a clip left alive through a pause resumes under the next clip", () => {
  // As above, but clip 0 is never stopped (the player only forgot it): on resume it plays its last 2 s under clip 1.
  const summary = analyseTruth(log([source(0, 0, 3), source(1, 1, 2, { p: 5000 })], [[1000, 1, "suspended"], [5000, 1, "running"]]), 0, 10_000);
  assert.equal(summary.maxConcurrent, 2);
  assert.equal(summary.overlaps[0]!.ms, 2000);
  assert.equal(summary.overlaps[0]!.at, 5000);
});

test("a frozen clip is silent while the context is suspended", () => {
  // Clip 0 frozen from wall 1 s to 5 s; a media element plays 2–4 s in between: nothing sounds together.
  const frozen = log([source(0, 0, 3)], [[1000, 1, "suspended"], [5000, 1, "running"]]);
  frozen.media.push({ id: 0, src: "take.wav", intervals: [[2000, 4000]], open: null });
  assert.equal(analyseTruth(frozen, 0, 10_000).maxConcurrent, 1);
});

test("a disconnected source is silent from the moment it is cut off", () => {
  const summary = analyseTruth(log([source(0, 0, 3, { discC: 1 }), source(1, 1, 2)]), 0, 10_000);
  assert.equal(summary.maxConcurrent, 1);
});

test("back-to-back chunks (the chat's PCM) are one voice stream, not many clips", () => {
  const chunks = [0, 1, 2, 3, 4].map((i) => source(i, i * 0.1, 0.1, { label: "✋ chat" }));
  const summary = analyseTruth(log(chunks), 0, 10_000);
  assert.equal(summary.starts.length, 1);
  assert.equal(summary.maxConcurrent, 1);
});

test("a short sound effect over her voice is not a second clip", () => {
  const summary = analyseTruth(log([source(0, 0, 3), source(1, 1, 0.12, { label: "chalk" })]), 0, 10_000);
  assert.equal(summary.maxConcurrent, 1);
  assert.deepEqual(summary.overlaps, []);
});

test("two clips touching at a boundary are not an overlap", () => {
  const summary = analyseTruth(log([source(0, 0, 1), source(1, 0.995, 1)]), 0, 10_000);
  assert.equal(summary.maxConcurrent, 1);
});

test("a clip started while suspended sounds from the resume, even when the resume is recorded late (the 🔊 preview)", () => {
  // Suspended at wall 1 s (clock 1); clip 0 is started while suspended (scheduled at clock 1); the context runs again at
  // wall 3 s, but the statechange event that records it lands when the clock already reads 1.04.
  const summary = analyseTruth(log([source(0, 1, 2, { p: 2000, state: "suspended" })], [[1000, 1, "suspended"], [3000, 1.04, "running"]]), 0, 10_000);
  assert.equal(summary.sounding.length, 1);
  assert.equal(summary.starts[0]!.at, 3000);
});

test("chalk scratches one after another over her line are effects, not a second clip", () => {
  const scratches = [0, 1, 2, 3].map((i) => source(10 + i, 0.5 + i * 0.15, 0.15, { label: null }));
  const summary = analyseTruth(log([source(0, 0.6, 3), ...scratches]), 0, 10_000);
  assert.equal(summary.maxConcurrent, 1);
  assert.equal(summary.sounding.length, 1);
});
