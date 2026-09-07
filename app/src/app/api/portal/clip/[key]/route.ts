import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AUDIO_BUCKET, clipMetaPath, clipPath } from "@/lib/audioCache";
import { humanClipPath } from "@/lib/humanClips";

/**
 * Playback for the portal: her own take, or the AI clip as a reference.
 *
 * The child's /api/clip route needs a child session, which the actor
 * deliberately does not have — so the portal has its own door, gated by
 * her cookie in the proxy. Same private bucket, same short-lived signed
 * URLs; `?source=ai` fetches the rendered clip for the same words so she
 * can hear the intended pacing before recording.
 */
const SIGNED_URL_TTL_SECONDS = 600;
const KEY_SHAPE = /^[0-9a-f]{16,64}$/;

export async function GET(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!KEY_SHAPE.test(key)) return NextResponse.json({ ok: false, error: "bad_key" }, { status: 400 });

  const source = request.nextUrl.searchParams.get("source") === "ai" ? "ai" : "human";
  const wantMeta = request.nextUrl.searchParams.get("meta") === "1";
  const path = source === "ai" ? (wantMeta ? clipMetaPath(key) : clipPath(key)) : humanClipPath(key);

  const { data, error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, 302);
}
