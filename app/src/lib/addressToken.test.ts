import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAddress, resolveBeatAddress } from "./addressToken";
import { AUTHORED_LINES } from "./authoredLines";

test("boy and girl get the right vocative", () => {
  assert.equal(resolveAddress("දැන් බලන්න {address}, මම පෙන්නන්නම්.", "boy"), "දැන් බලන්න පුතේ, මම පෙන්නන්නම්.");
  assert.equal(resolveAddress("දැන් බලන්න {address}, මම පෙන්නන්නම්.", "girl"), "දැන් බලන්න දුවේ, මම පෙන්නන්නම්.");
});

test("unspecified drops the word and the sentence still reads naturally", () => {
  assert.equal(resolveAddress("දැන් බලන්න {address}, මම පෙන්නන්නම්.", "unspecified"), "දැන් බලන්න, මම පෙන්නන්නම්.");
  assert.equal(resolveAddress("හරි නේද {address}? තේරුණාද?", "unspecified"), "හරි නේද? තේරුණාද?");
  assert.equal(resolveAddress("හිතාගන්න වෙලාව ගන්න {address}.", "unspecified"), "හිතාගන්න වෙලාව ගන්න.");
  assert.equal(
    resolveAddress("හරි, දැන් මේක {address} තනියම කරලා බලන්න.", "unspecified"),
    "හරි, දැන් මේක තනියම කරලා බලන්න.",
  );
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
  assert.equal(resolved.spokenText, "බලන්න දුවේ.");
  assert.deepEqual(resolved.sayCandidates, ["හොඳයි දුවේ!", "නියමයි!"]);
  assert.equal(resolved.praiseText, "හරි දුවේ!");
});

test("no authored line hard-codes an address word; tokens only", () => {
  for (const value of Object.values(AUTHORED_LINES)) {
    for (const line of Array.isArray(value) ? value : [value]) {
      assert.ok(!/පුතේ|දුවේ/u.test(line), `hard-coded address in: ${line}`);
    }
  }
});

test("the two requested line edits are in place", () => {
  assert.equal(AUTHORED_LINES.feedbackCorrect[0], "හරි! ඔයා හරියටම කිව්වා! නියමයි!");
  assert.equal(AUTHORED_LINES.showBoardMode3, "හරි, දැන් මේක {address} තනියම කරලා බලන්න.");
});
