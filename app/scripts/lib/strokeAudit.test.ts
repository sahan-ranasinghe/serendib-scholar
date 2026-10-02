import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { POINTER_SETTLE_MS, POINTER_WAIT_MS, STROKE_PROBES, judgePointerWait, type Box, type Measured } from "./strokeAudit";

const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, width, height, right: left + width, bottom: top + height });

/** Card 528 with the hand resting beneath it, its tip 2 px off the card's bottom edge and centred on it. */
const target = box(435, 27, 78, 62);
const shown: Measured = {
  strokes: [],
  boardRect: box(0, 0, 828, 355),
  target,
  highlight: null,
  writeOns: [],
  pointer: { box: box(target.left + target.width / 2 - 20, target.bottom + 2, 40, 52), opacity: 1, missing: false, placed: "below", waiting: false, covers: 362 },
};
const probe = STROKE_PROBES.find((p) => p.name === "pointer-card")!;

test("the audit's wait is the hand's own: the last of Pointer.tsx's re-checks", () => {
  const source = readFileSync(path.resolve(__dirname, "../../src/components/board/Pointer.tsx"), "utf8");
  const settle = /const SETTLE_MS = \[([^\]]+)\];/u.exec(source);
  assert.ok(settle, "Pointer.tsx SETTLE_MS");
  const looks = settle[1]!.split(",").map((n) => Number(n.trim()));
  assert.equal(looks[looks.length - 1], POINTER_SETTLE_MS);
});

test("a hand with no clean spot may appear up to 200 ms after its 1.3 s wait, counted from the tap", () => {
  assert.equal(POINTER_WAIT_MS, POINTER_SETTLE_MS + 200);
  // What it measured on 1–2 Oct 2026, every one a fail against the old 1300.
  for (const ms of [1306, 1319, 1334, 1346, 1352, 1369]) assert.deepEqual(judgePointerWait(probe, ms, shown), [], `${ms} ms`);
  assert.deepEqual(judgePointerWait(probe, POINTER_WAIT_MS, shown), []);
});

test("later than that, or never, is still a failure — and so is a hand that lands off its target", () => {
  assert.deepEqual(judgePointerWait(probe, 1501, shown), ["pointer appeared 1501 ms after the tap — later than 1500 ms"]);
  assert.deepEqual(judgePointerWait(probe, null, shown), ["pointer never appeared for number:528 (waited past 3000 ms)"]);
  const astray: Measured = { ...shown, pointer: { ...shown.pointer!, box: box(600, 200, 40, 52) } };
  assert.equal(judgePointerWait(probe, 1320, astray).length, 1);
  assert.match(judgePointerWait(probe, 1320, astray)[0]!, /does not touch the bottom edge/u);
});
