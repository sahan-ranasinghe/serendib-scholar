/**
 * The ✋ chat's context: what the board is, and the ONE thing the child is
 * pointing at when they raise their hand. Her first line has to name that
 * concrete thing — the number, the rod, the cell — not just the topic, so
 * this is the function the whole refinement rests on.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { boardFocus, sanitizeChatContext, chatContextPrompt } from "./chatContext";
import { initialStage, reduceStage, type StageState } from "./choreography";

const play = (...events: Parameters<typeof reduceStage>[1][]): StageState => {
  let stage = initialStage();
  for (const event of events) stage = reduceStage(stage, event, { legacy: null, lastBuilt: 1364 });
  return stage;
};

test("an empty board has nothing to point at", () => {
  assert.equal(boardFocus(initialStage()), null);
});

test("the abacus: the number that is up, and the rod that is glowing", () => {
  const shown = play({ primitive: "abacus", event: "show", args: { digits: [5, 4, 2, 1] } });
  const focus = boardFocus(shown);
  assert.ok(focus && focus.includes("ගණක රාමුවේ"), `named the abacus: ${focus}`);
  assert.ok(focus!.replace(/\s/gu, "").includes("5421"), `named the number: ${focus}`);

  const glowing = reduceStage(shown, { primitive: "abacus", event: "rod_glow", args: { rod: 3 } }, { legacy: null, lastBuilt: null });
  const glowFocus = boardFocus(glowing);
  assert.ok(glowFocus && glowFocus.includes("එකස්ථානය"), `named the glowing rod: ${glowFocus}`);
  assert.ok(glowFocus!.replace(/\s/gu, "").includes("5421"), `kept the number beside the rod: ${glowFocus}`);
});

test("a table: the empty cell being asked, with what its row already shows", () => {
  // blankTable.show takes its shape from the beat's own item, so the table is set up directly here.
  const table: StageState = {
    ...initialStage(),
    base: {
      kind: "blankTable",
      columns: [
        { key: "number", label: "සංඛ්‍යාව" },
        { key: "numberName", label: "සංඛ්‍යා නාමය" },
      ],
      rows: [
        { number: 6528, numberName: null },
        { number: null, numberName: "දෙදහස් හාරසිය තිහ" },
      ],
      filled: [],
      activeBlank: null,
    },
  };
  const stage = reduceStage(table, { primitive: "blankTable", event: "row_activate", args: { row: 1, field: "number" } }, { legacy: null, lastBuilt: null });
  const focus = boardFocus(stage);
  assert.ok(focus && focus.includes("2 වෙනි පේළියේ"), `named the row: ${focus}`);
  assert.ok(focus!.includes("දෙදහස් හාරසිය තිහ"), `named what the row already shows: ${focus}`);
});

test("number cards: the one with the ring around it", () => {
  const stage = play(
    { primitive: "numberCards", event: "show", args: { values: [84, 101, 528, 997] } },
    { primitive: "numberCards", event: "highlight_ring", args: { value: 101 } },
  );
  const focus = boardFocus(stage);
  assert.ok(focus && focus.replace(/\s/gu, "").includes("101"), `named the ringed card: ${focus}`);
});

test("the digit picker: the number the child built from the hand", () => {
  const stage = play(
    { primitive: "digitPicker", event: "show", args: { pool: [1, 3, 6, 4] } },
    { primitive: "digitPicker", event: "built_number", args: { digits: "3641" } },
  );
  const focus = boardFocus(stage);
  assert.ok(focus && focus.replace(/\s/gu, "").includes("3641"), `named what they built: ${focus}`);
});

test("the focus reaches the prompt, and a missing one says so rather than pretending", () => {
  const context = sanitizeChatContext({ board: "ගණක රාමුවේ 5 421", boardFocus: "ගණක රාමුවේ 5 421 එකස්ථානය කූර" })!;
  assert.equal(context.boardFocus, "ගණක රාමුවේ 5 421 එකස්ථානය කූර");
  assert.ok(chatContextPrompt(context).includes("එකස්ථානය කූර"), "the prompt carries the focus");

  const blank = sanitizeChatContext({ board: "පුවරුව හිස්" })!;
  assert.equal(blank.boardFocus, null);
  assert.ok(chatContextPrompt(blank).includes("nothing specific"), "an empty board says nothing specific is up");
});
