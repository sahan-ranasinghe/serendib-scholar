import { createHash } from "node:crypto";

/**
 * THE LESSON-SCRIPT CACHE'S FINGERPRINT (29 Sep 2026, docs/cms/content-inventory.md §16). Pure: no database, no files.
 *
 * lesson_scripts caches the built script, and it is served only while this fingerprint matches — so the fingerprint
 * has to change whenever anything that ends up IN the script changes. It used to hash only each content_bank row's
 * id + component_type: an in-place edit of a row's props, answer or spoken transcript (or a packing number) never
 * reached a child until someone forced a rebuild. It now hashes:
 *   - the format version (the builder's output shape),
 *   - every verified row's FULL content (concept, difficulty, type, props, answer, explanation, source),
 *   - the blueprint override file and the authored script (with the actor's accepted re-wordings),
 *   - every packing constant (lessonScriptBuilder PACKING, with the pace estimates),
 *   - the content the builder bakes into the script (concept titles and descriptions, item titles, the lesson title,
 *     the fixed spoken lines it inserts).
 */
export interface FingerprintInput {
  formatVersion: string;
  rows: Array<{ id: string } & Record<string, unknown>>;
  overrideJson?: string;
  authoredJson?: string;
  packing: unknown;
  content: unknown;
}

/** JSON with every object's keys sorted — the same value always hashes the same, whatever order the database returned. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

export function fingerprintScriptInputs(input: FingerprintInput): string {
  const hash = createHash("sha256");
  hash.update(`format:${input.formatVersion};`);
  hash.update(`override:${input.overrideJson ?? ""};`);
  hash.update(`authored:${input.authoredJson ?? ""};`);
  hash.update(`packing:${stableJson(input.packing)};`);
  hash.update(`content:${stableJson(input.content)};`);
  const rows = [...input.rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of rows) hash.update(`row:${stableJson(row)};`);
  return hash.digest("hex").slice(0, 32);
}
