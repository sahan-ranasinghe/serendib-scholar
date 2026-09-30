import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { statusAfterNote } from "./portalRules";
import { runtimeSpokenLines } from "./spokenLines";
import { buildScriptFromRows } from "./lessonScriptBuilder";
import { parseAuthoredScript } from "./authoredScript";
import { CONCEPT_DESCRIPTIONS } from "./lessonDesign";
import { clipKey } from "./audioCache";

test("a note never undoes a decision: accepted stays accepted, rejected stays rejected", () => {
  assert.equal(statusAfterNote("accepted"), "accepted");
  assert.equal(statusAfterNote("rejected"), "rejected");
  assert.equal(statusAfterNote("pending"), "note_only");
  assert.equal(statusAfterNote(null), "note_only");
  assert.equal(statusAfterNote("note_only"), "note_only");
});

test("an accepted re-wording re-keys the line and its clip together: the row carries the words that will be spoken", () => {
  const file = parseAuthoredScript(readFileSync(path.resolve(__dirname, "../data/lessons/authored/maths-5-1.json"), "utf8"))!;
  const target = file.beats.find((b) => b.type === "EXPLAIN")!;
  const reworded = "මේක ඇයගේම වචනවලින් කියපු පේළියක්.";
  // What buildLessonScript does with an accepted re-wording (actor_lines → the authored beat's spokenText).
  const overlaid = { ...file, beats: file.beats.map((b) => (b.id === target.id ? { ...b, spokenText: reworded } : b)) };
  const build = (authoredScript: typeof file) => buildScriptFromRows([], new Map(Object.entries(CONCEPT_DESCRIPTIONS)), "maths", 5, 1, { lessonTitle: "සංඛ්‍යා - 1", authoredScript });
  const row = runtimeSpokenLines(build(overlaid)).find((l) => l.id === target.id)!;
  assert.equal(row.text, reworded, "the row is the re-wording — the take route stores her recording under its key");
  assert.equal(clipKey(row.text, "Aoede"), clipKey(reworded, "Aoede"));
  const before = runtimeSpokenLines(build(file)).find((l) => l.id === target.id)!;
  assert.notEqual(clipKey(before.text, "Aoede"), clipKey(row.text, "Aoede"), "the original words' key is not where the re-worded line is looked up");
});
