/**
 * Saying any number in the actor's own voice, without a model.
 *
 * sinhalaNumberName emits numbers as a small closed vocabulary — 77
 * distinct words across the whole 0–100 000 range, because Sinhala builds
 * numbers by composition ("විසි හයදහස් එකසිය හතළිස් හත" is five words, all
 * of them reused constantly). Record those 77 once and every number in the
 * lesson can be spoken in her voice by concatenation.
 *
 * That is what makes three things possible without a live model:
 *   - reading back what a child built on the digit picker,
 *   - CONFIRM ("ඔයා කිව්වේ ___ නේද?"),
 *   - the give-up demonstration.
 *
 * The clips are keyed exactly like any other line — clipKey(lexeme, voice)
 * — so the portal records them as ordinary lines and the audio cache
 * serves them with no special case (hers where she has recorded the word,
 * the AI clip where she has not). A word with no clip at all means nothing
 * is composed: the caller falls back to the board.
 */
import { clipKey, CLIP_SAMPLE_RATE, wavFromPcm16 } from "@/lib/audioCache";
import { sinhalaNumberLexemes, sinhalaNumberName } from "@/lib/sinhalaNumber";
import { AUTHORED_LINES } from "@/lib/authoredLines";

/** Silence between words. Shorter than a sentence gap; enough to not slur. */
export const NUMBER_WORD_GAP_MS = 120;

/**
 * Every word the number renderer can emit, sorted for a stable recording
 * order. Verified against an exhaustive walk of 0..100000 — the set below
 * and the set actually emitted are the same 77 words.
 */
export function numberWordLexemes(): string[] {
  return [...sinhalaNumberLexemes()].sort((a, b) => a.localeCompare(b, "si"));
}

/** The words for one number, in the order they are spoken. */
export function numberWords(value: number): string[] {
  return sinhalaNumberName(value).split(/\s+/u).filter(Boolean);
}

export interface NumberClipPlan {
  value: number;
  spoken: string;
  words: Array<{ word: string; key: string }>;
}

/** What to play, in order, to say `value` in the recorded voice. */
export function numberClipPlan(value: number, voice: string): NumberClipPlan {
  const words = numberWords(value);
  return {
    value,
    spoken: words.join(" "),
    words: words.map((word) => ({ word, key: clipKey(word, voice) })),
  };
}

/**
 * Joins PCM16 mono WAVs into one, with a gap between each — at ONE sample
 * rate, whatever each clip was recorded at.
 *
 * A number can mix sources: the actor's words are processed at 48 kHz
 * (src/lib/actorAudio.ts) while an AI word is 24 kHz (CLIP_SAMPLE_RATE),
 * and /api/clip serves hers where it has one and the AI clip otherwise.
 * Each clip's rate is read from its own WAV header; every clip is resampled
 * to the highest rate among them (so her words are never degraded), and the
 * result is stamped with that rate. It used to copy the samples and stamp
 * 24 kHz on everything, so a 48 kHz word played at half speed (29 Sep 2026,
 * docs/cms/content-inventory.md §16).
 */
export function concatWavClips(clips: Uint8Array[], gapMs = NUMBER_WORD_GAP_MS): Uint8Array {
  const decoded = clips.map(readWav);
  const rate = decoded.reduce((max, clip) => Math.max(max, clip.sampleRate), 0) || CLIP_SAMPLE_RATE;
  const parts: Int16Array[] = [];
  const gap = new Int16Array(Math.round((rate * gapMs) / 1000));
  decoded.forEach((clip, index) => {
    if (index > 0) parts.push(gap);
    parts.push(resamplePcm16(clip.pcm, clip.sampleRate, rate));
  });
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Int16Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return wavFromPcm16(merged, rate);
}

/**
 * PCM16 from one rate to another, by linear interpolation. The composer only
 * ever raises a rate (to the highest among the clips), where interpolation
 * adds no aliasing; a lowering call averages each output sample's span first.
 */
