import test from "node:test";
import assert from "node:assert/strict";
import { checkSpeechRules, type SpeechBeat } from "./speechRules";

const beat = (over: Partial<SpeechBeat> & { id: string }): SpeechBeat => ({
  spokenText: "",
  pauseType: null,
  ...over,
});

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
