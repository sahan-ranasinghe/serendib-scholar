/**
 * Verification aid (not part of the product): renders a spoken Sinhala
 * answer to a 16kHz WAV that headless Chromium can feed to the page as a
 * fake microphone, so an unattended run can actually ANSWER a question and
 * exercise the record → /api/hear → planner path end to end.
 *
 * Trailing silence matters: Chromium loops the file, and the runtime's
 * recorder ends an answer after 1.5s of quiet.
 *
 *   tsx scripts/_make-answer-wav.ts "පන්දහස් තුන්සිය විසි දෙක" /tmp/answer.wav
 */
import fs from "node:fs";
import { renderSpeechPcm } from "../src/lib/liveTts";
import { wavFromPcm16 } from "../src/lib/audioCache";

const TEXT = process.argv[2] ?? "පන්දහස් තුන්සිය විසි දෙක";
const OUT = process.argv[3] ?? "/tmp/answer.wav";
const OUT_RATE = 16000;
const TAIL_SECONDS = 3;

/** 24kHz → 16kHz by linear interpolation; good enough for a test fixture. */
function downsample(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  const ratio = fromRate / toRate;
  const out = new Int16Array(Math.floor(pcm.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const source = i * ratio;
    const low = Math.floor(source);
    const high = Math.min(pcm.length - 1, low + 1);
    const fraction = source - low;
    out[i] = Math.round(pcm[low] * (1 - fraction) + pcm[high] * fraction);
  }
  return out;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const raw = await renderSpeechPcm(TEXT, apiKey);
  const speech = downsample(raw, 24000, OUT_RATE);
  const withTail = new Int16Array(speech.length + OUT_RATE * TAIL_SECONDS);
  withTail.set(speech, 0);
  fs.writeFileSync(OUT, wavFromPcm16(withTail, OUT_RATE));
  console.log(`"${TEXT}" → ${OUT} (${(speech.length / OUT_RATE).toFixed(1)}s speech + ${TAIL_SECONDS}s silence)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
