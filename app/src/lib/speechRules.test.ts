import test from "node:test";
import assert from "node:assert/strict";
import { checkSpeechRules, type SpeechBeat } from "./speechRules";

const beat = (over: Partial<SpeechBeat> & { id: string }): SpeechBeat => ({
  spokenText: "",
  pauseType: null,
  ...over,
});

const ask = (id: string, spokenText: string, expectedAnswer?: string): SpeechBeat =>
  beat({ id, spokenText, type: "ASK", pauseType: "ASK", expectedAnswer: expectedAnswer ?? null });

test("a RHETORICAL beat must end with a tag", () => {
  // The two the review actually caught, before it rewrote them.
  const findings = checkSpeechRules([
    beat({ id: "a", pauseType: "RHETORICAL", spokenText: "{address}, බලන්නකෝ මේ රවුම ඇතුළේ තියෙන ඉලක්කම් ටික දිහා." }),
    beat({ id: "b", pauseType: "RHETORICAL", spokenText: "ශෝක්! එකතු වුණාම එක්දහස් තුන්සිය හැට හතර හැටියට කියවෙනවා." }),
  ]);
  assert.equal(findings.length, 2);
  assert.ok(findings.every((f) => f.rule === "rhetoricalMustEndWithTag"));
});

test("the vocative is not part of the tag, before or after the comma", () => {
  const findings = checkSpeechRules([
    beat({ id: "a", pauseType: "RHETORICAL", spokenText: "ලකුණු ඔයා කියවලා තියෙනවා නේද {address}?" }),
    beat({ id: "b", pauseType: "RHETORICAL", spokenText: "තියෙන්නේ පබළු පහයි නේද, {address}?" }),
    beat({ id: "c", pauseType: "RHETORICAL", spokenText: "මෙතන කිසිම අගයක් කියවෙන්නේ නැහැ, නේද?" }),
    beat({ id: "d", pauseType: "RHETORICAL", spokenText: "ඒ තැනට බිංදුවක් ලියන්න ඕනේ, හරිද?" }),
  ]);
  assert.deepEqual(findings, []);
});

test("only RHETORICAL beats are held to the tag rule", () => {
  const findings = checkSpeechRules([
    beat({ id: "a", pauseType: "ASK", spokenText: "මුල්ම සංඛ්‍යාව මොකක්ද කියලා මට කියන්න." }),
    beat({ id: "b", pauseType: null, spokenText: "අපේ පළමු පාඩම තමයි සංඛ්‍යා." }),
  ]);
  assert.deepEqual(findings, []);
});

test("bookish words are flagged with the spoken replacement the review named", () => {
  const findings = checkSpeechRules([
    beat({ id: "a", spokenText: "ගණක රාමුවෙන් නිරූපණය කරලා බලමු." }),
    beat({ id: "b", spokenText: "අබකසය දිහා බලන්න." }),
    beat({ id: "c", spokenText: "එතනින් ලැබෙන වටිනාකම බිංදුවම තමයි." }),
  ]);
  assert.deepEqual(
    findings.map((f) => [f.beatId, f.suggestion]),
    [["a", "පෙන්වන"], ["b", "ගණක රාමුව"], ["c", "අගය"]],
  );
});

test("සංඛ්‍යාංක is allowed in the beat that teaches the term, not for pointing at digits", () => {
  const findings = checkSpeechRules([
    beat({ id: "teaching", spokenText: "මේ ඉලක්කම්වලට සංඛ්‍යාංකය කියලා කියනවා." }),
    beat({ id: "pointing", spokenText: "රවුම ඇතුළේ තියෙන සංඛ්‍යාංක ටික දිහා බලන්න." }),
  ]);
  assert.deepEqual(findings.map((f) => f.beatId), ["pointing"]);
});

test('"සහ" is flagged only between numbers being listed aloud', () => {
  const findings = checkSpeechRules([
    beat({ id: "list", spokenText: "එක, තුන, හය සහ හතර", sourceText: "{number:1}, {number:3}, {number:6} සහ {number:4}" }),
    beat({ id: "prose", spokenText: "අම්මා සහ තාත්තා ගෙදර ඉන්නවා.", sourceText: "අම්මා සහ තාත්තා ගෙදර ඉන්නවා." }),
  ]);
  assert.deepEqual(findings.map((f) => f.beatId), ["list"]);
});

