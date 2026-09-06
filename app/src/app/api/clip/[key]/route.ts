import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { AUDIO_BUCKET, clipMetaPath, clipPath } from "@/lib/audioCache";
import { requireSession } from "@/lib/sessionAuth";

/**
 * The only door to the (private) clip bucket.
 *
 * The lesson-audio bucket used to be public: clips are lesson content, not
 * child data, but a public bucket is still an open bandwidth bill and an
 * open catalogue of the product's entire audio. So the bucket is private
 * and the browser comes here instead — session cookie required (also
 * enforced by proxy.ts) — and gets a 302 to a signed URL that dies after
 * ten minutes. `?meta=1` redirects to the clip's metadata JSON the same
 * way.
 */

const SIGNED_URL_TTL_SECONDS = 600;
const KEY_SHAPE = /^[0-9a-f]{16,64}$/;

export async function GET(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { key } = await context.params;
  if (!KEY_SHAPE.test(key)) {
    return NextResponse.json({ ok: false, error: "bad_key" }, { status: 400 });
  }
  const wantMeta = request.nextUrl.searchParams.get("meta") === "1";
  const path = wantMeta ? clipMetaPath(key) : clipPath(key);

  const { data, error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    // A miss is normal for a line the batch render hasn't reached — the
    // client falls back to /api/speak-line, which renders and caches it.
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
