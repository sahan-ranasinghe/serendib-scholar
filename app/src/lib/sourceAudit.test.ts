import { test } from "node:test";
import assert from "node:assert/strict";
import { settingOccurrences, uiSinhalaLiterals } from "../../scripts/lib/sourceAudit";

/**
 * Two greps the app must keep passing (scripts/lib/sourceAudit.ts; `npm run audit:source` prints them). Both came from
 * the CMS inventory (docs/cms/content-inventory.md §16): every word on a child's or a parent's screen is in the copy
 * sheet, and every duplicated setting is written once — so the CMS has one place to take each of them from.
 */

test("no Sinhala literal in child- or parent-facing code outside appCopy.ts and authoredLines.ts", () => {
  const found = uiSinhalaLiterals().map((l) => `${l.file}:${l.line}  ${l.text.slice(0, 60)}`);
  assert.deepEqual(found, []);
});

test("each duplicated setting is written once — in src/lib/settings.ts (the tagline: in the copy sheet)", () => {
  for (const { name, hits } of settingOccurrences()) {
    assert.equal(hits.length, 1, `${name}: ${hits.length} occurrences — ${hits.map((h) => `${h.file}:${h.line}`).join(", ")}`);
    assert.equal(hits[0]!.file, name === "tagline" ? "src/lib/appCopy.ts" : "src/lib/settings.ts", `${name} lives in ${hits[0]!.file}`);
  }
});
