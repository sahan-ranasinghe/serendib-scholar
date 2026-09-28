import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_MAX_OPEN_SECONDS, CHAT_MIN_CHARGE_SECONDS, chatCharge, chatHold, isChatMinutes } from "./chatBudgetRules";

test("a chat opened and closed in ten seconds costs the minimum, 15 s — not 5 minutes", () => {
  assert.equal(chatCharge(10, 600, 11), CHAT_MIN_CHARGE_SECONDS);
  assert.equal(CHAT_MIN_CHARGE_SECONDS, 15);
});

test("a chat is charged the time it was connected", () => {
  assert.equal(chatCharge(95.2, 600, 97), 96);
});

test("an opening costs at most what it held — a forgotten session cannot drain the day", () => {
  assert.equal(chatCharge(4000, CHAT_MAX_OPEN_SECONDS, 4000), CHAT_MAX_OPEN_SECONDS);
  assert.equal(chatCharge(300, 120, 300), 120);
});

test("the client cannot claim more time than has passed on the server's clock", () => {
  assert.equal(chatCharge(500, 600, 60), 65);
});

test("a nonsense report is charged the minimum", () => {
  assert.equal(chatCharge(Number.NaN, 600, 30), 15);
  assert.equal(chatCharge(-5, 600, 30), 15);
});

test("an opening holds what is left, up to the per-open cap; too little left refuses it", () => {
  assert.equal(chatHold(1800), CHAT_MAX_OPEN_SECONDS);
  assert.equal(chatHold(200), 200);
  assert.equal(chatHold(15), 15);
  assert.equal(chatHold(14), null);
  assert.equal(chatHold(0), null);
});

test("a parent chooses 15, 30 or 60 minutes a day", () => {
  assert.deepEqual([15, 30, 60, 20, 45, "30"].map(isChatMinutes), [true, true, true, false, false, false]);
});

test("the old flat fee gave three openings a day; the new day of 30 minutes holds many short chats", () => {
  // 30 minutes, ten-second chats charged at the minimum: 120 openings, not 3.
  let used = 0;
  let openings = 0;
  for (;;) {
    const hold = chatHold(1800 - used);
    if (hold === null) break;
    used += chatCharge(10, hold, 10);
    openings += 1;
  }
  assert.equal(openings, 120);
});
