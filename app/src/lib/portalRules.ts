/**
 * The voice actor portal's decisions, pure (the routes that apply them are server-only; these are tested).
 */

export type LineStatus = "pending" | "accepted" | "rejected" | "note_only";

/**
 * A note never changes a decision already made on a line (29 Sep 2026): an accepted re-wording stays accepted — it used
 * to be reset to note_only, and the re-wording silently dropped out of the script — a rejected one stays rejected; only
 * a line with no decision becomes note_only.
 */
export function statusAfterNote(existing: LineStatus | null | undefined): LineStatus {
  return existing === "accepted" || existing === "rejected" ? existing : "note_only";
}
