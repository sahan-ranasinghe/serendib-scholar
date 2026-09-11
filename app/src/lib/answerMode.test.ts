import test from "node:test";
import assert from "node:assert/strict";
import { deriveAnswerMode, valueOfAnswer, isPartValue, conceptSkill } from "./answerMode";

test("the concept objective names the skill", () => {
  assert.equal(conceptSkill("readWrite4Digit", "9 999 තෙක් කුමන සංඛ්‍යාවක් වුව ද කියවයි."), "readWrite");
  assert.equal(conceptSkill("placeValue4Digit", "ඉලක්කම් හතරේ සංඛ්‍යාවල ස්ථානීය අගය දක්වයි."), "placeValue");
});

test("names and digits give their value; a part of a number is not a number to read", () => {
  assert.equal(valueOfAnswer("අසූ හතර"), 84);
  assert.equal(valueOfAnswer("පන්දහස"), 5000);
  assert.equal(valueOfAnswer("බිංදුව"), 0);
  assert.equal(valueOfAnswer("2430"), 2430);
  assert.equal(valueOfAnswer("අටට බිංදුවක් දාලා නෑ"), null);
  assert.equal(isPartValue(5000), true);
  assert.equal(isPartValue(1), true);
  assert.equal(isPartValue(5421), false);
});

test("the mode follows the expects type and the skill", () => {
  const rw = (expectedAnswer: string | null, extra: Partial<Parameters<typeof deriveAnswerMode>[0]> = {}) => deriveAnswerMode({ type: "ASK", expectedAnswer, skill: "readWrite", ...extra });
  const pv = (expectedAnswer: string | null, extra: Partial<Parameters<typeof deriveAnswerMode>[0]> = {}) => deriveAnswerMode({ type: "ASK", expectedAnswer, skill: "placeValue", ...extra });
  assert.equal(rw('{"kind": "permutationOf", "digits": [1, 3, 6, 4], "length": 4}'), "build");
  assert.equal(rw("1000"), "build");
  assert.equal(rw("අසූ හතර"), "readAloud");
  assert.equal(rw("හයදහස් පන්සිය විසි අට", { boardKind: "blank" }), "cell");
  assert.equal(deriveAnswerMode({ type: "CHECK_MY_WORK", expectedAnswer: "අටට බිංදුවක් දාලා නෑ", hasRubric: true, skill: "readWrite" }), "why");
  assert.equal(pv("එක"), "valueOrPlace");
  assert.equal(pv("පන්දහස"), "valueOrPlace");
  assert.equal(pv("6000"), "valueOrPlace");
  assert.equal(pv("5"), "valueOrPlace");
  assert.equal(pv("පන්දහස් හාරසිය විසි එක"), "readAloud");
  assert.equal(pv("6000", { boardKind: "blank" }), "cell");
  assert.equal(deriveAnswerMode({ type: "SOFT_CHECK", expectedAnswer: null, skill: "placeValue", precedingMode: "readAloud" }), "readAloud");
  assert.equal(deriveAnswerMode({ type: "SOFT_CHECK", expectedAnswer: null, skill: "placeValue" }), "valueOrPlace");
});
