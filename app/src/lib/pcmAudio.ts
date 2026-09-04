/**
 * Mic capture (AudioWorklet -> 16kHz PCM16) and playback (24kHz PCM16 queue)
 * for the Gemini Live duplex audio stream. Gemini Live speaks in raw PCM16
 * mono chunks, base64-encoded inside the WebSocket JSON frames — no browser
 * codec is involved on either side.
 */

export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface PcmRecorderHandle {
  stop: () => void;
}

/**
 * Starts capturing microphone audio and invokes `onChunk` with base64-encoded
 * PCM16 frames at 16kHz, ready to send as `realtimeInput.audio.data`.
 */
export async function startPcmRecorder(
  stream: MediaStream,
  onChunk: (base64Pcm16: string) => void,
): Promise<PcmRecorderHandle> {
  const audioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
  await audioContext.audioWorklet.addModule("/worklets/pcm-recorder-worklet.js");

  const source = audioContext.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(audioContext, "pcm-recorder-worklet");

  worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    onChunk(arrayBufferToBase64(event.data));
  };

  source.connect(worklet);
  // The worklet doesn't need to reach the speakers — connect to a muted
  // destination-less path so the graph stays alive without echoing input.
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  worklet.connect(silentGain);
  silentGain.connect(audioContext.destination);

  return {
    stop: () => {
      worklet.port.onmessage = null;
      source.disconnect();
      worklet.disconnect();
      silentGain.disconnect();
      void audioContext.close();
    },
  };
}

/**
 * Schedules incoming 24kHz PCM16 chunks back-to-back for gapless playback,
 * and supports immediate interruption (barge-in) when the model is cut off
 * by the child speaking again.
 */
export class PcmPlayer {
  private audioContext: AudioContext;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private onPlaybackStateChange?: (isPlaying: boolean) => void;
  /** Taps the output for per-frame amplitude (drives the character's mouth) — see getAmplitude. */
  private analyser: AnalyserNode;
  private analyserBuffer: Float32Array<ArrayBuffer>;

  /**
   * `onPlaybackStateChange`, if given, fires true the instant audio starts
   * actually playing through the speaker and false the instant it's fully
   * drained (last source ended) or cleared (barge-in) — used to drive the
   * character's "talking" visual state on real playback, not just on
   * network chunk arrival (which runs ahead of what's actually audible).
   */
  constructor(options?: { onPlaybackStateChange?: (isPlaying: boolean) => void }) {
    this.audioContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    this.onPlaybackStateChange = options?.onPlaybackStateChange;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    this.analyser.connect(this.audioContext.destination);
    this.analyserBuffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
  }

  /**
   * RMS of the audio currently at the speaker, 0..~1 — read once per
   * animation frame to drive the talking mouth (see ZaraCharacter.tsx).
   * Cheap: one time-domain read, no allocation.
   */
  getAmplitude(): number {
    this.analyser.getFloatTimeDomainData(this.analyserBuffer);
    let sum = 0;
    for (let i = 0; i < this.analyserBuffer.length; i += 1) {
      sum += this.analyserBuffer[i] * this.analyserBuffer[i];
    }
    return Math.sqrt(sum / this.analyserBuffer.length);
  }

  async resume(): Promise<void> {
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  enqueue(base64Pcm16: string): void {
    const buffer = base64ToArrayBuffer(base64Pcm16);
    const pcm16 = new Int16Array(buffer);
    const audioBuffer = this.audioContext.createBuffer(
      1,
      pcm16.length,
      OUTPUT_SAMPLE_RATE,
    );
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcm16.length; i++) {
      channel[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    // Through the analyser so getAmplitude sees exactly what's audible.
    source.connect(this.analyser);

    const startAt = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;

    const wasEmpty = this.activeSources.size === 0;
    this.activeSources.add(source);
    if (wasEmpty) this.onPlaybackStateChange?.(true);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0) this.onPlaybackStateChange?.(false);
    };
  }

  /**
   * Stops and clears any queued/playing audio — used on barge-in
   * interruption. `activeSources` is cleared synchronously (not left to the
   * async `onended` cascade) so an `enqueue()` called immediately after —
   * e.g. the model resuming speech right after being interrupted — always
   * sees an empty set and correctly fires onPlaybackStateChange(true)
   * again, rather than a stale entry suppressing it. Each stopped source's
   * own `onended` still fires (guaranteed by the Web Audio API spec) and
   * harmlessly no-ops against the now-empty set.
   */
  clear(): void {
    const wasPlaying = this.activeSources.size > 0;
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();
    this.nextStartTime = this.audioContext.currentTime;
    if (wasPlaying) this.onPlaybackStateChange?.(false);
  }

  close(): void {
    this.clear();
    void this.audioContext.close();
  }
}
