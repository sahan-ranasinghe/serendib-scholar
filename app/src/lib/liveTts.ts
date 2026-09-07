/**
 * Rendering Zara's speech to a cached clip.
 *
 * The lesson no longer holds a live voice session open while she teaches:
 * every scripted line is rendered ONCE through the pinned voice, paced,
 * and stored. This module is that renderer — used by the batch script
 * (scripts/render-lesson-audio.ts) for whole sessions, and by
 * /api/render-line for the handful of lines that can only be written at
 * runtime (RETEACH, CONFIRM), which are cached the same way after first
 * use.
 *
 * The Live API is the renderer rather than a separate TTS model on
 * purpose: it is the voice the child has been hearing, byte for byte.
 */
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ZARA_VOICE } from "@/lib/zaraVoice";
import {
  AUDIO_BUCKET,
  CLIP_SAMPLE_RATE,
  clipKey,
  clipMetaPath,
  clipPath,
  pcm16FromBase64,
  wavFromPcm16,
  type ClipMeta,
} from "@/lib/audioCache";
import { padSentenceGaps, pausePlanFor, timeStretch } from "@/lib/timeStretch";

const RENDER_TIMEOUT_MS = 60000;

/** Reads the exact words aloud and nothing else. */
const READER_INSTRUCTION =
  "You are reading a script aloud for a recording. Read the user's text aloud in Sinhala EXACTLY as written, " +
  "word for word, in a warm, unhurried teacher's voice. Add nothing, skip nothing, do not answer or comment.";

/** Renders one text to raw PCM16 through the Live API's pinned voice. */
export async function renderSpeechPcm(text: string, apiKey: string): Promise<Int16Array> {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });
  const chunks: Int16Array[] = [];
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("render timed out")), RENDER_TIMEOUT_MS);
    let session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      try {
        session?.close();
      } catch {
        /* already closed */
      }
      if (error) reject(error);
      else resolve();
    };
    void ai.live
      .connect({
        model: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ZARA_VOICE } } },
          systemInstruction: { parts: [{ text: READER_INSTRUCTION }] },
        },
        callbacks: {
          onmessage: (message) => {
            for (const part of message.serverContent?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) chunks.push(pcm16FromBase64(part.inlineData.data));
            }
            if (message.serverContent?.turnComplete) finish();
          },
          onerror: (error) => finish(new Error(String((error as { message?: string }).message ?? error))),
          onclose: (event) => {
            if (chunks.length === 0) finish(new Error(`closed: ${event?.reason || event?.code || "no audio"}`));
          },
        },
      })
      .then((connected) => {
        session = connected;
        connected.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
      })
      .catch((error) => finish(error as Error));
  });

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (total < CLIP_SAMPLE_RATE * 0.2) throw new Error("render returned almost no audio");
  const merged = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/** Renders + paces one line: slowed to SPEECH_RATE with real pauses at the sentence seams. */
export async function renderPacedClip(text: string, apiKey: string) {
  const raw = await renderSpeechPcm(text, apiKey);
  const stretched = timeStretch(raw, CLIP_SAMPLE_RATE);
  return padSentenceGaps(stretched, CLIP_SAMPLE_RATE, pausePlanFor(text));
}

export interface CachedClip extends ClipMeta {
  key: string;
  /** True when this call did the rendering (false = already cached). */
  rendered: boolean;
}

/** Is this line already in the cache? Cheap enough to call per beat. */
export async function readCachedClip(text: string): Promise<CachedClip | null> {
  const key = clipKey(text, ZARA_VOICE);
  const { data, error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).download(clipMetaPath(key));
  if (error || !data) return null;
  try {
    const meta = JSON.parse(await data.text()) as ClipMeta;
    return { ...meta, key, rendered: false };
  } catch {
    return null;
  }
}

/**
 * The cache-or-render entry point: returns the stored clip if it exists,
 * otherwise renders, paces, uploads both objects, and returns it.
 */