test("a paraphrase is correct BEFORE the term is introduced and wrong after", () => {
  // readWrite4Digit:17 must say සියයේ තැන — සියයස්ථානය belongs to the next
  // activity. The identical words later in the lesson are a regression.
  const findings = checkSpeechRules([
    beat({ id: "before", spokenText: "මෙතන සියයේ තැනට කිසිම අගයක් කියවෙන්නේ නැහැ, නේද?" }),
    beat({ id: "introduces", spokenText: "වමට යද්දී දහයස්ථානය, සියයස්ථානය පිහිටනවා." }),
    beat({ id: "after", spokenText: "ඊළඟට සියයේ කූරෙන් හාරසියයකුත් ලැබෙනවා." }),
  ]);
  assert.deepEqual(
    findings.map((f) => [f.beatId, f.rule]),
    [["after", "termConsistencyAfterIntroduction"]],
  );
});

test("a clean script reports nothing", () => {
  assert.deepEqual(
    checkSpeechRules([
      beat({ id: "a", pauseType: "RHETORICAL", spokenText: "ලකුණු පුවරුව දිහා බලලා තියෙනවා නේද {address}?" }),
      beat({ id: "b", spokenText: "ගණක රාමුවේ දකුණු කෙළවරේ තියෙන කූර එකස්ථානයයි." }),
    ]),
    [],
  );
});

/**
 * The two flow rules. Both exist because the script's WORDS passed every
 * earlier check while its structure ignored what the child had said.
 */

test("praise in the beat after a question is a bug, not a compliment", () => {
  const findings = checkSpeechRules([
    ask("q", "මුල්ම සංඛ්‍යාව මොකක්ද?", "අසූ හතර"),
    beat({ id: "a", spokenText: "නියමයි! ඒ සංඛ්‍යාව අසූ හතරයි.", type: "EXPLAIN" }),
  ]);
  assert.deepEqual(findings.map((f) => [f.beatId, f.rule]), [["a", "noVerdictAfterAQuestion"]]);
});

test("a neutral statement of the same answer passes", () => {
  const findings = checkSpeechRules([
    ask("q", "මුල්ම සංඛ්‍යාව මොකක්ද?", "අසූ හතර"),
    beat({ id: "a", spokenText: "පළමු සංඛ්‍යාව අසූ හතරයි.", type: "EXPLAIN" }),
  ]);
  assert.deepEqual(findings, []);
});

test("neutral openers are fine; a verdict later in the beat is not the target", () => {
  // "එහෙනම්" presumes nothing about the answer. ("ඔව්" used to be here —
  // it is now flagged after a judged ASK, see the round-7 test below.)
  const findings = checkSpeechRules([
    ask("q", "කීයද?", "දහය"),
    beat({ id: "a", spokenText: "එහෙනම්, ඒක දහයයි.", type: "EXPLAIN" }),
  ]);
  assert.deepEqual(findings, []);
});

test("praise where no question preceded is left alone", () => {
  const findings = checkSpeechRules([
    beat({ id: "explain", spokenText: "අපි දැන් ගණක රාමුව බලමු.", type: "EXPLAIN" }),
    beat({ id: "praise", spokenText: "නියමයි! දැන් අපි ඉදිරියට යමු.", type: "TRANSITION" }),
  ]);
  assert.deepEqual(findings, []);
});

test("a number stated after an open-ended invitation is flagged", () => {
  const findings = checkSpeechRules([
    beat({ id: "q", spokenText: "ඔයා කැමති සංඛ්‍යාවක් හදලා මට කියන්න.", type: "SOFT_CHECK", pauseType: "SOFT_CHECK" }),
    beat({ id: "a", spokenText: "එක්දහස් තුන්සිය හැට හතර ලස්සනයි.", sourceText: "{number:1364} ලස්සනයි.", type: "EXPLAIN" }),
  ]);
  assert.deepEqual(findings.map((f) => [f.beatId, f.rule]), [["a", "noAssumedAnswer"]]);
});

test("the same number framed as an example is allowed", () => {
  for (const frame of ["උදාහරණයක් විදිහට අපිට එක්දහස් තුන්සිය හැට හතර හදන්නත් පුළුවන්.", "අපි හිතමු එක්දහස් තුන්සිය හැට හතර හැදුවා කියලා."]) {
    const findings = checkSpeechRules([
      beat({ id: "q", spokenText: "ඔයා කැමති සංඛ්‍යාවක් හදන්න.", type: "SOFT_CHECK", pauseType: "SOFT_CHECK" }),
      beat({ id: "a", spokenText: frame, sourceText: "{number:1364}", type: "EXPLAIN" }),
    ]);
    assert.deepEqual(findings, [], frame);
  }
});

