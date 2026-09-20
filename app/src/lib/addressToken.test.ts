import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAddress, resolveBeatAddress } from "./addressToken";
import { AUTHORED_LINES, RETEACH_LINES } from "./authoredLines";

test("every child is addressed පුතේ — boy, girl and unspecified alike", () => {
  const line = "දැන් බලන්න {address}, මම පෙන්නන්නම්.";
  const spoken = "දැන් බලන්න පුතේ, මම පෙන්නන්නම්.";
  assert.equal(resolveAddress(line, "boy"), spoken);
  assert.equal(resolveAddress(line, "girl"), spoken);
  assert.equal(resolveAddress(line, "unspecified"), spoken);
});

test("gender adds no variants — one resolved line means one recorded clip", () => {
  const lines = [
    "හරි නේද {address}? තේරුණාද?",
    "හිතාගන්න වෙලාව ගන්න {address}.",
    "හරි, දැන් මේක {address} තනියම කරලා බලන්න.",
  ];
  for (const line of lines) {
    const rendered = new Set((["boy", "girl", "unspecified"] as const).map((g) => resolveAddress(line, g)));
    assert.equal(rendered.size, 1, `${line} rendered ${rendered.size} ways`);
    assert.ok(!rendered.values().next().value!.includes("{address}"), "the token survived");
  }
});

test("resolution covers every speakable field of a beat", () => {
  const resolved = resolveBeatAddress(
    {
      goal: "g",
      spokenText: "බලන්න {address}.",
      sayCandidates: ["හොඳයි {address}!", "නියමයි!"],
      praiseText: "හරි {address}!",
    },
    "girl",
  );
  assert.equal(resolved.spokenText, "බලන්න පුතේ.");
  assert.deepEqual(resolved.sayCandidates, ["හොඳයි පුතේ!", "නියමයි!"]);
  assert.equal(resolved.praiseText, "හරි පුතේ!");
});

test("no authored line hard-codes an address word; tokens only", () => {
  for (const value of [...Object.values(AUTHORED_LINES), ...Object.values(RETEACH_LINES)]) {
    for (const line of Array.isArray(value) ? value : [value]) {
      assert.ok(!/පුතේ|දුවේ/u.test(line), `hard-coded address in: ${line}`);
    }
  }
});

test("the two requested line edits are in place", () => {
  assert.equal(AUTHORED_LINES.feedbackCorrect[0], "හරි! ඔයා හරියටම කිව්වා! නියමයි!");
  assert.equal(AUTHORED_LINES.showBoardMode3, "හරි, දැන් මේක {address} තනියම කරලා බලන්න.");
});
