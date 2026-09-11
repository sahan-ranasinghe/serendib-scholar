import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBoardContent, blockToBoardAction, parseAbacusStep } from "./boardContentParser";
import { mouthShapeFor } from "../components/ZaraCharacter";

test("the 5421 board text parses to abacus digits + a filled expansion", () => {
  // Real boardContent from segment 00:03:00 (with its escaped newline, as stored).
  const blocks = parseBoardContent("5 4 2 1\\n5000 + 400 + 20 + 1");
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0], { kind: "abacus", digits: [5, 4, 2, 1] });
  assert.deepEqual(blocks[1], { kind: "expansion", prompt: 5421, parts: [5000, 400, 20, 1] });

  const abacus = blockToBoardAction(blocks[0], "b");
  assert.deepEqual(abacus, { kind: "abacus_set", digits: [5, 4, 2, 1], animate: true });
  const expansion = blockToBoardAction(blocks[1], "b");
  assert.ok(expansion.kind === "show_components" && expansion.components[0].type === "ExpansionExercise");
});

test("a number-name table parses into PlaceValueTable rows", () => {
  const blocks = parseBoardContent(
    "2. වගුව සම්පූර්ණ කරන්න.\n\n| සංඛ්‍යාව | සංඛ්‍යා නාමය |\n|---|---|\n| 6528 | හයදහස් පන්සිය විසි අට |\n| ............. | දෙදහස් හාරසිය තිහ |",
  );
  const table = blocks.find((b) => b.kind === "table");
  assert.ok(table && table.kind === "table");
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[0], { number: 6528, numberName: "හයදහස් පන්සිය විසි අට" });
  assert.deepEqual(table.rows[1], { number: null, numberName: "දෙදහස් හාරසිය තිහ" });
});

test("unparseable board text becomes a verbatim text card, never nothing", () => {
  const blocks = parseBoardContent("උදාහරණය : 3058\n① 8597");
  assert.ok(blocks.length > 0);
  const action = blockToBoardAction(blocks[blocks.length - 1], "b");
  assert.ok(action.kind !== "none");
  assert.ok(blocks.some((b) => b.kind === "text" && b.text.includes("3058")));
});

test("abacus worked steps parse to rod + bead count; non-bead steps to null", () => {
  assert.deepEqual(parseAbacusStep("දාහේ ස්ථානයේ ගණක 5යි", 4), { rod: 0, count: 5 });
  assert.deepEqual(parseAbacusStep("සිය ස්ථානයේ ගණක 3යි", 4), { rod: 1, count: 3 });
  assert.deepEqual(parseAbacusStep("එක ස්ථානයේ ගණක 2යි", 4), { rod: 3, count: 2 });
  assert.deepEqual(parseAbacusStep("දාහේ ස්ථානයේ ගණක 3යි", 5), { rod: 1, count: 3 }, "5-digit numbers shift rods right");
  assert.equal(parseAbacusStep("සංඛ්‍යාව: 5322", 4), null, "the final-number step is not a bead placement");
});

test("the talking mouth maps amplitude to the export's three talk shapes", () => {
  assert.equal(mouthShapeFor(0.0), 1, "silence → talk1 (small o)");
  assert.equal(mouthShapeFor(0.06), 2, "quiet → talk2 (open)");
  assert.equal(mouthShapeFor(0.3), 3, "loud → talk3 (wide ah)");
});
