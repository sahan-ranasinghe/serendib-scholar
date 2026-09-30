import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AUDIO_BUCKET } from "@/lib/audioCache";
import { humanClipPath, humanMetaPath, humanOpusPath } from "@/lib/humanClips";
import { deleteTake, getTake, takesForClip } from "@/lib/actorStore";
import { portalLineById } from "@/lib/portalLines";

/**
 * Delete a kept take: the line returns to "not recorded".
 *
 * The processed clip goes, so the runtime stops finding a human recording
 * for those words and falls back to the AI one. The RAW take is left
 * alone — deleting is how she says "that read was wrong", not "destroy the
 * evidence", and a raw file costs nothing to keep.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const beatId = typeof body.beat_id === "string" ? body.beat_id : "";
  if (!beatId) return NextResponse.json({ ok: false, error: "beat_id is required" }, { status: 400 });

  // The row's clip: one recording per line, whichever row id it was kept under (an older portal listed one line many
  // times) — so deleting it removes that clip and every take of it, never a different line's.
  const clipKeyValue = (await portalLineById(beatId))?.clipKey ?? (await getTake(beatId))?.clip_key ?? null;
  if (clipKeyValue) {
    const storage = supabaseAdmin.storage.from(AUDIO_BUCKET);
    await storage.remove([humanClipPath(clipKeyValue), humanOpusPath(clipKeyValue), humanMetaPath(clipKeyValue)]);
    for (const take of await takesForClip(clipKeyValue)) await deleteTake(take.beat_id);
  }
  await deleteTake(beatId);
  return NextResponse.json({ ok: true });
}
