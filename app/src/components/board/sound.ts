"use client";

/**
 * The board's five sounds, synthesised with Web Audio so there is nothing
 * to license and nothing to download. Each is ≤ 300 ms and quiet — a
 * classroom, not an arcade. They play on the audio manager's effects bus
 * (src/lib/audioManager.ts), in the app's one playback context.
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
import { audio, type EffectPart } from "@/lib/audioManager";

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

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function envelope(ctx: AudioContext, out: AudioNode, peak: number, attack: number, release: number, at: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
  gain.connect(out);
  return gain;
}

/** Each sound's graph, into the audio manager's effects bus; the manager starts (and stops) the parts. */
const SYNTH: Record<SoundName, (ctx: AudioContext, out: AudioNode) => EffectPart[]> = {
  beadClick(ctx, out) {
    const at = ctx.currentTime;
    const click = ctx.createBufferSource();
    click.buffer = noiseBuffer(ctx, 0.03);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2600;
    band.Q.value = 1.2;
    click.connect(band).connect(envelope(ctx, out, 0.18, 0.003, 0.03, at));
    const tock = ctx.createOscillator();
    tock.type = "sine";
    tock.frequency.setValueAtTime(220, at);
    tock.frequency.exponentialRampToValueAtTime(140, at + 0.06);
    tock.connect(envelope(ctx, out, 0.12, 0.002, 0.07, at));
    return [
      { node: click, at },
      { node: tock, at, stopAt: at + 0.09 },
    ];
  },
  chalk(ctx, out) {
    const at = ctx.currentTime;
    const scratch = ctx.createBufferSource();
    scratch.buffer = noiseBuffer(ctx, 0.15);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(2400, at);
    band.frequency.linearRampToValueAtTime(3600, at + 0.14);
    band.Q.value = 0.9;
    scratch.connect(band).connect(envelope(ctx, out, 0.07, 0.02, 0.12, at));
    return [{ node: scratch, at }];
  },
  chime(ctx, out) {
    const at = ctx.currentTime;
    return (
      [
        [880, 0.16, 0],
        [1318.5, 0.1, 0.06],
      ] as const
    ).map(([frequency, gain, delay]) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(envelope(ctx, out, gain, 0.01, 0.26, at + delay));
      return { node: osc, at: at + delay, stopAt: at + delay + 0.3 };
    });
  },
  wobble(ctx, out) {
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
    osc.connect(low).connect(envelope(ctx, out, 0.14, 0.02, 0.25, at));
    return [
      { node: lfo, at, stopAt: at + 0.29 },
      { node: osc, at, stopAt: at + 0.29 },
    ];
  },
  pageTurn(ctx, out) {
    const at = ctx.currentTime;
    const sweep = ctx.createBufferSource();
    sweep.buffer = noiseBuffer(ctx, 0.26);
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.setValueAtTime(700, at);
    low.frequency.exponentialRampToValueAtTime(3200, at + 0.22);
    sweep.connect(low).connect(envelope(ctx, out, 0.12, 0.05, 0.2, at));
    return [{ node: sweep, at }];
  },
};

/**
 * Plays a sound unless muted — through the one audio manager, which starts it on its effects bus and never while ⏸
 * holds the lesson. Safe to call before any user gesture — it simply stays silent.
 */
export function playSound(name: SoundName): void {
  if (isMuted()) return;
  try {
    audio.effect((ctx, out) => SYNTH[name](ctx, out));
  } catch {
    /* an odd browser; silence is fine */
  }
}
