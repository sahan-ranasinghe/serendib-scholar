import { test } from "node:test";
import assert from "node:assert/strict";
import { FRESH, onActivate, onPress, onSurfacePress, SINGLE_FIRE_MS, type FireState } from "./singleFire";

/** Plays a sequence of pointerdowns ("down") and clicks on one control; returns which clicks were accepted. */
function play(events: Array<{ kind: "down" } | { kind: "click"; at: number; pointer?: boolean }>, repeat = false): boolean[] {
  let state: FireState = FRESH;
  const accepted: boolean[] = [];
  for (const event of events) {
    if (event.kind === "down") {
      state = onPress(state);
      continue;
    }
    const result = onActivate(state, { at: event.at, pointer: event.pointer ?? true, repeat });
    state = result.next;
    accepted.push(result.accept);
  }
  return accepted;
}

test("one tap fires once", () => {
  assert.deepEqual(play([{ kind: "down" }, { kind: "click", at: 1000 }]), [true]);
});

test("a tap delivered twice (two clicks on one press) fires once", () => {
  assert.deepEqual(play([{ kind: "down" }, { kind: "click", at: 1000 }, { kind: "click", at: 1004 }]), [true, false]);
});

test("a ghost click with no press on the control never fires", () => {
  assert.deepEqual(play([{ kind: "click", at: 1000 }]), [false]);
});

test("a rapid double-tap on ⏮ (two presses 80 ms apart) is one step", () => {
  assert.deepEqual(play([{ kind: "down" }, { kind: "click", at: 1000 }, { kind: "down" }, { kind: "click", at: 1080 }]), [true, false]);
});

test("five deliberate taps on ⏮ are five steps", () => {
  const events: Array<{ kind: "down" } | { kind: "click"; at: number }> = [];
  for (let i = 0; i < 5; i += 1) events.push({ kind: "down" }, { kind: "click", at: 1000 + i * (SINGLE_FIRE_MS + 50) });
  assert.deepEqual(play(events), [true, true, true, true, true]);
});

test("a repeat control (a pad key): the two 0s of 1000 at 150 ms are two presses", () => {
  assert.deepEqual(play([{ kind: "down" }, { kind: "click", at: 1000 }, { kind: "down" }, { kind: "click", at: 1150 }], true), [true, true]);
});

test("a repeat control still drops a second click riding on one press", () => {
  assert.deepEqual(play([{ kind: "down" }, { kind: "click", at: 1000 }, { kind: "click", at: 1003 }], true), [true, false]);
});

test("keyboard / programmatic clicks: time rule only (300 ms, or 30 ms on a repeat control)", () => {
  assert.deepEqual(play([{ kind: "click", at: 1000, pointer: false }, { kind: "click", at: 1100, pointer: false }, { kind: "click", at: 1400, pointer: false }]), [true, false, true]);
  assert.deepEqual(play([{ kind: "click", at: 1000, pointer: false }, { kind: "click", at: 1080, pointer: false }, { kind: "click", at: 1090, pointer: false }], true), [true, true, false]);
});

/** Plays a sequence of presses on one pointerdown surface (the soft check's board); returns which were accepted. */
function pressSurface(times: number[]): boolean[] {
  let state: FireState = FRESH;
  return times.map((at) => {
    const result = onSurfacePress(state, at);
    state = result.next;
    return result.accept;
  });
}

test("tap anywhere to continue: two touches 80 ms apart are one press", () => {
  assert.deepEqual(pressSurface([1000, 1080]), [true, false]);
});

test("tap anywhere to continue: a refused press does not restart the window", () => {
  assert.deepEqual(pressSurface([1000, 1200, 1300, 1400]), [true, false, true, false]);
});

test("tap anywhere to continue: deliberate taps a moment apart each count", () => {
  assert.deepEqual(pressSurface([1000, 1000 + SINGLE_FIRE_MS, 1000 + SINGLE_FIRE_MS * 3]), [true, true, true]);
});
