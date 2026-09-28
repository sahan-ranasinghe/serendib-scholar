/**
 * THE AUDIO MANAGER (28 Sep 2026) — the one owner of everything the app plays.
 *
 * Why it exists: on a real phone, ⏮ then ▶ played two clips together while
 * every drill reported "peak audible 1". The old player's clear() resolved
 * each clip's promise and forgot its source WITHOUT stopping it: the clip
 * the child had paused sat frozen in the suspended context, and ▶ — which
 * resumes the context — brought it back under the selected beat's line. It
 * also resumed the context itself when a fetch finished during ⏸, so a line
 * could start while paused. The measure that caught it reads the browser, not
 * this module (scripts/lib/audioTruth.ts, `npm run audio:check`).
 *
 * What makes two voice clips at once impossible by construction:
 *
 *   ONE CONTEXT      this module creates every AudioContext in the app: the
 *                    playback context (24 kHz, the clips' own rate) with one
 *                    voice bus (→ the mouth's analyser → the speaker) and one
 *                    effects bus, and the microphone's capture contexts
 *                    (captureContext: they never start a source).
 *   ONE STARTER      nothing else calls .start() or .play() — lesson lines,
 *                    the ✋ chat's PCM, the board's sound effects and the actor
 *                    portal's takes all start here (src/lib/audioManager.test.ts
 *                    fails the build on a start anywhere else).
 *   A TOKEN          every request for the speaker takes a monotonically rising
 *                    token (claim). Every continuation — the clip's fetch
 *                    resolving, its decode, its start, the caption/board sync
 *                    that follows — carries it and gives up silently once it
 *                    is not current (unlessStale / isCurrent / play). A new
 *                    request, a navigation, ⏸, ▶, ⏹, ↺ and ✋ all move it on.
 *   STOP MEANS STOP  stopAll() stops AND disconnects every live source and
 *                    aborts every clip fetch in flight (AbortController).
 *   AN INVARIANT     starting a voice while another is live throws in
 *                    development and, in production, logs both labels (the
 *                    beat ids) and stops the older one first.
 *
 * ⏸ freezes the line that is sounding, in place (the context is suspended;
 * that one live voice is carried over to the new token), and nothing else
 * may start until ▶. ▶ moves the token again and lets the frozen line — only
 * that line — play on; a 🔊 preview started while paused ends with the pause.
 * A request whose token a pause or resume moved (not a new request, a stop or
 * a navigation: superseded()) is asked for again by its caller once ▶.
 */

export const OUTPUT_SAMPLE_RATE = 24000;

/** A continuation whose request is no longer current. */
export const STALE = Symbol("stale");
export type Stale = typeof STALE;

/** How a clip's playback ended: heard to the end, stopped, or never started (its token moved on first). */
export type PlayResult = "ended" | "stopped" | "stale";

interface Voice {
  /** The request it belongs to — re-stamped when a pause or resume carries it over. */
  token: number;
  /** What it is, for the invariant's message and the harness (a beat id, "✋ chat", a take). */
  label: string;
  /** Sources of one request (a clip, or the chat's chunks) share a stream: they never count as two clips. */
  stream: string;
  /** Live when ⏸ came: frozen in place, and it plays on after ▶. */
  frozen: boolean;
  /** Stops and disconnects it and settles its promise; idempotent. */
  stop: () => void;
}

export interface ChunkStream {
  /** One base64 PCM16 chunk at 24 kHz, scheduled right after the last (dropped when the stream's request is no longer current). */
  push: (base64Pcm16: string) => void;
  /** Barge-in: what is queued stops, and the stream carries on under a fresh request. */
  interrupt: () => void;
  /** The stream is over: whatever is still queued stops. */
  end: () => void;
}

/** A sound effect's nodes, built by the caller and started here: the source, when it starts and (optionally) stops. */
export interface EffectPart {
  node: AudioScheduledSourceNode;
  at: number;
  stopAt?: number;
}

