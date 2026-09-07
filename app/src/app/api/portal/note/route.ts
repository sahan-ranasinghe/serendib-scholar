import { NextRequest, NextResponse } from "next/server";
import { upsertLine } from "@/lib/actorStore";

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

  await upsertLine({
    beat_id: beatId,
    original_text: originalText,
    note: note || null,
    status: "note_only",
  });
  return NextResponse.json({ ok: true });
}
