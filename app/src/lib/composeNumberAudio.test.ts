import test from "node:test";
import assert from "node:assert/strict";
import { numberWordLexemes, numberWords, numberClipPlan, concatWavClips, pcmOfWav, readWav, resamplePcm16, wavDurationMs } from "./composeNumberAudio";
import { sinhalaNumberName } from "./sinhalaNumber";
import { wavFromPcm16, CLIP_SAMPLE_RATE, clipKey } from "./audioCache";
import { answersMatch, parseAnswerPredicate, predicateMatches } from "./answerCheck";

test("the lexeme set covers every number 0..100000 with nothing missing", () => {
  const emitted = new Set<string>();
  for (let n = 0; n <= 100_000; n += 1) for (const w of sinhalaNumberName(n).split(/\s+/u)) if (w) emitted.add(w);
  const declared = new Set(numberWordLexemes());
  const missing = [...emitted].filter((w) => !declared.has(w));
  assert.deepEqual(missing, [], "words the renderer emits but the portal would never record");
  assert.equal(declared.size, emitted.size, "the recording list has no words that are never spoken");
});

test("the library is small enough to record in one sitting", () => {
  // The whole point: 77 clips, not one per number.
  assert.equal(numberWordLexemes().length, 77);
});

test("a number becomes its words, in speaking order", () => {
  assert.deepEqual(numberWords(26147), ["විසි", "හයදහස්", "එකසිය", "හතළිස්", "හත"]);
  assert.deepEqual(numberWords(0), ["බිංදුව"]);
  assert.deepEqual(numberWords(100_000), ["සියක්", "දහස"]);
});

test("the clip plan keys each word exactly as the cache does", () => {
  const plan = numberClipPlan(5421, "Zara");
  assert.deepEqual(plan.words.map((w) => w.word), ["පන්දහස්", "හාරසිය", "විසි", "එක"]);
  assert.equal(plan.words[0]!.key, clipKey("පන්දහස්", "Zara"));
  assert.equal(plan.spoken, sinhalaNumberName(5421));
});

test("clips concatenate with a gap between the words", () => {
  const tone = (samples: number) => wavFromPcm16(new Int16Array(samples).fill(1000), CLIP_SAMPLE_RATE);
  const joined = concatWavClips([tone(2400), tone(2400)], 120);
  const expectedGap = Math.round((CLIP_SAMPLE_RATE * 120) / 1000);
  assert.equal(pcmOfWav(joined).length, 2400 + expectedGap + 2400);
});

test("a clip that is not mono PCM16 is refused rather than pitch-shifted", () => {
  const stereo = wavFromPcm16(new Int16Array(100), CLIP_SAMPLE_RATE);
  new DataView(stereo.buffer, stereo.byteOffset).setUint16(22, 2, true); // channels = 2
  assert.throws(() => pcmOfWav(stereo), /mono PCM16/);
});

/** Open-ended questions: every valid arrangement is a right answer. */
test("a permutation predicate accepts any arrangement of the digits", () => {
  const expected = JSON.stringify({ kind: "permutationOf", digits: [1, 3, 6, 4], length: 4 });
  for (const good of ["1364", "6431", "4613", "3146"]) {
    assert.ok(answersMatch(expected, good), `${good} should be accepted`);
  }
});

test("a permutation predicate rejects the wrong digits, count or length", () => {
  const expected = JSON.stringify({ kind: "permutationOf", digits: [1, 3, 6, 4], length: 4 });
  for (const bad of ["1365", "1366", "136", "13644", "1133"]) {
    assert.ok(!answersMatch(expected, bad), `${bad} should be rejected`);
  }
});

test("plain answers are unaffected by predicate support", () => {
  assert.ok(answersMatch("6000", "6000"));
  assert.ok(answersMatch("10 000", "10000"));
  assert.ok(!answersMatch("6000", "600"));
  assert.equal(parseAnswerPredicate("අසූ හතර"), null);
  assert.ok(predicateMatches({ kind: "permutationOf", digits: [1, 3, 6, 4], length: 4 }, "6431"));
});

test("a 48 kHz human word and a 24 kHz AI word in one number: one rate, each word at its own speed", () => {
  // Her word: 100 ms of 440 Hz at 48 kHz (actorAudio's rate). The AI word: 100 ms of 440 Hz at 24 kHz (CLIP_SAMPLE_RATE).
  const sine = (rate: number, ms: number) => {
    const pcm = new Int16Array(Math.round((rate * ms) / 1000));
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000);
    return wavFromPcm16(pcm, rate);
  };
  const human = sine(48_000, 100);
  const ai = sine(24_000, 100);
  const joined = concatWavClips([human, ai], 120);
  const { pcm, sampleRate } = readWav(joined);
  assert.equal(sampleRate, 48_000, "stamped with the highest rate among the words");
  // 100 ms + 120 ms gap + 100 ms, all at 48 kHz.
  assert.equal(pcm.length, 4800 + 5760 + 4800);
  assert.equal(wavDurationMs(joined), 320);
  // The pitch survives: 440 Hz over 100 ms crosses zero about 88 times in each word — the AI word was resampled, not
  // stretched (the old splice stamped 24 kHz on everything, so her 48 kHz word played at half speed and half pitch).
  const crossings = (samples: Int16Array) => {
    let n = 0;
    for (let i = 1; i < samples.length; i += 1) if ((samples[i - 1]! < 0) !== (samples[i]! < 0)) n += 1;
    return n;
  };
  const herPart = pcm.slice(0, 4800);
  const aiPart = pcm.slice(4800 + 5760);
  assert.ok(Math.abs(crossings(herPart) - 88) <= 2, `her word: ${crossings(herPart)} zero crossings`);
  assert.ok(Math.abs(crossings(aiPart) - 88) <= 2, `the AI word: ${crossings(aiPart)} zero crossings`);
});

test("clips at one rate are joined as they are", () => {
  const tone = (rate: number) => wavFromPcm16(new Int16Array(rate / 10).fill(500), rate);
  const joined = concatWavClips([tone(24_000), tone(24_000)], 120);
  assert.equal(readWav(joined).sampleRate, 24_000);
  assert.equal(readWav(joined).pcm.length, 2400 + 2880 + 2400);
  assert.deepEqual(resamplePcm16(new Int16Array([1, 2, 3]), 24_000, 24_000), new Int16Array([1, 2, 3]));
});
