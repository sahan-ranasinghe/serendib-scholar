import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintScriptInputs, stableJson } from "./scriptFingerprint";

const row = (props: Record<string, unknown>, answer: unknown = "5421") => ({
  id: "7b58e436-334f-452c-bc2a-81f234d03268",
  concept_tag: "placeValue4Digit",
  difficulty: "standard",
  component_type: "place_value_breakdown",
  component_props: props,
  answer,
  explanation: { spokenTranscript: "දැන් මේ වගුව බලමු." },
  source: "textbook",
});
const base = { formatVersion: "15", rows: [row({ number: 2348 })], overrideJson: "", authoredJson: "{}", packing: { sessionAskLimit: 12 }, content: { conceptTitles: { a: "ස්ථානීය අගය" } } };

test("an in-place edit of a row's props, answer or explanation changes the fingerprint (it used to hash id + type only)", () => {
  const before = fingerprintScriptInputs(base);
  assert.notEqual(fingerprintScriptInputs({ ...base, rows: [row({ number: 2349 })] }), before, "props");
  assert.notEqual(fingerprintScriptInputs({ ...base, rows: [row({ number: 2348 }, "5422")] }), before, "answer");
  assert.notEqual(fingerprintScriptInputs({ ...base, rows: [{ ...row({ number: 2348 }), explanation: { spokenTranscript: "වෙනස්." } }] }), before, "explanation");
});

test("a packing constant or baked-in content changing changes the fingerprint", () => {
  const before = fingerprintScriptInputs(base);
  assert.notEqual(fingerprintScriptInputs({ ...base, packing: { sessionAskLimit: 11 } }), before);
  assert.notEqual(fingerprintScriptInputs({ ...base, content: { conceptTitles: { a: "අගය" } } }), before);
  assert.notEqual(fingerprintScriptInputs({ ...base, formatVersion: "16" }), before);
});

test("the same content hashes the same whatever order the keys and rows arrive in", () => {
  const a = { ...base, rows: [row({ number: 2348, field: "digit" }), { ...row({}), id: "a0" }] };
  const b = { ...base, rows: [{ ...row({}), id: "a0" }, row({ field: "digit", number: 2348 })] };
  assert.equal(fingerprintScriptInputs(a), fingerprintScriptInputs(b));
  assert.equal(stableJson({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
});
