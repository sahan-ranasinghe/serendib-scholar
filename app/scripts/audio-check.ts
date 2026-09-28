/**
 * npm run audio:check -- <baseUrl> — the navigation soak, alone (28 Sep 2026).
 *
 * "Tap ⏮ once (or a few times), then ▶, and two clips play together" — on a
 * real phone, while every drill said "peak audible 1" (it read the player's
 * own counter). This check measures the BROWSER (scripts/lib/audioTruth.ts:
 * AudioScheduledSourceNode.start/stop, 'ended', disconnect, every
 * AudioContext's state, HTMLMediaElement play/pause) and replays the device
 * sequence forty times under device-like conditions — Slow 3G on the page
 * and its service worker, 4× CPU (scripts/lib/navSoak.ts):
 *
 *   ⏮ once → ▶ (20×) and ⏮ five times → ▶ (20×), 0 / 100 / 300 / 800 ms
 *   between the last ⏮ and ▶, ⏸ at four different moments of the line.
 *
 * Every sequence must keep real concurrency ≤ 1, be silent while paused, and
 * play exactly one clip — the selected beat's — after ▶ (and serve exactly
 * one beat, where the build publishes window.__served). Exit 1 otherwise.
 *
 * A fresh child is onboarded through the API (scripts/lib/onboard.ts) and
 * removed again at the end. Needs a production build served with
 * DEV_MODE=on (the soak lands on its origins with window.__dev.jump) and
 * CLIP_RENDER=off.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { connect, evaluate, launch, openPage, wait } from "./lib/cdp";
import { ONBOARD_VIA_API_JS } from "./lib/onboard";
import { AUDIO_TRUTH_JS } from "./lib/audioTruth";
import { CPU_RATE, runNavSoak, SLOW_3G, soakOrigins, soakTable, type SoakBeat } from "./lib/navSoak";
import { beatSpec, type BeatType } from "../src/lib/beatRegistry";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3001";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

/** A beat that only speaks: nothing waits for an answer, and it has words to say. */
export function speechOnly(beat: SoakBeat): boolean {
  const words = (beat.spokenText ?? "").trim() || (beat.sayCandidates ?? []).find((s) => s.trim());
  if (!words) return false;
  if (["CLOSE_SESSION", "RECAP", "SESSION_START", "CHAT_OPENER", "BREAK_CHAT"].includes(beat.type)) return false;
  try {
    // A soft check ("acknowledge") waits a moment and carries on by itself; a question ("judge") would stall the soak.
    const handling = beatSpec(beat.type as BeatType).onChildResponse;
    return handling === "none" || beat.type === "SOFT_CHECK" || beat.type === "WAIT";
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const { browser, wsUrl } = await launch("audio-check");
  const root = await connect(wsUrl, "audio-check");
  const page = await openPage(root);
  const errors: string[] = [];
  page.on("Runtime.exceptionThrown", (params) => {
    const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
    errors.push(`exception: ${details?.exception?.description ?? details?.text ?? "?"}`.slice(0, 240));
  });
  page.on("Runtime.consoleAPICalled", (params) => {
    const args = (params.args as Array<{ value?: unknown; description?: string }>) ?? [];
    const text = args.map((a) => String(a.value ?? a.description ?? "")).join(" ");
    // Errors, and the lesson's clip-fetch warnings (a timeout on Slow 3G is read on the board — say so).
    if (params.type === "error" || /clip fetch failed/u.test(text)) errors.push(`console.${params.type}: ${text}`.slice(0, 240));
  });
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("Network.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: AUDIO_TRUTH_JS });
  await page.send("Emulation.setUserAgentOverride", { userAgent: MOBILE_UA, platform: "Android" });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  // A fresh child, onboarded the way design-check's clip drill does it.
  const env = await readFile(path.resolve(process.cwd(), ".env.local"), "utf8").catch(() => "");
  const accessCode = /^ACCESS_CODE=(.*)$/mu.exec(env)?.[1]?.trim().replace(/^["']|["']$/gu, "") ?? "";
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send("Page.navigate", { url: `${BASE}/` });
  await wait(1500);
  type Onboarded = { ok: boolean; child_id?: string; step?: string; error?: string };
  const onboarded: Onboarded = await evaluate<Onboarded>(page, ONBOARD_VIA_API_JS(accessCode, "ශබ්ද පරීක්ෂා")).catch((): Onboarded => ({ ok: false, step: "evaluate" }));
  if (!onboarded.ok) throw new Error(`onboarding failed at ${onboarded.step}`);
  let exitCode = 1;
  try {
    await page.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
    await page.send("Page.navigate", { url: `${BASE}/session` });
    await wait(3000);
    // The child's first tap (the gesture that unlocks audio on a phone).
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 446, y: 206 }] });
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const script = await evaluate<{ beats: SoakBeat[]; sessions: Array<{ firstBeat: number; lastBeat: number }> } | null>(
      page,
      `fetch("/api/lesson-script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "maths", grade: 5, lesson: 1 }) }).then((r) => r.json()).then((j) => j.script ?? null).catch(() => null)`,
    );
    if (!script) throw new Error("no lesson script");
    const origins = soakOrigins(script.beats, script.sessions[0]!.lastBeat, speechOnly);
    if (origins.length === 0) throw new Error("no run of six speech-only beats in the first session");
    for (let i = 0; i < 120; i += 1) {
      if ((await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.status ?? ''`)) === "teaching") break;
      await wait(250);
    }
    console.log(`origins (${origins.length}): ${origins.map((i) => `${script.beats[i]!.id.replace(/^authored:/u, "")} (#${i})`).join(", ")}`);

    // Device-like conditions: Slow 3G for the page AND its service worker (a clip the worker fetches is throttled too), 4× CPU.
    await page.send("Network.emulateNetworkConditions", SLOW_3G);
    const targets = (await root.send("Target.getTargets")) as { targetInfos: Array<{ targetId: string; type: string; url: string }> };
    const worker = targets.targetInfos.find((t) => t.type === "service_worker" && t.url.includes("/sw.js"));
    if (worker) {
      const session = ((await root.send("Target.attachToTarget", { targetId: worker.targetId, flatten: true })) as { sessionId: string }).sessionId;
      await root.send("Network.enable", {}, session);
      await root.send("Network.emulateNetworkConditions", SLOW_3G, session);
    }
    await page.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
    console.log(`conditions: Slow 3G (400 ms, 400 kb/s) on the page${worker ? " and its service worker" : " (no service worker found)"}, CPU ×${CPU_RATE}\n`);

    const rows = await runNavSoak(page, script.beats, origins);
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    // The manager's invariant, in a production build, logs instead of throwing: any such line is a failure too.
    const refused = errors.filter((e) => e.includes("two clips at once refused"));
    const failed = rows.filter((r) => !r.ok);
    const overlaps = rows.filter((r) => r.max > 1);
    console.log(`\nthe 40 sequences (real concurrency from the browser's own audio API):\n${soakTable(rows)}`);
    console.log(`\nmax real concurrency across all sequences: ${Math.max(0, ...rows.map((r) => r.max))} · sequences with two clips at once: ${overlaps.length}/40 · sound while paused: ${rows.filter((r) => r.whilePaused.length).length}/40 · failed: ${failed.length}/40`);
    if (errors.length) console.log(`\npage errors (${errors.length}):\n${[...new Set(errors)].slice(0, 12).map((e) => `  ${e}`).join("\n")}`);
    if (refused.length) console.log(`\nthe audio manager refused two clips at once ${refused.length} time(s):\n${refused.slice(0, 5).map((e) => `  ${e}`).join("\n")}`);
    exitCode = failed.length === 0 && refused.length === 0 ? 0 : 1;
  } finally {
    // The child and its rows go again.
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => undefined);
    await page.send("Page.navigate", { url: `${BASE}/` }).catch(() => undefined);
    await wait(1500);
    let removed = "NOT removed";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await evaluate<{ ok: boolean }>(page, `fetch("/api/parent/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json()).catch(() => ({ ok: false }))`).catch(() => ({ ok: false }));
      if (result.ok) {
        removed = "removed";
        break;
      }
      await wait(1500);
    }
    console.log(`\nthe soak's child ${onboarded.child_id}: ${removed}`);
    browser.kill();
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(`audio:check FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