test("a rhetorical soft check is a confirmation, not an invitation", () => {
  // Zara asks "you remember the order, don't you?" and then names HER OWN
  // example number. Nothing was assumed about the child's answer, and
  // flagging it would make the rule noise.
  const findings = checkSpeechRules([
    beat({ id: "q", spokenText: "කූරු හතරේ පිළිවෙළ ඔයාට මතක හිටියා නේද {address}?", type: "SOFT_CHECK", pauseType: "SOFT_CHECK" }),
    beat({ id: "a", spokenText: "ඔන්න අපි පන්දහස් හාරසිය විසි එක රාමුවට දාමු.", sourceText: "ඔන්න අපි {number:5421} රාමුවට දාමු.", type: "EXPLAIN" }),
  ]);
  assert.deepEqual(findings, []);
});

test("a question with one right answer may state it plainly", () => {
  const findings = checkSpeechRules([
    ask("q", "දහසස්ථානයේ අගය කීයද?", "6000"),
    beat({ id: "a", spokenText: "ඒක හයදහසයි.", sourceText: "ඒක {number:6000}යි.", type: "EXPLAIN" }),
  ]);
  assert.deepEqual(findings, []);
});

/** Round 7: the board rules. */

test("a worked answer on the board before its question is flagged — the old :96→:100 shape", () => {
  const findings = checkSpeechRules([
    beat({ id: "96", type: "SHOW_BOARD", spokenText: "මෙන්න අභ්‍යාසයක්.", board: { kind: "text", text: "5 421 = 5 000 + 400 + 20 + 1" } }),
    ask("98", "දහසස්ථානයේ ඉලක්කම මොකක්ද?", "5"),
    beat({ id: "99", type: "EXPLAIN", spokenText: "දහසස්ථානයේ ඉන්නේ පහ නේද." }),
    ask("100", "ඒ පහ නිසා ලැබෙන අගය කීයද?", "5000"),
  ]);
  assert.deepEqual(
    findings.map((f) => [f.beatId, f.rule]),
    // Both halves of the same pair: the BOARD is flagged for displaying an
    // answer still to be asked for, and the ASK is flagged for its answer
    // already being up. (:98 asks for a DIGIT visible inside 5 421 — a
    // read-the-digit question, not an answer given away.)
    [
      ["96", "boardDisplaysALaterAnswer"],
      ["100", "answerShownBeforeAsked"],
    ],
  );
});

test("stored answers are not displayed answers — a blank expansion is clean", () => {
  // The exact shape of :96. `answers` is the reveal key; boardFor maps
  // every cell to null, so nothing is on the board to give away.
  const findings = checkSpeechRules([
    beat({ id: "96", type: "SHOW_BOARD", spokenText: "මෙන්න.", board: { kind: "expansion", number: 5421, answers: [5000, 400, 20, 1] } }),
    ask("98", "දහසස්ථානයේ ඉලක්කම මොකක්ද?", "5"),
    ask("100", "ඒ පහ නිසා ලැබෙන අගය කීයද?", "5000"),
  ]);
  assert.deepEqual(findings, []);
});

test("the same run with a blank expansion and a reveal after the confirmation is clean", () => {
  const findings = checkSpeechRules([
    beat({ id: "96", type: "SHOW_BOARD", spokenText: "මෙන්න අභ්‍යාසයක්.", board: { kind: "expansion", number: 5421 } }),
    ask("98", "දහසස්ථානයේ ඉලක්කම මොකක්ද?", "5"),
    beat({ id: "99", type: "EXPLAIN", spokenText: "දහසස්ථානයේ ඉන්නේ පහ නේද." }),
    ask("100", "ඒ පහ නිසා ලැබෙන අගය කීයද?", "5000"),
    beat({ id: "101", type: "EXPLAIN", spokenText: "ඒක පන්දහසයි.", sourceText: "ඒක {number:5000}යි.", numbers: [5000], board: { kind: "reveal", value: "5000" } }),
  ]);
  assert.deepEqual(findings, []);
});

