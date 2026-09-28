/**
 * Recording ONE answer.
 *
 * Questions no longer run through a streaming voice session: when a
 * question's window opens, the app records the child itself, decides when
 * they have finished speaking, and posts the clip to /api/hear. That gives
 * the runtime an explicit, inspectable moment of "the child answered" —
 * the thing the live session kept losing on real phones.
 *
 * Ending rules, in order:
 *   - no speech at all by `onsetTimeoutMs`  → { spoke: false } (the
 *     silence ladder takes over)
 *   - speech, then `silenceMs` of quiet     → done, clip returned
 *   - `maxMs` of speech                     → done, hard cap
 *   - the caller cancels (pad ✓, pause, stop)
 */
import { arrayBufferToBase64 } from "@/lib/pcmAudio";
import { audio } from "@/lib/audioManager";

/** Quiet needed after speech before the answer is treated as finished. */
export const ANSWER_SILENCE_MS = 1500;
/** Hard cap on one answer. */
export const ANSWER_MAX_MS = 8000;

const RECORD_SAMPLE_RATE = 16000;
/** RMS above this counts as the child speaking (well above room tone). */
const SPEECH_RMS = 0.02;

/**
 * ONE recording context for the whole session. A sitting opens ~25 answer
 * windows; mobile browsers cap how many AudioContexts a page may hold and
 * are not reliable about reclaiming closed ones, so the context is created
 * once and only its nodes are torn down between answers.
 */
let sharedContext: AudioContext | null = null;
function recordingContext(): AudioContext {
  if (!sharedContext || sharedContext.state === "closed") {
    // Capture only — made by the audio manager, which owns every AudioContext in the app.
    sharedContext = audio.captureContext(RECORD_SAMPLE_RATE);
  }
  return sharedContext;
}

/** Releases the shared recording context (session end). */
export function closeRecordingContext(): void {
  const context = sharedContext;
  sharedContext = null;
  if (context && context.state !== "closed") void context.close();
}

export interface AnswerRecording {
  /** Did the child actually say anything? */
  spoke: boolean;
  /** base64 WAV (16kHz mono) — empty when nothing was said. */
  wavBase64: string;
  durationMs: number;
}

export interface AnswerRecorderHandle {
  /** Stops early and resolves the recording with whatever was captured. */
  finish: () => void;
  /** Abandons the recording entirely (pause/stop) — the promise resolves with spoke=false. */
  cancel: () => void;
  /** The promise the runtime awaits. */
  done: Promise<AnswerRecording>;
}

/**
 * Starts recording an answer from an already-open mic stream.
 * `onLevel` drives the listening ring; it fires ~every 20ms with the
 * current RMS (0..~1).
 */
export function recordAnswer(
  stream: MediaStream,
  options: {
    onsetTimeoutMs: number;
    silenceMs?: number;
    maxMs?: number;
    onLevel?: (rms: number) => void;
    onSpeechStart?: () => void;
  },
): AnswerRecorderHandle {
  const silenceMs = options.silenceMs ?? ANSWER_SILENCE_MS;
  const maxMs = options.maxMs ?? ANSWER_MAX_MS;

  const audioContext = recordingContext();
  void audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(2048, 1, 1);
  // Some browsers only run a ScriptProcessor once it reaches a destination;
  // a zero-gain node keeps it running without echoing the child's own mic.
  const mute = audioContext.createGain();
  mute.gain.value = 0;
  const chunks: Float32Array[] = [];

  let spoke = false;
  let lastVoiceAt = 0;
  let startedAt = Date.now();
  let settled = false;
  let resolveDone: (recording: AnswerRecording) => void = () => undefined;

  const done = new Promise<AnswerRecording>((resolve) => {
    resolveDone = resolve;
  });

  const teardown = () => {
    try {
      processor.onaudioprocess = null;
      processor.disconnect();
      mute.disconnect();
      source.disconnect();
      // The context itself stays open for the next answer.
    } catch {
      /* already torn down */
    }
  };

  const settle = (keepAudio: boolean) => {
    if (settled) return;
    settled = true;
    teardown();
    if (!keepAudio || !spoke) {
      resolveDone({ spoke: false, wavBase64: "", durationMs: 0 });
      return;
    }
    const samples = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(samples);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    resolveDone({
      spoke: true,
      wavBase64: arrayBufferToBase64(wavFromFloat32(merged, RECORD_SAMPLE_RATE)),
      durationMs: Math.round((samples / RECORD_SAMPLE_RATE) * 1000),
    });
  };

  processor.onaudioprocess = (event) => {
    if (settled) return;
    const input = event.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    options.onLevel?.(rms);

    const now = Date.now();
    if (rms >= SPEECH_RMS) {
      if (!spoke) {
        spoke = true;
        startedAt = now;
        options.onSpeechStart?.();
      }
      lastVoiceAt = now;
    }
    if (spoke) {
      chunks.push(new Float32Array(input));
      if (now - lastVoiceAt >= silenceMs) return settle(true); // they finished
      if (now - startedAt >= maxMs) return settle(true); // hard cap
    } else if (now - startedAt >= options.onsetTimeoutMs) {
      return settle(false); // never started — the ladder takes it from here
    }
  };

  source.connect(processor);
  processor.connect(mute);
  mute.connect(audioContext.destination);

  return {
    finish: () => settle(true),
    cancel: () => settle(false),
    done,
  };
}

/** Float32 [-1,1] → PCM16 mono WAV. */
function wavFromFloat32(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}
