/**
 * The reteach lines, against the rules they were written under.
 *
 *   npm run test:authored-lines
 *
 * One line per concept, taken from that concept's own objective in
 * docs/design/maths-5-1.json (see RETEACH_LINES in authoredLines.ts for
 * why the beat needs words at all). These assertions are the review a
 * native speaker cannot do on every commit: length, register, and above
 * all that a child meeting a second miss is not handed a word the lesson
 * has not taught her yet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RETEACH_LINES } from "./authoredLines";

interface Concept {
  conceptTag: string;
  objective: string;
  vocabularyIntroduced?: string[];
  vocabularyNotSpoken?: { terms?: string[] } | null;
}

const design = JSON.parse(
  readFileSync(path.join(process.cwd(), "../docs/design/maths-5-1.json"), "utf8"),
) as { concepts: Concept[] };

/** Words as a speaker counts them: the em-dash that marks a pause is not one. */
const words = (line: string) => line.split(/\s+/u).filter((w) => w.replace(/[—…,.!?]/gu, "").length > 0);

test("every concept in the design file has a reteach line", () => {
  for (const concept of design.concepts) {
    assert.ok(
      RETEACH_LINES[concept.conceptTag],
      `${concept.conceptTag} can be missed twice and has no line to carry the reteach`,
    );
  }
});

test("no reteach line is written for a concept the design file does not have", () => {
  const known = new Set(design.concepts.map((c) => c.conceptTag));
  for (const tag of Object.keys(RETEACH_LINES)) assert.ok(known.has(tag), `RETEACH_LINES has no concept ${tag}`);
});

test("each line is at most fourteen words", () => {
  for (const [tag, line] of Object.entries(RETEACH_LINES)) {
    assert.ok(words(line).length <= 14, `${tag}: ${words(line).length} words — "${line}"`);
  }
});

test("each line is spoken Sinhala: no English, no digits, ending in a full stop", () => {
  for (const [tag, line] of Object.entries(RETEACH_LINES)) {
    assert.ok(!/[A-Za-z]/u.test(line), `${tag} has English letters: "${line}"`);
    // The style card allows a numeral only where the official material uses one;
    // a reteach line names no specific item, so it needs none.
    assert.ok(!/[0-9]/u.test(line), `${tag} has a numeral: "${line}"`);
    assert.ok(line.trim().endsWith("."), `${tag} does not end in a full stop: "${line}"`);
  }
});

test("no line uses a term the guide keeps out of her mouth", () => {
  for (const concept of design.concepts) {
    for (const term of concept.vocabularyNotSpoken?.terms ?? []) {
      for (const [tag, line] of Object.entries(RETEACH_LINES)) {
        assert.ok(!line.includes(term), `${tag} says "${term}", which is book vocabulary, not hers`);
      }
    }
  }
});

test("no line reaches forward for a word a later concept has yet to introduce", () => {
  const order = design.concepts.map((c) => c.conceptTag);
  for (const [tag, line] of Object.entries(RETEACH_LINES)) {
    const mine = order.indexOf(tag);
    for (const concept of design.concepts) {
      if (order.indexOf(concept.conceptTag) <= mine) continue; // its own vocabulary, and everything already met, is fair
      for (const term of concept.vocabularyIntroduced ?? []) {
        assert.ok(
          !line.includes(term),
          `${tag} uses "${term}", which the child does not meet until ${concept.conceptTag}`,
        );
      }
    }
  }
});
