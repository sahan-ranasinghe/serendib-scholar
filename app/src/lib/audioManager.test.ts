import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { audio, STALE } from "./audioManager";

/**
 * ONE STARTER (28 Sep 2026): nothing outside src/lib/audioManager.ts may make a playback context or an audio element,
 * or start / play a sound. Two clips at once used to come from exactly that: sounds started in more than one place, and
 * a player that could forget one. The recorders' .start() (MediaRecorder, the portal's take hook) records — it plays
 * nothing — and is the one exception.
 */
const FORBIDDEN: Array<{ pattern: RegExp; what: string }> = [
  { pattern: /\bnew\s+(?:window\.)?(?:webkit)?AudioContext\b/u, what: "makes an AudioContext (use audio.context() / audio.captureContext())" },
  { pattern: /\bnew\s+OfflineAudioContext\b/u, what: "makes an OfflineAudioContext (use audio.decodeFile())" },
  { pattern: /\bnew\s+Audio\s*\(/u, what: "makes an audio element (use audio.playUrl())" },
  { pattern: /\.play\s*\(\s*\)/u, what: "calls .play() (use audio.play() / audio.playUrl())" },
  { pattern: /(?<!\brecorder)\.start\s*\(/u, what: "calls .start() (use audio.play() / openStream() / effect())" },
];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/u.test(name) && !/\.test\.tsx?$/u.test(name)) out.push(full);
  }
  return out;
}

test("nothing outside the audio manager makes a context or an element, or starts a sound", () => {
  const root = path.resolve(__dirname, "..");
  const offenders: string[] = [];
  for (const file of sources(root)) {
    if (file.endsWith(path.join("lib", "audioManager.ts"))) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (/^\s*(\/\/|\*)/u.test(line)) return;
        for (const rule of FORBIDDEN) if (rule.pattern.test(line)) offenders.push(`${path.relative(root, file)}:${index + 1} ${rule.what}`);
      });
  }
  assert.deepEqual(offenders, []);
});

test("a new request supersedes the last; ⏸ and ▶ move the token without superseding", () => {
  const first = audio.claim("line A");
  assert.ok(audio.isCurrent(first));
  audio.pause();
  assert.ok(!audio.isCurrent(first), "⏸ moves the token on");
  assert.ok(!audio.superseded(first), "…but a paused request is asked for again, not dropped");
  audio.resume();
  assert.ok(!audio.superseded(first));
  const second = audio.claim("line B");
  assert.ok(audio.superseded(first), "a newer line supersedes it");
  audio.stopAll("navigation");
  assert.ok(audio.superseded(second), "a navigation supersedes everything before it");
});

test("a continuation waiting on a fetch returns STALE the moment the token moves", async () => {
  const token = audio.claim("line C");
  let finish: (value: string) => void = () => undefined;
  const slow = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const waiting = audio.unlessStale(token, slow);
  audio.stopAll("navigation");
  assert.equal(await waiting, STALE);
  finish("the clip, too late");
});

test("a continuation whose token is current gets its value; a failed one is a miss (null), never stale", async () => {
  const token = audio.claim("line D");
  assert.equal(await audio.unlessStale(token, Promise.resolve("clip")), "clip");
  assert.equal(await audio.unlessStale(token, Promise.reject(new Error("undecodable"))), null);
});

test("nothing plays without a playback context, and a stale token never starts", async () => {
  const token = audio.claim("line E");
  audio.claim("line F");
  assert.equal(await audio.play({} as AudioBuffer, { token, label: "line E" }), "stale");
});
