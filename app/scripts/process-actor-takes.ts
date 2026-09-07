/**
 * Finish the takes the deployed site could not.
 *
 *   npm run portal:process
 *
 * Vercel's serverless runtime has no ffmpeg, so a take she records against
 * the deployed portal is uploaded RAW and parked at `pending_processing`.
 * Her work is safe at that point — this is what turns it into a clip the
 * lesson can play: trim to her handles, denoise, loudnorm to -16 LUFS,
 * WAV + Opus, sentence spans, and the row promoted to `saved`.
 *
 * Run it wherever ffmpeg exists (a laptop, CI). It is idempotent and
 * re-runnable: everything is rebuilt from the raw file, which is never
 * deleted, so a bad pass costs nothing but a re-run.
 */
import { createClient } from "@supabase/supabase-js";
import { processTake, resolveFfmpeg } from "../src/lib/actorAudio";
import { AUDIO_BUCKET } from "../src/lib/audioCache";
import { humanClipPath, humanMetaPath, humanOpusPath, type HumanClipMeta } from "../src/lib/humanClips";

const RETRY_FAILED = process.argv.includes("--retry-failed");

async function main(): Promise<void> {
  const ffmpeg = await resolveFfmpeg();
  if (!ffmpeg) throw new Error("No ffmpeg on this machine — install it, or set FFMPEG_PATH.");
  console.log(`ffmpeg: ${ffmpeg}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const supabase = createClient(url, key);
  const storage = supabase.storage.from(AUDIO_BUCKET);

  const wanted = RETRY_FAILED ? ["pending_processing", "failed"] : ["pending_processing"];
  const { data, error } = await supabase.from("actor_takes").select("*").in("status", wanted);
  if (error) throw new Error(`actor_takes read failed: ${error.message}`);
  const takes = data ?? [];
  console.log(`${takes.length} take(s) to process.\n`);

  let done = 0;
  let failed = 0;
  for (const take of takes) {
    const label = `${take.beat_id}`;
    if (!take.raw_path || !take.clip_key) {
      console.log(`  SKIP ${label} — no raw file recorded.`);
      continue;
    }
    try {
      const download = await storage.download(take.raw_path);
      if (download.error || !download.data) throw new Error(download.error?.message ?? "raw file missing");
      const raw = new Uint8Array(await download.data.arrayBuffer());

      const processed = await processTake(raw, {
        trimStartMs: take.trim_start_ms ?? 0,
        trimEndMs: take.trim_end_ms,
      });
      const meta: HumanClipMeta = {
        durationMs: processed.durationMs,
        sentences: processed.sentences,
        text: "",
        voice: "human",
        source: "human",
        beatId: take.beat_id,
        recordedAt: take.updated_at ?? new Date().toISOString(),
      };
      const wav = await storage.upload(humanClipPath(take.clip_key), processed.wav, {
        contentType: "audio/wav",
        upsert: true,
      });
      if (wav.error) throw new Error(wav.error.message);
      if (processed.opus.byteLength > 0) {
        await storage.upload(humanOpusPath(take.clip_key), processed.opus, { contentType: "audio/opus", upsert: true });
      }
      await storage.upload(humanMetaPath(take.clip_key), JSON.stringify(meta), {
        contentType: "application/json",
        upsert: true,
      });
      await supabase
        .from("actor_takes")
        .update({
          clip_path: humanClipPath(take.clip_key),
          opus_path: processed.opus.byteLength > 0 ? humanOpusPath(take.clip_key) : null,
          duration_ms: processed.durationMs,
          sentences: processed.sentences,
          status: "saved",
          updated_at: new Date().toISOString(),
        })
        .eq("beat_id", take.beat_id);
      done += 1;
      console.log(`  OK   ${label}  ${(processed.durationMs / 1000).toFixed(1)}s, ${processed.sentences.length} sentence(s)`);
    } catch (processError) {
      failed += 1;
      console.error(`  FAIL ${label}: ${String(processError).slice(0, 160)}`);
      await supabase.from("actor_takes").update({ status: "failed" }).eq("beat_id", take.beat_id);
    }
  }
  console.log(`\nprocessed ${done}, failed ${failed}`);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