export function resamplePcm16(pcm: Int16Array, from: number, to: number): Int16Array {
  if (from === to || pcm.length === 0) return pcm;
  const length = Math.max(1, Math.round((pcm.length * to) / from));
  const out = new Int16Array(length);
  const step = from / to;
  for (let i = 0; i < length; i += 1) {
    const position = i * step;
    if (step > 1) {
      // Lowering the rate: the mean of the input samples this output sample covers.
      const start = Math.floor(position);
      const end = Math.min(pcm.length, Math.max(start + 1, Math.floor(position + step)));
      let sum = 0;
      for (let j = start; j < end; j += 1) sum += pcm[j]!;
      out[i] = Math.round(sum / (end - start));
      continue;
    }
    const left = Math.floor(position);
    const right = Math.min(pcm.length - 1, left + 1);
    const fraction = position - left;
    out[i] = Math.round(pcm[left]! * (1 - fraction) + pcm[right]! * fraction);
  }
  return out;
}

/** A PCM16 mono WAV's samples and its own sample rate, found by walking its chunks. */
export function readWav(wav: Uint8Array): { pcm: Int16Array; sampleRate: number } {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let offset = 12;
  let sampleRate = 0;
  while (offset + 8 <= wav.byteLength) {
    const id = String.fromCharCode(wav[offset]!, wav[offset + 1]!, wav[offset + 2]!, wav[offset + 3]!);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      const channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      const bits = view.getUint16(offset + 22, true);
      if (channels !== 1 || bits !== 16) {
        throw new Error(`number-word clip is not mono PCM16 (${channels}ch/${bits}bit) — refusing to splice it`);
      }
    }
    if (id === "data") {
      if (!sampleRate) throw new Error("number-word clip has no fmt chunk before its data — refusing to splice it");
      const start = offset + 8;
      const length = Math.min(size, wav.byteLength - start);
      return { pcm: new Int16Array(wav.buffer.slice(wav.byteOffset + start, wav.byteOffset + start + (length - (length % 2)))), sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  return { pcm: new Int16Array(0), sampleRate: sampleRate || CLIP_SAMPLE_RATE };
}

/** The samples of a PCM16 mono WAV (its rate: readWav). */
export function pcmOfWav(wav: Uint8Array): Int16Array {
  return readWav(wav).pcm;
}

/** How long a PCM16 mono WAV plays, from its own header's rate. */
export function wavDurationMs(wav: Uint8Array): number {
  const { pcm, sampleRate } = readWav(wav);
  return Math.round((pcm.length / sampleRate) * 1000);
}

/**
 * The fixed words around a spoken number, taken from the SAME authored
 * lines the runtime already uses (AUTHORED_LINES.confirmHeard,
 * giveUpReveal) split at their {value} slot — so the actor records exactly
 * the halves the runtime will splice a number between, and CONFIRM in her
 * voice is the CONFIRM line, not a paraphrase of it.
 *
 * `before` may carry {address}; callers resolve it for the child before
 * keying the clip, the same as any other line.
 */
export interface NumberFrame {
  before: string;
  after: string;
}

function splitAtValue(line: string): NumberFrame {
  const [before = "", after = ""] = line.split("{value}");
  // A trailing "." left on the far side of the slot would be recorded as
  // a line that starts with a full stop; the pause it stood for is the
  // gap the composer already leaves.
  return { before: before.trim(), after: after.replace(/^[.\s]+/u, "").trim() };
}

export const NUMBER_FRAMES: { built: NumberFrame; heard: NumberFrame; answer: NumberFrame } = {
  /** After an open build task: the number alone follows "look at the board". */
  built: splitAtValue(AUTHORED_LINES.builtReadBack),
  /** CONFIRM — AUTHORED_LINES.confirmHeard around the heard number. */
  heard: splitAtValue(AUTHORED_LINES.confirmHeard),
  /** The give-up demonstration — AUTHORED_LINES.giveUpReveal around the answer. */
  answer: splitAtValue(AUTHORED_LINES.giveUpReveal),
};
