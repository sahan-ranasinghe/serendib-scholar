/**
 * 18 Sep 2026 (the device walk): what a child enters is ON the surface before it is judged (enterAnswer → judgeEntry),
 * and on the abacus only the rod under discussion carries a value — the last rod's answer leaves when the next is asked.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { enterAnswer, initialStage, judgeEntry, reduceStage, type StageState } from "./choreography";

const play = (stage: StageState, ...events: Parameters<typeof reduceStage>[1][]): StageState => events.reduce((s, e) => reduceStage(s, e, { legacy: null, lastBuilt: null }), stage);
const abacusAnswer = (stage: StageState) => (stage.base?.kind === "abacus" ? { text: stage.base.childAnswer, rod: stage.base.answerRod ?? null } : null);

test("an entered value is pending on the stage before any verdict, on every surface", () => {
  const asked = play(initialStage(), { primitive: "expansion", event: "show", args: { number: 5421, parts: ["5000", null, null, null] } }, { primitive: "turn", event: "your_turn", args: { answerMode: "cell", surface: "cell" } });
  const entered = enterAnswer(asked, "400");
  assert.deepEqual(entered.entry, { value: "400", verdict: "pending" });
  assert.equal(entered.base?.kind === "expansion" ? entered.base.expansion.parts[1] : "x", null, "nothing is written as hers or as right before the judge");
  const right = judgeEntry(entered, true);
  assert.equal(right.base?.kind === "expansion" ? right.base.expansion.answered?.[1] : null, "400", "a right part stands as the CHILD's (green ✓)");
  const wrong = judgeEntry(enterAnswer(asked, "40"), false);
  assert.deepEqual(wrong.entry, { value: "40", verdict: "wrong" }, "a wrong value stays on the surface to wobble");
  assert.equal(play(wrong, { primitive: "turn", event: "your_turn", args: { answerMode: "cell", surface: "cell" } }).entry, null, "the retry starts clean");
});

test("the window closing on a tap keeps the chips up until the verdict; the next question clears them", () => {
  const asked = play(initialStage(), { primitive: "abacus", event: "show", args: { digits: [5, 4, 2, 1] } }, { primitive: "turn", event: "your_turn", args: { answerMode: "readAloud", surface: "chips" } }, { primitive: "choiceChips", event: "show", args: { options: ["a", "b", "c"], correctIndex: 0 } });
  const tapped = play(enterAnswer(asked, "a"), { primitive: "turn", event: "over", args: {} });
  assert.ok(tapped.chips, "the tapped chip is still there to be marked");
  assert.equal(play(judgeEntry(tapped, true), { primitive: "turn", event: "over", args: {} }).chips, null, "once judged, the lesson moving on takes them");
});

test("the abacus rod run: one value at a time, under the rod under discussion", () => {
  const glow = (rod: number) => ({ primitive: "abacus" as const, event: "rod_glow" as const, args: { rod } });
  const ask = { primitive: "turn" as const, event: "your_turn" as const, args: { answerMode: "valueOrPlace", surface: "rod" } };
  let stage = play(initialStage(), { primitive: "abacus", event: "show", args: { digits: [5, 4, 2, 1] } }, glow(3), ask);
  stage = judgeEntry(enterAnswer(stage, "1"), true);
  assert.deepEqual(abacusAnswer(stage), { text: "1", rod: 3 }, "the ones rod's answer is written under the ones rod, before the judge");
  stage = play(stage, { primitive: "turn", event: "over", args: {} }, glow(3));
  assert.deepEqual(abacusAnswer(stage), { text: "1", rod: 3 }, "it stays while she is still talking about that rod");
  stage = play(stage, glow(2));
  assert.deepEqual(abacusAnswer(stage), { text: null, rod: null }, "the tens rod is under discussion: the ones rod's answer has left");
  stage = play(stage, glow(1), ask);
  stage = judgeEntry(enterAnswer(stage, "4"), true);
  assert.deepEqual(abacusAnswer(stage), { text: "4", rod: 1 });
  stage = play(stage, glow(0));
  assert.deepEqual(abacusAnswer(stage), { text: null, rod: null }, "nothing accumulates: the thousands rod starts with no value under any rod");
  stage = play(judgeEntry(enterAnswer(play(stage, glow(1), ask), "4"), true), { primitive: "highlight", event: "circle", args: { target: { number: 5421 } } });
  assert.deepEqual(abacusAnswer(stage), { text: null, rod: null }, "a ring on the whole number is about no rod: no rod's answer stays");
});

test("a right table cell becomes the child's own fill, and her confirmation does not write over it", () => {
  const table = { kind: "blankTable" as const, columns: [{ key: "number", label: "n" }, { key: "place", label: "p" }], rows: [{ number: 6572, place: null }], filled: [], activeBlank: null, itemId: "x" };
  let stage: StageState = { ...initialStage(), base: table };
  stage = play(stage, { primitive: "blankTable", event: "row_activate", args: { row: 0, field: "place" } }, { primitive: "turn", event: "your_turn", args: { answerMode: "cell", surface: "cell" } });
  stage = enterAnswer(stage, "දහසස්ථානය");
  assert.equal(stage.entry?.verdict, "pending");
  assert.equal(stage.base?.kind === "blankTable" ? stage.base.filled.length : -1, 0, "not a fill yet — it is only what they entered");
  stage = judgeEntry(stage, true);
  assert.deepEqual(stage.base?.kind === "blankTable" ? stage.base.filled : [], [{ row: 0, field: "place", value: "දහසස්ථානය", by: "child" }]);
  stage = play(stage, { primitive: "blankTable", event: "cell_fill", args: { row: 0, field: "place", value: "දහසස්ථානය", by: "tutor" } });
  assert.equal(stage.base?.kind === "blankTable" ? stage.base.filled[0]?.by : "", "child", "the child's green stands");
});
