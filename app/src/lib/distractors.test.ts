import test from "node:test";
import assert from "node:assert/strict";
import { choicesForQuestion, numberDistractors, validateChoices, shuffleBySeed, type ChoiceSet } from "./distractors";
import { sinhalaNumberName } from "./sinhalaNumber";

const RUBRIC = {
  acceptIfAnyOf: ["අසූව", "80", "බිංදුව", "දහයස්ථානය", "8 නෙවෙයි", "අටේ අගය", "අසූවක්"],
  conceptDescription: "In 84 the digit 8 is in the tens place and represents 80, not 8.",
  choices: ["අටේ අගය අසූවයි, අට නෙවෙයි", "හතරේ අගය හතළිහයි", "අසූ හතර හරියටම හරි"],
};

test("number-name distractors: swapped digits, a zero dropped or added, one place off", () => {
  assert.deepEqual(numberDistractors(5421).slice(0, 3), [5412, 5241, 4521]);
  assert.ok(numberDistractors(1008).includes(108), "a zero dropped");
  assert.ok(numberDistractors(528).includes(5028), "a zero added");
  assert.ok(numberDistractors(84).includes(840), "one place off");
});

test("a value question: the adjacent place and the digit itself", () => {
  const set = choicesForQuestion({ id: "t", answerMode: "valueOrPlace", expectedAnswer: "පන්දහස", numbers: [5421] })!;
  assert.deepEqual([...set.options].sort(), ["5", "500", "5000"]);
  assert.equal(set.options[set.correctIndex], "5000");
  assert.deepEqual(validateChoices(set, "පන්දහස"), []);
});

test("a bead count, a digit, a name, a finding — each three distinct options with exactly one correct", () => {
  const cases: Array<[Parameters<typeof choicesForQuestion>[0], string]> = [
    [{ id: "c", answerMode: "valueOrPlace", expectedAnswer: "එක", line: "එකස්ථානයේ පබළු කීයක් තියෙනවද?" }, "එක"],
    [{ id: "d", answerMode: "valueOrPlace", expectedAnswer: "7", numbers: [8700, 700], line: "මොන ඉලක්කමද?" }, "7"],
    [{ id: "n", answerMode: "readAloud", expectedAnswer: sinhalaNumberName(5421) }, sinhalaNumberName(5421)],
    [{ id: "w", answerMode: "why", expectedAnswer: "අටට බිංදුවක් දාලා නෑ", rubric: RUBRIC }, "අටට බිංදුවක් දාලා නෑ"],
    [{ id: "cell", answerMode: "cell", expectedAnswer: "6000", field: "valueRepresented", numbers: [6572, 6] }, "6000"],
    [{ id: "cell2", answerMode: "cell", expectedAnswer: "2430", field: "number", numbers: [2430] }, "2430"],
  ];
  for (const [q, expected] of cases) {
    const set = choicesForQuestion(q);
    const isCorrect = q.answerMode === "why" ? (o: string) => o === RUBRIC.choices[0] : undefined;
    assert.deepEqual(validateChoices(set, expected, isCorrect), [], `${q.id}: ${JSON.stringify(set)}`);
  }
});

test("the validator rejects the answer under another label, duplicates, and a wrong correctIndex", () => {
  const relabelled: ChoiceSet = { options: ["පන්දහස", "5000", "500"], correctIndex: 0 };
  assert.ok(validateChoices(relabelled, "පන්දහස").some((p) => p.includes("different label")));
  const dupes: ChoiceSet = { options: ["5000", "5000", "500"], correctIndex: 0 };
  assert.ok(validateChoices(dupes, "5000").some((p) => p.includes("distinct")));
  const wrongIndex: ChoiceSet = { options: ["5000", "50", "500"], correctIndex: 1 };
  assert.ok(validateChoices(wrongIndex, "5000").some((p) => p.includes("correctIndex")));
});

test("an open build has no chips; the shuffle is deterministic", () => {
  assert.equal(choicesForQuestion({ id: "p", answerMode: "build", expectedAnswer: '{"kind": "permutationOf", "digits": [1, 3, 6, 4], "length": 4}' }), null);
  assert.deepEqual(shuffleBySeed([1, 2, 3, 4], "same"), shuffleBySeed([1, 2, 3, 4], "same"));
  assert.notDeepEqual(shuffleBySeed([1, 2, 3, 4, 5, 6], "a"), shuffleBySeed([1, 2, 3, 4, 5, 6], "b"));
});

test("the word bank: the name's own words plus two deterministic distractors, none of them answer words", () => {
  const { nameWordBank } = require("./distractors") as typeof import("./distractors");
  const bank = nameWordBank(6528, "t")!;
  assert.deepEqual(bank.answer, ["හයදහස්", "පන්සිය", "විසි", "අට"]);
  assert.equal(bank.tiles.length, 6);
  for (const word of bank.answer) assert.ok(bank.tiles.includes(word));
  const extras = bank.tiles.filter((w) => !bank.answer.includes(w));
  assert.deepEqual(extras.sort(), ["නවය", "හයසිය"].sort(), "the leading digit one place down, and the last word off by one");
  assert.deepEqual(nameWordBank(6528, "t"), nameWordBank(6528, "t"), "deterministic");
  const short = nameWordBank(2430, "s")!;
  assert.deepEqual(short.answer, ["දෙදහස්", "හාරසිය", "තිහ"]);
  assert.equal(short.tiles.length, 5);
});