export async function ensureClip(text: string, apiKey: string, options: { force?: boolean } = {}): Promise<CachedClip> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("cannot render an empty line");
  if (!options.force) {
    const cached = await readCachedClip(trimmed);
    if (cached) return cached;
  }

  const key = clipKey(trimmed, ZARA_VOICE);
  const clip = await renderPacedClip(trimmed, apiKey);
  const meta: ClipMeta = {
    durationMs: clip.durationMs,
    sentences: clip.sentences,
    text: trimmed,
    voice: ZARA_VOICE,
  };
  const storage = supabaseAdmin.storage.from(AUDIO_BUCKET);
  const wav = wavFromPcm16(clip.pcm);
  const upload = await storage.upload(clipPath(key), wav, { contentType: "audio/wav", upsert: true });
  if (upload.error) throw new Error(`clip upload failed: ${upload.error.message}`);
  const metaUpload = await storage.upload(clipMetaPath(key), JSON.stringify(meta), {
    contentType: "application/json",
    upsert: true,
  });
  if (metaUpload.error) throw new Error(`clip meta upload failed: ${metaUpload.error.message}`);
  return { ...meta, key, rendered: true };
}

/**
 * Creates the clip bucket if it isn't there yet (no DDL needed) — PRIVATE:
 * the browser reaches clips only through /api/clip/<key>, which requires a
 * session and returns a short-lived signed URL.
 */
/**
 * What the bucket accepts. Rendered clips are WAV + JSON; the voice
 * actor's portal adds her RAW takes (whatever MediaRecorder produced —
 * webm on Chrome and Android, mp4 on iOS) and the Opus copies of her
 * processed clips. A bucket that rejects her container rejects the take,
 * which is the one thing the upload path is built never to do.
 */
const AUDIO_MIME_TYPES = [
  "audio/wav",
  "application/json",
  "audio/webm",
  "audio/ogg",
  "audio/opus",
  "audio/mp4",
  "audio/mpeg",
  "video/webm", // Chrome labels an audio-only MediaRecorder blob this way
];

export async function ensureAudioBucket(): Promise<void> {
  const { data } = await supabaseAdmin.storage.getBucket(AUDIO_BUCKET);
  if (data) {
    // `public` is required by updateBucket's type, so it is always sent —
    // as its current value unless it needs flipping.
    const updates: { public: boolean; allowedMimeTypes?: string[] } = { public: false };
    let changed = data.public === true;
    // A bucket created before the portal existed allows only WAV + JSON,
    // and would silently refuse every take she records. Widened in place
    // rather than requiring the bucket to be recreated.
    //
    // A NULL allowlist means "accept anything", which is strictly more
    // permissive than any list here — so it is left exactly as it is. An
    // earlier version read null as an empty array and helpfully "widened"
    // an unrestricted bucket into a restricted one, quietly undoing a
    // human who had cleared the list by hand to unblock a recording
    // session. Never narrow what someone deliberately opened.
    const allowed = data.allowed_mime_types;
    if (allowed !== null && allowed !== undefined && AUDIO_MIME_TYPES.some((type) => !allowed.includes(type))) {
      updates.allowedMimeTypes = [...new Set([...allowed, ...AUDIO_MIME_TYPES])];
      changed = true;
    }
    if (changed) {
      const { error } = await supabaseAdmin.storage.updateBucket(AUDIO_BUCKET, updates);
      if (error) throw new Error(`could not update the ${AUDIO_BUCKET} bucket: ${error.message}`);
      if (data.public) console.warn(`[liveTts] The ${AUDIO_BUCKET} bucket was public — made it private.`);
      if (updates.allowedMimeTypes) console.warn(`[liveTts] Widened ${AUDIO_BUCKET} to accept the actor's recording formats.`);
    }
    return;
  }
  const { error } = await supabaseAdmin.storage.createBucket(AUDIO_BUCKET, {
    public: false,
    fileSizeLimit: "20MB",
    allowedMimeTypes: AUDIO_MIME_TYPES,
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`could not create the ${AUDIO_BUCKET} bucket: ${error.message}`);
  }
}
