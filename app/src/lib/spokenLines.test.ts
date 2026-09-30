import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fixedLines, runtimeSpokenLines } from "./spokenLines";
import { AUTHORED_LINES, RETEACH_LINES } from "./authoredLines";
import { NUMBER_FRAMES, numberWordLexemes } from "./composeNumberAudio";
import { buildScriptFromRows } from "./lessonScriptBuilder";
import { parseAuthoredScript } from "./authoredScript";
import { CONCEPT_DESCRIPTIONS } from "./lessonDesign";
import { buildFeedbackBeat, buildGiveUpBeat, buildNudgeBeat, buildReteachBeats } from "./lessonOrchestrator";
import { resolveAddress } from "./addressToken";

/**
 * EVERY STRING THE RUNTIME CAN SPEAK HAS A PORTAL ROW (29 Sep 2026). The portal lists runtimeSpokenLines(script); these
 * check that list from the runtime's side — the fixed tables, the orchestrator's builders run over every question, and
 * every AUTHORED_LINES key the speaking modules reach for — so a line cannot be spoken without a row to record it on.
 * (The dry run checks the same over the full built lesson; src/lib/sourceAudit.test.ts rules out inline spoken text.)
 */
const APP = path.resolve(__dirname, "../..");
const script = buildScriptFromRows([], new Map(Object.entries(CONCEPT_DESCRIPTIONS)), "maths", 5, 1, {
  lessonTitle: "සංඛ්‍යා - 1",
  authoredScript: parseAuthoredScript(readFileSync(path.join(APP, "src/data/lessons/authored/maths-5-1.json"), "utf8")),
});
const lines = runtimeSpokenLines(script);
const texts = new Set(lines.map((l) => l.text));
const said = (text: string) => resolveAddress(text, "unspecified").trim();

test("one row per distinct line — never two rows for one recording", () => {
  assert.equal(texts.size, lines.length);
  assert.ok(lines.length > 200, `${lines.length} lines`);
});

test("every fixed line, reteach line, number frame and number word has a row", () => {
  for (const line of fixedLines()) assert.ok(texts.has(line.text), `${line.id}: "${line.text}"`);
  for (const [tag, text] of Object.entries(RETEACH_LINES)) assert.ok(texts.has(said(text)), `reteach ${tag}`);
  for (const [name, frame] of Object.entries(NUMBER_FRAMES)) for (const half of [frame.before, frame.after]) if (half) assert.ok(texts.has(said(half)), `frame ${name}: "${half}"`);
  for (const word of numberWordLexemes()) assert.ok(texts.has(word), `number word ${word}`);
});

test("every question's feedback, nudge, give-up and reteach — from the runtime's own builders — has a row", () => {
  const questions = script.beats.filter((b) => b.expectedAnswer);
  assert.ok(questions.length > 20);
  for (const beat of questions) {
    const built = [buildFeedbackBeat(beat, true), buildFeedbackBeat(beat, false), buildFeedbackBeat(beat, false, undefined, { reteachFollows: true }), buildNudgeBeat(beat), buildGiveUpBeat(beat), ...buildReteachBeats(script, beat, []).beats];
    for (const b of built) for (const text of [b.spokenText, ...(b.sayCandidates ?? [])]) if (text) assert.ok(texts.has(said(text)), `${beat.id} → ${b.id}: "${said(text).slice(0, 50)}"`);
  }
  for (const beat of script.beats) if (beat.spokenText) assert.ok(texts.has(said(beat.spokenText)), beat.id);
});

test("every AUTHORED_LINES key a speaking module reaches for is listed (a {value} template is listed filled or split)", () => {
  const SPEAKING = ["src/hooks/useLessonRuntime.ts", "src/hooks/useLiveChat.ts", "src/lib/lessonOrchestrator.ts", "src/lib/lessonScriptBuilder.ts", "src/lib/recapBeat.ts", "src/lib/composeNumberAudio.ts"];
  /** Each template, and where its filled or split forms come from. */
  const TEMPLATES: Record<string, string> = {
    revealBlank: "filled by the builder into its beat (a script line)",
    giveUpReveal: "filled per question by buildGiveUpBeat (per-question rows); split into NUMBER_FRAMES.answer",
    rubricReveal: "filled per rubric by buildRubricRevealBeat (per-question rows)",
    confirmHeard: "voice assessment only — split into NUMBER_FRAMES.heard around the number words",
    builtReadBack: "split into NUMBER_FRAMES.built around the number words",
  };
  const used = new Set<string>();
  for (const file of SPEAKING) for (const m of readFileSync(path.join(APP, file), "utf8").matchAll(/AUTHORED_LINES\.(\w+)/gu)) used.add(m[1]!);
  for (const key of used) {
    const value = (AUTHORED_LINES as Record<string, string | readonly string[]>)[key];
    assert.ok(value !== undefined, `AUTHORED_LINES.${key} does not exist`);
    for (const text of typeof value === "string" ? [value] : value) {
      if (text.includes("{value}")) assert.ok(key in TEMPLATES, `template ${key} is spoken but has no known filled form`);
      else assert.ok(texts.has(said(text)), `AUTHORED_LINES.${key} has no row`);
    }
  }
  for (const key of Object.keys(TEMPLATES)) assert.ok(String((AUTHORED_LINES as Record<string, unknown>)[key]).includes("{value}"), `${key} is not a template any more`);
});
