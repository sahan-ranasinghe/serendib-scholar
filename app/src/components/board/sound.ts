"use client";

/**
 * The board's five sounds, synthesised with Web Audio so there is nothing
 * to license and nothing to download. Each is ≤ 300 ms and quiet — a
 * classroom, not an arcade.
 *
 *   beadClick  a bead landing on a rod
 *   chalk      a marker writing (every write-on, ≤ 150 ms)
 *   chime      correct — two soft partials
 *   wobble     wrong — a low tone with a slow vibrato; nothing harsh
 *   pageTurn   a concept change
 *
 * Mute lives here too (a tiny external store, remembered per device), so
 * the tray's toggle and every primitive agree.
 */
import { useSyncExternalStore } from "react";

export type SoundName = "beadClick" | "chalk" | "chime" | "wobble" | "pageTurn";

const MUTE_KEY = "board.muted";
let muted = false;
let loaded = false;
const listeners = new Set<() => void>();

function loadMuted(): void {
  if (loaded) return;
  loaded = true;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
}

export function isMuted(): boolean {
  if (typeof window !== "undefined") loadMuted();
  return muted;
}

export function setMuted(next: boolean): void {
  loadMuted();
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* private mode — the toggle still works for this page */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMuted(): boolean {
  return useSyncExternalStore(subscribe, isMuted, () => false);
}

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function envelope(ctx: AudioContext, peak: number, attack: number, release: number, at: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
  gain.connect(ctx.destination);
  return gain;
}

const SYNTH: Record<SoundName, (ctx: AudioContext) => void> = {
  beadClick(ctx) {
    const at = ctx.currentTime;
    const click = ctx.createBufferSource();
    click.buffer = noiseBuffer(ctx, 0.03);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2600;
    band.Q.value = 1.2;
    click.connect(band).connect(envelope(ctx, 0.18, 0.003, 0.03, at));
    click.start(at);
    const tock = ctx.createOscillator();
    tock.type = "sine";
    tock.frequency.setValueAtTime(220, at);
    tock.frequency.exponentialRampToValueAtTime(140, at + 0.06);
    tock.connect(envelope(ctx, 0.12, 0.002, 0.07, at));
    tock.start(at);
    tock.stop(at + 0.09);
  },
  chalk(ctx) {
    const at = ctx.currentTime;
    const scratch = ctx.createBufferSource();
    scratch.buffer = noiseBuffer(ctx, 0.15);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(2400, at);
    band.frequency.linearRampToValueAtTime(3600, at + 0.14);
    band.Q.value = 0.9;
    scratch.connect(band).connect(envelope(ctx, 0.07, 0.02, 0.12, at));
    scratch.start(at);
  },
  chime(ctx) {
    const at = ctx.currentTime;
    for (const [frequency, gain, delay] of [
      [880, 0.16, 0],
      [1318.5, 0.1, 0.06],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(envelope(ctx, gain, 0.01, 0.26, at + delay));
      osc.start(at + delay);
      osc.stop(at + delay + 0.3);
    }
  },
  wobble(ctx) {
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 165;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const depth = ctx.createGain();
    depth.gain.value = 14;
    lfo.connect(depth).connect(osc.frequency);
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 600;
    osc.connect(low).connect(envelope(ctx, 0.14, 0.02, 0.25, at));
    lfo.start(at);
    osc.start(at);
    osc.stop(at + 0.29);
    lfo.stop(at + 0.29);
  },
  pageTurn(ctx) {
    const at = ctx.currentTime;
    const sweep = ctx.createBufferSource();
    sweep.buffer = noiseBuffer(ctx, 0.26);
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.setValueAtTime(700, at);
    low.frequency.exponentialRampToValueAtTime(3200, at + 0.22);
    sweep.connect(low).connect(envelope(ctx, 0.12, 0.05, 0.2, at));
    sweep.start(at);
  },
};

/** Plays a sound unless muted. Safe to call before any user gesture — it simply stays silent. */
export function playSound(name: SoundName): void {
  if (isMuted()) return;
  const ctx = audio();
  if (!ctx || ctx.state !== "running") return;
  try {
    SYNTH[name](ctx);
  } catch {
    /* an odd browser; silence is fine */
  }
}