test("an expansion staged AFTER the question is not an early answer (:88 / :92)", () => {
  const findings = checkSpeechRules([
    beat({ id: "87", type: "EXPLAIN", spokenText: "අපි මුලින්ම ලියලා බලමු.", board: { kind: "text", text: "6 831" } }),
    ask("88", "දහසස්ථානයේ හයෙන් පෙන්වන අගය කීයද?", "6000"),
    beat({ id: "89", type: "EXPLAIN", spokenText: "ඒක හයදහසයි.", board: { kind: "text", text: "6 831 = 6000 + 800 + 30 + 1" } }),
  ]);
  assert.deepEqual(findings, []);
});

test("a clear between two beats showing the same board is a flash", () => {
  const picker = { kind: "digitPicker", digits: [1, 3, 6, 4] };
  const findings = checkSpeechRules([
    beat({ id: "a", type: "EXPLAIN", spokenText: "බලන්න.", board: picker }),
    beat({ id: "b", type: "EXPLAIN", spokenText: "දැන් හදමු.", board: { kind: "clear" } }),
    beat({ id: "c", type: "EXPLAIN", spokenText: "ආයෙත් බලන්න.", board: picker }),
  ]);
  assert.ok(findings.some((f) => f.beatId === "b" && f.rule === "clearIsAFlash"));
});

test("no beat may clear inside a run of questions on the picker", () => {
  const picker = { kind: "digitPicker", digits: [1, 3, 6, 4] };
  const pred = JSON.stringify({ kind: "permutationOf", digits: [1, 3, 6, 4], length: 4 });
  const findings = checkSpeechRules([
    ask("q1", "සංඛ්‍යාවක් හදන්න.", pred),
    beat({ id: "q1", type: "ASK", pauseType: "ASK", expectedAnswer: pred, spokenText: "සංඛ්‍යාවක් හදන්න.", board: picker }),
    beat({ id: "r1", type: "EXPLAIN", spokenText: "ඒ සංඛ්‍යාවේ නම බෝඩ් එකේ බලන්න.", board: { kind: "builtNumber" } }),
    beat({ id: "oops", type: "EXPLAIN", spokenText: "දැන් තව එකක්.", board: { kind: "clear" } }),
    beat({ id: "q2", type: "ASK", pauseType: "ASK", expectedAnswer: pred, spokenText: "වෙනස් එකක් හදන්න.", board: picker }),
  ]);
  assert.ok(findings.some((f) => f.beatId === "oops" && f.rule === "noClearInsideAnAskRun"));
});

test("inherit and the read-back overlay never count as a clear", () => {
  const picker = { kind: "digitPicker", digits: [1, 3, 6, 4] };
  const pred = JSON.stringify({ kind: "permutationOf", digits: [1, 3, 6, 4], length: 4 });
  const findings = checkSpeechRules([
    beat({ id: "q1", type: "ASK", pauseType: "ASK", expectedAnswer: pred, spokenText: "සංඛ්‍යාවක් හදන්න.", board: picker }),
    beat({ id: "r1", type: "EXPLAIN", spokenText: "ඒ සංඛ්‍යාවේ නම බෝඩ් එකේ බලන්න.", board: { kind: "builtNumber" } }),
    beat({ id: "q2", type: "ASK", pauseType: "ASK", expectedAnswer: pred, spokenText: "වෙනස් එකක් හදන්න.", board: { kind: "none" } }),
    beat({ id: "r2", type: "EXPLAIN", spokenText: "ඒ සංඛ්‍යාවේ නම බෝඩ් එකේ බලන්න.", board: { kind: "builtNumber" } }),
  ]);
  assert.deepEqual(findings.filter((f) => f.rule.startsWith("clear") || f.rule.startsWith("noClear")), []);
});

test("ඔව් after a judged ASK presumes the child was right; after a soft check it is fine", () => {
  const afterAsk = checkSpeechRules([
    ask("q", "නවසිය අනූ නවයට එකක් එකතු කළාම කීයද?", "1000"),
    beat({ id: "a", type: "EXPLAIN", spokenText: "ඔව්, නවසිය අනූ නවයට එකක් එකතු වුණාම දහස හැදෙනවා." }),
  ]);
  assert.deepEqual(afterAsk.map((f) => [f.beatId, f.rule]), [["a", "noVerdictAfterAQuestion"]]);
  const afterSoft = checkSpeechRules([
    beat({ id: "s", type: "SOFT_CHECK", pauseType: "SOFT_CHECK", spokenText: "පේනවා නේද?" }),
    beat({ id: "a", type: "EXPLAIN", spokenText: "ඔව්, මෙතන ඉලක්කම් හතරක් තියෙනවා." }),
  ]);
  assert.deepEqual(afterSoft, []);
});
