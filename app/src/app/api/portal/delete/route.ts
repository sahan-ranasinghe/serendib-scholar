import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AUDIO_BUCKET } from "@/lib/audioCache";
import { humanClipPath, humanMetaPath, humanOpusPath } from "@/lib/humanClips";
import { deleteTake, getTake } from "@/lib/actorStore";

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

  const take = await getTake(beatId);
  if (take?.clip_key) {
    const storage = supabaseAdmin.storage.from(AUDIO_BUCKET);
    await storage.remove([
      humanClipPath(take.clip_key),
      humanOpusPath(take.clip_key),
      humanMetaPath(take.clip_key),
    ]);
  }
  await deleteTake(beatId);
  return NextResponse.json({ ok: true });
}
