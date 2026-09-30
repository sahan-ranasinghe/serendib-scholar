import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONCEPT_DESCRIPTIONS, DESIGN_CONCEPTS, VOCABULARY_INTRODUCED_BY } from "./lessonDesign";
import { designSlice, DESIGN_DATA_PATH, DESIGN_SOURCE_PATH } from "../../scripts/lib/designSlice";

/**
 * The design file (docs/design/maths-5-1.json) is the one source of each concept's vocabulary and description; the app
 * reads a generated copy (`npm run generate:design`). These fail when the two drift — a design edit not regenerated.
 */
const design = JSON.parse(readFileSync(DESIGN_SOURCE_PATH, "utf8"));
const generated = JSON.parse(readFileSync(DESIGN_DATA_PATH, "utf8"));

test("the app's design data is exactly what the design file generates (run `npm run generate:design` after editing it)", () => {
  assert.deepEqual(generated, designSlice(design));
});

test("VOCABULARY_INTRODUCED_BY is the design file's vocabularyIntroduced, term for term", () => {
  const fromFile: Record<string, string> = {};
  for (const concept of design.concepts as Array<{ conceptTag: string; vocabularyIntroduced: string[] }>) for (const term of concept.vocabularyIntroduced) fromFile[term] = concept.conceptTag;
  assert.deepEqual(VOCABULARY_INTRODUCED_BY, fromFile);
  assert.equal(Object.keys(VOCABULARY_INTRODUCED_BY).length, 10);
  assert.ok(!("සංඛ්‍යාංකය" in VOCABULARY_INTRODUCED_BY), "never-said guide terms stay out of the gate");
});

test("every design concept has a description, in the design's own order", () => {
  assert.deepEqual((design.concepts as Array<{ conceptTag: string }>).map((c) => c.conceptTag), [...DESIGN_CONCEPTS]);
  for (const tag of DESIGN_CONCEPTS) assert.ok(CONCEPT_DESCRIPTIONS[tag]?.length > 20, `${tag} has no description`);
});
