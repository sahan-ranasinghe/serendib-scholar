/**
 * Human-recorded clips: the same cache, a different shelf.
 *
 * A clip the actor recorded is keyed EXACTLY like the AI one — the hash of
 * the resolved text plus the pinned voice plus the format version — and
 * stored in the same bucket under a `human/` prefix. That is the whole
 * trick: the runtime asks for a line's key, tries the human shelf, and
 * falls back to the AI shelf, without knowing anything about the portal.
 *
 * Because the key is the hash of the TEXT, re-recording after an edit
 * re-keys itself: change the words and the old clip is simply no longer
 * the one anybody asks for. Nothing has to be invalidated by hand.
 */
import { AUDIO_FORMAT_VERSION, clipKey, type ClipMeta } from "@/lib/audioCache";

/** Bump when the ffmpeg chain changes — every human clip re-renders from raw. */
export const HUMAN_AUDIO_VERSION = "h1";

export type VoiceProfile = "human" | "ai";

/**
 * Which voice the runtime should prefer. 'human' tries her recording and
 * falls back to the AI clip; 'ai' ignores the human shelf entirely, so a
 * half-recorded lesson can still be demoed in one consistent voice.
 */
export function voiceProfile(): VoiceProfile {
  return (process.env.VOICE_PROFILE ?? "").trim().toLowerCase() === "human" ? "human" : "ai";
}

/** Same key as the AI clip for the same words — that is what makes fallback work. */
export function humanClipKey(text: string, voice: string): string {
  return clipKey(text, voice);
}

export function humanClipPath(key: string): string {
  return `human/${HUMAN_AUDIO_VERSION}/${key}.wav`;
}

export function humanOpusPath(key: string): string {
  return `human/${HUMAN_AUDIO_VERSION}/${key}.opus`;
}

export function humanMetaPath(key: string): string {
  return `human/${HUMAN_AUDIO_VERSION}/${key}.json`;
}

/**
 * The untouched take, kept forever under its own name.
 *
 * Processing is destructive-looking (trim, denoise, loudnorm) and her
 * handles can move afterwards, so the raw upload is never overwritten and
 * never deleted by the portal: every processed clip can be rebuilt from
 * it. It is also what makes the upload safe to do FIRST — the bytes are
 * out of her browser before any of the slow work starts.
 */
export function rawTakePath(beatId: string, takenAt: number): string {
  return `human/raw/${beatId.replace(/[^A-Za-z0-9:_-]/gu, "_")}/${takenAt}.webm`;
}

export interface HumanClipMeta extends ClipMeta {
  /** Which shelf answered, for the runtime's log line. */
  source: "human";
  beatId: string;
  recordedAt: string;
}

/** The AI shelf's own paths, re-exported so callers need one import. */
export const aiAudioVersion = AUDIO_FORMAT_VERSION;
