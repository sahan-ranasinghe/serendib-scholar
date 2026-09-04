import test from "node:test";
import assert from "node:assert/strict";
import { padSentenceGaps, pausePlanFor, splitSentences, timeStretch, SPEECH_RATE } from "./timeStretch";

const RATE = 24000;

/** A steady tone — the pitch of which must survive the stretch. */
function tone(seconds: number, hz: number, amplitude = 0.5): Int16Array {
  const pcm = new Int16Array(Math.round(seconds * RATE));
  for (let i = 0; i < pcm.length; i += 1) {
    pcm[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / RATE) * amplitude * 32767);
  }
  return pcm;
}

/** Zero-crossing rate is a cheap, robust pitch proxy for a pure tone. */
function estimateHz(pcm: Int16Array): number {
  let crossings = 0;
  for (let i = 1; i < pcm.length; i += 1) {
    if (pcm[i - 1] <= 0 && pcm[i] > 0) crossings += 1;
  }
  return crossings / (pcm.length / RATE);
}

test("time-stretching lengthens the audio by 1/rate", () => {
  const input = tone(1, 200);
  const output = timeStretch(input, RATE, SPEECH_RATE);
  const ratio = output.length / input.length;
  assert.ok(
    Math.abs(ratio - 1 / SPEECH_RATE) < 0.05,
    `expected ~${(1 / SPEECH_RATE).toFixed(2)}× longer, got ${ratio.toFixed(2)}×`,
  );
});

test("time-stretching preserves pitch (this is why it isn't resampling)", () => {
  const input = tone(1, 200);
  const output = timeStretch(input, RATE, SPEECH_RATE);
  const before = estimateHz(input);
  const after = estimateHz(output);
  // Resampling to 0.88× would land at 176Hz; WSOLA must stay at 200Hz.
  assert.ok(Math.abs(after - before) < 8, `pitch moved from ${before.toFixed(0)}Hz to ${after.toFixed(0)}Hz`);
});

test("a sentence gap BECOMES the requested pause, rather than adding to it", () => {
  // speech · 300ms of natural quiet · speech
  const speech = tone(0.5, 200);
  const quiet = new Int16Array(Math.round(0.3 * RATE));
  const input = new Int16Array(speech.length * 2 + quiet.length);
  input.set(speech, 0);
  input.set(quiet, speech.length);
  input.set(speech, speech.length + quiet.length);

  const paced = padSentenceGaps(input, RATE, [1200]);
  const gapMs = paced.sentences[1].startMs - paced.sentences[0].endMs;
  assert.ok(Math.abs(gapMs - 1200) < 120, `gap should be ~1200ms, got ${gapMs}ms`);
  assert.equal(paced.sentences.length, 2);
});

test("the pause plan is one pause per gap, shorter where she trails off", () => {
  assert.deepEqual(pausePlanFor("එකයි. දෙකයි. තුනයි."), [1200, 1200]);
  assert.deepEqual(pausePlanFor("මොකක්ද මේ?… ඔව්, හරි."), [1000]);
  assert.deepEqual(pausePlanFor("එක වාක්‍යයක් විතරයි."), []);
});

test("splitting keeps the trailing-off marker with its own sentence", () => {
  assert.deepEqual(splitSentences("බලන්න… ඔව්."), ["බලන්න…", "ඔව්."]);
});
