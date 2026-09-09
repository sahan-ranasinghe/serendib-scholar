import test from "node:test";
import assert from "node:assert/strict";
import { judgePhrase, judgePhraseLocally, type PhraseRubric } from "./phraseJudge";

/** readWrite4Digit:31's rubric, as recorded in docs/review/session-1-corrections.json. */
const RUBRIC: PhraseRubric = {
  acceptIfAnyOf: ["අසූව", "80", "බිංදුව", "දහයස්ථානය", "8 නෙවෙයි", "අටේ අගය", "අසූවක්"],
  conceptDescription: "In 84 the digit 8 is in the tens place and represents 80, not 8.",
};

const CORRECT = [
  "අටට බිංදුවක් දාන්න ඕනේ", // the zero on the 8
  "අට තියෙන්නේ දහයස්ථානයේ", // the 8 is in the tens place
  "ඒක අසූව වෙන්න ඕනේ", // it should be eighty
  "අටෙන් පෙන්වන්නේ 80", // the 8 shows 80 (digits)
];
const WRONG = ["හතර වැරදියි", "අසූ හතර හරියටම හරි"];

test("stage 1 accepts four correct phrasings without a model", () => {
  for (const phrasing of CORRECT) {
    const verdict = judgePhraseLocally(phrasing, RUBRIC);
    assert.equal(verdict.accepted, true, `should accept "${phrasing}"`);
  }
});

test("stage 1 does not accept the two wrong ones", () => {
  for (const phrasing of WRONG) {
    assert.equal(judgePhraseLocally(phrasing, RUBRIC).accepted, false, `should not accept "${phrasing}"`);
  }
});

test("the model is called only when stage 1 found nothing, and the stage is reported", async () => {
  let calls = 0;
  const model = async () => {
    calls += 1;
    return { accepted: false, why: "does not name the tens place or 80" };
  };
  for (const phrasing of CORRECT) {
    const verdict = await judgePhrase(phrasing, RUBRIC, model);
    assert.equal(verdict.stage, 1);
    assert.equal(verdict.accepted, true);
  }
  assert.equal(calls, 0);
  for (const phrasing of WRONG) {
    const verdict = await judgePhrase(phrasing, RUBRIC, model);
    assert.equal(verdict.stage, 2);
    assert.equal(verdict.accepted, false);
  }
  assert.equal(calls, WRONG.length);
});

test("number names and digits are the same token", () => {
  assert.equal(judgePhraseLocally("අගය අසූව", { acceptIfAnyOf: ["80"], conceptDescription: "" }).accepted, true);
  assert.equal(judgePhraseLocally("අගය 80", { acceptIfAnyOf: ["අසූව"], conceptDescription: "" }).accepted, true);
});
