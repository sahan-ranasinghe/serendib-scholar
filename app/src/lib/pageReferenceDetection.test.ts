/**
 * Run with:  npx tsx --test src/lib/pageReferenceDetection.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMentionedPageNumbers } from "./pageReferenceDetection";

test("no mention returns empty", () => {
  assert.deepEqual(extractMentionedPageNumbers("හරි hොඳයි! ඊළඟට යමු."), []);
});

test("plain English phrasing: 'page 43'", () => {
  assert.deepEqual(extractMentionedPageNumbers("Okay, let's look at page 43 now."), [43]);
});

test("Sinhala phrasing: number before 'පිටුව' with ordinal suffix", () => {
  assert.deepEqual(extractMentionedPageNumbers("හරි, දැන් අපි 43 වෙනි පිටුව බලමු."), [43]);
});

test("Sinhala phrasing: 'පිටුව' before number, no ordinal", () => {
  assert.deepEqual(extractMentionedPageNumbers("පිටුව 121 බලමු."), [121]);
});

test("does not misfire on an unrelated number in a math problem (the confirmed real bug's own example)", () => {
  assert.deepEqual(extractMentionedPageNumbers("හරි, දැන් 31 × 8 කීයද කියලා බලමු."), []);
});

test("does not misfire on a vague transition with no explicit number", () => {
  assert.deepEqual(extractMentionedPageNumbers("ලස්සනයි! ඊළඟ ප්‍රශ්නය බලමු."), []);
});

test("multiple distinct mentions, in first-mentioned order, deduplicated", () => {
  assert.deepEqual(
    extractMentionedPageNumbers("පිටුව 43 ඉවර උනාට පස්සේ, page 50 එකට යමු. ආයෙත් page 43 බලමු."),
    [43, 50],
  );
});

test("'page number 43' with the word 'number' in between", () => {
  assert.deepEqual(extractMentionedPageNumbers("Let's go to page number 43."), [43]);
});
