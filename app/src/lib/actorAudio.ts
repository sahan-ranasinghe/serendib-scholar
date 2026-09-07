/**
 * Turning a raw take into a clip the lesson can play.
 *
 * The chain, in one ffmpeg pass:
 *   atrim      → her drag handles (dead air, a false start)
 *   afftdn     → mild broadband noise reduction; she records in a room,
 *                not a booth, and a blanket only does so much
 *   loudnorm   → -16 LUFS, the same target the AI clips sit at, so a
 *                lesson that mixes both does not jump in volume
 *   48kHz mono → what the browser captured; no resampling surprises
 * and then a second, cheap pass to Opus for delivery.
 *
 * WHERE THIS RUNS IS THE HARD PART. Vercel's serverless runtime has no
 * ffmpeg binary, and the actor records against the deployed site. So the
 * pipeline is built to never make her wait on it and never lose work:
 *
 *   1. the RAW take uploads first and is what marks the line safe,
 *   2. processing is attempted with whatever ffmpeg can be found,
 *   3. if there is none, the take is stored `pending_processing` and
 *      `npm run portal:process` finishes it later from the raw file.
 *
 * A take is therefore never blocked on a binary that may not exist, and
 * the raw upload is never deleted — every processed clip can be rebuilt.
 */
// Deliberately NOT "server-only": scripts/process-actor-takes.ts and
// scripts/actor-clips.ts run this from the CLI, where server-only throws.
// It spawns child processes, so it can never reach a browser anyway.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/** Same target as the AI clips (src/lib/timeStretch.ts pacing) — one loudness for one lesson. */
const LOUDNESS_LUFS = -16;
/** A gap of at least this long reads as a sentence boundary to the board timing. */
export const SENTENCE_GAP_MS = 350;
const SAMPLE_RATE = 48000;

/**
 * Where ffmpeg is, if anywhere. FFMPEG_PATH wins (a deployment that ships
 * one), then the optional ffmpeg-static package, then the system binary.
 * Returns null rather than throwing: "no ffmpeg here" is an expected state
 * on Vercel, not an error.
 */
export async function resolveFfmpeg(): Promise<string | null> {
  const configured = (process.env.FFMPEG_PATH ?? "").trim();
  if (configured) return configured;
  // Optional dependency, resolved through a variable so the build does not
  // require it to exist: a deployment that needs a bundled binary installs
  // ffmpeg-static, everything else ignores it.
  const optional = "ffmpeg-static";
  try {
    const mod = (await import(/* webpackIgnore: true */ optional)) as { default?: string };
    if (mod?.default) return mod.default;
  } catch {
    /* not installed — fall through */
  }
  return (await which("ffmpeg")) ? "ffmpeg" : null;
}

function which(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn(binary, ["-version"], { stdio: "ignore" });
    probe.on("error", () => resolve(false));
    probe.on("close", (code) => resolve(code === 0));
  });
}

