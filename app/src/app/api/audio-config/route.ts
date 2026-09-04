import { NextResponse } from "next/server";
import { ZARA_VOICE } from "@/lib/zaraVoice";
import { AUDIO_FORMAT_VERSION } from "@/lib/audioCache";

/**
 * What the browser needs to find a cached clip on its own: the pinned
 * voice (half of a clip's identity — the other half is the text) and the
 * storage origin. With these the runtime fetches clips straight from
 * storage and only calls the app server when a line is missing.
 */
export async function GET() {
  const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return NextResponse.json({
    ok: Boolean(storageUrl),
    voice: ZARA_VOICE,
    storage_url: storageUrl.replace(/\/$/, ""),
    version: AUDIO_FORMAT_VERSION,
  });
}
