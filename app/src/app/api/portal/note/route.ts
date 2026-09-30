import { NextRequest, NextResponse } from "next/server";
import { listLines, upsertLine } from "@/lib/actorStore";
import { statusAfterNote } from "@/lib/portalRules";

/**
 * A note against one line: "this sentence is awkward", "say X instead".
 *
 * Goes to the database, not the repo, so it survives a deploy and reaches
 * the author through /portal/status and the review doc without her having
 * to send anything. A note alone does not change the words — status stays
 * 'note_only' unless "say it your way" has promoted her wording.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const beatId = typeof body.beat_id === "string" ? body.beat_id : "";
  const note = typeof body.note === "string" ? body.note.slice(0, 2000) : "";
  const originalText = typeof body.original_text === "string" ? body.original_text : "";
  if (!beatId) return NextResponse.json({ ok: false, error: "beat_id is required" }, { status: 400 });

  // A note is a note: it never changes a decision already made on the line. An accepted re-wording stays accepted (it
  // used to be reset to note_only, and the re-wording silently dropped out of the script), a rejected one stays
  // rejected; only a line with no decision is marked note_only. The original words are the stored ones, if any.
  const existing = (await listLines()).find((line) => line.beat_id === beatId);
  await upsertLine({
    beat_id: beatId,
    original_text: existing?.original_text || originalText,
    note: note || null,
    status: statusAfterNote(existing?.status),
  });
  return NextResponse.json({ ok: true });
}
