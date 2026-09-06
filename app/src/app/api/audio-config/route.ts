import { NextResponse } from "next/server";
import { ZARA_VOICE } from "@/lib/zaraVoice";
import { AUDIO_FORMAT_VERSION } from "@/lib/audioCache";

/**
 * What the browser needs to NAME a clip: the pinned voice (half of a
 * clip's identity — the other half is the spoken text). Clips themselves
 * are fetched through /api/clip/<key>; the storage origin is no longer
 * advertised here.
 */
export async function GET() {
  return NextResponse.json({ ok: true, voice: ZARA_VOICE, version: AUDIO_FORMAT_VERSION });
}
