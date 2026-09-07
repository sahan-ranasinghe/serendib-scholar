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
 * serves them with no special case. A missing lexeme falls back to the AI
 * voice for the whole number rather than splicing two voices mid-word.
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
 * Joins PCM16 mono WAVs into one, with a gap between each.
 *
 * Deliberately dumb: it reads each input's `data` chunk and copies the
 * samples. Every clip in this cache is mono PCM16 at CLIP_SAMPLE_RATE, so
 * there is nothing to resample; a clip that is not gets rejected rather
 * than silently pitch-shifted.
 */
export function concatWavClips(clips: Uint8Array[], gapMs = NUMBER_WORD_GAP_MS): Uint8Array {
  const parts: Int16Array[] = [];
  const gap = new Int16Array(Math.round((CLIP_SAMPLE_RATE * gapMs) / 1000));
  clips.forEach((clip, index) => {
    if (index > 0) parts.push(gap);
    parts.push(pcmOfWav(clip));
  });
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Int16Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return wavFromPcm16(merged, CLIP_SAMPLE_RATE);
}

/** The samples of a PCM16 mono WAV, found by walking its chunks. */
export function pcmOfWav(wav: Uint8Array): Int16Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let offset = 12;
  while (offset + 8 <= wav.byteLength) {
    const id = String.fromCharCode(wav[offset]!, wav[offset + 1]!, wav[offset + 2]!, wav[offset + 3]!);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      const channels = view.getUint16(offset + 10, true);
      const bits = view.getUint16(offset + 22, true);
      if (channels !== 1 || bits !== 16) {
        throw new Error(`number-word clip is not mono PCM16 (${channels}ch/${bits}bit) — refusing to splice it`);
      }
    }
    if (id === "data") {
      const start = offset + 8;
      const length = Math.min(size, wav.byteLength - start);
      return new Int16Array(wav.buffer.slice(wav.byteOffset + start, wav.byteOffset + start + (length - (length % 2))));
    }
    offset += 8 + size + (size % 2);
  }
  return new Int16Array(0);
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
  built: { before: "ඔයා හැදුවේ", after: "නේද?" },
  /** CONFIRM — AUTHORED_LINES.confirmHeard around the heard number. */
  heard: splitAtValue(AUTHORED_LINES.confirmHeard),
  /** The give-up demonstration — AUTHORED_LINES.giveUpReveal around the answer. */
  answer: splitAtValue(AUTHORED_LINES.giveUpReveal),
};
