/**
 * Speech pacing for the cached clips: slow her down without turning her
 * voice into a bass drone, and put real air between sentences.
 *
 * WSOLA (waveform-similarity overlap-add) stretches the audio in TIME
 * while leaving pitch alone: frames are overlapped at the offset where the
 * waveforms correlate best, so periodicity — and therefore pitch — is
 * preserved. Naive resampling would be one line, but it drops her voice by
 * two semitones at 0.88×, which no longer sounds like the teacher the
 * child is meant to recognise.
 *
 * Pure functions on Int16 PCM at a known sample rate: used both by the
 * batch renderer (scripts/render-lesson-audio.ts) and the on-demand route
 * (/api/render-line), so every clip in the lesson gets identical pacing.
 */

/** Playback pace for everything the tutor says. <1 = slower than recorded. */
export const SPEECH_RATE = 0.88;
/** Silence inserted at a sentence end. */
export const SENTENCE_PAUSE_MS = 1200;
/** Silence inserted where she trails off mid-thought (the "…" markers). */
export const RHETORICAL_PAUSE_MS = 1000;

/**
 * Time-stretches PCM16 by 1/rate (rate 0.88 → 13.6% longer), preserving
 * pitch. Frame and search sizes are the usual speech values: 30ms frames,
 * 50% overlap, ±10ms similarity search.
 */
export function timeStretch(pcm: Int16Array, sampleRate: number, rate = SPEECH_RATE): Int16Array {
  if (rate === 1 || pcm.length === 0) return pcm;
  const frame = Math.round(sampleRate * 0.03);
  const overlap = Math.round(frame / 2);
  const search = Math.round(sampleRate * 0.01);
  const analysisHop = Math.round(overlap * rate); // < synthesisHop when slowing down
  const synthesisHop = overlap;
  if (analysisHop < 1 || pcm.length < frame + search * 2) return pcm;

  const outLength = Math.ceil((pcm.length / analysisHop) * synthesisHop) + frame;
  const out = new Float32Array(outLength);
  const window = new Float32Array(frame);
  for (let i = 0; i < frame; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1));

  let analysisPos = 0;
  let synthesisPos = 0;
  let written = 0;
  while (analysisPos + frame + search < pcm.length) {
    // Find the offset near analysisPos whose waveform best matches what
    // was already written into the overlap region — that alignment is
    // what keeps the pitch periods continuous.
    let bestOffset = 0;
    if (synthesisPos > 0) {
      let bestScore = -Infinity;
      for (let offset = -search; offset <= search; offset += 1) {
        const start = analysisPos + offset;
        if (start < 0 || start + overlap >= pcm.length) continue;
        let score = 0;
        for (let i = 0; i < overlap; i += 8) {
          score += out[synthesisPos + i] * pcm[start + i];
        }
        if (score > bestScore) {
          bestScore = score;
          bestOffset = offset;
        }
      }
    }
    const start = Math.max(0, analysisPos + bestOffset);
    for (let i = 0; i < frame; i += 1) {
      const sample = pcm[start + i] ?? 0;
      const target = synthesisPos + i;
      if (target >= out.length) break;
      out[target] += sample * window[i];
      if (target + 1 > written) written = target + 1;
    }
    analysisPos += analysisHop;
    synthesisPos += synthesisHop;
  }

  const result = new Int16Array(written);
  for (let i = 0; i < written; i += 1) {
    result[i] = Math.max(-32768, Math.min(32767, Math.round(out[i])));
  }
  return result;
}

export interface SentenceSpan {
  /** Where this sentence starts in the finished clip. */
  startMs: number;
  endMs: number;
}

export interface PacedClip {
  pcm: Int16Array;
  durationMs: number;
  /** One span per sentence — the runtime lands board changes on these. */
  sentences: SentenceSpan[];
}

/**
 * Finds the quietest gaps in rendered speech and widens them to real
 * pauses. The renderer sends a whole beat (2-3 sentences) to the voice in
 * one request — cheaper and better-flowing than one request per sentence —
 * so the sentence seams have to be recovered from the audio: the model
 * already pauses between sentences, and those pauses are by far the
 * longest quiet stretches in the clip.
 *
 * `pauseMsPerGap` carries one duration per expected gap (1.2s normally,
 * 1.0s where the text trails off with "…"), so gaps are padded in the
 * order they occur.
 */