const DEV = process.env.NODE_ENV !== "production";

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private voiceBus: GainNode | null = null;
  private effectBus: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Float32Array<ArrayBuffer> | null = null;
  private token = 0;
  /** The token of the last claim / stopAll: a request older than this was superseded, not merely paused. */
  private lastTakeover = 0;
  private waiters = new Set<() => void>();
  private voices = new Set<Voice>();
  private fetches = new Set<AbortController>();
  private paused = false;
  private sounding = 0;
  private playingListener: ((playing: boolean) => void) | null = null;
  private playingNow = false;

  // ---------------------------------------------------------------- contexts

  /** The one playback context, made on first use (it starts suspended until a gesture on some phones). */
  context(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor({ sampleRate: OUTPUT_SAMPLE_RATE });
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    analyser.connect(ctx.destination);
    const voiceBus = ctx.createGain();
    voiceBus.connect(analyser);
    const effectBus = ctx.createGain();
    effectBus.connect(ctx.destination);
    this.ctx = ctx;
    this.analyser = analyser;
    this.analyserData = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    this.voiceBus = voiceBus;
    this.effectBus = effectBus;
    return ctx;
  }

  /** A context for the microphone (the ✋ chat, the answer recorder, the portal's takes). Capture only: it never starts a source. */
  captureContext(sampleRate?: number): AudioContext {
    return new AudioContext(sampleRate ? { sampleRate } : undefined);
  }

  /** Decodes a recording for drawing (the portal's trim editor) — offline, nothing is played. */
  decodeFile(data: ArrayBuffer): Promise<AudioBuffer> {
    return new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
  }

  /**
   * The lesson's first gesture (and every later one): let the speaker run — unless ⏸ holds it. suspend() and resume()
   * are asked for UNCONDITIONALLY: the context applies them in the order they are called, but its `state` changes only
   * when each one lands — deciding by `state` let a resume still in flight outlive a pause (the lesson paused, the voice
   * running on) and let a start-of-lesson resume be skipped while a suspend was still on its way.
   */
  unlock(): void {
    const ctx = this.context();
    if (ctx && !this.paused && ctx.state !== "closed") void ctx.resume().catch(() => undefined);
  }

  // ---------------------------------------------------------------- the token

  current(): number {
    return this.token;
  }

  isCurrent(token: number): boolean {
    return token === this.token;
  }

  /** Moved on by a newer request, a stop or a navigation — not merely by ⏸ / ▶ (such a request is asked for again). */
  superseded(token: number): boolean {
    return this.lastTakeover > token;
  }

  private bump(): number {
    this.token += 1;
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const wake of waiters) wake();
    return this.token;
  }

  /**
   * `promise`, or STALE the moment the token moves past `token`: a continuation never waits on a request nobody wants.
   * A rejection (an undecodable clip) is null — a missing clip, not a stale one — so a caller never retries it forever.
   */
  unlessStale<T>(token: number, promise: Promise<T>): Promise<T | null | Stale> {
    if (!this.isCurrent(token)) return Promise.resolve(STALE);
    return new Promise<T | null | Stale>((resolve) => {
      const wake = () => resolve(STALE);
      this.waiters.add(wake);
      promise.then(
        (value) => {
          this.waiters.delete(wake);
          resolve(this.isCurrent(token) ? value : STALE);
        },
        () => {
          this.waiters.delete(wake);
          resolve(this.isCurrent(token) ? null : STALE);
        },
      );
    });
  }

  /** A new request for the speaker: the token moves on and whatever is sounding stops — the newest request wins. */
  claim(label: string): number {
    const token = this.bump();
    this.lastTakeover = token;
    this.silence();
    return token;
  }

  /** Everything stops (a navigation, ⏹, ↺, ✋): the token moves on, every source is stopped and disconnected, every clip fetch aborted. */
  stopAll(reason: string): number {
    const token = this.bump();
    this.lastTakeover = token;
    for (const controller of this.fetches) controller.abort(new DOMException(`stopAll: ${reason}`, "AbortError"));
    this.fetches.clear();
    this.silence();
    return token;
  }

  /** ⏸: the sounding line freezes in place (carried over to the new token); anything still on its way is stale. */
  pause(): void {
    this.paused = true;
    const token = this.bump();
    for (const voice of this.voices) {
      voice.token = token;
      voice.frozen = true;
    }
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.suspend().catch(() => undefined);
  }

  /** ▶: the token moves on again; the frozen line plays on, a preview started while paused (🔊) ends here. */
  resume(): void {
    this.paused = false;
    const token = this.bump();
    for (const voice of [...this.voices]) {
      if (voice.frozen) {
        voice.token = token;
        voice.frozen = false;
      } else voice.stop();
    }
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.resume().catch(() => undefined);
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** The lesson is over (⏹): everything stops, a pause is forgotten, and the speaker sleeps until the next one. */
  release(reason: string): void {
    this.stopAll(reason);
    this.paused = false;
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.suspend().catch(() => undefined);
  }

  // ---------------------------------------------------------------- fetching

  /** A clip fetch the next stopAll aborts (and `timeoutMs` too). The body is read here, under the same signal. */
  async fetchBody<T>(url: string, timeoutMs: number, read: (response: Response) => Promise<T>): Promise<T | null> {
    const controller = new AbortController();
    this.fetches.add(controller);
    const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return await read(response);
    } finally {
      clearTimeout(timer);
      this.fetches.delete(controller);
    }
  }

  decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.context();
    if (!ctx) return Promise.reject(new Error("no audio"));
    return ctx.decodeAudioData(data.slice(0));
  }

  // ---------------------------------------------------------------- playing

  /** The playback clock, in seconds (frozen while ⏸ suspends it). */
  clock(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /**
   * Plays one clip under `token` and resolves when it has been heard to the end ("ended"), was stopped ("stopped"), or
   * never started because the token had moved on — or because ⏸ holds the lesson ("stale"). Sentence boundaries are
   * called back on the AUDIO clock, so a pause holds them with the word they belong to. `whilePaused` is the 🔊 preview.
   */
  play(buffer: AudioBuffer, options: { token: number; label: string; sentences?: Array<{ startMs: number }>; onSentence?: (index: number) => void; whilePaused?: boolean }): Promise<PlayResult> {
    const ctx = this.context();
    const bus = this.voiceBus;
    if (!ctx || !bus || !this.isCurrent(options.token)) return Promise.resolve("stale");
    if (this.paused && !options.whilePaused) return Promise.resolve("stale");
    this.assertAlone(options.label, null);
    if (options.whilePaused) void ctx.resume().catch(() => undefined);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    (source as AudioBufferSourceNode & { __label?: string }).__label = options.label;
    source.connect(bus);
    const startAt = ctx.currentTime;
    return new Promise<PlayResult>((resolve) => {
      let settled = false;
      const sentences = options.sentences ?? [];
      let next = 0;
      const voice: Voice = { token: options.token, label: options.label, stream: `${options.label}#${options.token}`, frozen: false, stop: () => finish("stopped") };
      const finish = (result: PlayResult) => {
        if (settled) return;
        settled = true;
        clearInterval(clock);
        this.voices.delete(voice);
        source.onended = null;
        if (result === "stopped") {
          try {
            source.stop();
          } catch {
            // never started, or already over
          }
        }
        try {
          source.disconnect();
        } catch {
          // already disconnected
        }
        this.setSounding(-1);
        // A preview that ends while ⏸ still holds the lesson puts the speaker back to sleep with it.
        if (options.whilePaused && this.paused) void ctx.suspend().catch(() => undefined);
        resolve(result);
      };
      // Sentence boundaries and the end, on the audio clock: 'ended' is unreliable on some phones, and a wall-clock timer
      // would fire through a pause.
      const clock = setInterval(() => {
        if (settled) return;
        const position = (ctx.currentTime - startAt) * 1000;
        while (next < sentences.length && sentences[next]!.startMs <= position) {
          const index = next;
          next += 1;
          options.onSentence?.(index);
        }
        if (ctx.state === "running" && position >= buffer.duration * 1000 + 60) finish("ended");
      }, 30);
      this.voices.add(voice);
      source.onended = () => finish("ended");
      source.start(startAt);
      this.setSounding(1);
    });
  }

  /**
   * A stream of PCM chunks under ONE request (the ✋ chat, the dev test tone): back to back, and one clip to the invariant.
   * Opening it claims the speaker; it is a live voice from then until end() — so ⏸ / ▶ carry it over like a line.
   */
  openStream(label: string): ChunkStream {
    const sources = new Set<AudioBufferSourceNode>();
    let end = 0;
    const quiet = () => {
      for (const source of sources) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // already over
        }
        try {
          source.disconnect();
        } catch {
          // already disconnected
        }
        this.setSounding(-1);
      }
      sources.clear();
      end = 0;
    };
    const token = this.claim(label);
    const voice: Voice = {
      token,
      label,
      stream: `${label}#${token}`,
      frozen: false,
      stop: () => {
        quiet();
        this.voices.delete(voice);
      },
    };
    this.voices.add(voice);
    return {
      push: (base64) => {
        const ctx = this.context();
        const bus = this.voiceBus;
        if (!ctx || !bus || !this.voices.has(voice) || !this.isCurrent(voice.token)) return;
        const pcm = base64ToInt16(base64);
        const buffer = ctx.createBuffer(1, pcm.length, OUTPUT_SAMPLE_RATE);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i]! / (pcm[i]! < 0 ? 0x8000 : 0x7fff);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        (source as AudioBufferSourceNode & { __label?: string }).__label = label;
        source.connect(bus);
        const startAt = Math.max(ctx.currentTime, end);
        source.start(startAt);
        end = startAt + buffer.duration;
        sources.add(source);
        this.setSounding(1);
        source.onended = () => {
          if (!sources.delete(source)) return;
          try {
            source.disconnect();
          } catch {
            // already disconnected
          }
          this.setSounding(-1);
        };
      },
      interrupt: () => {
        if (!this.voices.has(voice)) return;
        // Barge-in: what is queued stops; the stream carries on under a fresh token (the voice stays the live one).
        quiet();
        this.voices.delete(voice);
        voice.token = this.claim(label);
        voice.stream = `${label}#${voice.token}`;
        this.voices.add(voice);
      },
      end: () => voice.stop(),
    };
  }

  /** A board sound effect (≤ 300 ms, over her voice by design): built by the caller, started here. Never while ⏸ holds. */
  effect(build: (ctx: AudioContext, out: AudioNode) => EffectPart[]): void {
    const ctx = this.context();
    const bus = this.effectBus;
    if (!ctx || !bus || this.paused) return;
    // Outside a lesson (the gallery) nothing else wakes the speaker; inside one, a pause never gets this far.
    if (ctx.state !== "running") {
      void ctx.resume().catch(() => undefined);
      return;
    }
    for (const part of build(ctx, bus)) {
      part.node.start(part.at);
      if (part.stopAt !== undefined) part.node.stop(part.stopAt);
    }
  }

  /** A recording by URL (the actor portal): claims the speaker like any request; resolves when it ends or is stopped. */
  playUrl(url: string, label: string): Promise<PlayResult> {
    const token = this.claim(label);
    const element = new Audio(url);
    return new Promise<PlayResult>((resolve) => {
      let settled = false;
      const voice: Voice = { token, label, stream: `${label}#${token}`, frozen: false, stop: () => finish("stopped") };
      const finish = (result: PlayResult) => {
        if (settled) return;
        settled = true;
        this.voices.delete(voice);
        element.onended = null;
        element.onerror = null;
        element.pause();
        this.setSounding(-1);
        resolve(result);
      };
      this.voices.add(voice);
      this.setSounding(1);
      element.onended = () => finish("ended");
      element.onerror = () => finish("stopped");
      element.play().catch(() => finish("stopped"));
    });
  }

  // ---------------------------------------------------------------- the invariant

  /** Two voice clips at once is a bug: loud in development, logged with both labels and made impossible in production. */
  private assertAlone(label: string, stream: string | null): void {
    const other = [...this.voices].find((voice) => voice.stream !== stream);
    if (!other) return;
    const message = `[audio] two clips at once refused: "${label}" would start while "${other.label}" is live`;
    if (DEV) throw new Error(message);
    console.error(message);
    this.silence();
  }

  private silence(): void {
    for (const voice of [...this.voices]) voice.stop();
    this.voices.clear();
  }

  // ---------------------------------------------------------------- the mouth and the debug panel

  private setSounding(delta: number): void {
    this.sounding = Math.max(0, this.sounding + delta);
    const playing = this.sounding > 0;
    if (playing === this.playingNow) return;
    this.playingNow = playing;
    this.playingListener?.(playing);
  }

  /** Called with true when her voice starts sounding and false when nothing does (the character's talking state). */
  onPlayingChange(listener: ((playing: boolean) => void) | null): void {
    this.playingListener = listener;
  }

  /** RMS of the voice at the speaker, 0..~1 (the mouth reads it once a frame). */
  getAmplitude(): number {
    const analyser = this.analyser;
    const data = this.analyserData;
    if (!analyser || !data) return 0;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) sum += data[i]! * data[i]!;
    return Math.sqrt(sum / data.length);
  }

  debug(): { contextState: string; currentTime: number; token: number; paused: boolean; voices: string[]; fetches: number; playing: boolean } {
    return {
      contextState: this.ctx?.state ?? "none",
      currentTime: this.ctx?.currentTime ?? 0,
      token: this.token,
      paused: this.paused,
      voices: [...this.voices].map((voice) => `${voice.label}${voice.frozen ? " (frozen)" : ""}`),
      fetches: this.fetches.size,
      playing: this.playingNow,
    };
  }
}

/** The app's one audio manager. */
export const audio = new AudioManager();
