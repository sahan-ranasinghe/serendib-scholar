import test from "node:test";
import assert from "node:assert/strict";
import { charNgrams, cosine, jaccard, sentencesOf, stripOfficial, surfaceSimilarity } from "./scriptDistance";

test("stripping removes digits, number names, vocabulary terms and instructions", () => {
  const stripped = stripOfficial(
    "දැන් {address} බලන්න, 26 147 කියන්නේ විසි හයදහස් එකසිය හතළිස් හත — ඒකේ දස දහසස්ථානය මොකක්ද?",
    [],
  );
  assert.ok(!/\d/u.test(stripped), `digits survived: ${stripped}`);
  assert.ok(!stripped.includes("විසි"), "number lexeme survived");
  assert.ok(!stripped.includes("දස දහසස්ථානය"), "vocabulary term survived");
  assert.ok(!stripped.includes("{address}"), "the address token survived");
  // The genuinely-authored words remain.
  assert.ok(stripped.includes("බලන්න"));
});

test("a verbatim textbook instruction never counts as copying", () => {
  const instruction = "පහත කොටුවේ ඇති ඉලක්කම්වලින් හතරක් බැගින් භාවිත කර ඉලක්කම් හතරේ සංඛ්‍යා පහක් ලියන්න.";
  const stripped = stripOfficial(`හරි, ${instruction} පටන් ගමු.`, [instruction]);
  assert.ok(!stripped.includes("කොටුවේ"), "instruction text survived the strip");
  assert.ok(stripped.includes("පටන්"), "the authored words around it remain");
});

test("identical phrasing scores Jaccard 1, unrelated phrasing scores low", () => {
  const a = charNgrams("ඔන්න දැන් අපි මේක එකට කරලා බලමු");
  assert.equal(jaccard(a, a), 1);
  const b = charNgrams("හෙට උදේ පාසල් යන්න කලින් කෑම කන්න");
  assert.ok(jaccard(a, b) < 0.05);
});

test("a lightly-edited transcript sentence is caught by the surface guard", () => {
  const transcript = "ඔන්න ඉතින් අපි දැන් මේ ගණක රාමුව දිහා හොඳට බලමු පුතේ";
  const corpus = [{ sentence: transcript, grams: charNgrams(stripOfficial(transcript)) }];
  const nearCopy = "ඔන්න ඉතින් අපි දැන් මේ ගණක රාමුව දිහා හොඳින් බලමු"; // one word tweaked
  const hits = surfaceSimilarity(nearCopy, corpus);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].jaccard > 0.35, `expected a catch, jaccard=${hits[0].jaccard.toFixed(2)}`);
});

test("a genuinely reworded sentence passes the surface guard", () => {
  const transcript = "ඔන්න ඉතින් අපි දැන් මේ ගණක රාමුව දිහා හොඳට බලමු පුතේ";
  const corpus = [{ sentence: transcript, grams: charNgrams(stripOfficial(transcript)) }];
  const original = "හරි {address}, මේ තියෙන රාමුවේ පූස් කූරු ටික ගණන් කරන්නද?";
  const hits = surfaceSimilarity(original, corpus);
  assert.ok(hits.every((hit) => hit.jaccard <= 0.35), `false positive: ${JSON.stringify(hits)}`);
});

test("sentences too short after stripping are skipped, not compared", () => {
  const corpus = [{ sentence: "x", grams: charNgrams("අහඹු දිග වාක්‍යයක් තමයි මේ තියෙන්නේ හරිද") }];
  // Nothing but a number and a vocabulary term — nothing authored to judge.
  const hits = surfaceSimilarity("26 147 — දස දහසස්ථානය.", corpus);
  assert.equal(hits.length, 0);
});

test("cosine is 1 for identical vectors and ~0 for orthogonal ones", () => {
  assert.ok(Math.abs(cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  assert.equal(cosine([1, 0], [0, 1]), 0);
});

test("sentence splitting respects the pause marker", () => {
  assert.deepEqual(sentencesOf("බලන්න… හරි. දැන් කියන්න!"), ["බලන්න…", "හරි.", "දැන් කියන්න!"]);
});
