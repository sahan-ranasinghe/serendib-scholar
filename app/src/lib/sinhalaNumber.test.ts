import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNumberJoiners, renderNumberMarkers, sinhalaNumberName } from "./sinhalaNumber";

/**
 * Every expected name below is a VERIFIED pair from an official source:
 * [T] the textbook transcription (lesson1-numbers.ts, "encoded exactly as
 * given"), [G] the teacher's guide, [S] the task spec's own examples.
 * The ල/ළ variation (හතලිස්/හතළිස්) is normalised — the textbook itself
 * uses both spellings; this codebase standardises on ළ.
 */
function normalise(text: string): string {
  return text.replace(/ල/gu, "ළ").replace(/ /gu, " ").replace(/\s+/gu, " ").trim();
}

const VERIFIED_PAIRS: Array<[number, string, string]> = [
  // --- textbook, 4-digit (steps 2, 4) -----------------------------------
  [2430, "දෙදහස් හාරසිය තිහ", "T step-2"],
  [3100, "තුන්දහස් එකසියය", "T step-2"],
  [1008, "එක්දහස් අට", "T step-2"],
  [2311, "දෙදහස් තුන්සිය එකොළහ", "T step-4"],
  // --- textbook, 5-digit (step 8) ---------------------------------------
  [72932, "හැත්තෑ දෙදහස් නවසිය තිස් දෙක", "T step-8"],
  [10112, "දස දහස් එකසිය දොළහ", "T step-8 q1"],
  [13220, "දහ තුන්දහස් දෙසිය විස්ස", "T step-8 q2"],
  [41485, "හතලිස් එක්දහස් හාරසිය අසූ පහ", "T step-8 q4"],
  [69377, "හැට නවදහස් තුන්සිය හැත්තෑ හත", "T step-8 q5"],
  [35019, "තිස් පන්දහස් දහනවය", "T step-8 q6"],
  [50005, "පනස් දහස් පහ", "T step-8 q7"],
  // --- textbook, the round ten-thousands (step 6) ------------------------
  [10000, "දස දහස", "T step-6"],
  [20000, "විසි දහස", "T step-6"],
  [30000, "තිස් දහස", "T step-6"],
  [40000, "හතළිස් දහස", "T step-6"],
  [50000, "පනස් දහස", "T step-6"],
  [60000, "හැට දහස", "T step-6 + step-7 example"],
  [70000, "හැත්තෑ දහස", "T step-6"],
  [80000, "අසූ දහස", "T step-6"],
  [90000, "අනූ දහස", "T step-6"],
  [100000, "සියක් දහස", "T step-6 + G"],
  // --- the guide's 9+1 / 99+1 / 999+1 build-up ---------------------------
  [10, "දහය", "G activity 1"],
  [100, "සියය", "G activity 1"],
  [1000, "දහස", "G activity 1"],
  // --- the guide's worked 5-digit example --------------------------------
  [26147, "විසි හයදහස් එකසිය හතළිස් හත", "G activity 3"],
  // --- the task spec's own pair ------------------------------------------
  [5060, "පන්දහස් හැට", "S"],
];

test("every verified source pair renders exactly", () => {
  for (const [n, expected, source] of VERIFIED_PAIRS) {
    assert.equal(
      normalise(sinhalaNumberName(n)),
      normalise(expected),
      `${n} (${source}): expected "${expected}", got "${sinhalaNumberName(n)}"`,
    );
  }
});

test("zero-omission holds wherever a place is empty", () => {
  assert.equal(sinhalaNumberName(5060), "පන්දහස් හැට");
  assert.equal(sinhalaNumberName(1008), "එක්දහස් අට");
  assert.equal(sinhalaNumberName(50005), "පනස් දහස් පහ");
  assert.equal(sinhalaNumberName(7003), "හත්දහස් තුන");
  assert.equal(sinhalaNumberName(40100), "හතළිස් දහස් එකසියය"); // prefix kept inside a larger number, as in 3100
});

test("the guide's 3-digit warm-up numbers render", () => {
  assert.equal(sinhalaNumberName(84), "අසූ හතර");
  assert.equal(sinhalaNumberName(101), "එකසිය එක");
  assert.equal(sinhalaNumberName(528), "පන්සිය විසි අට");
  assert.equal(sinhalaNumberName(997), "නවසිය අනූ හත");
});

