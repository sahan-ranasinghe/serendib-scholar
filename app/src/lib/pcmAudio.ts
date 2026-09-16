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
  /** The most clips ever audible at once — 1 is the contract (never two). Read by the harness as window.__audio. */
  private peakSources = 0;
  /** How many clips have ever started. A control that must not make a sound leaves this untouched. */
  private clipsStarted = 0;
  private onPlaybackStateChange?: (isPlaying: boolean) => void;
  /** Taps the output for per-frame amplitude (drives the character's mouth) — see getAmplitude. */
  private analyser: AnalyserNode;
  private analyserBuffer: Float32Array<ArrayBuffer>;
  /**
   * TIME-BASED DRAIN DETECTION. On some mobile browsers the buffer-source
   * `onended` events are unreliable, so the drain callback never fired —
   * mic windows didn't open, silence ladders never started (observed live:
   * an ASK sat 48s with no ladder activity). So drain is ALSO detected by
   * the clock: the scheduled end of the last queued buffer is tracked, a
   * 100ms poller compares it to currentTime, and whichever of event/poll
   * fires first wins (the other becomes a no-op).
   */
  private lastScheduledEnd = 0;
  private drainPoller: ReturnType<typeof setInterval> | null = null;
  private playing = false;
  /** For the debug panel and drain-timing printouts. */
  lastDrainVia: "event" | "poll" | null = null;

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

  /** Freezes playback in place (the pause control) — resume() picks it back up. */
  async suspend(): Promise<void> {
    if (this.audioContext.state === "running") {
      await this.audioContext.suspend();
    }
  }

  /**
   * Plays ONE cached clip (a WAV fetched from the clip cache) and resolves
   * when it has finished, calling back at each sentence boundary so the
   * board can change between sentences rather than mid-word.
   *
   * This is the lesson's normal speech path now: scripted lines are
   * pre-rendered, so the runtime plays a file instead of streaming a live
   * voice session. `stop()` (pause, skip, session end) resolves it early.
   */
  async playClip(
    data: ArrayBuffer,
    options: { sentences?: Array<{ startMs: number; endMs: number }>; onSentence?: (index: number) => void } = {},
  ): Promise<void> {
    const audioBuffer = await this.audioContext.decodeAudioData(data.slice(0));
    await this.resume();
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.analyser);

    const startAt = Math.max(this.audioContext.currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
    this.lastScheduledEnd = Math.max(this.lastScheduledEnd, this.nextStartTime);
    this.activeSources.add(source);
    this.clipsStarted += 1;
    this.probe();
    this.setPlaying(true);
    this.startDrainPoller();

    // Sentence boundaries are scheduled off the same clock the audio runs
    // on, so a board change lands in the pause, not over her voice.
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    (options.sentences ?? []).forEach((sentence, index) => {
      const delayMs = Math.max(0, (startAt - this.audioContext.currentTime) * 1000 + sentence.startMs);
      timers.push(setTimeout(() => options.onSentence?.(index), delayMs));
    });

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.clipStoppers.delete(finish);
        for (const timer of timers) clearTimeout(timer);
        this.activeSources.delete(source);
        this.probe();
      this.probe();
        if (this.activeSources.size === 0) this.setPlaying(false);
        resolve();
      };
      this.clipStoppers.add(finish);
      source.onended = finish;
      // Clock fallback: on some mobile browsers `onended` never fires, and
      // a beat that never reports finishing would hang the whole lesson.
      // It follows the AUDIO clock, not the wall clock, so a pause (which
      // suspends the context) cannot "finish" a clip that is frozen
      // mid-sentence — it re-arms for whatever is genuinely left.
      const armGuard = () => {
        const remainingMs = Math.max(0, (this.lastScheduledEnd - this.audioContext.currentTime) * 1000);
        timers.push(
          setTimeout(() => {
            if (settled) return;
            if (this.audioContext.state === "suspended" || this.audioContext.currentTime < this.lastScheduledEnd - 0.05) {
              armGuard();
              return;
            }
            finish();
          }, Math.max(300, remainingMs + 300)),
        );
      };
      armGuard();
    });
  }

  /** Resolvers for clips currently playing — clear()/stop paths end them cleanly. */
  private clipStoppers = new Set<() => void>();

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
    this.lastScheduledEnd = Math.max(this.lastScheduledEnd, this.nextStartTime);

    this.activeSources.add(source);
    this.clipsStarted += 1;
    this.probe();
    this.setPlaying(true);
    this.startDrainPoller();

    source.onended = () => {
      this.activeSources.delete(source);
      this.probe();
      if (this.activeSources.size === 0 && this.audioContext.currentTime >= this.lastScheduledEnd - 0.02) {
        this.lastDrainVia = "event";
        this.setPlaying(false);
      }
    };
  }

  /** Single source of truth for the playing flag — event and poller both funnel here, idempotently. */
  private setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    if (!playing) {
      this.stopDrainPoller();
      // One line per drain — how it was detected and how far past the
      // scheduled end the clock was. This is what the mobile verification
      // (and any field debugging) reads.
      console.debug(
        `[pcm] drain via=${this.lastDrainVia ?? "clear"} t=${this.audioContext.currentTime.toFixed(3)} ` +
          `end=${this.lastScheduledEnd.toFixed(3)} lag=${(this.audioContext.currentTime - this.lastScheduledEnd).toFixed(3)}s ` +
          `ctx=${this.audioContext.state}`,
      );
    }
    this.onPlaybackStateChange?.(playing);
  }

  private startDrainPoller(): void {
    if (this.drainPoller) return;
    this.drainPoller = setInterval(() => {
      if (!this.playing) return;
      if (this.audioContext.currentTime >= this.lastScheduledEnd + 0.05) {
        this.lastDrainVia = "poll";
        this.activeSources.clear();
        this.probe();
    this.probe();
        this.setPlaying(false);
      }
    }, 100);
  }

  private stopDrainPoller(): void {
    if (this.drainPoller) clearInterval(this.drainPoller);
    this.drainPoller = null;
  }

  /** AudioContext state + drain timing, for the debug panel and stall diagnosis. */
  /**
   * How many clips are audible right now, and the most there have ever been.
   * Published on `window.__audio` so an unattended run can assert the
   * contract that two clips never overlap, from any control.
   */
  private probe(): void {
    this.peakSources = Math.max(this.peakSources, this.activeSources.size);
    if (typeof window !== "undefined") {
      (window as unknown as { __audio?: { active: number; peak: number; started: number } }).__audio = { active: this.activeSources.size, peak: this.peakSources, started: this.clipsStarted };
    }
  }

  getPlaybackDebug(): { contextState: string; currentTime: number; lastScheduledEnd: number; playing: boolean; lastDrainVia: string | null; activeSources: number; peakSources: number; clipsStarted: number } {
    return {
      contextState: this.audioContext.state,
      currentTime: this.audioContext.currentTime,
      lastScheduledEnd: this.lastScheduledEnd,
      playing: this.playing,
      lastDrainVia: this.lastDrainVia,
      activeSources: this.activeSources.size,
      peakSources: this.peakSources,
      clipsStarted: this.clipsStarted,
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
    for (const stopper of [...this.clipStoppers]) stopper();
    this.clipStoppers.clear();
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();
    this.probe();
    this.nextStartTime = this.audioContext.currentTime;
    this.lastScheduledEnd = this.audioContext.currentTime;
    this.setPlaying(false);
  }

  close(): void {
    this.clear();
    void this.audioContext.close();
  }
}