function run(binary: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

export interface ProcessedTake {
  wav: Uint8Array;
  opus: Uint8Array;
  durationMs: number;
  sentences: Array<{ startMs: number; endMs: number }>;
}

/**
 * Raw bytes (whatever MediaRecorder produced) → normalised WAV + Opus.
 * Throws only on a real ffmpeg failure; callers decide whether that means
 * "retry" or "leave it raw and process later".
 */
export async function processTake(
  raw: Uint8Array,
  options: { trimStartMs?: number; trimEndMs?: number | null } = {},
): Promise<ProcessedTake> {
  const ffmpeg = await resolveFfmpeg();
  if (!ffmpeg) throw new Error("no ffmpeg available");

  const dir = await mkdtemp(path.join(tmpdir(), "actor-take-"));
  const input = path.join(dir, "in.webm");
  const wavOut = path.join(dir, "out.wav");
  const opusOut = path.join(dir, "out.opus");
  try {
    await writeFile(input, raw);

    const filters: string[] = [];
    const start = Math.max(0, options.trimStartMs ?? 0) / 1000;
    const end = options.trimEndMs != null ? options.trimEndMs / 1000 : null;
    if (start > 0 || end != null) {
      filters.push(`atrim=start=${start.toFixed(3)}${end != null ? `:end=${end.toFixed(3)}` : ""}`, "asetpts=N/SR/TB");
    }
    filters.push("afftdn=nf=-25", `loudnorm=I=${LOUDNESS_LUFS}:TP=-1.5:LRA=11`);

    const wav = await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", input,
      "-af", filters.join(","),
      "-ac", "1", "-ar", String(SAMPLE_RATE), "-c:a", "pcm_s16le",
      wavOut,
    ]);
    if (wav.code !== 0) throw new Error(`ffmpeg wav failed: ${wav.stderr.slice(0, 300)}`);

    const opus = await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", wavOut, "-c:a", "libopus", "-b:a", "48k", opusOut,
    ]);
    // Opus is a delivery convenience; a build of ffmpeg without libopus
    // must not cost her the take.
    const opusBytes = opus.code === 0 ? new Uint8Array(await readFile(opusOut)) : new Uint8Array();

    const wavBytes = new Uint8Array(await readFile(wavOut));
    const { durationMs, sentences } = analyseWav(wavBytes);
    return { wav: wavBytes, opus: opusBytes, durationMs, sentences };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Duration and sentence spans, straight off the PCM.
 *
 * The board changes on sentence boundaries, so a human clip has to declare
 * them exactly as a rendered one does. A boundary is a silence of at least
 * SENTENCE_GAP_MS: cheap, deterministic, and the actor can drag the
 * markers afterwards if a dramatic pause fooled it.
 */
export function analyseWav(wav: Uint8Array): { durationMs: number; sentences: Array<{ startMs: number; endMs: number }> } {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  // Walk the RIFF chunks rather than assuming a 44-byte header: ffmpeg
  // writes a LIST/INFO chunk that would otherwise be read as samples.
  let offset = 12;
  let dataStart = 44;
  let dataLength = Math.max(0, wav.byteLength - 44);
  let sampleRate = SAMPLE_RATE;
  while (offset + 8 <= wav.byteLength) {
    const id = String.fromCharCode(wav[offset]!, wav[offset + 1]!, wav[offset + 2]!, wav[offset + 3]!);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") sampleRate = view.getUint32(offset + 12, true);
    if (id === "data") {
      dataStart = offset + 8;
      dataLength = Math.min(size, wav.byteLength - dataStart);
      break;
    }
    offset += 8 + size + (size % 2);
  }

  const sampleCount = Math.floor(dataLength / 2);
  const durationMs = Math.round((sampleCount / sampleRate) * 1000);

  // 20ms frames, RMS against a floor well below speech but above hiss.
  const frame = Math.floor(sampleRate * 0.02);
  const loud: boolean[] = [];
  for (let i = 0; i + frame <= sampleCount; i += frame) {
    let sum = 0;
    for (let j = 0; j < frame; j += 1) {
      const sample = view.getInt16(dataStart + (i + j) * 2, true) / 32768;
      sum += sample * sample;
    }
    loud.push(Math.sqrt(sum / frame) > 0.012);
  }

  const sentences: Array<{ startMs: number; endMs: number }> = [];
  const frameMs = 20;
  const gapFrames = Math.ceil(SENTENCE_GAP_MS / frameMs);
  let spanStart: number | null = null;
  let quiet = 0;
  loud.forEach((isLoud, index) => {
    if (isLoud) {
      if (spanStart === null) spanStart = index;
      quiet = 0;
      return;
    }
    if (spanStart === null) return;
    quiet += 1;
    if (quiet >= gapFrames) {
      sentences.push({ startMs: spanStart * frameMs, endMs: (index - quiet + 1) * frameMs });
      spanStart = null;
      quiet = 0;
    }
  });
  if (spanStart !== null) sentences.push({ startMs: spanStart * frameMs, endMs: durationMs });
  if (sentences.length === 0) sentences.push({ startMs: 0, endMs: durationMs });
  return { durationMs, sentences };
}
