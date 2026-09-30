import { NextResponse } from "next/server";
import { ensureAudioBucket } from "@/lib/liveTts";
import { portalLines } from "@/lib/portalLines";

/**
 * Everything the portal needs to draw a whole session, in one request.
 *
 * The actor's page must survive a reload mid-session with nothing lost, so
 * it holds no durable state of its own: it asks for this and redraws. That
 * means the response has to carry her takes and her notes alongside the
 * script, not just the lines.
 *
 * Text is delivered ADDRESS-RESOLVED. She reads what the child hears
 * ("පුතේ", never "{address}"), and the clip key is the hash of exactly
 * those words — the same key the AI clip for that line would have, which
 * is what lets the runtime prefer her recording without knowing the portal
 * exists.
 *
 * Proxy-gated by the portal cookie (src/proxy.ts); no child session is
 * involved, and none is accepted.
 */

/**
 * The bucket's MIME allowlist, reconciled when the portal opens.
 *
 * The widen lived only in scripts/render-lesson-audio.ts, which nobody
 * runs before a recording session — so production kept rejecting her takes
 * with "mime type audio/webm is not supported" while the fix sat in the
 * repo looking applied. Reconciling here means the first request the
 * portal makes repairs the bucket, on every deployment, without anyone
 * remembering to.
 *
 * Once per process, and never fatal: a bucket problem must show up as a
 * failed health check, not as a portal that will not load.
 */
let bucketReconciled: Promise<void> | null = null;
function reconcileBucketOnce(): Promise<void> {
  bucketReconciled ??= ensureAudioBucket().catch((error) => {
    bucketReconciled = null; // let the next request try again
    console.error(`[portal] could not reconcile the audio bucket: ${String(error).slice(0, 200)}`);
  });
  return bucketReconciled;
}

/**
 * Every line the runtime can speak, one row per distinct line, grouped (src/lib/portalLines.ts), with THE voice
 * coverage count (src/lib/voiceCoverage.ts) — the same number /portal/status, portal:coverage and the dry run show.
 */
export async function GET() {
  await reconcileBucketOnce();
  const { lines, coverage } = await portalLines();
  return NextResponse.json({ ok: true, lesson: "maths-5-1", lines, coverage });
}