test("teens-of-thousands follow the textbook's දහ decomposition", () => {
  assert.equal(sinhalaNumberName(11000), "දහ එක්දහස");
  assert.equal(sinhalaNumberName(19435), "දහ නවදහස් හාරසිය තිස් පහ");
});

test("terminal vs combining forms switch on position", () => {
  assert.equal(sinhalaNumberName(5000), "පන්දහස"); // terminal
  assert.equal(sinhalaNumberName(5322), "පන්දහස් තුන්සිය විසි දෙක"); // combining chain
  assert.equal(sinhalaNumberName(20), "විස්ස");
  assert.equal(sinhalaNumberName(21), "විසි එක");
});

test("out of range throws rather than improvising", () => {
  assert.throws(() => sinhalaNumberName(100001));
  assert.throws(() => sinhalaNumberName(-1));
  assert.throws(() => sinhalaNumberName(1.5));
});

/**
 * The suffix joiner. Every pair below is a native-speaker correction from
 * docs/review/session-1-edits.json (§2) or the joinerInstrumentalFix in
 * docs/review/gemini-review-decisions.json — the left column is what the
 * session-1 script actually shipped.
 */
test("case endings bind to the number name, with or without a space", () => {
  assert.equal(renderNumberMarkers("{number:9} ට {number:1} ක්").spoken, "නවයට එකක්");
  assert.equal(renderNumberMarkers("{number:9}ට {number:1}ක්").spoken, "නවයට එකක්");
  assert.equal(renderNumberMarkers("{number:99} ට").spoken, "අනූ නවයට");
  assert.equal(renderNumberMarkers("{number:5000} ක").spoken, "පන්දහසක");
  assert.equal(renderNumberMarkers("{number:400} කුත්").spoken, "හාරසියයකුත්");
  assert.equal(renderNumberMarkers("{number:60} යි.").spoken, "හැටයි.");
  assert.equal(renderNumberMarkers("{number:6} ක් පේනවා").spoken, "හයක් පේනවා");
});

test("a bare න් after a number is the instrumental, and gets its vowel sign", () => {
  assert.equal(renderNumberMarkers("{number:2}න්").spoken, "දෙකෙන්");
  assert.equal(renderNumberMarkers("{number:1}න්").spoken, "එකෙන්");
  assert.equal(renderNumberMarkers("{number:5}න් පෙන්වන").spoken, "පහෙන් පෙන්වන");
  // Already correct in the source: rendered unchanged, never double-signed.
  assert.equal(renderNumberMarkers("{number:2}ෙන්").spoken, "දෙකෙන්");
  assert.equal(renderNumberMarkers("{number:5}ෙන්").spoken, "පහෙන්");
});

test("vowel signs land on the name's final consonant", () => {
  assert.equal(renderNumberMarkers("{number:2}ේ අගය").spoken, "දෙකේ අගය");
  assert.equal(renderNumberMarkers("{number:2} ේ අගය").spoken, "දෙකේ අගය");
  assert.equal(renderNumberMarkers("{number:1}මයි.").spoken, "එකමයි.");
});

test("a word that merely STARTS with a joiner keeps its space", () => {
  // "කියලයි" begins with ක, but continues into ි — it is a word, not an ending.
  assert.equal(renderNumberMarkers("{number:1364} කියලයි").spoken, "එක්දහස් තුන්සිය හැට හතර කියලයි");
  assert.equal(renderNumberMarkers("{number:10} හැදෙනවා").spoken, "දහය හැදෙනවා");
  assert.equal(renderNumberMarkers("{number:5421} කියන").spoken, "පන්දහස් හාරසිය විසි එක කියන");
});

test("joiner normalisation is idempotent and reports the numbers spoken", () => {
  const once = normalizeNumberJoiners("{number:9} ට {number:1} ක්");
  assert.equal(normalizeNumberJoiners(once), once);
  assert.deepEqual(renderNumberMarkers("{number:9}ට {number:1}ක් {number:10}").numbers, [9, 1, 10]);
});
