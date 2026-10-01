import { test } from "node:test";
import assert from "node:assert/strict";
import { COPY, LATIN_ALLOWED_SCREENS, MISSING, t } from "./appCopy";

/**
 * The copy sheet after the native review round (29 Sep 2026, docs/review/app-copy-corrections.json): every string has
 * its Sinhala, and a child-facing string carries no English beyond the four words a Sri Lankan family uses as they are.
 */

/** The English a child-facing string may carry (the owner's list): Wi-Fi, PIN, SMS — and ඩේටා, written in Sinhala. */
const ALLOWED_LATIN = ["Wi-Fi", "PIN", "SMS"];
/**
 * Child-facing strings that still carry other English, each listed for the owner rather than rewritten here:
 * cert.print's "(A4)" is the paper size on the certificate's print button.
 */
const KNOWN_ENGLISH = new Set(["cert.print"]);
/**
 * Strings with WORDS but no Sinhala, by design: the dev-only English notice under the OTP step (a parent surface, dev
 * builds only). Strings with no words at all — "‹", "+1", "15 · 20 · 30", "{year} {month} {day}" — need none.
 */
const NO_SINHALA_BY_DESIGN = new Set(["onb.1.devNoticeEn"]);

const childFacing = Object.entries(COPY).filter(([, entry]) => !LATIN_ALLOWED_SCREENS.has(entry.screen));
const latinIn = (si: string) => {
  let text = si.replace(/\{[a-zA-Z]+\}/gu, "");
  for (const word of ALLOWED_LATIN) text = text.split(word).join("");
  return text.match(/[A-Za-z][A-Za-z0-9-]*/gu) ?? [];
};

test("nothing is missing: every string in the sheet has its Sinhala", () => {
  assert.equal(MISSING.length, 0, `still missing: ${MISSING.map((m) => m.key).join(", ")}`);
  for (const [key, entry] of Object.entries(COPY)) {
    assert.ok(entry.si.trim().length > 0, `${key} has no text`);
    const words = /[A-Za-z඀-෿]/u.test(entry.si.replace(/\{[a-zA-Z]+\}/gu, ""));
    if (words && !NO_SINHALA_BY_DESIGN.has(key)) assert.ok(/[඀-෿]/u.test(entry.si), `${key} has no Sinhala: "${entry.si}"`);
  }
});

test("no child-facing string carries English beyond Wi-Fi, ඩේටා, PIN and SMS (and the one listed exception)", () => {
  const found = childFacing.filter(([key, entry]) => latinIn(entry.si).length > 0 && !KNOWN_ENGLISH.has(key)).map(([key, entry]) => `${key} (${entry.screen}): ${latinIn(entry.si).join(", ")}`);
  assert.deepEqual(found, []);
  for (const key of KNOWN_ENGLISH) assert.ok(latinIn(COPY[key as keyof typeof COPY].si).length > 0, `${key} no longer carries English — drop it from KNOWN_ENGLISH`);
});

test("the consistency pass: no on-screen string says ආයෙ for 'again' — ආයෙත් everywhere", () => {
  const bare = Object.entries(COPY).filter(([, entry]) => /ආයෙ(?!ත්)/u.test(entry.si)).map(([key]) => key);
  assert.deepEqual(bare, []);
});

test("the month names are twelve, January first", () => {
  const names = COPY["month.names"].si.split(/,\s*/u);
  assert.equal(names.length, 12);
  assert.equal(names[0], "ජන.");
  assert.equal(names[8], "සැප්.");
  assert.equal(names[9], "ඔක්.");
  assert.equal(COPY["month.names"].en.split(/,\s*/u).length, 12);
});

test("session ordinals say වෙනි everywhere (the spoken form), never වන", () => {
  const written = Object.entries(COPY).filter(([, entry]) => /වන සැසිය/u.test(entry.si)).map(([key]) => key);
  assert.deepEqual(written, []);
  assert.match(COPY["common.sessionNth"].si, /වෙනි සැසිය/u);
});

test("the child sees සාරා, never the Latin name", () => {
  const latinName = childFacing.filter(([, entry]) => /Zara/u.test(entry.si)).map(([key]) => key);
  assert.deepEqual(latinName, []);
});

test("the child's controls have Sinhala accessible names", () => {
  for (const key of ["a11y.backspace", "a11y.done", "a11y.close", "a11y.back", "a11y.beadDrag", "a11y.blank", "a11y.pageLoading"] as const) assert.match(COPY[key].si, /^[\u0D80-\u0DFF\u200D ]+$/u, key);
  // The abacus's tappable rod: its own label, the bead count, and nothing Latin around them.
  assert.equal(t("a11y.rodTap", { rod: "සි", n: 4 }), "සි: පබළු 4 — ඔබන්න");
  assert.doesNotMatch(COPY["a11y.rodTap"].si.replace(/\{(rod|n)\}/gu, ""), /[A-Za-z]/u);
});