export function padSentenceGaps(
  pcm: Int16Array,
  sampleRate: number,
  pauseMsPerGap: number[],
): PacedClip {
  const gapCount = pauseMsPerGap.length;
  const msPerSample = 1000 / sampleRate;
  if (gapCount === 0 || pcm.length === 0) {
    return {
      pcm,
      durationMs: Math.round(pcm.length * msPerSample),
      sentences: [{ startMs: 0, endMs: Math.round(pcm.length * msPerSample) }],
    };
  }

  // Short-window RMS, then the quiet runs between speech.
  const windowSamples = Math.max(1, Math.round(sampleRate * 0.02));
  const windows = Math.floor(pcm.length / windowSamples);
  const energy = new Float32Array(windows);
  let peak = 0;
  for (let w = 0; w < windows; w += 1) {
    let sum = 0;
    for (let i = 0; i < windowSamples; i += 1) {
      const sample = pcm[w * windowSamples + i] / 32768;
      sum += sample * sample;
    }
    energy[w] = Math.sqrt(sum / windowSamples);
    if (energy[w] > peak) peak = energy[w];
  }
  const quiet = peak * 0.06;

  const runs: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  for (let w = 0; w < windows; w += 1) {
    if (energy[w] <= quiet) {
      if (runStart === -1) runStart = w;
    } else if (runStart !== -1) {
      runs.push({ start: runStart, end: w });
      runStart = -1;
    }
  }
  // A trailing quiet run is the clip's own tail, not a sentence gap.

  // The N longest interior gaps are the sentence seams; keep them in
  // time order so the per-gap pause durations line up with the text.
  const seams = runs
    .filter((run) => run.start > 2 && run.end < windows - 2)
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, gapCount)
    .sort((a, b) => a.start - b.start);

  const pieces: Int16Array[] = [];
  const sentences: SentenceSpan[] = [];
  let cursorSample = 0;
  let outSamples = 0;
  seams.forEach((seam, index) => {
    // The gap BECOMES the target pause — it is not added on top of the
    // quiet the voice already left, or a 1.2s pause would land as 2.5s.
    // A short slice of the original quiet is kept at each edge so a soft
    // consonant tail or breath before the next sentence survives.
    const runStartSample = seam.start * windowSamples;
    const runEndSample = Math.min(pcm.length, seam.end * windowSamples);
    const targetSamples = Math.round((pauseMsPerGap[index] / 1000) * sampleRate);
    const edgeSamples = Math.min(Math.round(sampleRate * 0.1), Math.floor((runEndSample - runStartSample) / 2));

    const speech = pcm.subarray(cursorSample, runStartSample + edgeSamples);
    pieces.push(speech);
    sentences.push({
      startMs: Math.round(outSamples * msPerSample),
      endMs: Math.round((outSamples + speech.length) * msPerSample),
    });
    outSamples += speech.length;

    const silenceSamples = Math.max(0, targetSamples - edgeSamples * 2);
    pieces.push(new Int16Array(silenceSamples));
    outSamples += silenceSamples;
    // The trailing edge of the original quiet leads into the next sentence.
    const lead = pcm.subarray(runEndSample - edgeSamples, runEndSample);
    pieces.push(lead);
    outSamples += lead.length;
    cursorSample = runEndSample;
  });
  const tail = pcm.subarray(cursorSample);
  pieces.push(tail);
  sentences.push({
    startMs: Math.round(outSamples * msPerSample),
    endMs: Math.round((outSamples + tail.length) * msPerSample),
  });
  outSamples += tail.length;

  const merged = new Int16Array(outSamples);
  let offset = 0;
  for (const piece of pieces) {
    merged.set(piece, offset);
    offset += piece.length;
  }
  return { pcm: merged, durationMs: Math.round(outSamples * msPerSample), sentences };
}

/**
 * The pause length after each sentence of `text`, in order. A sentence
 * ending in the trailing-off marker ("…", her rhetorical pauses) gets the
 * shorter one — she is still mid-thought there.
 */
export function pausePlanFor(text: string): number[] {
  const parts = splitSentences(text);
  return parts.slice(0, -1).map((part) => (part.trimEnd().endsWith("…") ? RHETORICAL_PAUSE_MS : SENTENCE_PAUSE_MS));
}

/** Sentence split that treats the "…" pause marker as a sentence end of its own. */
export function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()];
}
