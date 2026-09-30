import { COPY, type CopyKey } from "../../src/lib/appCopy";

/**
 * The harnesses read the app's words from the copy sheet by key (29 Sep 2026) — never a second copy of them, which
 * breaks the moment a copy editor changes a line (docs/cms/content-inventory.md §16).
 */
export const copy = (key: CopyKey): string => COPY[key].si;

/** A CSS selector for the control whose accessible name is this copy key. */
export const ariaSel = (key: CopyKey): string => `[aria-label=${JSON.stringify(COPY[key].si)}]`;

/** A copy template as a regex source: its words escaped, each {hole} a captured (\d+). */
export function copyPattern(key: CopyKey): string {
  return COPY[key].si.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\\\{[a-zA-Z]+\\\}/gu, "(\\d+)");
}
