/**
 * Move a session's recordings in and out as a ZIP.
 *
 *   npm run portal:clips -- export [dir]   # every kept clip → <beatId>.wav
 *   npm run portal:clips -- import <dir>   # a folder of <beatId>.wav files
 *
 * Export is the backup and the hand-off: a session's kept audio as plain
 * WAVs a human can listen to outside the app.
 *
 * Import is the escape hatch. If she ends up recording in a real booth, or
 * on a recorder, the files come back through EXACTLY the same pipeline as
 * a portal take — same trim, denoise, loudnorm, same key derived from the
 * beat's text — so imported and in-portal audio are indistinguishable
 * downstream. Nothing bypasses the conditioning.
 *
 * Written as a directory rather than a real .zip: the project has no zip
 * dependency, and `zip -r session1.zip out/` is one command. Keeping it a
 * plain folder also means she can drop files in by hand.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile as readAuthored } from "node:fs/promises";
import { processTake } from "../src/lib/actorAudio";
import { AUDIO_BUCKET, clipKey } from "../src/lib/audioCache";
import { ZARA_VOICE } from "../src/lib/zaraVoice";
import { humanClipPath, humanMetaPath, humanOpusPath, rawTakePath, type HumanClipMeta } from "../src/lib/humanClips";
import { parseAuthoredScript } from "../src/lib/authoredScript";
import { resolveAddress } from "../src/lib/addressToken";

const MODE = process.argv[2];
const DIR = process.argv[3] ?? "actor-clips";

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(url, key);
}

async function exportClips(): Promise<void> {
  const supabase = client();
  const storage = supabase.storage.from(AUDIO_BUCKET);
  const { data, error } = await supabase.from("actor_takes").select("*").eq("status", "saved");
  if (error) throw new Error(error.message);
  const takes = data ?? [];
  await mkdir(DIR, { recursive: true });

  let written = 0;
  for (const take of takes) {
    if (!take.clip_key) continue;
    const download = await storage.download(humanClipPath(take.clip_key));
    if (download.error || !download.data) {
      console.error(`  MISS ${take.beat_id} — no processed clip in the bucket.`);
      continue;
    }
    const safe = String(take.beat_id).replace(/[^A-Za-z0-9:_-]/gu, "_");
    await writeFile(path.join(DIR, `${safe}.wav`), new Uint8Array(await download.data.arrayBuffer()));
    written += 1;
  }
  console.log(`Exported ${written}/${takes.length} clip(s) to ${DIR}/`);
  console.log(`  zip -r ${DIR}.zip ${DIR}`);
}

async function importClips(): Promise<void> {
  const supabase = client();
  const storage = supabase.storage.from(AUDIO_BUCKET);

  const authored = parseAuthoredScript(
    await readAuthored(path.join(process.cwd(), "src/data/lessons/authored/maths-5-1.json"), "utf8"),
  );
  if (!authored) throw new Error("Could not read the authored script.");
  // The key is the hash of the words, so an imported file has to be tied
  // back to its beat's text — not to the filename it happened to have.
  const textByBeat = new Map(
    authored.beats.map((beat) => [beat.id, resolveAddress(beat.spokenText, "unspecified")] as const),
  );

  const files = (await readdir(DIR)).filter((name) => name.endsWith(".wav"));
  console.log(`${files.length} file(s) in ${DIR}/\n`);
  let done = 0;
  for (const name of files) {
    const beatId = name.replace(/\.wav$/u, "").replace(/_/gu, ":");
    const text = textByBeat.get(beatId);
    if (!text) {
      console.error(`  SKIP ${name} — no authored beat named ${beatId}.`);
      continue;
    }
    try {
      const raw = new Uint8Array(await readFile(path.join(DIR, name)));
      const key = clipKey(text, ZARA_VOICE);
      const rawPath = rawTakePath(beatId, Date.now());
      await storage.upload(rawPath, raw, { contentType: "audio/wav", upsert: true });

      const processed = await processTake(raw);
      const meta: HumanClipMeta = {
        durationMs: processed.durationMs,
        sentences: processed.sentences,
        text,
        voice: "human",
        source: "human",
        beatId,
        recordedAt: new Date().toISOString(),
      };
      await storage.upload(humanClipPath(key), processed.wav, { contentType: "audio/wav", upsert: true });
      if (processed.opus.byteLength > 0) {
        await storage.upload(humanOpusPath(key), processed.opus, { contentType: "audio/opus", upsert: true });
      }
      await storage.upload(humanMetaPath(key), JSON.stringify(meta), { contentType: "application/json", upsert: true });
      await supabase.from("actor_takes").upsert({
        beat_id: beatId,
        lesson: "maths-5-1",
        clip_key: key,
        raw_path: rawPath,
        clip_path: humanClipPath(key),
        opus_path: processed.opus.byteLength > 0 ? humanOpusPath(key) : null,
        duration_ms: processed.durationMs,
        sentences: processed.sentences,
        status: "saved",
        updated_at: new Date().toISOString(),
      });
      done += 1;
      console.log(`  OK   ${beatId}  ${(processed.durationMs / 1000).toFixed(1)}s`);
    } catch (error) {
      console.error(`  FAIL ${name}: ${String(error).slice(0, 160)}`);
    }
  }
  console.log(`\nimported ${done}/${files.length}`);
}

async function main(): Promise<void> {
  if (MODE === "export") return exportClips();
  if (MODE === "import") return importClips();
  console.log("usage: npm run portal:clips -- export [dir] | import <dir>");
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
