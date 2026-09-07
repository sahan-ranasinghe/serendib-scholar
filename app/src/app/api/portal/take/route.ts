import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AUDIO_BUCKET } from "@/lib/audioCache";
import { humanClipPath, humanMetaPath, humanOpusPath, rawTakePath, type HumanClipMeta } from "@/lib/humanClips";
import { processTake, resolveFfmpeg } from "@/lib/actorAudio";
import { upsertTake } from "@/lib/actorStore";

/**
 * One kept take, uploaded.
 *
 * ORDER MATTERS, and it is the whole design of this route. The raw bytes
 * go to Storage FIRST, before any processing is attempted, and only then
 * is anything told to the client. She may be on a phone on a domestic
 * connection two hours into a session; the one thing that must never
 * happen is a take existing only in her browser. Everything after the raw
 * upload can be redone from it.
 *
 * So:
 *   1. raw → Storage. If this fails, the take failed; she retries.
 *   2. row → 'pending_processing'. The line is now SAFE.
 *   3. ffmpeg, if there is one here (Vercel has none). Success promotes
 *      the row to 'saved' with duration and sentence spans; failure leaves
 *      it pending, to be finished by `npm run portal:process`.
 *
 * The portal only counts a line as recorded at step 2 or later — never on
 * the strength of a local blob.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TAKE_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "expected multipart form data" }, { status: 400 });

  const lineId = String(form.get("line_id") ?? "");
  const text = String(form.get("text") ?? "");
  const clipKeyForText = String(form.get("clip_key") ?? "");
  const trimStartMs = Number(form.get("trim_start_ms") ?? 0) || 0;
  const trimEndRaw = form.get("trim_end_ms");
  const trimEndMs = trimEndRaw === null || trimEndRaw === "" ? null : Number(trimEndRaw);
  const peakDbfs = form.get("peak_dbfs") === null ? null : Number(form.get("peak_dbfs"));
  const noiseDbfs = form.get("noise_dbfs") === null ? null : Number(form.get("noise_dbfs"));
  const audio = form.get("audio");

  if (!lineId || !clipKeyForText || !(audio instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "line_id, clip_key and audio are required" }, { status: 400 });
  }
  const raw = new Uint8Array(await audio.arrayBuffer());
  if (raw.byteLength === 0) return NextResponse.json({ ok: false, error: "empty take" }, { status: 400 });
  if (raw.byteLength > MAX_TAKE_BYTES) {
    return NextResponse.json({ ok: false, error: "take too large" }, { status: 413 });
  }

  const storage = supabaseAdmin.storage.from(AUDIO_BUCKET);

  // 1. RAW FIRST. Nothing else is allowed to run before her bytes are out
  //    of the browser and in the bucket.
  const rawPath = rawTakePath(lineId, Date.now());
  const rawUpload = await storage.upload(rawPath, raw, { contentType: audio.type || "audio/webm", upsert: true });
  if (rawUpload.error) {
    // The real message, not a generic one. "Upload failed — retrying
    // automatically" sent the first session hunting for a network problem
    // when the bucket was plainly saying "mime type audio/webm is not
    // supported"; she should be able to read the cause off the screen.
    const message = rawUpload.error.message;
    console.error(`[portal] raw upload failed for ${lineId}: ${message}`);
    await upsertTake({ beat_id: lineId, status: "failed" });
    const mimeProblem = /mime type/i.test(message);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint: mimeProblem
          ? "The audio bucket is rejecting this recording format. Open /portal/status — the health check says how to widen it."
          : undefined,
        retryable: !mimeProblem,
      },
      { status: 502 },
    );
  }

  // 2. The line is now safe, whatever happens next.
  await upsertTake({
    beat_id: lineId,
    clip_key: clipKeyForText,
    raw_path: rawPath,
    trim_start_ms: trimStartMs,
    trim_end_ms: trimEndMs,
    status: "pending_processing",
    peak_dbfs: peakDbfs,
    noise_dbfs: noiseDbfs,
  });

  // 3. Process here if this environment can.
  if (!(await resolveFfmpeg())) {
    return NextResponse.json({
      ok: true,
      status: "pending_processing",
      note: "Saved. Audio conditioning runs later (no ffmpeg in this environment).",
    });
  }

  try {
    const processed = await processTake(raw, { trimStartMs, trimEndMs });
    const meta: HumanClipMeta = {
      durationMs: processed.durationMs,
      sentences: processed.sentences,
      text,
      voice: "human",
      source: "human",
      beatId: lineId,
      recordedAt: new Date().toISOString(),
    };
    const wavUpload = await storage.upload(humanClipPath(clipKeyForText), processed.wav, {
      contentType: "audio/wav",
      upsert: true,
    });
    if (wavUpload.error) throw new Error(wavUpload.error.message);
    if (processed.opus.byteLength > 0) {
      await storage.upload(humanOpusPath(clipKeyForText), processed.opus, {
        contentType: "audio/opus",
        upsert: true,
      });
    }
    await storage.upload(humanMetaPath(clipKeyForText), JSON.stringify(meta), {
      contentType: "application/json",
      upsert: true,
    });

    await upsertTake({
      beat_id: lineId,
      clip_key: clipKeyForText,
      clip_path: humanClipPath(clipKeyForText),
      opus_path: processed.opus.byteLength > 0 ? humanOpusPath(clipKeyForText) : null,
      duration_ms: processed.durationMs,
      sentences: processed.sentences,
      status: "saved",
    });
    return NextResponse.json({
      ok: true,
      status: "saved",
      durationMs: processed.durationMs,
      sentences: processed.sentences,
    });
  } catch (error) {
    // The raw take is already safe; this is recoverable work, not lost work.
    console.error(`[portal] processing failed for ${lineId}: ${String(error).slice(0, 200)}`);
    return NextResponse.json({
      ok: true,
      status: "pending_processing",
      note: "Saved. Conditioning failed here and will be retried offline.",
    });
  }
}
