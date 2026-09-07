import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { degenerateProblems } from "./authorGuards";

/** The REAL broken output from the model comparison (2026-09-07): ~230
 * words of English scaffolding babble in an `analogy` field. It passed
 * every check then; it must never pass again. */
const BROKEN_ANALOGY = readFileSync(path.join(__dirname, "__fixtures__", "degenerate-analogy.txt"), "utf8").trim();

test("the real degenerate analogy string is rejected, on multiple grounds", () => {
  const problems = degenerateProblems("analogyDomain", BROKEN_ANALOGY);
  const rules = new Set(problems.map((p) => p.rule));
  assert.ok(rules.has("degenerate-english"), "consecutive-English rule must fire");
  assert.ok(rules.has("degenerate-length"), "3×-length rule must fire");
  assert.ok(rules.has("degenerate-repetition"), "token-repetition rule must fire");
});

test("a normal analogy domain passes", () => {
  assert.deepEqual(degenerateProblems("analogyDomain", "cricket score"), []);
  assert.deepEqual(degenerateProblems("analogyDomain", "school van fare"), []);
});

test("more than 3 consecutive English words is rejected even when short", () => {
  const problems = degenerateProblems("analogyDomain", "this is clearly english text");
  assert.ok(problems.some((p) => p.rule === "degenerate-english"));
});

test("three consecutive English words are still fine (domain names are English)", () => {
  assert.deepEqual(degenerateProblems("analogyDomain", "exercise books stack"), []);
});

test("token repetition beyond 5 is rejected", () => {
  const looping = "හරි හරි හරි හරි හරි හරි හරි";
  const problems = degenerateProblems("say", looping, { expectSinhala: true });
  assert.ok(problems.some((p) => p.rule === "degenerate-repetition"));
});

test("spokenText below 60% Sinhala is rejected; real Sinhala speech passes", () => {
  const mixed = "ok so basically the answer is දෙක";
  assert.ok(degenerateProblems("say", mixed, { expectSinhala: true }).some((p) => p.rule === "degenerate-language"));
  const sinhala = "දැන් {address} මේ සංඛ්‍යාව {number:6831} හොඳින් බලන්න.";
  assert.deepEqual(degenerateProblems("say", sinhala, { expectSinhala: true }), []);
});

test("Sinhala with many virama-ending words is not 'repetition' (tokenizer keeps marks)", () => {
  const text = "පන්දහස් තුන්සිය විසි දෙක. හයදහස් අටසිය තිස් එක. හත්දහස් හයසිය පනස් අට. නවදහස් නවසිය අනූ නවය.";
  const problems = degenerateProblems("say", text, { expectSinhala: true });
  assert.ok(!problems.some((p) => p.rule === "degenerate-repetition"), JSON.stringify(problems));
});

test("guideStep may be English (it cites the guide) but still has length limits", () => {
  assert.deepEqual(
    degenerateProblems("guideStep", "Display a row of numbers with up to three digits", { englishOk: true }),
    [],
  );
  const bloated = "word ".repeat(200);
  assert.ok(degenerateProblems("guideStep", bloated, { englishOk: true }).some((p) => p.rule === "degenerate-length" || p.rule === "degenerate-repetition"));
});
