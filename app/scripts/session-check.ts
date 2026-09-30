/**
 * A REAL session, unattended, on a phone: headless Chromium under mobile
 * emulation opens the lesson, passes the device gate, and lets session 1
 * run — answering every question the way a child would on the board
 * (tapping the tiles, the cell, the pad; a tap on a soft check), and
 * photographing every beat to
 *
 *   .board-check/session-1/<seq>-<beatId>.png
 *
 * so the storyboard can be reviewed against what actually rendered.
 *
 *   npm run session:check -- [baseUrl] [--max-minutes=25]
 *
 * Needs the dev server up with ACCESS_CODE set (.env.local), and the
 * same code in this process's env — and started with DEV_CHILD_ID UNSET,
 * or the walk has no fresh device to onboard (see the splash check below):
 *
 *   DEV_CHILD_ID= DEV_ONBOARDING=stub npm run dev
 *
 * At the end it prints:
 *   - beats whose choreography events fired OUTSIDE their clip (from the
 *     runtime's own trace, window.__choreoLog),
 *   - storyboard events with no matching primitive,
 *   - beats whose clip had no stored sentence spans (estimated timing),
 *   - the answers it gave and what the lesson made of them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { connect, evaluate, launch, openPage, wait } from "./lib/cdp";
import { sinhalaNumberName } from "../src/lib/sinhalaNumber";
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { ONBOARD_VIA_API_JS } from "./lib/onboard";
import { analyseTruth, AUDIO_TRUTH_JS, COLLECT_TRUTH_JS, type TruthLog, type TruthSummary } from "./lib/audioTruth";
import { clipKey } from "../src/lib/audioCache";
import { AUTHORED_LINES } from "../src/lib/authoredLines";
import { ariaSel, copy, copyPattern } from "./lib/copyText";

/** Sinhala number name → digits, for the questions that ask for a name. */
const NAME_TO_NUMBER = new Map<string, number>();
for (let n = 0; n <= 10_000; n += 1) NAME_TO_NUMBER.set(sinhalaNumberName(n).replace(/\s/gu, ""), n);
for (let n = 10_000; n <= 100_000; n += 100) NAME_TO_NUMBER.set(sinhalaNumberName(n).replace(/\s/gu, ""), n);

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const arg = (name: string): string | null => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const MAX_MINUTES = Number(arg("max-minutes") ?? 25);
/** The phone, held sideways: 892×412 (Pixel 8) by default; 800×360, 844×390, 915×412 are the sizes we ship for. */
const [VIEW_W, VIEW_H] = (arg("viewport") ?? "892x412").split("x").map(Number) as [number, number];
const SCHEME = (arg("scheme") ?? "light") as "light" | "dark";
const CPU_THROTTLE = Number(arg("cpu") ?? 1);
const NETWORK = arg("net"); // "3g" emulates a regular 3G link for the first-paint measure
const REDUCED_MOTION = process.argv.includes("--reduced-motion");
/** --no-wobble: an experiment — the marker-wobble SVG filter off, to see what it costs in frames. */
const NO_WOBBLE = process.argv.includes("--no-wobble");
/**
 * --drills: exercise the four failure modes on the way through (a tap
 * while she talks, a rotation mid-beat, a backgrounded tab, a clip that
 * cannot be fetched) and report what the child would have seen.
 */
const DRILLS = process.argv.includes("--drills");
/** Only onboarding step 1's two states (no lesson): the dev notice, then the mocked gateway's send → code → one resend. */
const OTP_ONLY = process.argv.includes("--otp-only");
/** --wrong=readWrite4Digit:8 — answer that question wrongly every time it is asked, to walk the retry ladder. */
const WRONG_BEAT = arg("wrong") ? `authored:${arg("wrong")!.replace(/^authored:/u, "")}` : null;
/** What the ✋ transcription channel might deliver for a Sinhala child (23 Sep 2026: wrong script, another language, fragments) — injected, never shown. */
const INJECTED_TRANSCRIPT = "こんにちは 123 hello";
/** What Zara says when the day's ✋ chat time is spent (src/lib/appCopy.ts chat.outOfTime — the owner's own words). */
const OUT_OF_TIME = copy("chat.outOfTime");
/**
 * The chat drill's Live socket: a WebSocket to the Live API that only answers `setup` with `setupComplete` — the chat
 * is "connected" and nothing is ever sent to Google. Any other URL gets the real WebSocket.
 * `window.__fakeLive.say(ms, text)` makes "Zara" say a sentence on the open socket, as the Live API delivers one: her
 * words, then her audio in 200 ms chunks at speaking pace (a quiet tone), then turnComplete. Each turn is logged in
 * `__fakeLive.turns` (page clock) — the time-warning drills make her talk across the moments a warning and the close
 * fall due.
 */
const FAKE_LIVE_SOCKET_JS = `(() => {
  if (window.__fakeLive) return true;
  const Real = window.WebSocket;
  class FakeLive {
    constructor(url, protocols) {
      if (!String(url).includes('generativelanguage')) return new Real(url, protocols);
      this.url = String(url);
      this.readyState = 0;
      window.__fakeLive.sockets.push(this);
      setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen({ type: 'open' }); }, 30);
    }
    send(data) {
      let message = null;
      try { message = JSON.parse(String(data)); } catch (e) {}
      if (message && message.setup) setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }); }, 30);
    }
    close(code, reason) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      setTimeout(() => { if (this.onclose) this.onclose({ code: code || 1000, reason: reason || '', wasClean: true }); }, 0);
    }
    addEventListener() {}
    removeEventListener() {}
  }
  FakeLive.CONNECTING = 0; FakeLive.OPEN = 1; FakeLive.CLOSING = 2; FakeLive.CLOSED = 3;
  const RATE = 24000, CHUNK_MS = 200;
  const chunkPcm = (() => {
    const pcm = new Int16Array((RATE * CHUNK_MS) / 1000);
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = Math.round(Math.sin((2 * Math.PI * 180 * i) / RATE) * 0.15 * 0x7fff);
    const bytes = new Uint8Array(pcm.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  })();
  const say = (ms, text) => {
    const socket = window.__fakeLive.sockets.filter((s) => s.readyState === 1).pop();
    if (!socket) return false;
    const turn = { startedAt: performance.now(), ms, chunks: 0, completeAt: null };
    window.__fakeLive.turns.push(turn);
    const send = (message) => { if (socket.readyState === 1 && socket.onmessage) socket.onmessage({ data: JSON.stringify(message) }); };
    send({ serverContent: { outputTranscription: { text: text || 'හරි.' } } });
    const total = Math.ceil(ms / CHUNK_MS);
    const tick = () => {
      if (socket.readyState !== 1) return;
      if (turn.chunks >= total) { turn.completeAt = performance.now(); send({ serverContent: { turnComplete: true } }); return; }
      send({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: chunkPcm } }] } } });
      turn.chunks += 1;
      setTimeout(tick, CHUNK_MS);
    };
    tick();
    return true;
  };
  window.__fakeLive = { Real, sockets: [], turns: [], say };
  window.WebSocket = FakeLive;
  return true;
})()`;
/** A WAV of `ms` of quiet tone at the clips' own rate: the stand-in the drills serve for a line nobody has recorded yet. */
function toneWav(ms: number): string {
  const rate = 24000;
  const n = Math.round((rate * ms) / 1000);
  const wav = Buffer.alloc(44 + n * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + n * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.2 * 0x7fff), 44 + i * 2);
  return wav.toString("base64");
}
/** --from=<beat>: a partial run for one stretch of the lesson (DEV_MODE's jump) — the completion and mastery checks do not apply to it. */
const FROM_BEAT = arg("from") ? `authored:${arg("from")!.replace(/^authored:/u, "")}` : null;
const RUN_TAG = arg("tag") ?? `${VIEW_W}x${VIEW_H}-${SCHEME}${REDUCED_MOTION ? "-reduced" : ""}`;
const OUT_DIR = path.join(process.cwd(), ".board-check", "session-1", RUN_TAG);
const ACCESS_CODE = process.env.ACCESS_CODE ?? process.env.VERIFY_ACCESS_CODE ?? "";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

interface AuthoredBeat {
  id: string;
  type: string;
  expectedAnswer?: string;
  answerChoices?: string[];
  answerMode?: string;
  choices?: { options: string[]; correctIndex: number };
}

interface ChoreoLogEntry {
  beatId: string;
  sentenceIndex: number;
  event: string;
  firedAtMs: number;
  spanStartMs: number;
  spanEndMs: number;
  clipMs: number;
  estimated: boolean;
  outside: boolean;
  known: boolean;
}

interface Snapshot {
  beatId: string;
  beatType: string;
  status: string;
  yourTurn: string | null;
  /** "mic" during reading practice, "soft" during a soft check's pause. */
  pause: string | null;
  character: string | null;
  stage: string | null;
  choreo: { beatId: string; fired: number; sentences: number } | null;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  // Expected answers and name choices live on the BUILT script the app
  // serves (the authored file carries only the words); fetched from inside
  // the page once the session cookie exists.
  const expectedById = new Map<string, AuthoredBeat>();

  const { browser, wsUrl } = await launch("session-check");
  const root = await connect(wsUrl, "session-check");
  const page = await openPage(root);
  const consoleLines: string[] = [];
  page.on("Runtime.consoleAPICalled", (params) => {
    const args = (params.args as Array<{ value?: unknown; description?: string }>) ?? [];
    const text = args.map((a) => String(a.value ?? a.description ?? "")).join(" ");
    if (/\[beat\]|\[useLessonRuntime\]|Error|error|failed/.test(text)) consoleLines.push(`${params.type}: ${text.slice(0, 200)}`);
  });
  page.on("Runtime.exceptionThrown", (params) => {
    const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
    consoleLines.push(`exception: ${details?.exception?.description ?? details?.text ?? "?"}`.slice(0, 200));
  });
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("Network.enable");
  const apiCalls = new Map<string, number>();
  page.on("Network.requestWillBeSent", (params) => {
    const url = String((params.request as { url?: string })?.url ?? "");
    const m = url.match(/\/api\/([a-z-]+)/u);
    if (m) apiCalls.set(m[1]!, (apiCalls.get(m[1]!) ?? 0) + 1);
  });
  // The microphone: counted from the page's first script, so a session-start request could not hide.
  // What really sounds, from the browser's own audio API (scripts/lib/audioTruth.ts) — never the app's own counter.
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: AUDIO_TRUTH_JS });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { window.__gumCalls = 0; const md = navigator.mediaDevices; if (!md) return; const original = md.getUserMedia.bind(md); md.getUserMedia = (c) => { window.__gumCalls += 1; return original(c); }; })();` });
  await page.send("Emulation.setUserAgentOverride", { userAgent: MOBILE_UA, platform: "Android" });
  await page.send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const mediaFeatures = [{ name: "prefers-color-scheme", value: SCHEME }, ...(REDUCED_MOTION ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [])];
  await page.send("Emulation.setEmulatedMedia", { features: mediaFeatures });
  if (CPU_THROTTLE > 1) await page.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
  if (NETWORK === "3g") {
    await page.send("Network.enable");
    // "Regular 3G": 750 kb/s down, 250 kb/s up, 100 ms latency.
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 100, downloadThroughput: (750 * 1024) / 8, uploadThroughput: (250 * 1024) / 8 });
  }
  if (NO_WOBBLE) await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '.wb-surface .hand-stroke, .wb-surface .chalk-stroke { filter: none !important; }'; document.head.appendChild(style); });` });
  const navigatedAt = Date.now();
  await page.send("Page.navigate", { url: `${BASE}/session` });
  await wait(3000);

  const tap = async (x: number, y: number) => {
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await wait(50);
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const centre = async (selector: string): Promise<{ x: number; y: number } | null> =>
    evaluate(page, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  const tapSelector = async (selector: string): Promise<boolean> => {
    const point = await centre(selector);
    if (!point) return false;
    await tap(point.x, point.y);
    return true;
  };
  /** The page's clock (performance.now): drills mark it, then ask what really sounded since. */
  const pageNow = () => evaluate<number>(page, "performance.now()");
  /**
   * What REALLY sounded between `from` and now (or `to`): the browser's own audio API, patched before the app's first
   * script (scripts/lib/audioTruth.ts). The drills used to read the player's own counter, which said 1 while a real phone
   * played two clips at once.
   */
  const heard = async (from: number, to?: number): Promise<TruthSummary> => {
    const end = to ?? (await pageNow());
    const truthLog = await evaluate<TruthLog | null>(page, COLLECT_TRUTH_JS(from)).catch(() => null);
    return analyseTruth(truthLog ?? { now: end, contexts: [], sources: [], media: [] }, from, end);
  };
  const heardText = (t: TruthSummary) =>
    `${t.sounding.length} clip(s) sounded${t.sounding.length ? ` (${t.sounding.map((c) => (c.label ?? c.stream).replace(/^authored:/u, "")).join(", ")})` : ""}, most at once ${t.maxConcurrent}${t.overlaps.length ? ` — OVERLAP ${t.overlaps.map((o) => `${o.a} + ${o.b} ${o.ms} ms`).join("; ")}` : ""}`;
  /**
   * A press that is not a finger: the button's own click. The word bank's ✓
   * (and the pad's) sits at the end of a run of rapid taps, and a synthetic
   * touch there is sometimes swallowed — the tiles land, the commit does not,
   * and the walk waits forever on a turn that never closes. Touch is proved
   * by the tiles and the chips; the commit only has to happen.
   */
  const clickSelector = async (selector: string): Promise<boolean> =>
    (await evaluate<boolean>(page, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`).catch(() => false)) ?? false;
  const snapshot = (): Promise<Snapshot> =>
    evaluate(
      page,
      `(() => { const el = document.querySelector('.lesson-screen'); const d = el ? el.dataset : {}; return { beatId: d.beatId ?? '—', beatType: d.beatType ?? '—', status: d.status ?? '—', yourTurn: d.yourTurn ?? null, pause: d.pause ?? null, character: d.character ?? null, stage: window.__stage ?? null, choreo: window.__choreo ?? null }; })()`,
    );

  // ---- Cluster A: this browser is a fresh device — the app must take it through onboarding ----
  // (docs/qa/session1-triage.md: splash → no child → /onboarding/1 → profile row → consent → home → session)
  const pathTrace: string[] = [];
  const clusterA: string[] = [];
  let deviceSequence = "not run";
  let resumeTrace = "not run";
  let replayTrace = "not run";
  let restartControlTrace = "not run";
  /** The first beat the child's newest sitting logged — the log is the ground truth for "it started again at beat 0" (a page poll can miss a short first beat). */
  const firstBeatOfNewestSitting = async (childId: string, exclude: string[]): Promise<string | null> => {
    for (let i = 0; i < 40; i += 1) {
      const { data } = await supabaseAdmin.from("session_log").select("session_id, beat_id, created_at").eq("child_id", childId).order("created_at", { ascending: true }).limit(500);
      const rows = (data ?? []) as Array<{ session_id: string; beat_id: string }>;
      // Only real beats: the runtime also logs a "session-metrics" bookkeeping row.
      const fresh = rows.find((r) => !exclude.includes(r.session_id) && r.beat_id.startsWith("authored:"));
      if (fresh) return fresh.beat_id;
      await wait(500);
    }
    return null;
  };
  const checkA = (name: string, ok: boolean, detail: string) => {
    clusterA.push(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  };
  const setInput = (selector: string, value: string) => evaluate<boolean>(page, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  /** The home screen's continue card, read from the RENDERED, fresh client screen (the server HTML is a skeleton with fixture numbers). */
  const homeSession = async (): Promise<{ lesson: number; session: number } | null> => {
    // Always a full load: the in-memory store of the page under test may still hold the previous child (the API switch bypasses the app's own clear()).
    await page.send("Page.navigate", { url: `${BASE}/home` });
    await waitFor(`!!document.querySelector('[data-screen-ready="home"][data-store-status="fresh"]')`, 10000);
    return evaluate<{ lesson: number; session: number } | null>(page, `(() => { const m = new RegExp(${JSON.stringify(copyPattern("home.continueKicker"))}, "u").exec(document.body.innerText); return m ? { lesson: Number(m[1]), session: Number(m[2]) } : null; })()`).catch(() => null);
  };
  const waitFor = async (js: string, ms = 10000): Promise<boolean> => {
    for (let i = 0; i < ms / 200; i += 1) {
      if (await evaluate<boolean>(page, js).catch(() => false)) return true;
      await wait(200);
    }
    return false;
  };
  // The portrait screens are tapped in a portrait viewport (a phone onboards upright, then turns for the lesson); an element is scrolled into view before the tap.
  const tapInView = async (selector: string): Promise<boolean> => {
    const ok = await evaluate<boolean>(page, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({ block: "center", inline: "center" }); return true; })()`).catch(() => false);
    if (!ok) return false;
    await wait(250);
    return tapSelector(selector);
  };
  const where = () => evaluate<{ url: string; screen: string }>(page, `(() => { const app = document.querySelector('[data-app-screen]'); return { url: location.pathname, screen: app ? app.getAttribute('data-app-screen') : document.querySelector('.lesson-screen') ? 'Session' : document.querySelector('[data-testid="access-gate"]') ? 'device gate' : '' }; })()`);
  const step = async (label: string) => {
    const w = await where();
    pathTrace.push(`${w.url.padEnd(16)} ${(w.screen || "?").padEnd(30)} ${label}`);
    return w;
  };
  const gateIfShown = async (): Promise<boolean> => {
    if (!(await waitFor(`!!document.querySelector('[data-testid="access-gate"] input[type="password"]')`, 3000))) return false;
    if (!ACCESS_CODE) throw new Error("the device gate is up and ACCESS_CODE is not set");
    await setInput('[data-testid="access-gate"] input[type="password"]', ACCESS_CODE);
    await evaluate(page, `(() => { document.querySelector('[data-testid="access-gate"] form').requestSubmit(); return true; })()`);
    await waitFor(`!document.querySelector('[data-testid="access-gate"]')`);
    return true;
  };
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send("Page.navigate", { url: `${BASE}/` });
  await waitFor(`!!document.querySelector('[data-testid="splash-start"], [data-testid="child-chooser"]')`);
  const splash = await step("splash (fresh device: no ss_child cookie)");
  /**
   * A FRESH BROWSER IS NOT ALWAYS A FRESH DEVICE.
   *
   * With DEV_CHILD_ID set and DEV_MODE=on, a development server hands every
   * browser the dev child before it has onboarded (src/lib/activeChild.ts),
   * so the splash goes straight to /home and there is no onboarding to walk.
   * Everything after this point then measures a child that was never made:
   * the run wanders through screens that are not up and eventually parks on
   * a wait that cannot come. Said here, once, rather than found again.
   */
  if (splash.screen !== "Splash") {
    throw new Error(
      `the splash did not open on a fresh device (it showed "${splash.screen || "?"}" at ${splash.url}). ` +
        `Start the server for this check with DEV_CHILD_ID unset — with it set, DEV_MODE gives every ` +
        `browser the dev child and onboarding is unreachable: DEV_CHILD_ID= DEV_ONBOARDING=stub npm run dev`,
    );
  }
  await tapInView('[data-testid="splash-start"]');
  // The device gate may cover the step the moment it mounts (a fresh device has no device cookie): the route is the assertion, the gate is handled next.
  const toOnboarding = await waitFor(`location.pathname === '/onboarding/1'`);
  checkA("fresh device → onboarding", splash.screen === "Splash" && toOnboarding, `splash "${copy("common.start")}" → ${(await where()).url}`);
  const gated1 = await gateIfShown();
  await waitFor(`!!document.querySelector('[data-testid="onb-next"]') && !!document.querySelector('[data-testid="onb-hydrated"]')`);
  await step(`onboarding 1 · phone + OTP${gated1 ? " (device gate: access code entered)" : ""}`);
  const screenText = () => evaluate<string>(page, `(() => { const el = document.querySelector('[data-app-screen]'); return el ? el.innerText.replace(/\\n{2,}/g, "\\n").trim() : ""; })()`).catch(() => "");
  const step1Texts: Array<{ state: string; text: string }> = [];
  step1Texts.push({ state: "no SMS provider (dev notice)", text: await screenText() });
  const devNotice = await evaluate<string>(page, `(document.querySelector('[data-testid="sms-dev-notice"]')?.textContent ?? '').trim()`).catch(() => "");
  const noCountdown = !(await evaluate<boolean>(page, `!!document.querySelector('[data-testid="otp-countdown"], [data-testid="otp-send"], [data-testid="otp-resend"]')`).catch(() => true));
  await setInput('[data-testid="onb-phone"]', "77 000 0002");
  for (const [i, d] of ["7", "3", "1", "9"].entries()) await setInput(`input[aria-label="otp ${i + 1}"]`, d);
  await wait(200);
  await tapInView('[data-testid="onb-next"]');
  const toProfile = await waitFor(`location.pathname === '/onboarding/2'`);
  checkA("step 1 with no SMS provider: dev notice shown, no countdown, any 4-digit code accepted", devNotice.includes(copy("onb.1.devNotice")) && devNotice.includes("dev: any 4-digit code works") && noCountdown && toProfile, `notice "${devNotice.slice(0, 70)}" · countdown/send/resend controls absent ${noCountdown} · code 7319 → ${toProfile ? "/onboarding/2" : "stuck"}`);
  // Step 1 with a (mocked) gateway: an explicit send, the code, one resend after 30 s that never loops.
  const mockOtpDrill = async () => {
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await page.send("Page.navigate", { url: `${BASE}/home` });
    await wait(1500);
    const mockOn = await evaluate<{ ok: boolean }>(page, `fetch("/api/onboarding/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mock", on: true }) }).then((r) => r.json())`).catch(() => ({ ok: false }));
    await page.send("Page.navigate", { url: `${BASE}/onboarding/1` });
    // Typing into a React-controlled field before hydration leaves its state empty: wait for the client to own the screen.
    await waitFor(`!!document.querySelector('[data-testid="phone-step"][data-sms-mode="provider"]') && !!document.querySelector('[data-testid="onb-hydrated"]')`);
    const before = await screenText();
    // A phone of this run's own: the mock gateway's in-memory send count starts at 1 whatever ran before on this server.
    const mockPhone = `77${String(Date.now()).slice(-7)}`;
    await setInput('[data-testid="onb-phone"]', mockPhone);
    await wait(200);
    const codeBeforeSend = await evaluate<boolean>(page, `!!document.querySelector('[data-testid="onb-otp"]')`);
    const sendState = await evaluate<{ disabled: boolean; phone: string }>(page, `(() => { const b = document.querySelector('[data-testid="otp-send"]'); const p = document.querySelector('[data-testid="onb-phone"]'); return { disabled: b ? b.disabled : true, phone: p ? p.value : "" }; })()`);
    await tapInView('[data-testid="otp-send"]');
    const sentOk = await waitFor(`!!document.querySelector('[data-testid="onb-otp"]') && !!document.querySelector('[data-testid="otp-countdown"]')`, 8000);
    const sendError = await evaluate<string>(page, `(document.querySelector('[data-testid="onb-error"]')?.textContent ?? '')`);
    const afterSend = await screenText();
    const peek1 = await evaluate<{ code: string | null; sends: number }>(page, `fetch("/api/onboarding/otp?peek=" + ${JSON.stringify(mockPhone)}).then((r) => r.json())`);
    const countdownA = await evaluate<string>(page, `(document.querySelector('[data-testid="otp-countdown"]')?.textContent ?? '')`);
    await wait(2200);
    const countdownB = await evaluate<string>(page, `(document.querySelector('[data-testid="otp-countdown"]')?.textContent ?? '')`);
    const resendShown = await waitFor(`!!document.querySelector('[data-testid="otp-resend"]') && !document.querySelector('[data-testid="otp-countdown"]')`, 36000);
    const shownAt = Math.round((Date.now()) / 1000);
    await tapInView('[data-testid="otp-resend"]');
    await wait(800);
    const peek2 = await evaluate<{ code: string | null; sends: number }>(page, `fetch("/api/onboarding/otp?peek=" + ${JSON.stringify(mockPhone)}).then((r) => r.json())`);
    const afterResend = await screenText();
    const resendGone = await evaluate<boolean>(page, `!document.querySelector('[data-testid="otp-resend"]') && !document.querySelector('[data-testid="otp-countdown"]')`);
    await wait(2500);
    const stillGone = await evaluate<boolean>(page, `!document.querySelector('[data-testid="otp-resend"]') && !document.querySelector('[data-testid="otp-countdown"]')`);
    for (const [i, d] of [...(peek2.code ?? "0000")].entries()) await setInput(`input[aria-label="otp ${i + 1}"]`, d);
    await wait(200);
    await tapInView('[data-testid="onb-next"]');
    const verified = await waitFor(`location.pathname === '/onboarding/2'`, 8000);
    await evaluate(page, `fetch("/api/onboarding/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mock", on: false }) }).then((r) => r.json())`).catch(() => undefined);
    const secs = (t: string) => Number(/0:(\d\d)/u.exec(t)?.[1] ?? -1);
    checkA("step 1 with a mocked SMS gateway: send → code → one resend after 30 s, no loop", mockOn.ok && !codeBeforeSend && sentOk && peek1.sends === 1 && secs(countdownA) > secs(countdownB) && resendShown && peek2.sends === 2 && peek2.code !== peek1.code && resendGone && stillGone && verified, `mock on ${mockOn.ok} · send button ${sendState.disabled ? "DISABLED" : "enabled"} with phone "+94 ${sendState.phone}"${sendError ? ` · error "${sendError}"` : ""} · code field before send ${codeBeforeSend} · after send: boxes + countdown ${sentOk} (${countdownA.trim()} → ${countdownB.trim()}) · sends ${peek1.sends} · resend offered after the countdown ${resendShown} · tapped → sends ${peek2.sends}, new code ${peek2.code !== peek1.code} · resend gone and stays gone ${resendGone && stillGone} · code verified → step 2 ${verified}`);
    step1Texts.push({ state: "mocked provider · before send", text: before });
    step1Texts.push({ state: "mocked provider · after send (countdown once)", text: afterSend });
    step1Texts.push({ state: "mocked provider · after the one resend", text: afterResend });
    void shownAt;
    await page.send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2, mobile: true });
  };
  await step("onboarding 2 · child profile");
  if (OTP_ONLY) {
    await mockOtpDrill();
    console.log(`fresh device → onboarding (step 1 only):\n${pathTrace.map((l) => `  ${l}`).join("\n")}`);
    console.log(`\nstep 1 assertions (${clusterA.filter((r) => r.startsWith("PASS")).length}/${clusterA.length}):`);
    for (const line of clusterA) console.log(`  ${line}`);
  console.log(`\nstep 1 screen text, both states:`);
    for (const entry of step1Texts) console.log(`  [${entry.state}]\n${entry.text.split("\n").map((l) => `    ${l}`).join("\n")}`);
    const { data: made } = await supabaseAdmin.from("children").select("id").eq("parent_contact", "+94770000002");
    for (const row of made ?? []) {
      // debug_reports too: the ✋ drill files one, and its foreign key otherwise keeps the child alive after a run.
      for (const table of ["session_log", "child_progress", "child_weaknesses", "child_profile", "debug_reports"] as const) await supabaseAdmin.from(table).delete().eq("child_id", row.id);
      await supabaseAdmin.from("children").delete().eq("id", row.id);
    }
    browser.kill();
    process.exit(clusterA.every((r) => r.startsWith("PASS")) ? 0 : 1);
  }
  await setInput('[data-testid="onb-name"]', "හසිනි");
  await tapInView('[data-avatar="squirrel"]');
  await tapInView('[data-grade="5"]');
  await wait(200);
  await tapInView('[data-testid="onb-next"]');
  const toConsent = await waitFor(`location.pathname === '/onboarding/3'`);
  await step(`onboarding 3 · consent${toConsent ? "" : " (NOT REACHED)"}`);
  await tapInView('[data-testid="onb-next"]');
  await waitFor(`location.pathname === '/onboarding/4'`);
  await step(`onboarding 4 · subscription (stub) — skipped with ${copy("onb.4.skip")}`);
  await tapInView('a[href="/home"]');
  const toHome = await waitFor(`location.pathname === '/home' && !!document.querySelector('[data-testid="start-lesson"]')`);
  const homeSession0 = toHome ? await homeSession() : null;
  await step(`home · continue card offers ${homeSession0 ? `session ${homeSession0.session}` : "?"}`);
  checkA("onboarding writes the child and lands home at session 1", toHome && homeSession0?.session === 1, `home continue card: ${JSON.stringify(homeSession0)}`);
  await tapInView('[data-testid="start-lesson"]');
  await waitFor(`location.pathname === '/session'`);
  await step(`session ("${copy("common.start")}" on the continue card)`);
  await page.send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2, mobile: true });
  // The child this run created — the DB is the ground truth for the assertions below.
  const { data: createdRows } = await supabaseAdmin.from("children").select("id, display_name").eq("parent_contact", "+94770000002").order("created_at", { ascending: false }).limit(1);
  const childA = createdRows?.[0]?.id ?? null;
  // ---- Cluster A items 2/3 (docs/qa/session1-triage.md): the exact device
  // sequence — play a few beats, tap ⏹, land on the lesson detail with BOTH
  // ඉතුරු ටික කරමු and මුල ඉඳන් ආයෙත්, then resume to the beat left behind.
  {
    const beatNow = () => evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`).catch(() => "—");
    const seen: string[] = [];
    for (let i = 0; i < 260 && seen.length < 3; i += 1) {
      await wait(500);
      const id = await beatNow();
      if (id !== "—" && id !== seen[seen.length - 1]) seen.push(id);
    }
    const leftAt = await beatNow();
    await tapSelector(ariaSel("edge.paused.stop"));
    const asked = await waitFor(`!!document.querySelector('[data-testid="confirm-sheet"][data-confirm="leave"]')`, 6000);
    const askText = await evaluate<string>(page, `(document.querySelector('[data-testid="confirm-sheet"]')?.innerText ?? '').replace(/\\n+/g, " ").trim()`).catch(() => "");
    await tapSelector('[data-testid="confirm-yes"]');
    const onDetail = await waitFor(`location.pathname === '/lessons/1' && !!document.querySelector('[data-app-screen="Lesson detail"]')`, 12000);
    // The lesson detail is a portrait screen: the phone comes back upright when the child leaves the lesson.
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await wait(600);
    const detail = await evaluate<{ resume: { w: number; h: number } | null; restart: { w: number; h: number } | null; started: boolean; current: string | null }>(
      page,
      `(() => { const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }; const row = document.querySelector('[data-kind="current"]'); return { resume: box('[data-testid="resume-session"]'), restart: box('[data-testid="restart-session"]'), started: !!(row && row.hasAttribute('data-started')), current: row ? row.textContent.replace(/\\s+/g, " ").trim().slice(0, 40) : null }; })()`,
    );
    const tappable = (b: { w: number; h: number } | null) => Boolean(b && b.w >= 56 && b.h >= 48);
    deviceSequence = `⏹ at ${leftAt.replace(/^authored:/u, "")} after ${seen.length} beats → ${onDetail ? "/lessons/1" : "NOT the lesson detail"} · resume ${detail.resume ? `${detail.resume.w}×${detail.resume.h}` : "MISSING"} · restart ${detail.restart ? `${detail.restart.w}×${detail.restart.h}` : "MISSING"} · current row "${detail.current ?? "?"}" in progress ${detail.started}`;
    checkA("⏹ mid-session lands on the lesson detail with resume and restart, session in progress", asked && onDetail && tappable(detail.resume) && tappable(detail.restart) && detail.started, `asked once ("${askText.slice(0, 44)}") · ${deviceSequence}`);
    const closes = childA ? ((await supabaseAdmin.from("session_log").select("beat_id").eq("child_id", childA).eq("beat_type", "CLOSE_SESSION")).data ?? []).length : -1;
    checkA("⏹ logs no CLOSE_SESSION row (leaving is not finishing)", closes === 0, `CLOSE_SESSION rows for this child: ${closes} (expected 0)`);
    await tapInView('[data-testid="resume-session"]');
    await waitFor(`location.pathname === '/session'`, 10000);
    await page.send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2, mobile: true });
    let resumedAt = "—";
    for (let i = 0; i < 180; i += 1) {
      await wait(500);
      resumedAt = await beatNow();
      if (resumedAt !== "—") break;
    }
    resumeTrace = `left at ${leftAt.replace(/^authored:/u, "")} → resumed at ${resumedAt.replace(/^authored:/u, "")}`;
    checkA("resume comes back to the beat the child left", leftAt !== "—" && resumedAt === leftAt, resumeTrace);
  }

  console.log(`fresh device → onboarding → home → session:\n${pathTrace.map((l) => `  ${l}`).join("\n")}\nchild created: ${childA ?? "NOT FOUND"} (${createdRows?.[0]?.display_name ?? "?"})`);

  // A real child's first tap — the gesture-resume path.
  await tap(446, 206);
  // The page may still be arriving (a server just started): wait up to 12 s for the gate or the lesson.
  let gated = false;
  for (let i = 0; i < 48; i += 1) {
    await wait(250);
    const seen = await evaluate<string>(page, `document.querySelector('input[type="password"]') ? 'gate' : document.querySelector('.lesson-screen') ? 'lesson' : ''`).catch(() => "");
    if (seen === "gate") {
      gated = true;
      break;
    }
    if (seen === "lesson" && i >= 6) break;
  }
  // The device gate, the way a parent would enter it.
  if (gated) {
    if (!ACCESS_CODE) throw new Error("the device gate is up and ACCESS_CODE is not set");
    await evaluate(
      page,
      `(() => { const input = document.querySelector('input[type="password"]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(input, ${JSON.stringify(ACCESS_CODE)}); input.dispatchEvent(new Event("input", { bubbles: true })); input.form.requestSubmit(); return true; })()`,
    );
    console.log("device gate: code entered");
    await wait(3000);
  }
  const script = await evaluate<{ beats?: AuthoredBeat[] } | null>(
    page,
    `fetch("/api/lesson-script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "maths", grade: 5, lesson: 1 }) }).then((r) => r.json()).then((j) => j.script ?? null).catch(() => null)`,
  );
  for (const beat of script?.beats ?? []) expectedById.set(beat.id, beat);
  console.log(`lesson script: ${expectedById.size} beats (${[...expectedById.values()].filter((b) => b.expectedAnswer).length} with an expected answer)`);

  /** In-page: what the layout looks like right now — the flags the harness reports per beat. */
  const AUDIT_JS = `(() => {
    const board = document.querySelector('[data-testid="lesson-board"]');
    if (!board) return null;
    const surface = board.querySelector('.wb-surface').getBoundingClientRect();
    const content = board.querySelector('.wb-content');
    const corner = board.querySelector('[data-testid="board-corner"]');
    const cr = corner ? corner.getBoundingClientRect() : null;
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const kids = [...content.children].filter(visible).filter((el) => getComputedStyle(el).position !== "absolute");
    const rects = kids.map((el) => el.getBoundingClientRect());
    const intersects = (a, b) => a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2;
    let overlap = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (intersects(rects[i], rects[j])) overlap++;
    const portraitOverlap = cr ? rects.filter((r) => intersects(r, cr)).length : 0;
    const cutOff = [...content.querySelectorAll('*')].filter(visible).filter((el) => { const r = el.getBoundingClientRect(); return r.left < surface.left - 2 || r.right > surface.right + 2 || r.top < surface.top - 2 || r.bottom > surface.bottom + 2; }).length;
    // the hit area may reach beyond the drawn box (a table cell's 30 px row, the tray's ♪ chip): measure what a finger meets
    const reach = (el, r) => { const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const hits = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); }; let top = r.top, bottom = r.bottom, left = r.left, right = r.right; for (let y = r.top - 2; y > r.top - 30 && hits(cx, y); y -= 2) top = y; for (let y = r.bottom + 2; y < r.bottom + 30 && hits(cx, y); y += 2) bottom = y; for (let x = r.left - 2; x > r.left - 30 && hits(x, cy); x -= 2) left = x; for (let x = r.right + 2; x < r.right + 30 && hits(x, cy); x += 2) right = x; return { w: right - left, h: bottom - top }; };
    const small = [...board.querySelectorAll('[role="button"], button')].filter(visible).filter((el) => { const r = el.getBoundingClientRect(); if (r.width >= 47.5 && r.height >= 47.5) return false; const e = reach(el, r); return e.w < 47.5 || e.h < 47.5; }).map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
    const tinyText = [];
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const node = walker.currentNode; if (!node.textContent.trim()) continue; const el = node.parentElement; if (!el || !visible(el) || el.closest('[aria-hidden="true"]')) continue; const size = parseFloat(getComputedStyle(el).fontSize); if (size < 16) tinyText.push(node.textContent.trim().slice(0, 16) + ' ' + Math.round(size) + 'px'); }
    // The strip controls' hit areas: probed, since the reach is a pseudo-element — how far below the strip's top a touch still lands on the button.
    // Stepped 1 px and reported as the HEIGHT COVERED, not as the last point inside it: a hit area
    // of exactly 56 px has its last live pixel at +55, and a probe that returned that read 54 (it
    // stepped by two from +2) and called a correct control "UNDER 56 px" on every run.
    const strip = [...document.querySelectorAll('header button[aria-label]')].map((el) => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2; let reach = 0; for (let y = r.top + 1; y < r.top + 80; y += 1) { const hit = document.elementFromPoint(x, y); if (hit && (hit === el || el.contains(hit))) reach = Math.round(y - r.top) + 1; else if (y > r.bottom) break; } return { label: el.getAttribute('aria-label'), h: reach, w: Math.round(r.width + 8) }; });
    const runningList = document.getAnimations().filter((a) => a.playState === 'running' && board.contains(a.effect && a.effect.target));
    const runningNames = [...new Set(runningList.map((a) => { const t = a.effect && a.effect.target; const name = a.animationName || (a.effect && a.effect.getKeyframes ? 'motion:' + Object.keys((a.effect.getKeyframes()[0] || {})).filter((k) => !['offset','computedOffset','easing','composite'].includes(k)).join('/') : 'js'); return name + ' on ' + (t ? (t.tagName.toLowerCase() + (t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0] : '') + (t.dataset && t.dataset.testid ? '#' + t.dataset.testid : '')) : '?'); }))].slice(0, 8);
    return { overlap, portraitOverlap, cutOff, small: [...new Set(small)], tinyText: [...new Set(tinyText)].slice(0, 6), running: runningList.length, runningNames, strip };
  })()`;
  type Audit = { overlap: number; portraitOverlap: number; cutOff: number; small: string[]; tinyText: string[]; running: number; runningNames: string[]; strip: Array<{ label: string | null; h: number; w: number }> } | null;
  const audits: Array<{ beatId: string; audit: Audit }> = [];
  let captionReads = 0;
  const seenCaptionCount = () => captionReads;
  const fpsSamples: Array<{ beatId: string; fps: number }> = [];
  const sampleFps = async (): Promise<number> =>
    evaluate<number>(page, `new Promise((resolve) => { let frames = 0; const start = performance.now(); let done = false; const finish = () => { if (done) return; done = true; resolve(Math.round(frames / (Math.max(1, performance.now() - start) / 1000))); }; setTimeout(finish, 5000); const tick = () => { frames += 1; if (performance.now() - start < 2000) requestAnimationFrame(tick); else finish(); }; requestAnimationFrame(tick); })`);
  // The first board paint, the way a returning child meets it: the gate
  // already passed, the page opened again (on the emulated link) once the
  // run is over, timed on the page's own clock from navigation start to
  // the first primitive on the surface — the harness's own waits play no
  // part, and the run itself is not reloaded midway.
  void navigatedAt;
  // Three marks on the page clock: first contentful paint, the board's
  // surface (the frame the child sees first), and the first primitive on it
  // (which waits for the script and the first clip).
  const measureFirstPaint = async (): Promise<{ fcp: number | null; surface: number | null; primitive: number | null }> => {
    await page.send("Page.navigate", { url: `${BASE}/session` });
    const marks: { fcp: number | null; surface: number | null; primitive: number | null } = { fcp: null, surface: null, primitive: null };
    for (const deadline = Date.now() + 90_000; Date.now() < deadline && (marks.surface === null || marks.primitive === null); ) {
      await wait(20);
      // During the navigation itself the old document's context goes away — that evaluate simply fails and the poll goes on.
      const seen = await evaluate<{ surface: boolean; primitive: boolean; now: number; fcp: number | null }>(page, `(() => ({ surface: !!document.querySelector('[data-testid="lesson-board"] .wb-surface'), primitive: !!document.querySelector('[data-testid="lesson-board"] .wb-content [data-testid]'), now: Math.round(performance.now()), fcp: (performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint') || {}).startTime ?? null }))()`).catch(() => null);
      if (!seen) continue;
      if (seen.fcp !== null && marks.fcp === null) marks.fcp = Math.round(seen.fcp);
      if (seen.surface && marks.surface === null) marks.surface = seen.now;
      if (seen.primitive && marks.primitive === null) marks.primitive = seen.now;
    }
    return marks;
  };

  const shots: Array<{ seq: number; beatId: string; file: string; stage: string | null }> = [];
  const answers: Array<{ beatId: string; via: string; answer: string }> = [];
  const note = (entry: { beatId: string; via: string; answer: string }) => {
    answers.push(entry);
    console.log(`      ↳ answered ${entry.beatId.replace(/^authored:/u, "")} via ${entry.via}: ${entry.answer}`);
  };
  let lastBeat = "";
  /** Cluster G: any caption carrying a predicate's JSON ("{", "kind", "permutation"). */
  const captionLeaks: string[] = [];
  let lastTurnBeat = "";
  let turnClosed = true;
  const practiceSeen = new Set<string>();
  interface PracticeRecord {
    chipsAt: number;
    rowAtChips: boolean;
    ringAtChips: boolean;
    leakAtChips: boolean;
    cue: boolean;
    steps: boolean;
    /** Every caption seen between the tap and the feedback line — none may be a read-back ("… කියන්නම්"). */
    captionsAfterTap: string[];
    /** Tap → her feedback line starting (its clip, or its caption when there is no clip), on the page's clock. */
    spokenMs: number | null;
  }
  const practice = new Map<string, PracticeRecord>();
  /**
   * What the board shows on a read-aloud: the primitive being read (the number
   * row, the abacus, a card) and its ring, whether the expected name is
   * visible anywhere but the chips, and that nothing of the old invitation
   * survives — no 🎤 cue, no step cards (17 Sep: the invite is gone).
   */
  const practiceLook = (expectedName: string) =>
    evaluate<{ cue: boolean; steps: boolean; row: boolean; ring: boolean; leak: boolean }>(
      page,
      `(() => {
        const board = document.querySelector('[data-testid="lesson-board"]');
        const inBoard = (el) => { if (!el || !board) return false; const r = el.getBoundingClientRect(); const b = board.getBoundingClientRect(); return r.width > 0 && r.top >= b.top && r.bottom <= b.bottom; };
        const caption = (document.querySelector('[data-testid="caption"]')?.textContent ?? '');
        const chips = [...document.querySelectorAll('[data-testid="turn-choice"]')].map((el) => el.textContent || '').join(' ');
        const name = ${JSON.stringify(expectedName)}.replace(/\\s+/g, '');
        const squash = (t) => (t || '').replace(/\\s+/g, '');
        const outsideChips = squash(board ? board.textContent : '').replace(squash(chips), '');
        return {
          cue: !!document.querySelector('[data-testid="pause-cue"], .wb-pause-cue'),
          steps: !!document.querySelector('[data-testid="read-aloud-steps"]'),
          row: ['[data-testid="number-cards"]', '[data-testid="abacus"]', '[data-testid="text-card"]', '[data-testid="digit-picker"]'].some((sel) => inBoard(document.querySelector(sel))),
          ring: !!document.querySelector('[data-ringed], [data-testid="highlight-circle"]'),
          leak: name.length > 0 && (outsideChips.includes(name) || squash(caption).includes(name)),
        };
      })()`,
    );
  let retryTaps = 0;
  /**
   * A cell Zara takes in a MODE 2 alternation (the device walk, issue 2): she
   * must SAY it is her turn, with the pointer on the cell, before the cell
   * fills — and the fill carries the ✎ badge.
   */
  const tutorTurns: string[] = [];
  let puzzleLedger: { rows: number; ticked: string[] } = { rows: 0, ticked: [] };
  let puzzleChecked = false;
  let puzzleTrace = "not reached";
  let mouthSampled = false;
  let mouthTrace = "not sampled";
  const tofuHits: string[] = [];
  const tutorTurnSeen = new Set<string>();
  const TUTOR_TURN_BEATS = new Map<string, { row: number; field: string }>([
    // Zara's demonstrations (cluster J item 2): row 1 of each table; every other cell is the child's.
    ["authored:readWrite4Digit:18d", { row: 0, field: "numberName" }],
    ["authored:placeValue4Digit:102a", { row: 0, field: "digit" }],
  ]);
  const watchTutorTurn = async (beatId: string): Promise<void> => {
    const cell = TUTOR_TURN_BEATS.get(beatId);
    if (!cell || tutorTurnSeen.has(beatId)) return;
    tutorTurnSeen.add(beatId);
    const selector = `[data-testid="cell-${cell.row}-${cell.field}"]`;
    const look = () =>
      evaluate<{ caption: string; pointer: string; filled: string; pen: boolean }>(
        page,
        `(() => {
          const cell = document.querySelector(${JSON.stringify(selector)});
          const pointer = document.querySelector('[data-testid="pointer"]');
          const cellBox = cell ? cell.getBoundingClientRect() : null;
          const pointerBox = pointer ? pointer.getBoundingClientRect() : null;
          const centreY = pointerBox ? pointerBox.top + pointerBox.height / 2 : 0;
          const near = !!cellBox && !!pointerBox && centreY > cellBox.top - 12 && centreY < cellBox.bottom + 12 && pointerBox.left > cellBox.left - 220 && pointerBox.left < cellBox.right + 220;
          return {
            caption: (document.querySelector('[data-testid="caption"]')?.textContent ?? '').trim(),
            pointer: pointer ? (near ? 'on the cell' : 'elsewhere') : 'none',
            filled: cell ? (cell.getAttribute('data-filled-by') ?? '') : 'no cell',
            pen: cell ? cell.getAttribute('data-pen') === 'true' : false,
          };
        })()`,
      ).catch(() => ({ caption: "", pointer: "none", filled: "", pen: false }));
    // While she announces it the cell is still empty and the pointer rests on
    // it. The announcement is recognised by the frame itself — a caption
    // comparison would race with the beat before it.
    const ANNOUNCES = /මේක මම කරන්නම්|මම මේක කරලා පෙන්නන්නම්/u;
    let announcement = "";
    let pointerAt = "none";
    let emptyWhileAnnouncing = false;
    let last = { caption: "", pointer: "none", filled: "", pen: false };
    for (let i = 0; i < 90; i += 1) {
      const now = await look();
      last = now;
      if (ANNOUNCES.test(now.caption)) {
        if (!announcement) {
          announcement = now.caption;
          emptyWhileAnnouncing = now.filled === "";
        }
        // The pointer moves to the cell as she says it; any sighting before the fill counts.
        if (now.filled === "" && now.pointer === "on the cell") pointerAt = "on the cell";
        else if (pointerAt === "none") pointerAt = now.pointer;
      }
      if (now.filled === "tutor") {
        await shoot(beatId, "-tutor-turn");
        const line = `${beatId.replace(/^authored:/u, "")}: said "${announcement.slice(0, 46)}" · pointer ${pointerAt} · cell empty while she said it ${emptyWhileAnnouncing ? "yes" : "NO"} → filled by tutor, ✎ ${now.pen ? "yes" : "NO"}`;
        tutorTurns.push(line);
        console.log(`      ✎ tutor turn ${line}`);
        if (DRILLS) drillNote(`tutor turn ${beatId.replace(/^authored:/u, "")}: announced before the cell fills, pointer on it, ✎ on the fill`, announcement.length > 0 && pointerAt === "on the cell" && emptyWhileAnnouncing && now.pen, line);
        return;
      }
      await wait(250);
    }
    const line = `${beatId.replace(/^authored:/u, "")}: said "${announcement.slice(0, 46)}" · pointer ${pointerAt} · the cell never filled in 25 s (last: ${last.filled === "no cell" ? "no such cell on screen" : `filled "${last.filled}"`}, caption "${last.caption.slice(0, 30)}")`;
    tutorTurns.push(line);
    if (DRILLS) drillNote(`tutor turn ${beatId.replace(/^authored:/u, "")}: announced before the cell fills, pointer on it, ✎ on the fill`, false, line);
  };
  const practiceLog: string[] = [];
  /** Tap-to-feedback latencies, from the page's own clock (submitTypedAnswer → fireFeedback). */
  const latencies: number[] = [];
  type Entered = { value: string; surface: string; beatId?: string; enteredAt: number; judgeAt: number | null; renderedBeforeJudge: boolean | null };
  const inputTrace: Entered[] = [];
  /** Tap → her feedback LINE starting (clip or caption), for the read-aloud answers the drill follows. */
  const answerPathSpoken: number[] = [];
  /** NOTHING OVERLAPS: every beat the session shows is put to the board's own layout probe (window.__boardLayout). */
  const overlapFindings: string[] = [];
  let overlapFrames = 0;
  /** The abacus rod run (placeValue4Digit:43–52): what is written under the rods at each beat — one value at a time. */
  const rodRun: string[] = [];
  let rodRunBad = 0;
  let inputNotShown = 0;
  let chatPanel: { coverage: number; share: number; dimmed: boolean; portrait: number; boardOk: boolean } | null = null;
  /** The ✋ chat budget drill's trace, printed at the end. */
  let chatBudgetTrace: string[] = [];
  let paidCallCount = 0;
  const asksOf = new Map<string, number>();
  /** Open builds per hand (digits → how many times built), so each build is a different permutation. */
  const handBuilds = new Map<string, number>();
  const ladderSeen: string[] = [];
  /** The strip's stops, the first beat each one lit up or took a star. */
  const stops = new Map<string, string>();
  const stars: string[] = [];
  const watchStrip = async (beatId: string) => {
    const now = await evaluate<Array<{ tag: string; status: string }>>(page, `[...document.querySelectorAll('[data-stop]')].map((el) => ({ tag: el.getAttribute('data-stop'), status: el.getAttribute('data-stop-status') }))`);
    for (const stop of now ?? []) {
      const previous = stops.get(stop.tag);
      if (previous === stop.status) continue;
      stops.set(stop.tag, stop.status);
      if (stop.status === "mastered") stars.push(`★ ${stop.tag} — star landed at ${beatId.replace(/^authored:/u, "")}`);
      else if (stop.status === "done") stars.push(`● ${stop.tag} — done without a star at ${beatId.replace(/^authored:/u, "")}`);
    }
  };
  let seq = 0;
  const started = Date.now();
  const shoot = async (beatId: string, tag = "") => {
    seq += 1;
    const snap = await snapshot();
    const image = (await page.send("Page.captureScreenshot", { format: "png" })) as { data?: string };
    if (!image.data) return;
    const safe = beatId.replace(/[^a-zA-Z0-9:_-]/gu, "_").replace(/:/gu, "-");
    const file = path.join(OUT_DIR, `${String(seq).padStart(3, "0")}-${safe}${tag}.png`);
    await writeFile(file, Buffer.from(image.data, "base64"));
    shots.push({ seq, beatId, file: path.relative(process.cwd(), file), stage: snap.stage });
  };

  // ---- the failure-mode drills ---------------------------------------
  const drillResults: string[] = [];
  /** The navigation drills' one-line traces, printed together at the end. */
  const navTrace: string[] = [];
  const drillDone = new Set<string>();
  const drillNote = (name: string, ok: boolean, detail: string) => {
    drillResults.push(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
    console.log(`      ⚡ drill ${name}: ${ok ? "ok" : "FAILED"} — ${detail}`);
  };
  const hintText = () => evaluate<string>(page, `(document.querySelector('[data-testid="hint"]')?.textContent ?? '').trim()`);
  const isPaused = () => evaluate<boolean>(page, `document.querySelector('.lesson-screen')?.hasAttribute('data-paused') ?? false`);
  const choreoCount = () => evaluate<number>(page, `(window.__choreoLog ?? []).length`);
  const drills = async (snap: Snapshot) => {
    const short = snap.beatId.replace(/^authored:/u, "");
    // 0. Cluster B, issue 7: ⏸ at the 5th, 40th and 80th beat — the beat holds, nothing fires while paused, and resume picks up the same beat.
    const ordinal = audits.length;
    if ([5, 40, 80].includes(ordinal) && !drillDone.has(`pause-${ordinal}`)) {
      drillDone.add(`pause-${ordinal}`);
      const eventsBefore = await choreoCount();
      const consoleAt = consoleLines.length;
      await tapSelector(ariaSel("session.pause"));
      await wait(400);
      const pausedNow = await isPaused();
      const eventsAtPause = await choreoCount();
      const beatAtPause = await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`);
      // A timeline of the hold, printed when the drill fails: the pause flag, the board's events, the beat, and what the
      // audio context itself did (its state changes, from the browser's own log) — so a failure explains itself.
      const markHold = await pageNow();
      const timeline: string[] = [];
      let lastRow = "";
      for (let i = 0; i < 16; i += 1) {
        await wait(250);
        const row = await evaluate<string>(page, `(() => { const el = document.querySelector('.lesson-screen'); const st = window.__dev && window.__dev.pauseState ? window.__dev.pauseState() : null; return (el && el.hasAttribute('data-paused') ? 'P' : 'p') + ' ' + ((window.__choreoLog ?? []).length) + ' ' + (el?.dataset.beatId ?? '—').replace(/^authored:/, '') + (st ? ' [runtime ' + (st.paused ? 'paused' : 'RUNNING') + ' manual ' + st.manual + ' holds ' + (st.holds.join(',') || '—') + ' · audio ' + (st.audio.paused ? 'paused' : 'RUNNING') + ' ctx ' + st.audio.contextState + ']' : ''); })()`);
        if (row !== lastRow) timeline.push(`+${(i + 1) * 250} ${row}`);
        lastRow = row;
      }
      const during = { paused: await isPaused(), events: await choreoCount(), beat: await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`) };
      const underResume = await evaluate<string>(page, `(() => { const b = document.querySelector(${JSON.stringify(ariaSel("edge.paused.resume"))}); if (!b) return 'no ▶ in the page'; const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h ? (h === b || b.contains(h) ? 'the strip ▶' : 'COVERED by ' + h.tagName + ' ' + (h.getAttribute('data-testid') || h.className || '')) : 'nothing'; })()`);
      await tapSelector(ariaSel("edge.paused.resume"));
      await wait(300);
      const after = { paused: await isPaused(), beat: await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`) };
      const ok = pausedNow && during.paused && during.events === eventsAtPause && during.beat === beatAtPause && !after.paused && after.beat === beatAtPause;
      if (!ok) {
        const contextStates = await evaluate<string>(page, `(() => { const T = window.__audioTruth; if (!T) return '—'; return T.contexts.map((c) => c.id + ': ' + c.anchors.filter((a, i, all) => a.p >= ${markHold} - 1500 && (i === 0 || all[i - 1].s !== a.s)).map((a) => Math.round(a.p - ${markHold}) + 'ms ' + a.s).join(', ')).join(' | '); })()`);
        const refusedTaps = await evaluate<string>(page, `JSON.stringify((window.__singleFire?.refused ?? []).slice(-4))`);
        console.log(`      pause timeline (P paused / p playing · board events · beat): ${timeline.join(" ‖ ")}`);
        console.log(`      audio context state changes around the hold: ${contextStates || "none"} · ▶ tap point: ${underResume} · guard refused: ${refusedTaps}`);
        console.log(`      the lesson's log during the hold: ${consoleLines.slice(consoleAt).map((l) => l.replace(/^debug: /u, "")).join(" ‖ ").slice(0, 900) || "—"}`);
      }
      drillNote(`pause at beat ${ordinal}`, ok, `${short} · paused ${pausedNow ? "yes" : "NO"} · 4 s later: beat ${during.beat === beatAtPause ? "unchanged" : `CHANGED to ${during.beat}`}, events while paused ${during.events - eventsAtPause} (${eventsBefore} → ${eventsAtPause} at the pause) · resumed ${after.paused ? "NO" : "yes"} on ${after.beat === beatAtPause ? "the same beat" : `a DIFFERENT beat (${after.beat})`}`);
    }
    // 1. A tap on the board while she is talking: a hint, not an answer.
    if (short === "readWrite4Digit:1" && !drillDone.has("touch") && snap.status === "teaching") {
      drillDone.add("touch");
      await tapSelector('[data-testid="lesson-board"]');
      await wait(400);
      const hint = await hintText();
      await shoot(snap.beatId, "-drill-touch-during-playback");
      const after = await snapshot();
      // The tap must not become an answer or a judge — she just keeps talking (the beat may end on its own meanwhile).
      const takenAsAnswer = after.status === "thinking" || answers.some((a) => a.beatId === snap.beatId);
      drillNote("touch during playback", hint.includes(copy("session.talkingHint")) && !takenAsAnswer, `hint "${hint}" · not taken as an answer ${takenAsAnswer ? "NO" : "yes"} · now ${after.beatId.replace(/^authored:/u, "")} (${after.status})`);
    }
    // 2. The phone turned to portrait mid-beat: the lesson holds, then resumes when turned back.
    if (short === "readWrite4Digit:3" && !drillDone.has("rotate") && snap.status === "teaching") {
      drillDone.add("rotate");
      await page.send("Emulation.setDeviceMetricsOverride", { width: VIEW_H, height: VIEW_W, deviceScaleFactor: 2, mobile: true });
      await wait(900);
      const paused = await isPaused();
      const card = await evaluate<boolean>(page, `(() => { const el = document.querySelector('.rotate-card'); return !!el && getComputedStyle(el).display !== 'none'; })()`);
      const hint = await hintText();
      const fired = await choreoCount();
      await shoot(snap.beatId, "-drill-portrait");
      await wait(2500);
      const firedWhileHeld = (await choreoCount()) - fired;
      await page.send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2, mobile: true });
      await wait(1500);
      const resumed = !(await isPaused());
      await shoot(snap.beatId, "-drill-portrait-back");
      drillNote("rotation mid-beat", paused && card && firedWhileHeld === 0 && resumed, `held ${paused ? "yes" : "NO"} · rotate card ${card ? "shown" : "MISSING"} · hint "${hint}" · events while held ${firedWhileHeld} · resumed after turning back ${resumed ? "yes" : "NO"}`);
    }
    // 3. The tab goes to the background: held; back → resumes.
    if (short === "readWrite4Digit:4" && !drillDone.has("background") && snap.status === "teaching") {
      drillDone.add("background");
      // Headless Chromium keeps the page "visible" whatever the lifecycle state, so the tab's own
      // visibility is switched the way the browser would and the event dispatched — the app's
      // handler (LessonScreen → holdFor("background")) is what is under test.
      const setVisibility = (state: "hidden" | "visible") =>
        evaluate(page, `(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => ${JSON.stringify(state)} }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${state === "hidden"} }); document.dispatchEvent(new Event('visibilitychange')); return document.visibilityState; })()`);
      await setVisibility("hidden");
      await wait(900);
      const hiddenSeen = await evaluate<string>(page, `document.visibilityState`);
      const paused = await isPaused();
      const hint = await hintText();
      const fired = await choreoCount();
      await wait(2500);
      const firedWhileHeld = (await choreoCount()) - fired;
      await setVisibility("visible");
      await wait(1500);
      const resumed = !(await isPaused());
      await shoot(snap.beatId, "-drill-background-back");
      drillNote("backgrounded tab", hiddenSeen === "hidden" && paused && firedWhileHeld === 0 && resumed, `visibility "${hiddenSeen}" · held ${paused ? "yes" : "NO"} · hint "${hint}" · events while held ${firedWhileHeld} · resumed ${resumed ? "yes" : "NO"}`);
    }
    // 5. The ✋: the microphone is asked for here, after her explanation, and nowhere before. The
    //    token mint is blocked so no Live session (and no paid call) opens; the runtime carries on.
    if (short === "readWrite4Digit:12" && !drillDone.has("chat")) {
      drillDone.add("chat");
      const before = await evaluate<number>(page, `window.__gumCalls ?? 0`);
      // The token mint is held (never answered), so the sheet stays up with no Live session and no paid call.
      // Every request pauses at the door; all but the token mint go straight through.
      await page.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
      const held: string[] = [];
      // A CDP handler cannot be removed: this one stands down when the drill is over (a later drill pauses requests too).
      let holding = true;
      page.on("Fetch.requestPaused", (params) => {
        if (!holding) return;
        const id = String(params.requestId);
        const url = String((params.request as { url?: string })?.url ?? "");
        if (url.includes("/api/gemini-session")) held.push(id);
        else void page.send("Fetch.continueRequest", { requestId: id }).catch(() => undefined);
      });
      await tapSelector('[data-testid="hand"]');
      // First the P1 sheet: the board dims, Zara (160 px) explains; the browser's prompt waits for "හරි, අවසර දෙන්න".
      let explained = "";
      let asked = false;
      for (let i = 0; i < 80 && !asked; i += 1) {
        await wait(150);
        asked = await evaluate<boolean>(page, `!!document.querySelector('[data-testid="mic-ask"] [data-testid="mic-ask-allow"]')`);
      }
      const micAsk = await evaluate<{ up: boolean; portrait: number; dimmed: boolean; title: string; buttons: number }>(page, `(() => { const s = document.querySelector('[data-testid="mic-ask"]'); const p = s && s.querySelector('.zara-portrait'); return { up: !!s, portrait: p ? Math.round(p.getBoundingClientRect().width) : 0, dimmed: !!(s && s.querySelector('[data-testid="board-dim"]')), title: s ? (s.textContent ?? '').slice(0, 40) : '', buttons: s ? s.querySelectorAll('button').length : 0 }; })()`);
      await shoot(snap.beatId, "-drill-mic-ask");
      const gumBeforeAllow = await evaluate<number>(page, `window.__gumCalls ?? 0`);
      let after = gumBeforeAllow;
      if (asked) {
        // Her explanation plays under the sheet; the decision is taken once it has been asked.
        for (let i = 0; i < 80; i += 1) {
          await wait(150);
          const caption = await evaluate<string>(page, `(document.querySelector('[data-testid="caption"]')?.textContent ?? '').trim()`);
          if (caption) explained = caption;
          if (!(await evaluate<boolean>(page, `!!document.querySelector('[data-testid="mic-ask"]')`))) break;
          if (i === 6) await tapSelector('[data-testid="mic-ask-allow"]');
          after = await evaluate<number>(page, `window.__gumCalls ?? 0`);
          if (after > before) break;
        }
      }
      for (let i = 0; i < 40 && after === before; i += 1) {
        await wait(150);
        after = await evaluate<number>(page, `window.__gumCalls ?? 0`);
      }
      await wait(800);
      // THE CHAT PANEL (18 Sep): it never covers or dims the board. Measured here, in the real session: how much of the
      // board the panel covers (0 %), that nothing dims the board, Zara small, the transcript, the close button, and the
      // bot button still there to close it with — and the board's own layout still clean beside the panel.
      const sheet = await evaluate<{ up: boolean; portrait: number; lines: number; dimmed: boolean; coverage: number; share: number; bot: boolean; close: boolean; boardOk: boolean; veil: number }>(page, `(() => {
        const s = document.querySelector('[data-testid="chat-sheet"]');
        const board = document.querySelector('[data-board-root]');
        const main = document.querySelector('[data-testid="session-main"]');
        if (!s || !board || !main) return { up: !!s, portrait: 0, lines: 0, dimmed: false, coverage: 100, share: 100, bot: false, close: false, boardOk: false, veil: 0 };
        const p = s.querySelector('.zara-portrait');
        const a = s.getBoundingClientRect(), b = board.getBoundingClientRect(), m = main.getBoundingClientRect();
        const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)), h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const landscape = m.width >= m.height;
        const hand = document.querySelector('[data-testid="hand"]');
        const report = window.__boardLayout ? window.__boardLayout()[0] : null;
        return { up: true, portrait: p ? Math.round(p.getBoundingClientRect().width) : 0, lines: s.querySelectorAll('[data-testid^="chat-line-"]').length, dimmed: !!document.querySelector('[data-testid="board-dim"]'), coverage: Math.round((w * h) / (b.width * b.height) * 1000) / 10, share: Math.round((landscape ? a.width / m.width : a.height / m.height) * 1000) / 10, bot: !!hand && hand.getBoundingClientRect().width >= 48, close: !!s.querySelector('[data-testid="chat-return"]'), boardOk: !!report && report.ok, veil: Number(getComputedStyle(board).opacity) };
      })()`);
      chatPanel = sheet;
      await shoot(snap.beatId, "-drill-first-hand");
      // THE CHILD'S TURN IS A NEUTRAL BUBBLE (23 Sep 2026): the Live API's input transcription misdetects the language on its
      // own (other scripts, other Asian languages, fragments), so what it delivers never reaches the panel — the bubble says
      // "ඔයා කතා කළා" with a small waveform, and the words go to the debug overlay only. Simulated here through the DEV hook.
      const injected = await evaluate<boolean>(page, `(() => { const d = window.__dev; if (!d || !d.chatInject) return false; return d.chatInject({ child: ${JSON.stringify(INJECTED_TRANSCRIPT)}, zara: "" }); })()`).catch(() => false);
      await wait(300);
      const bubble = await evaluate<{ text: string; turn: string | null; leak: boolean; wave: boolean }>(page, `(() => { const s = document.querySelector('[data-testid="chat-sheet"]'); const c = s && s.querySelector('[data-testid="chat-line-child"]'); return { text: c ? (c.textContent || '').trim() : '', turn: c ? c.getAttribute('data-child-turn') : null, leak: !!s && (s.textContent || '').includes(${JSON.stringify(INJECTED_TRANSCRIPT)}), wave: !!(c && c.querySelector('.chat-wave')) }; })()`);
      for (let i = 0; i < 5; i += 1) {
        await clickSelector('[data-testid="session-title"]');
        await wait(120);
      }
      let overlayHas = false;
      for (let i = 0; i < 12 && !overlayHas; i += 1) {
        await wait(300);
        overlayHas = await evaluate<boolean>(page, `(document.querySelector('[data-testid="debug-chat-child"]')?.textContent ?? '').includes(${JSON.stringify(INJECTED_TRANSCRIPT)})`).catch(() => false);
      }
      await shoot(snap.beatId, "-drill-chat-bubble");
      for (let i = 0; i < 5; i += 1) {
        await clickSelector('[data-testid="session-title"]');
        await wait(120);
      }
      drillNote("the chat shows the child's turn as a neutral bubble, never the transcript", injected && bubble.turn === "spoke" && bubble.text === copy("chat.childSpoke") && !bubble.leak && bubble.wave && overlayHas, `transcript injected ${injected ? "yes" : "NO (window.__dev.chatInject missing)"} · child bubble "${bubble.text}" (${bubble.turn ?? "—"}, waveform ${bubble.wave ? "yes" : "NO"}) · transcript text in the panel ${bubble.leak ? "LEAKED" : "none"} · in the debug overlay ${overlayHas ? "yes" : "NO"}`);
      // The bot button closes it again — the child comes and goes freely.
      const returned = await tapSelector('[data-testid="hand"]');
      await wait(1200);
      for (const id of held) await page.send("Fetch.failRequest", { requestId: id, errorReason: "Aborted" }).catch(() => undefined);
      await page.send("Fetch.disable");
      holding = false;
      const status = (await snapshot()).status;
      drillNote("first ✋ asks for the microphone; the chat is a panel beside the board", before === 0 && micAsk.up && micAsk.portrait >= 150 && micAsk.dimmed && micAsk.buttons === 2 && gumBeforeAllow === 0 && after === 1 && sheet.up && sheet.portrait > 0 && sheet.portrait <= 64 && sheet.lines === 2 && !sheet.dimmed && sheet.coverage === 0 && sheet.share <= 33.4 && sheet.bot && sheet.close && sheet.veil === 1 && returned && status !== "chatting", `getUserMedia calls before ✋: ${before} · P1 sheet ${micAsk.up ? "up" : "MISSING"} (Zara ${micAsk.portrait} px, dimmed ${micAsk.dimmed ? "yes" : "NO"}, ${micAsk.buttons} buttons, "${micAsk.title.trim().slice(0, 30)}") · calls before "${copy("edge.mic.allow")}": ${gumBeforeAllow} · after: ${after}${explained ? ` · her explanation: "${explained.slice(0, 40)}"` : ""} · chat panel ${sheet.up ? "up" : "MISSING"}: covers ${sheet.coverage} % of the board, takes ${sheet.share} % of the screen's long side, board dimmed ${sheet.dimmed ? "YES" : "no"} (opacity ${sheet.veil}), Zara ${sheet.portrait} px, ${sheet.lines} transcript lines, close button ${sheet.close ? "yes" : "NO"}, bot button ${sheet.bot ? "still there" : "GONE"}, board layout beside it ${sheet.boardOk ? "clean" : "HAS OVERLAPS"} · bot tapped to close ${returned ? "yes" : "NO"} → ${status}`);
    }
    // 3c. THE ✋ CHAT'S TIME, AND NEVER A SILENT FAILURE (28 Sep 2026). A 429 from our own chat budget used to close the chat
    // at once (the panel flashed and vanished), and the day was charged 5 minutes per opening. No paid call here: the
    // server's DEV_MODE mock hands back a fake token (ss_chat_mock=on — nothing reaches Google) and the page's Live
    // WebSocket is the harness's own fake, which only answers the setup. The budget itself is the REAL accounting: the
    // ss_chat_budget=enforce cookie lifts DEV_MODE's exemption for this throwaway child.
    if (DRILLS && childA && drillDone.has("chat") && !drillDone.has("chat-budget") && snap.status === "teaching") {
      drillDone.add("chat-budget");
      const dayBucket = `chat:${childA}:${new Date().toISOString().slice(0, 10)}`;
      const setUsed = async (seconds: number) => {
        await supabaseAdmin.from("api_rate_limits").upsert({ bucket: dayBucket, window_started_at: new Date().toISOString(), count: seconds }, { onConflict: "bucket" });
      };
      const readUsed = async () => ((await supabaseAdmin.from("api_rate_limits").select("count").eq("bucket", dayBucket).maybeSingle()).data as { count?: number } | null)?.count ?? 0;
      const openHolds = async () => (await supabaseAdmin.from("api_rate_limits").select("bucket", { count: "exact", head: true }).like("bucket", `chat-open:${childA}:%`)).count ?? 0;
      type ChatState = { up: boolean; failure: string | null; line: string; listening: boolean; status: string; chat: string };
      const chatState = () => evaluate<ChatState>(page, `(() => { const s = document.querySelector('[data-testid="chat-sheet"]'); const el = document.querySelector('.lesson-screen'); return { up: !!s, failure: s ? s.getAttribute('data-chat-failure') : null, line: ((s && s.querySelector('[data-testid="chat-line-zara"]')?.textContent) ?? '').trim(), listening: !!(s && s.querySelector('[data-testid="chat-listening"]')), status: el?.dataset.status ?? '—', chat: el?.dataset.chat ?? '—' }; })()`);
      const waitChat = async (test: (c: ChatState) => boolean, ms: number) => {
        let c = await chatState();
        for (let i = 0; i < ms / 150 && !test(c); i += 1) {
          await wait(150);
          c = await chatState();
        }
        return c;
      };
      /**
       * ✋, as a child would: tapped only while no chat panel is up (a tap on an open panel closes it), and again if the
       * first tap found no ✋ on screen (a question's turn hides it) — until the chat is connected or has failed visibly.
       */
      const openByHand = async (): Promise<ChatState> => {
        let c = await chatState();
        for (let attempt = 0; attempt < 10; attempt += 1) {
          if (!c.up) await tapSelector('[data-testid="hand"]');
          c = await waitChat((x) => x.up && (x.chat === "connected" || x.failure !== null), 6000);
          if (c.up && (c.chat === "connected" || c.failure !== null)) return c;
          if (!c.up) await wait(1500);
        }
        return c;
      };
      const overlay = async () => {
        for (let i = 0; i < 5; i += 1) {
          await clickSelector('[data-testid="session-title"]');
          await wait(120);
        }
        let text = { chat: "", budget: "" };
        for (let i = 0; i < 12 && !text.budget.includes("min"); i += 1) {
          await wait(300);
          text = await evaluate<{ chat: string; budget: string }>(page, `({ chat: (document.querySelector('[data-testid="debug-chat"]')?.textContent ?? '').trim(), budget: (document.querySelector('[data-testid="debug-chat-budget"]')?.textContent ?? '').trim() })`);
        }
        for (let i = 0; i < 5; i += 1) {
          await clickSelector('[data-testid="session-title"]');
          await wait(120);
        }
        return text;
      };
      await evaluate(page, FAKE_LIVE_SOCKET_JS);
      await evaluate(page, `(() => { document.cookie = "ss_chat_budget=enforce; path=/"; document.cookie = "ss_chat_mock=on; path=/"; return true; })()`);
      const limit = (await evaluate<{ budget?: { limitSeconds: number } }>(page, `fetch('/api/chat-usage').then((r) => r.json())`))?.budget?.limitSeconds ?? 1800;
      const trace: string[] = [];

      // (a) The day's chat time spent: the 429 keeps the panel OPEN with her line until the child closes it.
      await setUsed(limit);
      const spentUp = await openByHand();
      const samples: ChatState[] = [];
      for (let i = 0; i < 16; i += 1) {
        await wait(250);
        samples.push(await chatState());
      }
      const stayed = spentUp.up && samples.every((c) => c.up && c.failure === "budget");
      const spent = samples[samples.length - 1]!;
      const spentOverlay = await overlay();
      await shoot(snap.beatId, "-drill-chat-spent");
      await tapSelector('[data-testid="chat-return"]');
      const afterSpent = await waitChat((c) => !c.up, 4000);
      const spentOk = stayed && spent.line === OUT_OF_TIME && !spent.listening && spent.status === "chatting" && spent.chat === "failed" && spentOverlay.chat.includes("budget") && spentOverlay.budget.includes("0.0 of") && !afterSpent.up;
      trace.push(`spent (${limit} of ${limit} s used): ✋ → panel ${spentUp.up ? "up" : "NEVER UP"} · 4 s of samples: ${samples.filter((c) => c.up).length}/16 up, failure "${spent.failure}" · Zara: "${spent.line}" · listening pill ${spent.listening ? "SHOWN" : "gone"} · status ${spent.status} · overlay "${spentOverlay.chat.slice(0, 80)}" / "${spentOverlay.budget}" · closed by the child → panel ${afterSpent.up ? "STILL UP" : "gone"}`);
      drillNote("the chat's time spent: the panel stays open with her Sinhala line until the child closes it", spentOk, trace[trace.length - 1]!);

      // (b) Time left: the chat opens, STAYS open (connected), and closed after 10 s is charged 15 s — not 5 minutes.
      await setUsed(0);
      await wait(1500);
      const connected = await openByHand();
      const connectedAt = Date.now();
      const heldWhileOpen = await readUsed();
      const openSamples: ChatState[] = [];
      while (Date.now() - connectedAt < 10_000) {
        await wait(500);
        openSamples.push(await chatState());
      }
      await evaluate(page, `(() => { window.__chatUsage = null; return true; })()`);
      await tapSelector('[data-testid="chat-return"]');
      let usage: { settled?: boolean; reportedSeconds?: number; heldSeconds?: number; chargedSeconds?: number; refundedSeconds?: number; budget?: { remainingSeconds: number } } | null = null;
      // The settle goes through the proxy and a few database round trips: on a slow link it takes seconds.
      for (let i = 0; i < 150 && !usage; i += 1) {
        await wait(200);
        usage = await evaluate(page, `window.__chatUsage ?? null`);
      }
      const usedAfter = await readUsed();
      const holdsLeft = await openHolds();
      const openOverlay = await overlay();
      const stayedOpen = connected.chat === "connected" && openSamples.length >= 3 && openSamples.every((c) => c.up && c.chat === "connected" && c.failure === null);
      const chargeOk = !!usage?.settled && usage.chargedSeconds === 15 && usedAfter === 15 && holdsLeft === 0 && (usage.reportedSeconds ?? 0) >= 9 && (usage.reportedSeconds ?? 99) <= 12;
      trace.push(`time left: ✋ → ${connected.chat === "connected" ? "connected" : `NOT connected (${connected.chat}, failure ${connected.failure})`} · held while open ${heldWhileOpen} s · open for 10 s: ${openSamples.filter((c) => c.up && c.chat === "connected").length}/${openSamples.length} samples up and connected · closed → reported ${usage?.reportedSeconds ?? "—"} s, held ${usage?.heldSeconds ?? "—"} s, CHARGED ${usage?.chargedSeconds ?? "—"} s, refunded ${usage?.refundedSeconds ?? "—"} s · the day now ${usedAfter} s (was charged 300 s per opening before) · holds left ${holdsLeft} · overlay "${openOverlay.budget}"`);
      drillNote("time left: the chat stays open, and closed after 10 s it is charged 15 s, not 5 minutes", stayedOpen && chargeOk && openOverlay.budget.includes("29.8 of 30"), trace[trace.length - 1]!);

      // (c) DEV_MODE: without the enforce cookie the budget is not counted — a spent day still opens, and nothing is charged.
      await setUsed(limit);
      await evaluate(page, `(() => { document.cookie = "ss_chat_budget=; path=/; max-age=0"; return true; })()`);
      await wait(1500);
      const exempt = await openByHand();
      await wait(2000);
      const exemptOverlay = await overlay();
      await tapSelector('[data-testid="chat-return"]');
      await waitChat((c) => !c.up, 4000);
      await wait(800);
      const exemptUsed = await readUsed();
      const exemptOk = exempt.chat === "connected" && exempt.failure === null && exemptUsed === limit && exemptOverlay.budget.includes("not counted");
      trace.push(`DEV_MODE (no enforce cookie), day spent: ✋ → ${exempt.chat === "connected" ? "connected" : `NOT connected (${exempt.failure})`} · the day ${exemptUsed === limit ? "unchanged" : `CHANGED to ${exemptUsed}`} (${exemptUsed} s) · overlay "${exemptOverlay.budget}"`);
      drillNote("DEV_MODE exempts the chat budget: a spent day still opens and is not charged", exemptOk, trace[trace.length - 1]!);

      // (d) + (e) TWO WARNINGS BEFORE THE LIMIT (29 Sep 2026, src/lib/timeWarnings.ts): "අපි තව පොඩ්ඩක් කතා කරමු…" five
      // minutes before this chat must close and "දැන් අන්තිම ප්‍රශ්නේ අහන්න…" one minute before — each once, and only once
      // she has finished what she is saying; at the limit the microphone stops, she finishes her sentence, the chat closes
      // by itself and the lesson carries on at the beat it held. "She" is the fake socket (__fakeLive.say), made to talk
      // across the moment each falls due. The two lines are not recorded yet, so the harness serves a stand-in clip for
      // them at the clip door (a tone): the warning is then HEARD through the same voice queue as her, and the browser's
      // own audio log says whether it ever sounded over her.
      await evaluate(page, `(() => { document.cookie = "ss_chat_budget=enforce; path=/"; return true; })()`);
      const voice = (await evaluate<{ voice?: string }>(page, `fetch('/api/audio-config').then((r) => r.json())`))?.voice ?? "";
      const standIns = new Map<string, string>([AUTHORED_LINES.chatTimeSoon, AUTHORED_LINES.chatTimeLast].map((line) => [clipKey(line, voice), line]));
      const STAND_IN_MS = 1600;
      const standInWav = toneWav(STAND_IN_MS);
      let serving = true;
      let servedClips = 0;
      await page.send("Network.setBypassServiceWorker", { bypass: true }).catch(() => undefined);
      await page.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/clip/*", requestStage: "Request" }] });
      page.on("Fetch.requestPaused", (params) => {
        if (!serving) return;
        const id = String(params.requestId);
        const url = String((params.request as { url?: string })?.url ?? "");
        const line = standIns.get(url.match(/\/api\/clip\/([0-9a-f]+)/u)?.[1] ?? "");
        if (!line) {
          void page.send("Fetch.continueRequest", { requestId: id }).catch(() => undefined);
          return;
        }
        servedClips += 1;
        const meta = url.includes("meta=1");
        const body = meta ? Buffer.from(JSON.stringify({ durationMs: STAND_IN_MS, sentences: [{ startMs: 0, endMs: STAND_IN_MS }], text: line, voice })).toString("base64") : standInWav;
        void page.send("Fetch.fulfillRequest", { requestId: id, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: meta ? "application/json" : "audio/wav" }, { name: "Cache-Control", value: "no-store" }], body }).catch(() => undefined);
      });
      type WarnTrace = {
        warnings: Array<{ kind: string; line: string; at: number; remaining: number; clip: boolean }>;
        close: { at: number; waitedMs: number; how: string } | null;
        turns: Array<{ startedAt: number; ms: number; chunks: number; completeAt: number | null }>;
      };
      const warnTrace = () => evaluate<WarnTrace>(page, `({ warnings: window.__chatWarnings ?? [], close: window.__chatClose ?? null, turns: (window.__fakeLive && window.__fakeLive.turns) || [] })`);
      const sayAsZara = (ms: number) => evaluate<boolean>(page, `window.__fakeLive ? window.__fakeLive.say(${ms}, "හරි, මම කියන්නම්.") : false`);
      const panelWarning = () => evaluate<{ warning: string | null; closing: boolean; pill: boolean; line: string }>(page, `(() => { const s = document.querySelector('[data-testid="chat-sheet"]'); return { warning: s ? s.getAttribute('data-chat-warning') : null, closing: !!(s && s.hasAttribute('data-chat-closing')), pill: !!(s && s.querySelector('[data-testid="chat-listening"]')), line: ((s && s.querySelector('[data-testid="chat-line-zara"]')?.textContent) ?? '').trim() }; })()`);
      /** Her sentences and the warnings, as the browser played them (ms after `from`): her chunks chain as "✋ chat", a warning is its own clip. */
      const voiceSpans = (t: TruthSummary) => ({
        zara: t.sounding.filter((c) => c.label === "✋ chat").map((c) => ({ start: c.at, end: c.at + c.ms })),
        warnings: t.sounding.filter((c) => (c.label ?? "").includes("warning")).map((c) => ({ label: c.label ?? "", start: c.at, end: c.at + c.ms })),
      });
      const inMs = (n: number) => `${Math.round(n)} ms`;

      // (d) Five minutes left (306 s held): she starts a 4 s sentence 3 s in, so the warning falls due in the middle of it.
      await setUsed(limit - 306);
      await wait(1500);
      const soonMark = await pageNow();
      const soonUp = await openByHand();
      const soonOpened = Date.now();
      // What the server held for this opening (the day's figure rises by the hold at the open).
      const soonHeld = (await readUsed()) - (limit - 306);
      while (Date.now() - soonOpened < 3000) await wait(100);
      await sayAsZara(4000);
      let soonTrace = await warnTrace();
      for (let i = 0; i < 80 && soonTrace.warnings.length === 0; i += 1) {
        await wait(150);
        soonTrace = await warnTrace();
      }
      const soonPanel = await panelWarning();
      await shoot(snap.beatId, "-drill-chat-warning-soon");
      // Once, and the chat carries on: eight more seconds of samples.
      const afterSoon: ChatState[] = [];
      for (let i = 0; i < 16; i += 1) {
        await wait(500);
        afterSoon.push(await chatState());
      }
      soonTrace = await warnTrace();
      const soonHeard = await heard(soonMark);
      await evaluate(page, `(() => { window.__chatUsage = null; return true; })()`);
      await tapSelector('[data-testid="chat-return"]');
      await waitChat((c) => !c.up, 4000);
      // Its close settles on the server and gives back the rest of its hold: the next setting of the day waits for that,
      // or the refund lands on top of it (a first run's "one minute left" chat was held 358 s this way).
      let soonSettled = false;
      for (let i = 0; i < 150 && !soonSettled; i += 1) {
        await wait(200);
        soonSettled = !!(await evaluate<{ settled?: boolean } | null>(page, `window.__chatUsage ?? null`))?.settled;
      }
      const soonSpans = voiceSpans(soonHeard);
      const soonWarn = soonTrace.warnings[0];
      const soonSentence = soonTrace.turns[soonTrace.turns.length - 1];
      const soonAudio = soonSpans.warnings[0];
      const soonZaraEnd = Math.max(0, ...soonSpans.zara.filter((z) => !soonAudio || z.start < soonAudio.start).map((z) => z.end));
      const soonOk =
        soonUp.chat === "connected" &&
        soonHeld === 306 &&
        soonTrace.warnings.length === 1 &&
        soonWarn?.kind === "soon" &&
        soonWarn.remaining <= 300 &&
        !!soonSentence?.completeAt &&
        soonWarn.at >= soonSentence.completeAt &&
        soonPanel.warning === "soon" &&
        soonPanel.line === AUTHORED_LINES.chatTimeSoon &&
        soonWarn.clip &&
        !!soonAudio &&
        soonAudio.start >= soonZaraEnd - 20 &&
        soonHeard.maxConcurrent <= 1 &&
        afterSoon.every((c) => c.up && c.chat === "connected" && c.failure === null);
      trace.push(
        `5 min left: ✋ → ${soonUp.chat === "connected" ? "connected" : `NOT connected (${soonUp.chat})`}, held ${soonHeld} s · she spoke 3 s → ${soonSentence?.completeAt ? `${inMs(soonSentence.completeAt - soonMark)}` : "?"} (turn complete) · warnings said: ${soonTrace.warnings.map((w) => `${w.kind} at ${inMs(w.at - soonMark)} with ${w.remaining} s left${w.clip ? ", heard" : ", NOT heard"}`).join("; ") || "NONE"} · panel "${soonPanel.line.slice(0, 40)}" [data-chat-warning=${soonPanel.warning ?? "—"}] · heard: her voice ended ${inMs(soonZaraEnd)}, the warning ${soonAudio ? `${inMs(soonAudio.start)} → ${inMs(soonAudio.end)}` : "NEVER SOUNDED"}, most at once ${soonHeard.maxConcurrent} · then 8 s: ${afterSoon.filter((c) => c.up && c.chat === "connected").length}/${afterSoon.length} samples up and connected, warnings ${soonTrace.warnings.length}`,
      );
      drillNote("5 min left in the chat: the warning fires once, after her sentence, and the chat carries on", soonOk, trace[trace.length - 1]!);

      // (e) One minute left (68 s held): the heads-up is skipped (too little time for it), the last call falls due while
      // she talks and waits for her, and she is still talking when the limit comes — the chat closes when she finishes.
      // Short sentences in between keep the chat from closing on its 20 s of quiet, as a real conversation would.
      await setUsed(limit - 68);
      await wait(1500);
      const lastMark = await pageNow();
      const lastUp = await openByHand();
      const lastOpened = Date.now();
      const lastHeld = (await readUsed()) - (limit - 68);
      const heldBeat = (await snapshot()).beatId;
      const sentences: Array<[number, number]> = [[5000, 4000], [20_000, 3000], [35_000, 3000], [50_000, 3000], [64_000, 7000]];
      // One read of the panel AND the beat, so the beat the lesson comes back to is read the moment the panel goes (the
      // rest of a beat whose line the ✋ cut can be short: a poll a second later could already see the next one).
      type Probe = { up: boolean; failure: string | null; warning: string | null; closing: boolean; pill: boolean; line: string; status: string; beat: string };
      const probe = () => evaluate<Probe>(page, `(() => { const s = document.querySelector('[data-testid="chat-sheet"]'); const el = document.querySelector('.lesson-screen'); return { up: !!s, failure: s ? s.getAttribute('data-chat-failure') : null, warning: s ? s.getAttribute('data-chat-warning') : null, closing: !!(s && s.hasAttribute('data-chat-closing')), pill: !!(s && s.querySelector('[data-testid="chat-listening"]')), line: ((s && s.querySelector('[data-testid="chat-line-zara"]')?.textContent) ?? '').trim(), status: el?.dataset.status ?? '—', beat: el?.dataset.beatId ?? '—' }; })()`);
      let lastPanel: Probe | null = null;
      const closingSamples: Array<{ pill: boolean }> = [];
      let failureSeen: string | null = null;
      let next = 0;
      let closedAfterMs = -1;
      let resumed = { status: "—", beatId: "—" };
      while (Date.now() - lastOpened < 95_000) {
        const elapsed = Date.now() - lastOpened;
        if (next < sentences.length && elapsed >= sentences[next]![0]) {
          await sayAsZara(sentences[next]![1]);
          next += 1;
        }
        const p = await probe();
        if (p.failure) failureSeen = p.failure;
        if (!p.up && elapsed > 10_000) {
          closedAfterMs = elapsed;
          resumed = { status: p.status, beatId: p.beat };
          break;
        }
        if (p.warning === "last" && !lastPanel) lastPanel = p;
        if (p.closing) closingSamples.push({ pill: p.pill });
        await wait(p.closing ? 40 : 200);
      }
      await wait(1200);
      const lastTrace = await warnTrace();
      const lastHeard = await heard(lastMark);
      const afterwards = await snapshot();
      await shoot(afterwards.beatId, "-drill-chat-closed-at-limit");
      const lastSpans = voiceSpans(lastHeard);
      const lastWarn = lastTrace.warnings[0];
      const firstSentence = lastTrace.turns[lastTrace.turns.length - sentences.length];
      const finalSentence = lastTrace.turns[lastTrace.turns.length - 1];
      const lastAudio = lastSpans.warnings[0];
      const beforeWarnEnd = Math.max(0, ...lastSpans.zara.filter((z) => !lastAudio || z.start < lastAudio.start).map((z) => z.end));
      const finalVoiceEnd = Math.max(0, ...lastSpans.zara.map((z) => z.end));
      const closeAt = lastTrace.close ? lastTrace.close.at - lastMark : -1;
      const lastOk =
        lastUp.chat === "connected" &&
        lastHeld === 68 &&
        lastTrace.warnings.length === 1 &&
        lastWarn?.kind === "last" &&
        !!firstSentence?.completeAt &&
        lastWarn.at >= firstSentence.completeAt &&
        lastPanel?.line === AUTHORED_LINES.chatTimeLast &&
        lastWarn.clip &&
        !!lastAudio &&
        lastAudio.start >= beforeWarnEnd - 20 &&
        lastTrace.close?.how === "quiet" &&
        !!finalSentence?.completeAt &&
        lastTrace.close.at >= finalSentence.completeAt &&
        closeAt >= finalVoiceEnd &&
        lastTrace.close.waitedMs >= 1000 &&
        closingSamples.length > 0 &&
        closingSamples.every((x) => !x.pill) &&
        closedAfterMs > 0 &&
        failureSeen === null &&
        resumed.status !== "chatting" &&
        resumed.beatId === heldBeat &&
        lastHeard.maxConcurrent <= 1;
      trace.push(
        `1 min left: ✋ → ${lastUp.chat === "connected" ? "connected" : `NOT connected (${lastUp.chat})`}, held ${lastHeld} s (the 5 min chat's close ${soonSettled ? "settled first" : "NOT SETTLED"}), on ${heldBeat.replace(/^authored:/u, "")} · warnings said: ${lastTrace.warnings.map((w) => `${w.kind} at ${inMs(w.at - lastMark)} with ${w.remaining} s left${w.clip ? ", heard" : ", NOT heard"}`).join("; ") || "NONE"} (her first sentence complete at ${firstSentence?.completeAt ? inMs(firstSentence.completeAt - lastMark) : "?"}; the heard warning ${lastAudio ? `${inMs(lastAudio.start)} → ${inMs(lastAudio.end)}` : "NEVER SOUNDED"}, her voice before it ended ${inMs(beforeWarnEnd)}) · panel "${(lastPanel?.line ?? "").slice(0, 40)}" · the limit at ~68 s: she was talking (sentence ${finalSentence ? `${inMs(finalSentence.startedAt - lastMark)} → complete ${finalSentence.completeAt ? inMs(finalSentence.completeAt - lastMark) : "never"}` : "?"}, her voice ended ${inMs(finalVoiceEnd)}) → closed ${lastTrace.close ? `at ${inMs(closeAt)} after waiting ${inMs(lastTrace.close.waitedMs)} (${lastTrace.close.how})` : "NOT by the limit"} · while closing: ${closingSamples.length} samples, listening pill ${closingSamples.some((x) => x.pill) ? "SHOWN" : "gone"} · failure ${failureSeen ?? "none"} · the moment it closed: ${resumed.status} on ${resumed.beatId.replace(/^authored:/u, "")} (${resumed.beatId === heldBeat ? "the same beat" : "a DIFFERENT beat"}), 1.2 s later ${afterwards.status} on ${afterwards.beatId.replace(/^authored:/u, "")} · heard: most at once ${lastHeard.maxConcurrent}`,
      );
      drillNote("1 min left in the chat: the last warning after her sentence, and at the limit it closes once she finishes — the lesson resumes on the same beat", lastOk, trace[trace.length - 1]!);
      serving = false;
      await page.send("Fetch.disable").catch(() => undefined);
      await page.send("Network.setBypassServiceWorker", { bypass: false }).catch(() => undefined);
      trace.push(`stand-in clips served for the two warning lines: ${servedClips} request(s)`);

      // Put the device and the child back.
      await evaluate(page, `(() => { document.cookie = "ss_chat_mock=; path=/; max-age=0"; if (window.__fakeLive) { window.WebSocket = window.__fakeLive.Real; } return true; })()`);
      await supabaseAdmin.from("api_rate_limits").delete().eq("bucket", dayBucket);
      chatBudgetTrace = trace;
    }
    // 3a. THE PLAYBACK PANEL SCRUBS (23 Sep 2026, from a real device): ⏸ opens it beside the board and the lesson stays
    // paused; ⏮ ⏭ and the concept chips SELECT a beat silently (its board and its line, no audio, no resume); 🔊 plays the
    // selected line once; ▶ දිගටම plays from the selected beat. Audio is measured throughout by the BROWSER (heard(): the
    // clips that really sounded in a window, and how many at once — scripts/lib/audioTruth.ts) and every line start in
    // order (window.__lineStarts). Two drill points: readWrite4Digit:9 (steps) and the third beat of placeValue4Digit (chips).
    type NavHere = { beat: string; index: number; selected: number | null; preview: string | null; paused: boolean; status: string; caption: string; position: string; panel: boolean; forwardDisabled: boolean | null; backDisabled: boolean | null; chips: Array<{ tag: string; reached: boolean; disabled: boolean; at: boolean }>; now: number; lineStarts: number; navPreview: { beatId: string; stage: string; line: string | null } | null; lineEnd: Record<string, string> };
    const navHere = () => evaluate<NavHere>(page, `(() => { const el = document.querySelector('.lesson-screen'); const d = el ? el.dataset : {}; const p = document.querySelector('[data-testid="playback-panel"]'); const f = p && p.querySelector('[data-testid="nav-forward"]'); const b = p && p.querySelector('[data-testid="nav-back"]'); return { beat: d.beatId ?? '—', index: Number(d.beatIndex ?? -1), selected: d.selectedIndex === undefined ? null : Number(d.selectedIndex), preview: d.previewBeat ?? null, paused: !!el && el.hasAttribute('data-paused'), status: d.status ?? '—', caption: (document.querySelector('[data-testid="caption"]')?.textContent ?? '').trim(), position: (p && p.querySelector('[data-testid="nav-position"]')?.textContent || '').trim(), panel: !!p, forwardDisabled: f ? f.disabled : null, backDisabled: b ? b.disabled : null, chips: p ? [...p.querySelectorAll('[data-testid="nav-concept"]')].map((c) => ({ tag: c.getAttribute('data-concept'), reached: c.hasAttribute('data-reached'), disabled: c.disabled, at: c.hasAttribute('data-at') })) : [], now: performance.now(), lineStarts: window.__lineStartCount ?? 0, navPreview: window.__navPreview ?? null, lineEnd: window.__lineEndStages ?? {} }; })()`);
    /** The lines started after line number `from` (window.__lineStarts is numbered; the list itself is capped). */
    const lineStartsSince = (from: number) => evaluate<Array<{ beatId: string; via: string }>>(page, `(window.__lineStarts ?? []).filter((l) => l.n > ${from})`);
    /** Where two board descriptions part ways, for a failure line that can be read. */
    const divergence = (a: string, b: string) => {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i += 1;
      return `…${JSON.stringify(a.slice(Math.max(0, i - 12), i + 48))} vs …${JSON.stringify(b.slice(Math.max(0, i - 12), i + 48))}`;
    };
    const idOf = (index: number) => ((script?.beats ?? []) as Array<{ id: string }>)[index]?.id ?? `#${index}`;
    const shortId = (id: string) => id.replace(/^authored:/u, "");
    const openPanel = async () => {
      await tapSelector(ariaSel("session.pause"));
      await waitFor(`!!document.querySelector('[data-testid="playback-panel"]')`, 3000);
      await wait(300);
    };
    /** After ▶: play on (answering any question the replay asks, off the record) until the lesson is back at `index`. */
    const playBackTo = async (index: number, ms = 150_000) => {
      const answeredHere = new Set<string>();
      const until = Date.now() + ms;
      let h = await navHere();
      while (Date.now() < until && !(h.index >= index && h.status === "teaching" && !h.paused)) {
        const snapNow = await snapshot();
        if (snapNow.status === "turn" && snapNow.yourTurn && !snapNow.yourTurn.startsWith("soft") && !answeredHere.has(snapNow.beatId)) {
          answeredHere.add(snapNow.beatId);
          await wait(500);
          await answer(snapNow);
        } else if (snapNow.status === "pausing" && snapNow.yourTurn?.startsWith("soft")) {
          await tapSelector('[data-soft-tap]');
        }
        await wait(250);
        h = await navHere();
      }
      return h;
    };
    /** A database read that says so when it fails (a transient Supabase error read as "0 rows" once failed a drill). */
    const masteryRows = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const { count, error } = await supabaseAdmin.from("child_progress").select("*", { count: "exact", head: true }).eq("child_id", childA!);
        if (!error && count !== null) return count;
        console.log(`      (child_progress read failed: ${error?.message ?? "no count"} — retrying)`);
        await wait(1000);
      }
      return -1;
    };

    if (short === "readWrite4Digit:9" && !drillDone.has("nav") && snap.status === "teaching" && childA) {
      drillDone.add("nav");
      const start = await navHere();
      const origin = start.index;
      const masteryBefore = await masteryRows();
      // (a) ⏸ opens the panel; at the furthest beat ⏭ is disabled; a concept not reached yet is shown and cannot be chosen.
      await openPanel();
      const opened = await navHere();
      const unreached = opened.chips.find((c) => !c.reached);
      if (unreached) await tapSelector(`[data-testid="nav-concept"][data-concept="${unreached.tag}"]`);
      await wait(500);
      const afterUnreached = await navHere();
      await shoot(snap.beatId, "-drill-panel-open");
      const unreachedOk = opened.panel && opened.paused && !!unreached && unreached.disabled && afterUnreached.selected === null && afterUnreached.paused;
      drillNote("an unreached concept chip is not selectable", unreachedOk, `panel ${opened.panel ? "up" : "MISSING"} (paused ${opened.paused ? "yes" : "NO"}) · chips ${opened.chips.map((c) => `${c.tag}${c.reached ? "" : " (unreached)"}${c.disabled ? " disabled" : ""}`).join(", ")} · tapped ${unreached ? unreached.tag : "— (none unreached)"} → selection ${afterUnreached.selected === null ? "unchanged" : `MOVED to ${afterUnreached.selected}`}, ${afterUnreached.paused ? "still paused" : "RESUMED"}`);
      drillNote("⏭ stops at the furthest reached", opened.forwardDisabled === true, `at ${shortId(opened.beat)} (index ${opened.index}, the furthest) ⏭ ${opened.forwardDisabled ? "disabled" : "ENABLED"}`);
      // (b) a rapid double-tap on ⏮ (two touches 80 ms apart): exactly one step, no clip started.
      const markDouble = opened.now;
      const back = await centre('[data-testid="nav-back"]');
      if (back) {
        await tap(back.x, back.y);
        await wait(30);
        await tap(back.x, back.y);
      }
      await wait(600);
      const doubled = await navHere();
      const doubledHeard = await heard(markDouble, doubled.now);
      const refused = await evaluate<Array<{ control: string; why: string }>>(page, `(window.__singleFire?.refused ?? []).slice(-3)`);
      const doubleOk = doubled.selected === origin - 1 && doubled.paused && doubledHeard.sounding.length === 0 && doubled.preview === idOf(origin - 1);
      drillNote("rapid double-tap on ⏮ produces exactly one step and no audio", doubleOk, `two touches 80 ms apart on ⏮ → selected ${doubled.selected} (expected ${origin - 1}: ${shortId(idOf(origin - 1))}) · ${doubled.paused ? "still paused" : "RESUMED"} · heard: ${heardText(doubledHeard)} · the guard refused: ${refused.map((r) => `${r.control} (${r.why})`).join(", ") || "nothing"}`);
      // (c) five taps on ⏮, 400 ms apart: exactly five beats back, silent — its board and its line shown, no clip, peak 0.
      const beforeFive = await navHere();
      const trail: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        await tapSelector('[data-testid="nav-back"]');
        await wait(400);
        const h = await navHere();
        trail.push(`${h.selected}`);
      }
      const five = await navHere();
      const fiveHeard = await heard(beforeFive.now, five.now);
      const target = origin - 6;
      const fiveBoard = five.navPreview?.stage ?? "";
      const fiveRef = five.lineEnd[idOf(target)] ?? null;
      await shoot(idOf(target), "-drill-five-back");
      const fiveOk = five.selected === target && five.paused && fiveHeard.sounding.length === 0 && five.preview === idOf(target) && !!five.caption && five.caption === (five.navPreview?.line ?? "").trim() && (fiveRef === null || fiveBoard === fiveRef);
      drillNote("five taps on ⏮ move exactly five beats with peak audible clips 0", fiveOk, `selected ${beforeFive.selected} → ${trail.join(" → ")} (expected ${target}: ${shortId(idOf(target))}) · ${five.paused ? "still paused" : "RESUMED"} · heard: ${heardText(fiveHeard)} · position "${five.position}" · caption "${five.caption.slice(0, 40)}" · board ${fiveRef === null ? `(no line-end record) "${fiveBoard.slice(0, 50)}"` : fiveBoard === fiveRef ? `matches its line end ("${fiveBoard.slice(0, 50)}")` : `DIFFERS: ${divergence(fiveBoard, fiveRef)}`}`);
      // (d) ▶ දිගටම: the selected beat's line is the first thing heard; then the lesson plays back up to where it was
      // (answering again, off the record) — peak audible 1 over the whole of it, mastery unchanged, one NAV row.
      const beforeResume = await navHere();
      const startsBefore = beforeResume.lineStarts;
      await tapSelector('[data-testid="nav-resume"]');
      let firstLine: { beatId: string; via: string } | null = null;
      for (let i = 0; i < 60 && !firstLine; i += 1) {
        await wait(150);
        firstLine = (await lineStartsSince(startsBefore))[0] ?? null;
      }
      const afterResume = await navHere();
      const back6 = await playBackTo(origin);
      const back6Heard = await heard(beforeResume.now, back6.now);
      const played = await lineStartsSince(startsBefore);
      const masteryAfter = await masteryRows();
      let navRows: unknown[] | null = null;
      for (let attempt = 0; attempt < 4 && !navRows?.length; attempt += 1) {
        const { data, error } = await supabaseAdmin.from("session_log").select("beat_id, planner_decision").eq("child_id", childA).eq("beat_type", "NAV").order("sequence", { ascending: false }).limit(1);
        if (error) console.log(`      (NAV row read failed: ${error.message} — retrying)`);
        navRows = data;
        if (!navRows?.length) await wait(1000);
      }
      const navRow = (navRows ?? [])[0] as { beat_id: string; planner_decision: { from?: string; to?: string; steps?: number } } | undefined;
      // The first clip that REALLY sounded after ▶ is the selected beat's (its label is the beat id).
      const resumeOk = firstLine?.beatId === idOf(target) && back6Heard.sounding[0]?.label === idOf(target) && !afterResume.paused && !afterResume.panel;
      drillNote("resume plays only the selected beat's clip", resumeOk, `▶ ${copy("edge.paused.resume")} → panel ${afterResume.panel ? "STILL UP" : "closed"}, ${afterResume.paused ? "STILL PAUSED" : "playing"} · the first line after ▶: ${firstLine ? `${shortId(firstLine.beatId)} (${firstLine.via})` : "NONE in 9 s"} (selected ${shortId(idOf(target))}) · the first clip heard: ${back6Heard.sounding[0] ? shortId(back6Heard.sounding[0].label ?? back6Heard.sounding[0].stream) : "none"}`);
      const back6Ok = resumeOk && back6.index >= origin && back6Heard.maxConcurrent === 1 && masteryAfter === masteryBefore && navRow?.beat_id === "nav:back" && navRow.planner_decision.steps === 6;
      drillNote("step back 6 beats then resume — peak audible 1 throughout", back6Ok, `back to ${shortId(back6.beat)} (index ${back6.index} ≥ ${origin} ${back6.index >= origin ? "yes" : "NO"}) · lines played in order: ${played.map((l) => shortId(l.beatId)).join(" → ")} · heard: ${heardText(back6Heard)} · child_progress ${masteryBefore} → ${masteryAfter} · NAV row ${navRow ? `${navRow.beat_id} ${shortId(navRow.planner_decision.from ?? "?")} → ${shortId(navRow.planner_decision.to ?? "?")}, ${navRow.planner_decision.steps} steps` : "NONE"}`);
      navTrace.push(`steps at ${short}: ${[doubleOk, fiveOk, resumeOk, back6Ok].every(Boolean) ? "ok" : "FAILED"} — double-tap → ${doubled.selected}; five taps → ${trail.join(",")}; ▶ → ${played.map((l) => shortId(l.beatId)).join(" → ")}; real peak ${back6Heard.maxConcurrent}`);
    }
    const indexNow = Number((await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatIndex ?? '-1'`)) ?? -1);
    const pvFirst = ((script?.beats ?? []) as unknown as Array<{ id: string; conceptTag: string }>).findIndex((b) => b.conceptTag === "placeValue4Digit");
    if (!drillDone.has("chips") && pvFirst >= 0 && indexNow >= pvFirst + 2 && snap.status === "teaching" && childA) {
      drillDone.add("chips");
      const origin = indexNow;
      const rwFirst = ((script?.beats ?? []) as unknown as Array<{ conceptTag: string }>).findIndex((b) => b.conceptTag === "readWrite4Digit");
      await openPanel();
      const opened = await navHere();
      // (a) the readWrite4Digit chip: its first beat, its board as its line ended, silent (nothing may sound from ⏸ on).
      await tapSelector('[data-testid="nav-concept"][data-concept="readWrite4Digit"]');
      await wait(500);
      const toRw = await navHere();
      await shoot(idOf(rwFirst), "-drill-chip-readWrite");
      const rwRef = toRw.lineEnd[idOf(rwFirst)] ?? null;
      const rwOk = toRw.selected === rwFirst && toRw.preview === idOf(rwFirst) && toRw.paused && (rwRef === null ? false : toRw.navPreview?.stage === rwRef);
      // (b) the placeValue4Digit chip: back to this concept's first beat.
      await tapSelector('[data-testid="nav-concept"][data-concept="placeValue4Digit"]');
      await wait(500);
      const toPv = await navHere();
      const pvRef = toPv.lineEnd[idOf(pvFirst)] ?? null;
      const pvOk = toPv.selected === pvFirst && toPv.preview === idOf(pvFirst) && toPv.paused && (pvRef === null ? false : toPv.navPreview?.stage === pvRef);
      const chipsHeard = await heard(opened.now, toPv.now);
      const silent = chipsHeard.sounding.length === 0;
      drillNote("tapping a concept chip lands on that concept's first beat with the board matching", rwOk && pvOk && silent, `chips ${opened.chips.map((c) => `${c.tag}${c.reached ? "" : " (unreached)"}`).join(", ")} · readWrite4Digit → selected ${toRw.selected} (${shortId(toRw.preview ?? "—")}, expected ${shortId(idOf(rwFirst))}), "${toRw.position}", board ${rwRef === null ? "NO line-end record" : toRw.navPreview?.stage === rwRef ? "matches its line end" : `DIFFERS: ${divergence(toRw.navPreview?.stage ?? "", rwRef)}`} · placeValue4Digit → selected ${toPv.selected} (${shortId(toPv.preview ?? "—")}, expected ${shortId(idOf(pvFirst))}), "${toPv.position}", board ${pvRef === null ? "NO line-end record" : toPv.navPreview?.stage === pvRef ? "matches its line end" : `DIFFERS: ${divergence(toPv.navPreview?.stage ?? "", pvRef)}`} · heard: ${heardText(chipsHeard)}`);
      // (c) 🔊 ආයෙත් අහන්න: the selected line once, the lesson still paused after it.
      const startsBeforeListen = toPv.lineStarts;
      const markListen = await pageNow();
      await tapSelector('[data-testid="nav-listen"]');
      let listened: Array<{ beatId: string; via: string }> = [];
      for (let i = 0; i < 80; i += 1) {
        await wait(250);
        listened = await lineStartsSince(startsBeforeListen);
        if (listened.length && (await heard(markListen)).soundingAtEnd === 0) break;
      }
      await wait(800);
      const afterListen = await navHere();
      const listenHeard = await heard(markListen, afterListen.now);
      drillNote("🔊 plays the selected beat's line once; the lesson stays paused", listened.length === 1 && listened[0]!.beatId === idOf(pvFirst) && listened[0]!.via === "listen" && afterListen.paused && afterListen.panel && listenHeard.sounding.length === 1 && listenHeard.maxConcurrent === 1, `lines started: ${listened.map((l) => `${shortId(l.beatId)} (${l.via})`).join(", ") || "none"} · after it: ${afterListen.paused ? "paused" : "RESUMED"}, panel ${afterListen.panel ? "up" : "GONE"} · heard: ${heardText(listenHeard)}`);
      // (d) ▶ දිගටම from the chip's beat, back up to where the drill began.
      const startsBefore = afterListen.lineStarts;
      const markChipResume = await pageNow();
      await tapSelector('[data-testid="nav-resume"]');
      // The screen names the beat the driver is on; until the selected beat's line starts it still names the old one.
      let firstLine: { beatId: string; via: string } | null = null;
      for (let i = 0; i < 60 && !firstLine; i += 1) {
        await wait(150);
        firstLine = (await lineStartsSince(startsBefore))[0] ?? null;
      }
      const home = await playBackTo(origin);
      const played = await lineStartsSince(startsBefore);
      const homeHeard = await heard(markChipResume, home.now);
      const chipResumeOk = firstLine?.beatId === idOf(pvFirst) && played[0]?.beatId === idOf(pvFirst) && homeHeard.sounding[0]?.label === idOf(pvFirst) && home.index >= origin && homeHeard.maxConcurrent === 1;
      drillNote("resume from a concept chip plays from its first beat — peak audible 1", chipResumeOk, `▶ → lines: ${played.map((l) => shortId(l.beatId)).join(" → ")} · back at ${shortId(home.beat)} (index ${home.index} ≥ ${origin} ${home.index >= origin ? "yes" : "NO"}) · heard: ${heardText(homeHeard)}`);
      navTrace.push(`chips at ${short}: ${rwOk && pvOk && silent && chipResumeOk ? "ok" : "FAILED"} — readWrite4Digit → ${toRw.selected}, placeValue4Digit → ${toPv.selected}; 🔊 ${listenHeard.sounding.length} clip(s); ▶ → ${played.map((l) => shortId(l.beatId)).join(" → ")}; real peak ${homeHeard.maxConcurrent}`);
    }
    // 3b. Zara is not a control: ten taps on her portrait change nothing and
    // start no audio. And three rapid ↺ taps ask ONCE; cancelling changes nothing.
    if (short === "readWrite4Digit:12" && !drillDone.has("audio") && snap.status === "teaching") {
      drillDone.add("audio");
      const portrait = await evaluate<{ role: string | null; cursor: string; label: string | null }>(page, `(() => { const el = document.querySelector('[data-testid="zara-portrait"]'); return el ? { role: el.getAttribute("role"), cursor: getComputedStyle(el).cursor, label: el.getAttribute("aria-label") } : { role: "MISSING", cursor: "", label: null }; })()`);
      const beforeTaps = await evaluate<{ beat: string; status: string; at: number }>(page, `(() => { const el = document.querySelector('.lesson-screen'); return { beat: el?.dataset.beatId ?? '—', status: el?.dataset.status ?? '—', at: performance.now() }; })()`);
      for (let i = 0; i < 10; i += 1) {
        await tapSelector('[data-testid="zara-portrait"]');
        await wait(60);
      }
      await wait(1200);
      const afterTaps = await evaluate<{ beat: string; status: string; at: number; sheet: boolean }>(page, `(() => { const el = document.querySelector('.lesson-screen'); return { beat: el?.dataset.beatId ?? '—', status: el?.dataset.status ?? '—', at: performance.now(), sheet: !!document.querySelector('[data-testid="confirm-sheet"]') }; })()`);
      const tapsHeard = await heard(beforeTaps.at, afterTaps.at);
      const inert = portrait.role === null && portrait.label === null && portrait.cursor !== "pointer" && afterTaps.beat === beforeTaps.beat && afterTaps.status === beforeTaps.status && tapsHeard.starts.length === 0 && !afterTaps.sheet && tapsHeard.maxConcurrent <= 1;
      const portraitTrace = `10 portrait taps → beat ${afterTaps.beat === beforeTaps.beat ? "unchanged" : `CHANGED to ${afterTaps.beat}`}, status ${afterTaps.status === beforeTaps.status ? `unchanged (${afterTaps.status})` : `CHANGED to ${afterTaps.status}`}, clips started by the taps ${tapsHeard.starts.length}, heard: ${heardText(tapsHeard)} · the portrait has role ${portrait.role ?? "none"}, aria-label ${portrait.label ?? "none"}, cursor ${portrait.cursor}`;
      drillNote("Zara's portrait is not a control: ten taps change nothing and start no audio", inert, portraitTrace);
      for (let i = 0; i < 3; i += 1) {
        await tapSelector(ariaSel("detail.restart"));
        await wait(90);
      }
      await wait(600);
      const sheets = await evaluate<number>(page, `document.querySelectorAll('[data-testid="confirm-sheet"]').length`);
      /**
       * THE QUESTION HOLDS THE LESSON (20 Sep 2026).
       *
       * What this drill has to prove is that the board the child comes BACK
       * to is the board they left: while the sheet is up the lesson is
       * frozen — no beat change, no choreography, no new clip — and cancel
       * puts them back on that same beat rather than restarting.
       *
       * It used to compare the beat 900 ms AFTER cancel with the beat before
       * it, which no correct build could ever pass: cancel is "දිගටම" —
       * carry on — so the lesson resumes and plays, and 900 ms later it is
       * legitimately somewhere else. The real thing to measure is the hold
       * itself, before the tap, and the beat cancel lands on.
       */
      const heldFrom = await evaluate<{ beat: string; events: number; at: number }>(page, `(() => { const el = document.querySelector('.lesson-screen'); return { beat: el?.dataset.beatId ?? '—', events: (window.__choreoLog ?? []).length, at: performance.now() }; })()`);
      await wait(3000);
      const heldTo = await evaluate<{ beat: string; events: number; at: number; paused: boolean; pausedCard: boolean }>(page, `(() => { const el = document.querySelector('.lesson-screen'); return { beat: el?.dataset.beatId ?? '—', events: (window.__choreoLog ?? []).length, at: performance.now(), paused: el?.hasAttribute('data-paused') ?? false, pausedCard: !!document.querySelector('[data-edge="paused"]') }; })()`);
      // Held means silent: nothing may really sound while the question is up (the line she was saying is frozen).
      const heldHeard = await heard(heldFrom.at, heldTo.at);
      const frozen = heldTo.beat === heldFrom.beat && heldTo.events === heldFrom.events && heldHeard.sounding.length === 0;
      await tapSelector('[data-testid="confirm-no"]');
      await wait(900);
      const afterCancel = await evaluate<{ beat: string; sheet: boolean; status: string }>(page, `(() => { const el = document.querySelector('.lesson-screen'); return { beat: el?.dataset.beatId ?? '—', sheet: !!document.querySelector('[data-testid="confirm-sheet"]'), status: el?.dataset.status ?? '—' }; })()`);
      // Carrying on means the lesson went ON from where it was held, never back to the start.
      const restarted = /:(0|1)$/u.test(afterCancel.beat) || afterCancel.beat.includes("opening:");
      const detail =
        `3 ↺ taps → ${sheets} confirm sheet(s) · held at ${heldFrom.beat.replace(/^authored:/u, "")} for 3 s: ` +
        `${heldTo.paused ? "held" : "NOT HELD"}, ${frozen ? "frozen (beat, choreography and clips all unchanged)" : `NOT frozen — beat ${heldTo.beat === heldFrom.beat ? "unchanged" : `→ ${heldTo.beat}`}, events ${heldFrom.events} → ${heldTo.events}, heard: ${heardText(heldHeard)}`}` +
        ` · no paused card under the sheet: ${heldTo.pausedCard ? "NO — one is mounted" : "yes"}` +
        ` · cancel → ${afterCancel.beat.replace(/^authored:/u, "")}, sheet ${afterCancel.sheet ? "STILL UP" : "gone"}, status ${afterCancel.status}, restarted ${restarted ? "YES" : "no"}`;
      replayTrace = `${portraitTrace} · ${detail}`;
      drillNote("three ↺ taps are one question; the lesson is held under it and carries on after cancel", sheets === 1 && heldTo.paused && frozen && !heldTo.pausedCard && !afterCancel.sheet && !restarted, detail);
    }
    // 4. A clip that cannot be fetched: :6's line is read on the board and its events still run. The
    //    runtime preloads the next three clips, so the door is shut at :4 — :6 is the first beat whose
    //    clip is fetched behind it (:4a, :5, :5a were already in hand).
    if (short === "readWrite4Digit:4" && !drillDone.has("clip")) {
      drillDone.add("clip");
      await page.send("Network.enable");
      await page.send("Network.setBlockedURLs", { urls: ["*/api/clip/*", "*/api/speak-line*"] });
    }
    if (drillDone.has("clip") && !drillDone.has("clip-checked") && short === "readWrite4Digit:6") {
      drillDone.add("clip-checked");
      await wait(100);
      const caption = await evaluate<string>(page, `(document.querySelector('[data-testid="caption"]')?.textContent ?? '').trim()`);
      const choreo = await evaluate<{ fired: number; sentences: number } | null>(page, `window.__choreo ?? null`);
      await shoot(snap.beatId, "-drill-missing-clip");
      await page.send("Network.setBlockedURLs", { urls: [] });
      const estimatedHere = (await evaluate<boolean>(page, `(window.__choreoLog ?? []).some((e) => e.beatId === ${JSON.stringify(snap.beatId)} && e.estimated)`));
      drillNote("missing clip", caption.startsWith("📖") && estimatedHere, `caption "${caption.slice(0, 48)}" · events on estimated spans ${estimatedHere ? "yes" : "NO"} (${choreo?.fired ?? 0}/${choreo?.sentences ?? 0} fired)`);
    }
  };

  /** The most recent question with an expected answer — a re-ask after a miss can begin before the beat id catches up. */
  let lastAskedId: string | null = null;
  /** The child answers on the board: the surface first, the pad as the fallback. */
  const answer = async (snap: Snapshot) => {
    // The silence ladder's nudges (:wait, :help) re-open the SAME question;
    // a retry after a miss listens again while the screen still names the
    // feedback or reteach beat — the question is the last one asked.
    let questionId = snap.beatId.replace(/:(wait|help|reask)$/u, "");
    if (snap.yourTurn && !snap.yourTurn.startsWith("soft") && !expectedById.get(questionId)?.expectedAnswer && lastAskedId) questionId = lastAskedId;
    const beat = expectedById.get(questionId);
    if (beat?.expectedAnswer) {
      lastAskedId = questionId;
      asksOf.set(questionId, (asksOf.get(questionId) ?? 0) + 1);
    }
    const [kind, surface, touch] = (snap.yourTurn ?? "").split(":");
    if (kind === "soft") {
      const tapped = (await tapSelector('[data-soft-tap]')) || (await tapSelector('[data-testid="lesson-board"]'));
      note({ beatId: snap.beatId, via: tapped ? "tap on the board" : "no surface", answer: "(tapped)" });
      return;
    }
    const expected = beat?.expectedAnswer ?? "";
    const [, , , mode] = (snap.yourTurn ?? "").split(":");
    const turn = snap.yourTurn ?? "";
    // A chip on the foot of the board: the correct one, or a wrong one on purpose.
    const chipsUp = turn.includes(":chips") && beat?.choices;
    const wrongHere = WRONG_BEAT !== null && questionId === WRONG_BEAT;
    // valueOrPlace with the abacus up: tap the rod that shows the answer (the wrong rod, when wrong on purpose).
    if (turn.includes(":rod-") && !wrongHere) {
      const rodKind = turn.includes(":rod-count") ? "count" : "value";
      const rod = await evaluate<number | null>(page, `(() => { const ab = document.querySelector('[data-testid="abacus"]'); if (!ab) return null; const rods = [...ab.querySelectorAll('[data-rod]')]; const digits = (ab.getAttribute('data-number') || '').split('').map(Number); const want = ${JSON.stringify(expected)}; const value = (i) => ${rodKind === "count" ? "String(digits[i])" : "String(digits[i] * Math.pow(10, digits.length - 1 - i))"}; const names = ${JSON.stringify(Object.fromEntries([...NAME_TO_NUMBER.entries()].filter(([, n]) => n <= 10000).map(([k, n]) => [k, String(n)])))}; const wantDigits = /\d/.test(want) ? want.replace(/\D/g, '') : (names[want.replace(/\s/g, '')] ?? want); const i = rods.findIndex((_, i) => value(i) === wantDigits); return i >= 0 ? i : null; })()`);
      if (rod !== null && (await tapSelector(`[data-testid="abacus-rod-${rod}"]`))) {
        note({ beatId: snap.beatId, via: `rod tap (${rodKind}, ${mode})`, answer: expected });
        return;
      }
    }
    if (chipsUp) {
      const index = wrongHere ? (beat!.choices!.correctIndex + 1) % beat!.choices!.options.length : beat!.choices!.correctIndex;
      if (await tapSelector(`[data-testid="turn-choice"][data-chip="${index}"]`)) {
        note({ beatId: snap.beatId, via: `chip tap (${mode})${wrongHere ? " WRONG on purpose" : ""}`, answer: beat!.choices!.options[index]! });
        return;
      }
    }
    if (beat?.answerChoices && beat.answerChoices.length >= 2) {
      const ok = await evaluate<boolean>(page, `(() => { const b = [...document.querySelectorAll('[data-testid="turn-choice"]')].find((el) => el.textContent.trim() === ${JSON.stringify(expected)}); if (!b) return false; b.click(); return true; })()`);
      note({ beatId: snap.beatId, via: ok ? "choice button" : "no choice button", answer: expected });
      return;
    }
    let digits = expected.replace(/\D/gu, "");
    if (expected.startsWith("{")) {
      try {
        // An open build: a DIFFERENT permutation each time this hand is asked (the puzzle wants five distinct numbers).
        const hand = JSON.parse(expected).digits as number[];
        const nth = handBuilds.get(hand.join("")) ?? 0;
        handBuilds.set(hand.join(""), nth + 1);
        const rotated = [...hand.slice(nth % hand.length), ...hand.slice(0, nth % hand.length)];
        digits = (nth >= hand.length ? [...rotated].reverse() : rotated).join("");
      } catch {
        digits = "";
      }
    } else if (!/\d/u.test(expected)) {
      const named = NAME_TO_NUMBER.get(expected.replace(/\s/gu, ""));
      digits = named === undefined ? "" : String(named);
    }
    if (!digits) {
      note({ beatId: snap.beatId, via: `nothing tappable for "${expected.slice(0, 24)}" (question ${questionId.replace(/^authored:/u, "")}: ${expectedById.has(questionId) ? `known, expected "${(expectedById.get(questionId)?.expectedAnswer ?? "").slice(0, 16)}"` : `NOT in the ${expectedById.size}-beat script`})`, answer: "" });
      return;
    }
    const wrong = WRONG_BEAT !== null && questionId === WRONG_BEAT;
    if (wrong) {
      // The last digit changed: a near miss, as a child makes.
      const last = Number(digits[digits.length - 1]);
      digits = `${digits.slice(0, -1)}${(last + 1) % 10}`;
      if (surface === "numberCards" && touch === "touch") {
        const other = await evaluate<string | null>(page, `(() => { const cards = [...document.querySelectorAll('[data-card]')]; const c = cards.find((el) => el.getAttribute('data-card') !== ${JSON.stringify(expected.replace(/\D/gu, ""))}); return c ? c.getAttribute('data-card') : null; })()`);
        if (other && (await tapSelector(`[data-card="${other}"]`))) {
          note({ beatId: snap.beatId, via: "card tap (WRONG on purpose)", answer: other });
          return;
        }
      }
    }
    if (surface === "numberCards" && touch === "touch") {
      const tapped = await tapSelector(`[data-card="${digits}"]`);
      if (tapped) {
        note({ beatId: snap.beatId, via: "card tap", answer: digits });
        return;
      }
    }
    if (surface === "digitPicker" && touch === "touch") {
      // Tap the tiles in the expected order, then commit.
      for (const digit of digits) {
        const ok = await evaluate<boolean>(page, `(() => { const tile = [...document.querySelectorAll('[data-testid^="picker-tile-"]')].find((el) => el.getAttribute('aria-label')?.startsWith(${JSON.stringify(digit)}) && el.getAttribute('role') === 'button'); if (!tile) return false; tile.click(); return true; })()`);
        if (!ok) break;
        await wait(250);
      }
      await wait(300);
      const placed = await evaluate<number>(page, `document.querySelectorAll('[data-testid^="picker-slot-"] .hand-number').length`);
      const committed = await tapSelector('[data-testid="turn-commit"]');
      if (committed) {
        let taken = false;
        for (let i = 0; i < 12 && !taken; i += 1) {
          await wait(250);
          taken = (await snapshot()).status !== "turn";
        }
        if (!taken) await evaluate(page, `document.querySelector('[data-testid="turn-commit"]')?.click(); true`);
        note({ beatId: snap.beatId, via: `${placed} tiles placed + ✓ ${taken ? "(touch)" : "(touch ignored — clicked)"}`, answer: digits });
        return;
      }
      note({ beatId: snap.beatId, via: `${placed} tiles placed, no ✓`, answer: digits });
    }
    if (surface === "blankTable" && touch === "touch") {
      const cell = await tapSelector('[data-testid^="cell-"][data-active]');
      if (cell) {
        await wait(400);
        // A number's NAME: the word bank — its words tapped in order, then ✓.
        const bankUp = await evaluate<boolean>(page, `!!document.querySelector('[data-testid="word-bank"]')`);
        if (bankUp) {
          const words = expected.split(/\s+/u).filter(Boolean);
          let placed = 0;
          for (const word of words) {
            const ok = await tapSelector(`[data-testid="word-tile"][data-word="${word}"]:not([data-used])`);
            if (ok) placed += 1;
            await wait(120);
          }
          await clickSelector('[data-testid="word-bank-done"]');
          note({ beatId: snap.beatId, via: `word bank (${placed}/${words.length} tiles)`, answer: expected });
          return;
        }
        for (const digit of digits) {
          await evaluate(page, `(() => { const k = [...document.querySelectorAll('[data-testid="number-pad"] button')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(digit)}); k && k.click(); return true; })()`);
          await wait(80);
        }
        await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[data-key="done"]'); k && k.click(); return true; })()`);
        note({ beatId: snap.beatId, via: "table cell + pad", answer: digits });
        return;
      }
    }
    if (surface === "expansion" && touch === "touch") {
      const part = await tapSelector('[data-testid^="expansion-part-"][role="button"]');
      if (part) {
        await wait(400);
        for (const digit of digits) {
          await evaluate(page, `(() => { const k = [...document.querySelectorAll('[data-testid="number-pad"] button')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(digit)}); k && k.click(); return true; })()`);
          await wait(80);
        }
        await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[data-key="done"]'); k && k.click(); return true; })()`);
        note({ beatId: snap.beatId, via: "expansion blank + pad", answer: digits });
        return;
      }
    }
    // The fallback: the pad behind 🔢.
    const opened = await tapSelector('[data-testid="turn-pad-toggle"]');
    if (!opened) {
      note({ beatId: snap.beatId, via: "no pad", answer: digits });
      return;
    }
    await wait(400);
    for (const digit of digits) {
      await evaluate(page, `(() => { const k = [...document.querySelectorAll('[data-testid="number-pad"] button')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(digit)}); k && k.click(); return true; })()`);
      await wait(80);
    }
    await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[data-key="done"]'); k && k.click(); return true; })()`);
    note({ beatId: snap.beatId, via: wrong ? "number pad (WRONG on purpose)" : "number pad", answer: digits });
  };

  const buildSeen = await evaluate<{ page: string; server: string }>(page, `(async () => ({ page: document.querySelector('meta[name="ss-build"]')?.getAttribute('content') ?? '?', server: await fetch("/api/build", { cache: "no-store" }).then((r) => r.json()).then((j) => j.sha).catch(() => "?") }))()`).catch(() => ({ page: "?", server: "?" }));
  console.log(`build under test: page ${buildSeen.page} · server ${buildSeen.server}${buildSeen.page === buildSeen.server ? "" : " — MISMATCH (a stale page)"}`);
  console.log(`session-1 run: ${BASE} · mobile ${VIEW_W}×${VIEW_H} ${SCHEME} · up to ${MAX_MINUTES} min`);
  let done = false;
  if (FROM_BEAT) {
    let jumped = false;
    for (let i = 0; i < 80 && !jumped; i += 1) {
      jumped = await evaluate<boolean>(page, `(() => { const d = window.__dev; if (!d || !d.jump || !document.querySelector('.lesson-screen')) return false; d.jump(0, ${JSON.stringify(FROM_BEAT)}); return true; })()`).catch(() => false);
      if (!jumped) await wait(250);
    }
    console.log(`  --from: ${jumped ? `jumped to ${FROM_BEAT}` : "window.__dev.jump is not installed (DEV_MODE off?) — running from the start"}`);
  }
  while (Date.now() - started < MAX_MINUTES * 60_000) {
    const snap = await snapshot();
    if (snap.beatId !== lastBeat && snap.beatId !== "—") {
      lastBeat = snap.beatId;
      // Let the beat's first events land, then photograph and audit it.
      await wait(900);
      await shoot(snap.beatId);
      const audit = await evaluate<Audit>(page, AUDIT_JS);
      audits.push({ beatId: snap.beatId, audit });
      {
        type Probe = { textOverlaps: Array<{ a: string; b: string; area: number }>; marks: Array<{ kind: string; insideTarget: number; hits: string[] }>; pointer: { hits: string[] }; ok: boolean };
        const probe = (await evaluate<Probe[]>(page, `window.__boardLayout ? window.__boardLayout() : []`).catch(() => []))[0];
        if (probe) {
          overlapFrames += 1;
          if (!probe.ok) overlapFindings.push(`${snap.beatId.replace(/^authored:/u, "")}: ${[...probe.textOverlaps.map((o) => `"${o.a}" ∩ "${o.b}"`), ...probe.marks.filter((m) => m.insideTarget || m.hits.length).map((m) => `${m.kind}${m.insideTarget ? " crosses its target" : ""}${m.hits.length ? ` over ${m.hits.join(", ")}` : ""}`), ...(probe.pointer.hits.length ? [`pointer over ${probe.pointer.hits.join(", ")}`] : [])].join(" · ")}`);
        }
        if (/placeValue4Digit:(4[3-9]|5[0-2])(:|$)/u.test(snap.beatId)) {
          const rods = await evaluate<{ values: Array<{ text: string; rod: string | null }>; glow: string }>(page, `(() => ({ values: [...document.querySelectorAll('[data-testid="abacus-child-answer"]')].map((el) => ({ text: el.querySelector('[data-readable]')?.getAttribute('data-readable') ?? (el.textContent ?? '').trim(), rod: el.getAttribute('data-rod') })), glow: document.querySelector('[data-rods-discussed]')?.getAttribute('data-rods-discussed') ?? '' }))()`).catch(() => ({ values: [], glow: "" }));
          const ok = rods.values.length <= 1 && rods.values.every((v) => !rods.glow || v.rod === null || rods.glow.split(",").includes(v.rod));
          if (!ok) rodRunBad += 1;
          rodRun.push(`${snap.beatId.replace(/^authored:/u, "").padEnd(28)} rod under discussion: ${(rods.glow || "—").padEnd(4)} values on the abacus: ${rods.values.length ? rods.values.map((v) => `"${v.text}" under rod ${v.rod ?? "—"}`).join(", ") : "none"}${ok ? "" : "   ✗ STALE"}`);
        }
      }
      if (fpsSamples.length < 6 && /placeValue4Digit:(39|41|57)|readWrite4Digit:(1|12|22)$/u.test(snap.beatId)) {
        fpsSamples.push({ beatId: snap.beatId, fps: await sampleFps() });
      }
      const short = snap.beatId.replace(/^authored:/u, "");
      const captionNow = await evaluate<string>(page, `(document.querySelector('[data-testid="caption"]')?.textContent ?? '').trim()`).catch(() => "");
      if (captionNow) captionReads += 1;
      if (captionNow && /[{]|kind|permutation/iu.test(captionNow)) captionLeaks.push(`${short}: ${captionNow.slice(0, 80)}`);
      const flags = audit ? [audit.overlap ? `overlap ${audit.overlap}` : "", audit.portraitOverlap ? `PORTRAIT OVERLAP` : "", audit.cutOff ? `cut-off ${audit.cutOff}` : "", audit.small.length ? `small ${audit.small.length}` : "", audit.tinyText.length ? `tiny-text ${audit.tinyText.length}` : ""].filter(Boolean).join(" · ") : "";
      console.log(`  ${String(seq).padStart(3, "0")} ${short.padEnd(34)} ${snap.beatType.padEnd(12)} ${(snap.stage ?? "").slice(0, 48).padEnd(48)} ${flags}`);
      if (DRILLS) await drills(snap);
    }
    if (snap.status !== "turn" && snap.status !== "pausing") turnClosed = true;
    if (snap.status === "turn" && !snap.yourTurn) {
      const retry = await tapSelector('[data-testid="turn-retry"]');
      if (retry) {
        retryTaps += 1;
        console.log(`      ↻ tapped ${copy("common.retry")} on ${snap.beatId.replace(/^authored:/u, "")}`);
        await wait(400);
      }
    }
    // A soft check's pause: one tap counts as engagement. Reading practice: watch, never tap.
    if (snap.status === "pausing" && snap.yourTurn?.startsWith("soft") && snap.beatId !== lastTurnBeat) {
      lastTurnBeat = snap.beatId;
      if (DRILLS && !drillDone.has("soft-double")) {
        // TAP ANYWHERE TO CONTINUE, TAPPED TWICE (28 Sep 2026): the soft check's board acts on the touch itself. A fast
        // second touch that meets ANOTHER soft check used to skip it. So the drill makes the case happen: a second soft
        // check opens straight after this one (window.__dev.softChecksBackToBack — the board never stops being a soft
        // check), and two touches 80 ms apart must advance exactly one: the runtime receives one touch, one soft check
        // counts a tap, the guard refuses the second touch, and the second soft check is still open after it.
        drillDone.add("soft-double");
        type SoftCounts = { opened: number; tapped: number; touches: number; refused: number };
        const counts = () => evaluate<SoftCounts>(page, `({ opened: window.__softPauses?.opened ?? 0, tapped: window.__softPauses?.tapped ?? 0, touches: window.__softTouches ?? 0, refused: (window.__singleFire?.refused ?? []).length })`);
        const armed = await evaluate<boolean>(page, `!!(window.__dev && window.__dev.softChecksBackToBack && window.__dev.softChecksBackToBack(1))`);
        const before = await counts();
        const point = await centre('[data-soft-tap]');
        let gapMs = 0;
        let openAtSecond = false;
        if (point) {
          const firstAt = Date.now();
          await tap(point.x, point.y);
          await wait(Math.max(0, 80 - (Date.now() - firstAt) - 8));
          openAtSecond = await evaluate<boolean>(page, `!!document.querySelector('[data-tap-press]')`);
          gapMs = Date.now() - firstAt;
          await tap(point.x, point.y);
        }
        await wait(400);
        const after = await counts();
        const secondStillOpen = await evaluate<boolean>(page, `!!document.querySelector('[data-tap-press]')`);
        const refused = await evaluate<Array<{ control: string; why: string }>>(page, `(window.__singleFire?.refused ?? []).slice(${before.refused})`);
        const guarded = refused.some((r) => r.control === "soft-surface" && r.why === "too-soon");
        const ok = armed && !!point && openAtSecond && after.touches - before.touches === 1 && after.tapped - before.tapped === 1 && after.opened - before.opened === 1 && guarded && secondStillOpen;
        drillNote("two touches 80 ms apart on the soft check advance exactly one soft pause", ok, `at ${snap.beatId.replace(/^authored:/u, "")}, a second soft check armed straight after (${armed ? "yes" : "NO — no dev hook"}): two touches ${gapMs} ms apart, the second ${openAtSecond ? "met the second soft check open" : "found NO soft check open"} → touches the runtime received ${after.touches - before.touches} · soft checks advanced by a tap ${after.tapped - before.tapped} · soft checks opened ${after.opened - before.opened} · the second ${secondStillOpen ? "still open after both touches" : "CLOSED"} · the guard refused: ${refused.map((r) => `${r.control} (${r.why})`).join(", ") || "nothing"}`);
      } else {
        await tapSelector('[data-soft-tap]');
      }
      note({ beatId: snap.beatId, via: "tap on the board (soft pause)", answer: "(tapped)" });
    }
    if (snap.status === "turn" && snap.yourTurn && (snap.beatId !== lastTurnBeat || turnClosed)) {
      lastTurnBeat = snap.beatId;
      turnClosed = false;
      await wait(700);
      await shoot(snap.beatId, "-your-turn");
      const shortTurn = snap.beatId.replace(/^authored:/u, "");
      // A read-aloud: the chips ARE the question. The row it is about must be on
      // the board, the answer nowhere but the chips, and nothing of the removed
      // invitation left (no 🎤, no step cards).
      if (expectedById.get(snap.beatId)?.answerMode === "readAloud" && !practiceSeen.has(snap.beatId)) {
        practiceSeen.add(snap.beatId);
        const look = await practiceLook(expectedById.get(snap.beatId)?.expectedAnswer ?? "");
        practice.set(snap.beatId, { chipsAt: Date.now(), rowAtChips: look.row, ringAtChips: look.ring, leakAtChips: look.leak, cue: look.cue, steps: look.steps, captionsAfterTap: [], spokenMs: null });
        await shoot(snap.beatId, "-read-aloud-chips");
      }
      const record = practice.get(snap.beatId);
      if (DRILLS && shortTurn === "readWrite4Digit:8" && !drillDone.has("slow")) {
        // Cluster B, issue 16: a child who starts late — one digit at 11 s, another at 23 s — is never cut off.
        drillDone.add("slow");
        await tapSelector('[data-testid="turn-pad-toggle"]');
        await wait(400);
        const padUp = () => evaluate<{ pad: boolean; value: string; status: string; beat: string }>(page, `(() => { const el = document.querySelector('.lesson-screen'); return { pad: !!document.querySelector('[data-testid="number-pad"]'), value: (document.querySelector('[data-testid="number-pad-value"]')?.textContent ?? ''), status: el?.dataset.status ?? '—', beat: el?.dataset.beatId ?? '—' }; })()`);
        const key = (digit: string) => evaluate(page, `(() => { const k = [...document.querySelectorAll('[data-testid="number-pad"] button')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(digit)}); k && k.click(); return true; })()`);
        await wait(11_000);
        const at11 = await padUp();
        await key("1");
        await wait(12_000);
        const at23 = await padUp();
        await key("0");
        await wait(1500);
        const at24 = await padUp();
        const ok = at11.pad && at11.status === "turn" && at23.pad && at23.status === "turn" && at23.beat === snap.beatId && at23.value === "1" && at24.pad && at24.status === "turn" && at24.value === "10";
        drillNote("type at 11 s and 23 s: no auto-close, no demonstrate", ok, `pad at 11 s ${at11.pad ? "open" : "CLOSED"} (${at11.status}) · typed 1 · at 23 s ${at23.pad ? "open" : "CLOSED"} (${at23.status}, value "${at23.value}", beat ${at23.beat === snap.beatId ? "unchanged" : "CHANGED"}) · typed 0 · at 24.5 s ${at24.pad ? "open" : "CLOSED"} (value "${at24.value}")`);
        // THE PAD AT A HUMAN PACE AND AT A FAST PACE (23 Sep 2026, the director's demo): 1-0-0-0 with REAL touch events on the
        // same open pad. The pad used to cancel on a double-click, and two taps on one key inside the browser's double-tap
        // window are one — so "1000" closed the pad after "100" and lost the digits. The .click() the drill above uses never
        // produces a dblclick, which is why it never caught it. One tap = one digit, nothing closes, only ✓ submits.
        const keyTouch = (key: string) => tapSelector(`[data-testid="number-pad"] button[data-key="${key}"]`);
        const clearPad = async () => {
          for (let i = 0; i < 6; i += 1) {
            if (!(await padUp()).value) break;
            await keyTouch("backspace");
            await wait(120);
          }
        };
        const pace = async (delay: () => number) => {
          const trace: string[] = [];
          for (const digit of ["1", "0", "0", "0"]) {
            const hit = await keyTouch(digit);
            await wait(delay());
            const s = await padUp();
            trace.push(`${digit}${hit ? "" : "(NO KEY)"}→${s.pad ? `"${s.value}"` : "CLOSED"}`);
          }
          const s = await padUp();
          return { ok: s.pad && s.value === "1000" && s.status === "turn" && s.beat === snap.beatId, trace: trace.join(" "), s };
        };
        await clearPad();
        const fast = await pace(() => 150);
        drillNote("pad at a fast pace (150 ms, real touch): 1-0-0-0 stays open, one tap = one digit", fast.ok, `${fast.trace} · pad ${fast.s.pad ? "open" : "CLOSED"}, value "${fast.s.value}", ${fast.s.status} on ${fast.s.beat === snap.beatId ? "the same beat" : `a DIFFERENT beat (${fast.s.beat})`}`);
        await clearPad();
        const human = await pace(() => 300 + Math.floor(Math.random() * 300));
        drillNote("pad at a human pace (300–600 ms, real touch): 1-0-0-0 stays open, one tap = one digit", human.ok, `${human.trace} · pad ${human.s.pad ? "open" : "CLOSED"}, value "${human.s.value}", ${human.s.status} on ${human.s.beat === snap.beatId ? "the same beat" : `a DIFFERENT beat (${human.s.beat})`}`);
        // Only ✓ submits: the digits are still on the pad, and the touch on ✓ is what closes it (the click is the net, as everywhere).
        const beforeDone = await padUp();
        await keyTouch("done");
        let submitted = false;
        for (let i = 0; i < 8 && !submitted; i += 1) {
          await wait(250);
          submitted = (await padUp()).status !== "turn";
        }
        if (!submitted) await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[data-key="done"]'); k && k.click(); return true; })()`);
        drillNote("the pad submits only on ✓", beforeDone.pad && beforeDone.value === "1000" && beforeDone.status === "turn", `before ✓: pad ${beforeDone.pad ? "open" : "CLOSED"} with "${beforeDone.value}" (${beforeDone.status}) · ✓ by touch ${submitted ? "taken" : "swallowed — clicked"}`);
        note({ beatId: snap.beatId, via: "number pad (11 s / 23 s, then 150 ms and 300–600 ms by touch, ✓)", answer: "1000" });
      } else if (DRILLS && shortTurn === "readWrite4Digit:18f" && !drillDone.has("five")) {
        // Cluster B, issue 14: five digits on a four-digit answer are accepted and judged wrong normally.
        drillDone.add("five");
        await tapSelector('[data-testid^="cell-"][data-active]');
        await wait(400);
        for (const digit of ["1", "0", "0", "0", "0"]) {
          await evaluate(page, `(() => { const k = [...document.querySelectorAll('[data-testid="number-pad"] button')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(digit)}); k && k.click(); return true; })()`);
          await wait(80);
        }
        const typed = await evaluate<string>(page, `(document.querySelector('[data-testid="number-pad-value"]')?.textContent ?? '')`);
        await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[data-key="done"]'); k && k.click(); return true; })()`);
        note({ beatId: snap.beatId, via: "table cell + pad (10000 on a 4-digit answer — WRONG on purpose)", answer: "10000" });
        let judged = "";
        for (let i = 0; i < 60 && !judged; i += 1) {
          await wait(250);
          judged = await evaluate<string>(page, `(() => { const el = document.querySelector('.lesson-screen'); const id = el?.dataset.beatId ?? ''; if (/:(feedback|miss)$/.test(id)) return id; if (document.querySelector('[data-testid="turn-retry"]')) return 'retry note'; return ''; })()`);
        }
        drillNote("10000 on a 4-digit answer: all five digits accepted, judged wrong normally", typed === "10000" && judged !== "", `pad value "${typed}" · after ✓: ${judged ? judged.replace(/^authored:/u, "") : "no judgement seen in 15 s"}`);
      } else {
        await answer(snap);
      }
      if (record && record.spokenMs === null) {
        // THE ANSWER PATH (18 Sep): a tap is judged, the feedback plays, the lesson continues. No read-back beat, no frame
        // line, no composed number — so from the tap to her feedback line no caption may say "… කියන්නම්", no beat may be a
        // :readback, and the feedback line itself starts at once.
        let sawReadBackBeat = false;
        for (let i = 0; i < 40 && record.spokenMs === null; i += 1) {
          await wait(100);
          const seen = await evaluate<{ caption: string; beatId: string; spoken: number | null }>(page, `(() => { const t = window.__lastTapAt, l = window.__lastLineStart; const el = document.querySelector('.lesson-screen'); return { caption: (document.querySelector('[data-testid="caption"]')?.textContent ?? '').trim(), beatId: el?.dataset.beatId ?? '', spoken: t && l && l.at >= t && /:feedback|:miss/.test(l.beatId) ? Math.round(l.at - t) : null }; })()`).catch(() => ({ caption: "", beatId: "", spoken: null }));
          if (seen.caption && !record.captionsAfterTap.includes(seen.caption)) record.captionsAfterTap.push(seen.caption);
          if (/:readback$/u.test(seen.beatId)) sawReadBackBeat = true;
          if (seen.spoken !== null) record.spokenMs = seen.spoken;
        }
        await shoot(snap.beatId, "-read-aloud-after-tap");
        const r = record;
        const readBackCaption = r.captionsAfterTap.find((c) => c.includes("කියන්නම්")) ?? null;
        const line = `${shortTurn}: chips@0 s (row ${r.rowAtChips ? "on screen" : "MISSING"}, ring ${r.ringAtChips ? "yes" : "no"}, answer ${r.leakAtChips ? "VISIBLE" : "hidden"}, 🎤 cue ${r.cue ? "STILL THERE" : "gone"}, step cards ${r.steps ? "STILL THERE" : "gone"}) → tap → her feedback line ${r.spokenMs === null ? "NOT SEEN in 4 s" : `+${r.spokenMs} ms`} · read-back beat ${sawReadBackBeat ? "STILL THERE" : "none"} · "කියන්නම්" caption ${readBackCaption ? `STILL THERE ("${readBackCaption.slice(0, 30)}")` : "none"}`;
        practiceLog.push(line);
        answerPathSpoken.push(...(r.spokenMs === null ? [] : [r.spokenMs]));
        console.log(`      📖 read-aloud ${line}`);
        if (DRILLS) drillNote(`read-aloud ${shortTurn}: chips are the question · no invite · answer hidden until judged · NO read-back, feedback at once`, !sawReadBackBeat && !readBackCaption && r.spokenMs !== null && !r.cue && !r.steps && r.rowAtChips && !r.leakAtChips, line);
      }
      for (let i = 0; i < 20; i += 1) {
        const ms = await evaluate<number | null>(page, `(() => { const t = window.__lastTapAt, f = window.__lastFeedbackAt; return t && f && f >= t ? Math.round(f - t) : null; })()`);
        if (ms !== null) {
          // The input trace is collected as it is made: later drills reload the page, and window state goes with it.
          const entered = (await evaluate<Entered[]>(page, `(() => { const t = window.__inputTrace ?? []; window.__inputTrace = []; return t; })()`).catch(() => [])) ?? [];
          inputTrace.push(...entered);
          latencies.push(ms);
          await evaluate(page, `window.__lastTapAt = undefined; true`);
          break;
        }
        await wait(50);
      }
    }
    if (TUTOR_TURN_BEATS.has(snap.beatId)) await watchTutorTurn(snap.beatId);
    // Item 3: the five-number puzzle — the ledger fills row by row and the puzzle is not left before five.
    if (snap.beatId.startsWith("authored:readWrite4Digit:30") && !snap.beatId.includes(":feedback")) {
      const ledger = await evaluate<{ rows: number; ticked: string[] }>(page, `(() => { const rows = [...document.querySelectorAll('[data-testid^="ledger-row-"]')]; return { rows: rows.length, ticked: rows.filter((r) => (r.textContent || '').replace(/\s/g, '').length > 0 && r.getAttribute('data-done') === 'true').map((r) => (r.textContent || '').trim().slice(0, 12)) }; })()`).catch(() => ({ rows: 0, ticked: [] }));
      puzzleLedger = ledger;
    }
    // Item 9: while she talks, the mouth is sampled per frame for its states.
    if (snap.status === "teaching" && !mouthSampled && snap.beatId === "authored:readWrite4Digit:1") {
      mouthSampled = true;
      // A known clip (DEV_MODE): four seconds of tone at three loudnesses then silence, through the same player and analyser as her voice.
      const fed = await evaluate<boolean>(page, `(() => { const d = window.__dev; if (!d || !d.playTestClip) return false; d.playTestClip(); return true; })()`).catch(() => false);
      if (!fed) console.log("      (lip sync: window.__dev.playTestClip is not available — is DEV_MODE on?)");
      // The tone waits for her line to end and holds the floor (window.__testClip says when it played): frames are sampled
      // until it is done, and ONLY the tone's own four seconds are judged — three seconds of tone (loud, medium, soft), then
      // its silent second, where the mouth must close for a run of ≥ 15 frames (a quarter second).
      const sampled = await evaluate<{ frames: Array<{ t: number; m: string }>; startedAt: number | null }>(page, `new Promise((resolve) => { const seen = []; const begin = performance.now(); const tick = () => { const now = performance.now(); const m = document.querySelector('[data-mouth]')?.getAttribute('data-mouth') ?? 'none'; seen.push({ t: now, m }); const c = window.__testClip; if ((c && c.state === 'done') || now - begin > 20000) resolve({ frames: seen, startedAt: c && c.startedAt ? c.startedAt : null }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
      const t0 = sampled.startedAt ?? sampled.frames[0]?.t ?? 0;
      const frames = sampled.frames.filter((f) => f.t >= t0).map((f) => ({ t: f.t - t0, m: f.m }));
      const states = frames.map((f) => f.m);
      const distinct = [...new Set(states)];
      const audible = [...new Set(frames.filter((f) => f.t < 3000).map((f) => f.m))].filter((m) => m !== "closed" && m !== "0" && m !== "none");
      let closedRun = 0;
      let bestRun = 0;
      for (const f of frames.filter((frame) => frame.t >= 3000 && frame.t <= 4200)) {
        closedRun = f.m === "closed" || f.m === "0" ? closedRun + 1 : 0;
        bestRun = Math.max(bestRun, closedRun);
      }
      const closesAfter = sampled.startedAt !== null && bestRun >= 15;
      // The timeline, run-length encoded with times, so a failure can be read: "closed 0.0–0.4 · 3 0.4–1.1 · …".
      const runs: string[] = [];
      for (let i = 0, from = 0; i <= frames.length; i += 1) {
        if (i === frames.length || frames[i]!.m !== frames[from]!.m) {
          if (i > from) runs.push(`${frames[from]!.m} ${(frames[from]!.t / 1000).toFixed(1)}–${(frames[i - 1]!.t / 1000).toFixed(1)}`);
          from = i;
        }
      }
      console.log(`      👄 mouth timeline: ${runs.join(" · ").slice(0, 600)}`);
      mouthTrace = `${states.length} frames over the tone's own window${sampled.startedAt === null ? " (THE TONE NEVER PLAYED)" : ""} · states ${distinct.join(",")} · open shapes during the tone ${audible.length} · closed in its silent second ${closesAfter ? "yes" : "no"} (longest closed run ${bestRun} frames)`;
      if (DRILLS) drillNote("lip sync: three open mouth shapes from the clip's amplitude, closed on silence", audible.length >= 3 && closesAfter, mouthTrace);
    }
    // Item 8: tofu — no U+FFFD or missing glyph anywhere the child reads.
    {
      const tofu = await evaluate<string[]>(page, `(() => { const out = []; const sels = ['[data-testid="caption"]', '[data-testid="turn-choice"]', '[data-testid="abacus-child-answer"]', '[data-testid="feedback-badge"]', '.wb-caption', '[data-testid="retry-note"]']; for (const sel of sels) for (const el of document.querySelectorAll(sel)) { const text = (el.textContent || '').trim(); if (!text) continue; if (/\uFFFD|\?{3,}/.test(text)) out.push(sel + ' "' + text.slice(0, 30) + '"'); const font = getComputedStyle(el).font; if (document.fonts && document.fonts.check && !document.fonts.check(font, text)) out.push(sel + ' font cannot show "' + text.slice(0, 24) + '"'); } return out; })()`).catch(() => []);
      for (const line of tofu) if (!tofuHits.includes(`${snap.beatId.replace(/^authored:/u, "")} ${line}`)) tofuHits.push(`${snap.beatId.replace(/^authored:/u, "")} ${line}`);
    }
    // The first beat after the puzzle's five builds (:30f closes it; :31 / concept-done follow), whichever comes first.
    if (/^authored:readWrite4Digit:(30f|31|concept-done)$/u.test(snap.beatId) && !puzzleChecked && answers.some((a) => /readWrite4Digit:30/u.test(a.beatId))) {
      puzzleChecked = true;
      const builds = answers.filter((a) => /^readWrite4Digit:30[a-z]?$/u.test(a.beatId.replace(/^authored:/u, "")) && a.via.includes("tiles placed")).map((a) => a.answer);
      const distinct = new Set(builds);
      const line = `asked ${builds.length} time(s) (${builds.join(", ")}) · ${distinct.size} distinct · ledger ${puzzleLedger.ticked.length} ticked of ${puzzleLedger.rows} rows`;
      puzzleTrace = line;
      if (DRILLS) drillNote("the five-number puzzle: five builds asked, five distinct numbers in the ledger before it is left", builds.length >= 5 && (distinct.size >= 5 || builds.length >= 5) && puzzleLedger.ticked.length >= 5, line);
    }
    if (WRONG_BEAT && /:(reteach|reteach-demo|reveal|giveup)$/u.test(snap.beatId) && !ladderSeen.includes(snap.beatId)) ladderSeen.push(snap.beatId);
    await watchStrip(snap.beatId);
    if (snap.status === "done") {
      await wait(1200);
      await shoot("session-summary");
      done = true;
      break;
    }
    if (snap.status === "error" || snap.status === "locked") {
      console.log(`  stopped: status ${snap.status}`);
      break;
    }
    await wait(250);
  }

  const log = (await evaluate<ChoreoLogEntry[]>(page, `window.__choreoLog ?? []`)) ?? [];
  // Everything that really sounded since the lesson page last loaded — the browser's own audio API, read before the
  // cluster A drills navigate away.
  const walkHeard = await heard(0);
  if (DRILLS) drillNote("the whole walk: never two voice clips at once (the browser's own audio API)", walkHeard.maxConcurrent <= 1 && walkHeard.overlaps.length === 0, heardText(walkHeard).replace(/ \(.*?\), most/u, ", most"));

  // The sitting's own CLOSE_SESSION row, read NOW — before the cluster A drills below restart the session (which removes
  // its session_log rows, the close row with them; read after that, the full-completion drill could only ever see "(none)").
  // The close row is written after the close line has been said (read on the board, that is ~8 s): poll for it.
  let closeAtEnd: { reason: string; minutes: number | string } = { reason: "(none)", minutes: "—" };
  if (DRILLS && childA) {
    for (let i = 0; i < 60 && closeAtEnd.reason === "(none)"; i += 1) {
      await wait(500);
      const { data: closeRows } = await supabaseAdmin.from("session_log").select("beat_type, planner_decision, started_at").eq("child_id", childA).eq("beat_type", "CLOSE_SESSION").order("started_at", { ascending: false }).limit(1);
      const decision = (closeRows ?? [])[0]?.planner_decision as { reason?: string; minutesToday?: number } | undefined;
      if (decision?.reason) closeAtEnd = { reason: decision.reason, minutes: decision.minutesToday ?? "—" };
    }
  }

  // ---- Cluster A / G regression assertions (after the sitting) ---------------------
  let restartTrace = "not run";
  if (childA) {
    // Two children on one device get separate resume points.
    const second = await evaluate<{ ok: boolean; child_id?: string; step?: string; error?: string }>(page, ONBOARD_VIA_API_JS(ACCESS_CODE, "රවිඳු", childA));
    // The API onboarding bypassed the app's own child-switch path (which clears the device cache): drop it as the app would.
    await evaluate(page, `(() => { try { Object.keys(localStorage).filter((k) => k.startsWith('ss:app-state')).forEach((k) => localStorage.removeItem(k)); } catch {} return true; })()`);
    const homeB = second.ok ? await homeSession() : null;
    const back = await evaluate<{ ok: boolean }>(page, `fetch("/api/child/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ child_id: ${JSON.stringify(childA)} }) }).then((r) => r.json())`);
    await evaluate(page, `(() => { try { Object.keys(localStorage).filter((k) => k.startsWith('ss:app-state')).forEach((k) => localStorage.removeItem(k)); } catch {} return true; })()`);
    const homeA = back.ok ? await homeSession() : null;
    checkA("two children on one device get separate resume points", second.ok && homeB?.session === 1 && homeA?.session === (done ? 2 : 1), `second child ${second.ok ? second.child_id : `FAILED at ${second.step} (${second.error})`} → home session ${homeB?.session ?? "?"} · switch back → home session ${homeA?.session ?? "?"} (expected ${done ? 2 : 1})`);
    // The parent zone with no PIN shows create-PIN first.
    await page.send("Page.navigate", { url: `${BASE}/parent` });
    const parentShown = await waitFor(`!!document.querySelector('[data-testid="pin-create"], [data-testid="pin-gate"], [data-screen-ready="parent"]')`, 8000);
    const parentState = parentShown ? await evaluate<string>(page, `document.querySelector('[data-testid="pin-create"]') ? 'pin-create' : document.querySelector('[data-testid="pin-gate"]') ? 'pin-gate' : 'zone'`) : "nothing";
    checkA("parent zone with no PIN shows create-PIN", parentState === "pin-create", parentState === "pin-create" ? "pin-create form rendered, no gate" : `create-PIN form NOT rendered (${parentState})`);
    // Restart lands on beat 0 with mastery intact.
    const before = (await supabaseAdmin.from("child_progress").select("*", { count: "exact", head: true }).eq("child_id", childA)).count ?? 0;
    const sittingsBefore = [...new Set((((await supabaseAdmin.from("session_log").select("session_id").eq("child_id", childA)).data ?? []) as Array<{ session_id: string }>).map((r) => r.session_id))];
    const restart = await evaluate<{ ok: boolean; rows?: number; sittings?: number; first_beat?: string }>(page, `fetch("/api/session/restart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lesson: 1, session: 0 }) }).then((r) => r.json())`);
    const after = (await supabaseAdmin.from("child_progress").select("*", { count: "exact", head: true }).eq("child_id", childA)).count ?? 0;
    const logsLeft = (await supabaseAdmin.from("session_log").select("*", { count: "exact", head: true }).eq("child_id", childA)).count ?? 0;
    await page.send("Page.navigate", { url: `${BASE}/session` });
    await wait(2500);
    await tap(446, 206);
    let landed = "—";
    for (let i = 0; i < 120; i += 1) {
      const snap = await snapshot().catch(() => null);
      if (snap && snap.beatId !== "—" && snap.status !== "preparing" && snap.status !== "idle") {
        landed = snap.beatId;
        break;
      }
      await wait(250);
    }
    const beat0 = script?.beats?.[0]?.id ?? "?";
    const firstAfterRestart = await firstBeatOfNewestSitting(childA, sittingsBefore);
    restartTrace = `restart session 1: ${restart.ok ? `${restart.rows} session_log row(s) in ${restart.sittings} sitting(s) removed` : "FAILED"} · session_log rows left ${logsLeft} · child_progress ${before} → ${after} · the new sitting starts at ${String(firstAfterRestart ?? "nothing logged").replace(/^authored:/u, "")} (beat 0 = ${beat0.replace(/^authored:/u, "")}) · page showed ${landed.replace(/^authored:/u, "")}`;
    checkA("restart lands on beat 0 with mastery intact", restart.ok && firstAfterRestart === beat0 && before === after && before > 0, restartTrace);
    await page.send("Page.navigate", { url: "about:blank" });
  } else {
    checkA("two children on one device get separate resume points", false, "no child was created by onboarding");
    checkA("parent zone with no PIN shows create-PIN", false, "no child");
    checkA("restart lands on beat 0 with mastery intact", false, "no child");
  }
  // The phone from step 1 is on the parent record, unverified (no gateway).
  if (childA) {
    const { data: row } = await supabaseAdmin.from("children").select("parent_contact").eq("id", childA).maybeSingle();
    const flag = await supabaseAdmin.from("children").select("parent_contact_verified").eq("id", childA).maybeSingle();
    const verified: boolean | "column missing" = flag.error ? "column missing" : (flag.data as { parent_contact_verified?: boolean } | null)?.parent_contact_verified === true;
    checkA("step 1 stores the phone on the parent record as unverified", row?.parent_contact === "+94770000002" && verified !== true, `parent_contact ${row?.parent_contact ?? "?"} · parent_contact_verified ${verified === "column missing" ? "column missing on this database (supabase/schema.sql ALTER pending) — unverified by construction" : String(verified)}`);
  }
  await mockOtpDrill();
  // ↺ through the control itself: confirm → this session's rows go, the lesson
  // starts again at beat 0, nothing carried over, mastery untouched.
  if (childA) {
    // The sittings this child has logged so far: a restart must remove exactly
    // those (a row count would race with the reloaded lesson logging beat 0 again).
    const beforeSittings = [...new Set((((await supabaseAdmin.from("session_log").select("session_id").eq("child_id", childA)).data ?? []) as Array<{ session_id: string }>).map((r) => r.session_id))];
    const beforeMastery = (await supabaseAdmin.from("child_progress").select("*", { count: "exact", head: true }).eq("child_id", childA)).count ?? 0;
    await page.send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2, mobile: true });
    await page.send("Page.navigate", { url: `${BASE}/session` });
    await wait(2500);
    await tap(446, 206);
    for (let i = 0; i < 160; i += 1) {
      await wait(500);
      const id = await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`).catch(() => "—");
      if (id !== "—") break;
    }
    await tapSelector(ariaSel("detail.restart"));
    const askedRestart = await waitFor(`!!document.querySelector('[data-testid="confirm-sheet"][data-confirm="restart"]')`, 6000);
    await wait(400);
    const restartAsk = await evaluate<string>(page, `(document.querySelector('[data-testid="confirm-sheet"]')?.textContent ?? '').replace(/\s+/g, " ").trim()`).catch(() => "");
    const markRestart = await pageNow();
    await tapSelector('[data-testid="confirm-yes"]');
    let landed = "—";
    for (let i = 0; i < 200; i += 1) {
      await wait(500);
      landed = await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`).catch(() => "—");
      if (landed !== "—") break;
    }
    // What really sounded from the confirm on (a reload starts the page's clock, and its log, again from 0).
    const nowAfter = await pageNow();
    const restartHeard = await heard(nowAfter < markRestart ? 0 : markRestart, nowAfter);
    const firstLogged = await firstBeatOfNewestSitting(childA, beforeSittings);
    const afterSittings = [...new Set((((await supabaseAdmin.from("session_log").select("session_id").eq("child_id", childA)).data ?? []) as Array<{ session_id: string }>).map((r) => r.session_id))];
    const survivors = beforeSittings.filter((id) => afterSittings.includes(id));
    const afterMastery = (await supabaseAdmin.from("child_progress").select("*", { count: "exact", head: true }).eq("child_id", childA)).count ?? 0;
    const beat0 = script?.beats?.[0]?.id ?? "?";
    restartControlTrace = `↺ asked ("${restartAsk.slice(0, 44)}") · sittings before ${beforeSittings.length} → ${survivors.length} of them left (${afterSittings.length} now, the replay's own) · the new sitting starts at ${String(firstLogged ?? "nothing logged").replace(/^authored:/u, "")} (beat 0 = ${String(beat0).replace(/^authored:/u, "")}) · page showed ${landed.replace(/^authored:/u, "")} · child_progress ${beforeMastery} → ${afterMastery} · heard from the confirm on: ${heardText(restartHeard)}`;
    checkA("↺ confirm restarts this session at beat 0, mastery kept, nothing carried over", askedRestart && firstLogged === beat0 && survivors.length === 0 && afterMastery === beforeMastery && restartHeard.maxConcurrent <= 1, restartControlTrace);
  }
  // The production build has no code path to DEV_CHILD_ID.
  const serverDir = path.join(process.cwd(), ".next", "server");
  const mentions: string[] = [];
  const scan = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(full);
      else if (/\.(js|mjs|cjs)$/u.test(entry.name) && (await readFile(full, "utf8")).includes("DEV_CHILD_ID")) mentions.push(path.relative(process.cwd(), full));
    }
  };
  await scan(serverDir);
  checkA("production build has no code path to DEV_CHILD_ID", mentions.length === 0, mentions.length ? `mentioned in ${mentions.slice(0, 3).join(", ")}` : `.next/server scanned — no mention`);
  checkA("no predicate JSON in any caption ({, kind, permutation)", captionLeaks.length === 0, captionLeaks.length ? captionLeaks.slice(0, 3).join(" · ") : `${seenCaptionCount()} caption reads clean`);
  const firstPaintMs = await measureFirstPaint();
  const seen = new Set(shots.map((s) => s.beatId));
  const outside = new Map<string, ChoreoLogEntry[]>();
  const estimated = new Set<string>();
  const unknown: string[] = [];
  for (const entry of log) {
    if (entry.outside) outside.set(entry.beatId, [...(outside.get(entry.beatId) ?? []), entry]);
    if (entry.estimated) estimated.add(entry.beatId);
    if (!entry.known) unknown.push(`${entry.beatId} ${entry.event}`);
  }

  console.log(`\n${done ? "session ended" : "stopped at the time cap"} after ${Math.round((Date.now() - started) / 1000)}s · ${shots.length} screenshots in ${path.relative(process.cwd(), OUT_DIR)}/`);
  console.log(`run: ${VIEW_W}×${VIEW_H} ${SCHEME}${REDUCED_MOTION ? " reduced-motion" : ""}${NO_WOBBLE ? " (marker wobble OFF — experiment)" : ""}${CPU_THROTTLE > 1 ? ` cpu×${CPU_THROTTLE}` : ""}${NETWORK ? ` net ${NETWORK}` : ""}`);
  const ms = (v: number | null) => (v === null ? "not seen" : `${v} ms`);
  console.log(`first paint${NETWORK === "3g" ? " on 3G" : ""} (page clock, fresh load after the gate): first contentful paint ${ms(firstPaintMs.fcp)} · board surface ${ms(firstPaintMs.surface)} · first primitive on it ${ms(firstPaintMs.primitive)}`);
  if (DRILLS) {
    if (navTrace.length) console.log(`\nplayback panel (navigation) traces:\n${navTrace.map((l) => `  ${l}`).join("\n")}`);
    if (chatBudgetTrace.length) console.log(`\n✋ chat budget drill (fake socket, DEV_MODE mock token — no paid call; the server's accounting is real):\n${chatBudgetTrace.map((l) => `  ${l}`).join("\n")}`);
    console.log(`\nfailure-mode drills (${drillResults.filter((r) => r.startsWith("PASS")).length}/${drillResults.length} handled visibly):`);
    for (const line of drillResults) console.log(`  ${line}`);
    for (const name of ["touch during playback", "rotation mid-beat", "backgrounded tab", "missing clip", "first ✋ asks for the microphone", "the chat shows the child's turn as a neutral bubble", "the chat's time spent", "time left: the chat stays open", "DEV_MODE exempts the chat budget", "5 min left in the chat", "1 min left in the chat", "Zara's portrait is not a control", "three ↺ taps are one question", "pause at beat 5", "pause at beat 40", "pause at beat 80", "type at 11 s and 23 s", "pad at a fast pace", "pad at a human pace", "the pad submits only on ✓", "two touches 80 ms apart on the soft check", "an unreached concept chip is not selectable", "⏭ stops at the furthest reached", "rapid double-tap on ⏮", "five taps on ⏮", "resume plays only the selected beat", "step back 6 beats then resume", "tapping a concept chip", "🔊 plays the selected beat", "resume from a concept chip", "10000 on a 4-digit answer", "read-aloud readWrite4Digit:2"]) if (!drillResults.some((r) => r.includes(name))) console.log(`  SKIP  ${name}: its beat was not reached`);
  }
  if (fpsSamples.length) console.log(`fps while animating${CPU_THROTTLE > 1 ? ` at cpu×${CPU_THROTTLE}` : ""}: ${fpsSamples.map((s) => `${s.beatId.replace(/^authored:/u, "")} ${s.fps}`).join(", ")}`);
  const flagged = audits.filter((a) => a.audit && (a.audit.overlap || a.audit.portraitOverlap || a.audit.cutOff || a.audit.small.length || a.audit.tinyText.length));
  console.log(`layout audit: ${audits.length} beats · overlap ${audits.filter((a) => a.audit?.overlap).length} · portrait-overlap ${audits.filter((a) => a.audit?.portraitOverlap).length} · cut-off ${audits.filter((a) => a.audit?.cutOff).length} · sub-48px ${audits.filter((a) => a.audit?.small.length).length} · text<16px ${audits.filter((a) => a.audit?.tinyText.length).length}`);
  for (const a of flagged.slice(0, 20)) {
    const d = a.audit!;
    console.log(`  ${a.beatId.replace(/^authored:/u, "").padEnd(34)} ${[d.overlap ? `overlap ${d.overlap}` : "", d.portraitOverlap ? "portrait overlap" : "", d.cutOff ? `cut-off ${d.cutOff}` : "", ...d.small.map((s) => `small: ${s}`), ...d.tinyText.map((t) => `tiny: ${t}`)].filter(Boolean).join(" · ")}`);
  }
  {
    const strip = audits.find((a) => a.audit?.strip?.length)?.audit?.strip ?? [];
    // The labels as SessionShell.tsx writes them today. They were renamed and this list was not,
    // so the filter matched only ⏸ and the run reported "UNDER 56 px" whatever the controls measured.
    // ⏸ carries two labels because it is also the resume control.
    const controls = strip.filter((b) => [copy("session.pause"), copy("edge.paused.resume"), copy("detail.restart"), copy("edge.paused.stop")].includes(b.label ?? ""));
    console.log(`strip controls ⏸ ↺ ⏹ hit areas: ${controls.map((b) => `${b.label} ${b.w}×${b.h}`).join(" · ") || "not seen"} — ${controls.length === 3 && controls.every((b) => b.h >= 56) ? "all reach 56 px" : controls.length !== 3 ? `only ${controls.length} of the 3 found — the labels in this filter no longer match the strip` : "UNDER 56 px"}`);
  }
  if (REDUCED_MOTION) {
    console.log(`reduced motion: ${audits.filter((a) => a.audit && a.audit.running > 0).length} beat(s) had a running animation on the board (expected 0)`);
    const names = new Map<string, number>();
    for (const a of audits) for (const name of a.audit?.runningNames ?? []) names.set(name, (names.get(name) ?? 0) + 1);
    for (const [name, count] of [...names.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)) console.log(`  ${name} — on ${count} beat(s)`);
  }
  console.log(`beats seen: ${seen.size} · choreography events fired: ${log.length} on ${new Set(log.map((e) => e.beatId)).size} beats`);
  if (WRONG_BEAT) {
    const asks = asksOf.get(WRONG_BEAT) ?? 0;
    const short = WRONG_BEAT.replace(/^authored:/u, "");
    const reteach = ladderSeen.some((id) => /:reteach(-demo)?$/u.test(id));
    const reveal = ladderSeen.some((id) => /:(reveal|giveup)$/u.test(id));
    const after = shots.find((s, i) => i > 0 && ladderSeen.includes(shots[i - 1]!.beatId) && !ladderSeen.includes(s.beatId) && !s.beatId.startsWith(WRONG_BEAT));
    const ok = asks === 3 && reteach && reveal;
    console.log(`\nretry ladder at ${short} (answered wrongly on purpose): ${ok ? "PASS" : "FAIL"}`);
    console.log(`  asked ${asks} time(s) (never a fourth) · reteach after miss 2: ${reteach ? "yes" : "NO"} · reveal after miss 3: ${reveal ? "yes" : "NO"} · then moved on to ${after ? after.beatId.replace(/^authored:/u, "") : "?"}`);
    console.log(`  ladder beats seen: ${ladderSeen.map((id) => id.replace(/^authored:/u, "")).join(", ") || "none"}`);
  }
  {
    const hear = apiCalls.get("hear") ?? 0;
    const planner = apiCalls.get("planner") ?? 0;
    const gum = (await evaluate<number>(page, `window.__gumCalls ?? 0`).catch(() => -1)) ?? -1;
    const sorted = [...latencies].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null;
    console.log(`\nvoice on the lesson path: /api/hear calls ${hear} · /api/planner calls ${planner} · getUserMedia calls ${gum} (${DRILLS ? "1 expected, from the ✋ drill" : "0 expected"})`);
    // ---- the answer flow, the input surfaces, the rod run, the overlap probe, the paid calls (18 Sep 2026) -------------
    const spoken = [...answerPathSpoken].sort((a, b) => a - b);
    console.log(`tap → her feedback LINE starting (read-aloud answers followed by the drill): ${spoken.length ? `median ${spoken[Math.floor(spoken.length / 2)]} ms, max ${spoken[spoken.length - 1]} ms over ${spoken.length}` : "n/a"}`);
    if (!inputTrace.length) console.log("  FAIL  no entered value was traced");
    const bySurface = new Map<string, Entered[]>();
    for (const entry of inputTrace) bySurface.set(entry.surface, [...(bySurface.get(entry.surface) ?? []), entry]);
    console.log(`\ninput shown BEFORE it is judged (every entered value; the DOM is read as the judge begins):`);
    for (const [surface, entries] of bySurface) {
      const shown = entries.filter((e) => e.renderedBeforeJudge === true).length;
      const sample = entries[0]!;
      console.log(`  ${shown === entries.length ? "✓" : "✗"} ${surface.padEnd(24)} ${shown}/${entries.length} rendered before the judge · e.g. "${sample.value.slice(0, 24)}" entered → judged +${sample.judgeAt === null ? "?" : Math.round(sample.judgeAt - sample.enteredAt)} ms`);
    }
    for (const e of inputTrace.filter((entry) => entry.judgeAt !== null && entry.renderedBeforeJudge !== true)) console.log(`    ✗ NOT shown before the judge: "${e.value}" on ${e.surface} at ${(e.beatId ?? "?").replace(/^authored:/u, "")}`);
    inputNotShown = inputTrace.filter((e) => e.judgeAt !== null && e.renderedBeforeJudge !== true).length;
    if (!inputTrace.length) inputNotShown = 1;
    console.log(`\nabacus rod run — one value at a time, under the rod under discussion (${rodRunBad ? `✗ ${rodRunBad} stale` : "✓ none stale"}):`);
    for (const line of rodRun) console.log(`  ${line}`);
    console.log(`\noverlap assertion over the live session: ${overlapFrames} beat frame(s) probed · ${overlapFindings.length ? `✗ ${overlapFindings.length} with an overlap` : "✓ 0 overlaps"}`);
    for (const line of overlapFindings.slice(0, 20)) console.log(`  - ${line}`);
    console.log(`\nchat panel: ${chatPanel ? `covers ${chatPanel.coverage} % of the board · ${chatPanel.share} % of the screen's long side · board dimmed: ${chatPanel.dimmed ? "YES" : "no"} · Zara ${chatPanel.portrait} px · board layout beside it ${chatPanel.boardOk ? "clean" : "HAS OVERLAPS"}` : "not opened in this run (run with --drills)"}`);
    const paidRoutes = ["speak-line", "planner", "hear", "extract-interest"];
    paidCallCount = paidRoutes.reduce((sum, route) => sum + (apiCalls.get(route) ?? 0), 0);
    const server = await evaluate<{ allowed?: Record<string, number>; refused?: Record<string, number>; switches?: Record<string, string> } | null>(page, `fetch('/api/paid-calls').then((r) => r.json()).catch(() => null)`).catch(() => null);
    const serverAllowed = Object.entries(server?.allowed ?? {}).filter(([kind]) => kind !== "chat");
    paidCallCount += serverAllowed.reduce((sum, [, n]) => sum + n, 0);
    console.log(`\nPAID CALLS this session: ${paidCallCount}  (requests — ${paidRoutes.map((r) => `/api/${r} ${apiCalls.get(r) ?? 0}`).join(" · ")} · chat token /api/gemini-session ${apiCalls.get("gemini-session") ?? 0}${DRILLS ? " (the first ✋ drill's, held at the door and never answered; the budget drill's, answered by the DEV_MODE mock — no call to Google)" : ""})`);
    console.log(`  server gate (src/lib/paidCalls.ts, this process): allowed ${JSON.stringify(server?.allowed ?? {})} · refused ${JSON.stringify(server?.refused ?? {})} · switches ${JSON.stringify(server?.switches ?? {})}`);
    console.log(`tap → feedback latency: median ${median === null ? "n/a" : `${median} ms`} over ${latencies.length} judged answers${sorted.length ? ` (min ${sorted[0]}, max ${sorted[sorted.length - 1]})` : ""}`);
    {
      const r1 = practiceLog.find((l) => l.startsWith("readWrite4Digit:2:"));
      console.log(`R1 trace (readWrite4Digit:2, the first read-aloud): ${r1 ?? "not reached"}`);
    }
    console.log(`read-aloud seen on ${practiceLog.length} beat(s):`);
    for (const line of practiceLog) console.log(`  ${line}`);
    console.log(`\ntutor turns (she says the cell is hers before it fills) — ${tutorTurns.length} seen:`);
    for (const line of tutorTurns) console.log(`  ${line}`);
    console.log(`five-build puzzle: ${puzzleTrace}`);
    console.log(`lip sync: ${mouthTrace}`);
    console.log(`tofu scan: ${tofuHits.length === 0 ? "clean — no U+FFFD, no missing glyph in any caption, chip, answer or badge" : tofuHits.join(" · ")}`);
    if (tofuHits.length) console.log(`FAIL  tofu: ${tofuHits.length} render(s) with a missing glyph`);
    // Item 1 (cluster J): the sitting ran from beat 0 to ITS OWN close with no early close — the row says complete.
    if (DRILLS && childA) {
      const beats = (script?.beats ?? []) as Array<{ id: string; type: string; sessionIndex: number }>;
      const closeIndex = beats.findIndex((b) => b.type === "CLOSE_SESSION" && b.sessionIndex === 0);
      const lastWork = beats[closeIndex - 1]?.id ?? "?";
      const reachedLastWork = audits.some((a) => a.beatId === lastWork);
      const { reason, minutes } = closeAtEnd;
      const line = `session 1 from ${audits[0]?.beatId.replace(/^authored:/u, "") ?? "?"} to its own close · last work beat ${lastWork.replace(/^authored:/u, "")} ${reachedLastWork ? "reached" : "NOT reached"} · ${audits.length} beats seen · close_reason=${reason} (minutes_today ${minutes})`;
      drillNote("full completion: session 1 plays to its own CLOSE_SESSION with no early close, close_reason = complete", done && reachedLastWork && reason === "complete", line);
      console.log(`full-completion drill: ${line}`);
    }
    if (hear > 0 || planner > 0) console.log(`FAIL  the lesson path called ${hear ? "/api/hear" : "/api/planner"} — the answer path is touch-only`);
    if (gum > (DRILLS ? 1 : 0)) console.log(`FAIL  the microphone was asked for ${gum} time(s) — only the ✋ may ask`);
    if (median !== null && median > 200) console.log(`FAIL  median tap → feedback ${median} ms, over 200`);
    const judged = [...expectedById.values()].filter((b) => b.expectedAnswer && b.answerMode);
    const asked = answers.filter((a) => !a.via.startsWith("tap on the board") && !a.via.startsWith("nothing tappable"));
    const noSurface = answers.filter((a) => a.via.startsWith("nothing tappable") || a.via === "no pad" || a.via === "no surface");
    const byVia = new Map<string, number>();
    for (const a of asked) byVia.set(a.via.replace(/ WRONG on purpose/u, ""), (byVia.get(a.via.replace(/ WRONG on purpose/u, "")) ?? 0) + 1);
    console.log(`\ntouch surfaces used (${asked.length} judged answers, ${noSurface.length} with no surface${noSurface.length ? ": " + noSurface.map((a) => a.beatId.replace(/^authored:/u, "")).join(", ") : ""}):`);
    for (const [via, n] of byVia) console.log(`  ${via.padEnd(34)} ${n}`);
    console.log(`  script: ${judged.length} judged questions carry an answerMode · speech-primary 0 (readAloud is unjudged practice; its judged step is the chips: ${judged.filter((b) => b.answerMode === "readAloud").length} such questions)`);
  }
  if (WRONG_BEAT) console.log(`retry button (${copy("common.retry")}) tapped ${retryTaps} time(s) — the visible way back after a miss`);
  console.log(`\nmastery (${stars.filter((s) => s.startsWith("★")).length} star(s)):`);
  for (const line of stars) console.log(`  ${line}`);
  if (!stars.length) console.log("  no concept finished before the run ended");
  const ladder = consoleLines.filter((line) => /\[beat\] (miss|reteach|reveal|give up|confirm|stage [12]|concept complete|mastered|not mastered|silence ladder|pad|render|no clip)/iu.test(line));
  console.log(`\nthe ladder, from the runtime's own trace (${ladder.length} lines):`);
  for (const line of ladder.slice(0, 40)) console.log(`  ${line.replace(/^debug: \[beat\] /u, "")}`);
  console.log(`\nanswers given (${answers.length}):`);
  for (const a of answers) console.log(`  ${a.beatId.replace(/^authored:/u, "").padEnd(34)} ${a.via.padEnd(22)} ${a.answer}`);
  console.log(`\nbeats whose events fired OUTSIDE their clip: ${outside.size}`);
  for (const [beatId, entries] of outside) {
    for (const e of entries) console.log(`  ${beatId.replace(/^authored:/u, "")} s${e.sentenceIndex} ${e.event} fired at ${e.firedAtMs}ms, sentence ${e.spanStartMs}–${e.spanEndMs}ms of a ${e.clipMs}ms clip${e.estimated ? " (estimated spans)" : ""}`);
  }
  console.log(`\nstoryboard events with no matching primitive: ${unknown.length}`);
  for (const u of unknown) console.log(`  ${u}`);
  console.log(`\nbeats with estimated sentence spans (no stored spans that fit): ${estimated.size}`);
  if (estimated.size) console.log(`  ${[...estimated].map((b) => b.replace(/^authored:/u, "")).join(", ")}`);
  const problems = consoleLines.filter((line) => /error|exception|failed/i.test(line));
  console.log(`\nconsole errors: ${problems.length}`);
  for (const line of problems.slice(0, 15)) console.log(`  ${line}`);

  console.log(`\ncluster A / G regression assertions (${clusterA.filter((r) => r.startsWith("PASS")).length}/${clusterA.length}):`);
  for (const line of clusterA) console.log(`  ${line}`);
  console.log(`restart trace: ${restartTrace}`);
  console.log(`device sequence (⏹ → lesson detail): ${deviceSequence}`);
  console.log(`resume trace: ${resumeTrace}`);
  console.log(`↺ control trace: ${restartControlTrace}`);
  console.log(`portrait / ↺ trace: ${replayTrace}`);
  console.log(`audio (the browser's own audio API, since the lesson page last loaded): ${walkHeard.sounding.length} voice clips · the most sounding at once ${walkHeard.maxConcurrent} (the contract is 1)${walkHeard.overlaps.length ? ` — OVERLAPS: ${walkHeard.overlaps.map((o) => `${o.a} + ${o.b} ${o.ms} ms`).join("; ")}` : ""}`);
  // ---- THE CLOSE SAYS WHY (the device walk, issue 3) ---------------------
  // A sitting that stops must say why. The drill: walk into the numeral ↔ name
  // table, then set the daily limit a minute and five seconds away — it is
  // crossed mid-exercise. It must NOT cut the table off: it finishes the
  // exercise, then closes with her daily-limit line on the card and
  // close_reason=daily_limit on the session_log row.
  // AND IT WARNS FIRST (29 Sep 2026, src/lib/timeWarnings.ts): early in the
  // sitting the limit is set five minutes and eight seconds away — her five-
  // minute line comes once, between beats, and the lesson carries on (the
  // limit is then lifted again); at the table, set 65 s away, the five-minute
  // line is skipped (too little time for it) and her one-minute line comes
  // once, before the close.
  let closeDrill = "not run";
  let limitWarningDrill = "not run";
  const seenAfterArm: string[] = [];
  if (DRILLS && childA) {
    const TABLE_FIRST = "authored:readWrite4Digit:18c";
    const TABLE_LAST = "authored:readWrite4Digit:18m";
    await evaluate(page, `fetch("/api/session/restart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lesson: 1, session: 0 }) }).then((r) => r.json())`).catch(() => undefined);
    await page.send("Page.navigate", { url: `${BASE}/session` });
    await wait(2500);
    await tap(446, 206);
    const started = Date.now();
    let armed = false;
    let armedAt = "—";
    /** The five-minute warning's arming, early in the sitting, and what the lesson did after it. */
    let soonArmed = false;
    let soonArmedAt = "—";
    let soonLifted = false;
    let beatsAfterSoon = 0;
    let beatsAfterLast = 0;
    let lastBeatSeen = "";
    const captionsSeen = { soon: false, last: false };
    type LimitWarning = { kind: string; at: number; remaining: number; before: string };
    let limitWarnings: LimitWarning[] = [];
    const limitState = () => evaluate<{ usedMinutes: number; limit: number | null; said: string[] } | null>(page, `window.__dev && window.__dev.limitState ? window.__dev.limitState() : null`).catch(() => null);
    const setLimit = (minutes: number | null) => evaluate(page, `(() => { window.__dev && window.__dev.setDailyLimit(${minutes === null ? "null" : minutes}); return true; })()`).catch(() => false);
    let closedAt = "—";
    let closedInside = "";
    let cardText = "";
    let lastSeen = "—";
    let lastDrillTurn = "";
    let lastDrillAnswerAt = 0;
    /** The debug overlay's own line (minutes used · limit · close reason) once the limit is armed. */
    let overlay = "not read";
    const recent: string[] = [];
    const deadline = Date.now() + 14 * 60_000;
    while (Date.now() < deadline) {
      const snap = await snapshot().catch(() => null);
      if (!snap) {
        await wait(300);
        continue;
      }
      if (snap.beatId !== "—") {
        lastSeen = snap.beatId;
        const shortId = snap.beatId.replace(/^authored:/u, "");
        if (recent[recent.length - 1] !== shortId) recent.push(shortId);
        if (recent.length > 10) recent.shift();
      }
      // The limit's warnings: what the runtime said, and whether the child saw the line (read on the board until recorded).
      if (soonArmed) {
        limitWarnings = (await evaluate<LimitWarning[]>(page, `window.__limitWarnings ?? []`).catch(() => limitWarnings)) ?? limitWarnings;
        const shown = (await evaluate<string[]>(page, `[...(window.__captionsSeen ?? [])]`).catch(() => [])) ?? [];
        if (shown.some((c) => c.includes(AUTHORED_LINES.lessonTimeSoon))) captionsSeen.soon = true;
        if (shown.some((c) => c.includes(AUTHORED_LINES.lessonTimeLast))) captionsSeen.last = true;
        if (snap.beatId !== "—" && snap.beatId !== lastBeatSeen) {
          if (limitWarnings.some((w) => w.kind === "soon")) beatsAfterSoon += 1;
          if (limitWarnings.some((w) => w.kind === "last") && !/:close$/u.test(snap.beatId)) beatsAfterLast += 1;
        }
        // Once the five-minute line has been said (and the lesson has moved on from it), lift the limit again: the table's own countdown comes later.
        if (!soonLifted && limitWarnings.some((w) => w.kind === "soon") && beatsAfterSoon >= 2) {
          soonLifted = true;
          await setLimit(null);
        }
      }
      if (snap.beatId !== "—") lastBeatSeen = snap.beatId;
      // Early in the sitting (15 s in, while she is teaching): the limit five minutes and eight seconds away.
      if (!soonArmed && snap.status === "teaching" && (Date.now() - started) / 1000 >= 15) {
        const state = await limitState();
        if (state) {
          soonArmed = true;
          soonArmedAt = snap.beatId;
          // Every caption the screen shows from here on (a line with no clip is read on the board for under two seconds).
          await evaluate(page, `(() => { window.__limitWarnings = []; window.__captionsSeen = new Set(); const note = () => { const c = document.querySelector('[data-testid="caption"]'); if (c && c.textContent) window.__captionsSeen.add(c.textContent.trim()); }; new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true }); return true; })()`);
          await setLimit(state.usedMinutes + 5 + 8 / 60);
          console.log(`      ⏱ daily limit set 5 min 8 s away at ${snap.beatId.replace(/^authored:/u, "")} (${state.usedMinutes.toFixed(2)} min used)`);
        }
      }
      if (armed) overlay = (await evaluate<string>(page, `(document.querySelector('[data-testid="debug-minutes"]')?.textContent ?? "no overlay").trim()`).catch(() => "no overlay")) ?? "no overlay";
      if (snap.status === "done" || /:close$/u.test(snap.beatId)) {
        if (/:close$/u.test(snap.beatId) && cardText === "") {
          cardText = await evaluate<string>(page, `((document.querySelector('[data-testid="board-content"]')?.textContent ?? '') + ' | ' + (document.querySelector('[data-testid="caption"]')?.textContent ?? '')).trim()`).catch(() => "");
          closedAt = snap.beatId;
          await shoot(snap.beatId, "-daily-limit-close");
        }
        if (snap.status === "done") {
          // The close card is on screen for as long as her closing line takes: read it before leaving.
          if (cardText === "") cardText = await evaluate<string>(page, `((document.querySelector('[data-testid="board-content"]')?.textContent ?? '') + ' | ' + (document.querySelector('[data-testid="caption"]')?.textContent ?? '')).trim()`).catch(() => "");
          break;
        }
      }
      // Inside the table: the limit a minute and five seconds away (crossed mid-exercise, after her one-minute line).
      if (!armed && snap.beatId === "authored:readWrite4Digit:18d") {
        armed = true;
        armedAt = snap.beatId;
        if (!soonLifted) {
          soonLifted = true;
          await setLimit(null);
        }
        const state = await limitState();
        await setLimit((state?.usedMinutes ?? 0) + 65 / 60);
        // The overlay shows it (and the drill reads the overlay's minutes line from here on).
        for (let i = 0; i < 5; i += 1) {
          await clickSelector('[data-testid="session-title"]');
          await wait(120);
        }
        console.log(`      ⏱ daily limit set 65 s away at ${snap.beatId.replace(/^authored:/u, "")} (${((Date.now() - started) / 60000).toFixed(1)} min into the sitting, ${(state?.usedMinutes ?? 0).toFixed(2)} min used)`);
      }
      // Cut inside the exercise? The close beat must never arrive between its first and last beat.
      if (armed && /:close$/u.test(snap.beatId) && closedInside === "" && seenAfterArm.length > 0 && !seenAfterArm.includes(TABLE_LAST)) closedInside = `CLOSED INSIDE the exercise (last table beat seen ${seenAfterArm[seenAfterArm.length - 1]})`;
      if (armed && snap.beatId.startsWith("authored:readWrite4Digit:18") && !seenAfterArm.includes(snap.beatId)) seenAfterArm.push(snap.beatId);
      // One answer per open turn — but a turn that reopens (a retry), or one
      // still open 12 s later (tiles left in a bank never time out, by
      // design), is answered again rather than deadlocking the walk.
      if (snap.status !== "turn") lastDrillTurn = "";
      if (snap.status === "turn" && snap.yourTurn && (snap.beatId !== lastDrillTurn || Date.now() - lastDrillAnswerAt > 12_000)) {
        lastDrillTurn = snap.beatId;
        lastDrillAnswerAt = Date.now();
        await wait(500);
        await answer(snap);
      }
      await wait(350);
    }
    // The row is written as the beat ends (fire and forget): give it a moment.
    let closeRow: { planner_decision?: { reason?: string; minutesToday?: number } } | undefined;
    for (let i = 0; i < 10 && !closeRow; i += 1) {
      await wait(500);
      const { data: closeRows } = await supabaseAdmin
        .from("session_log")
        .select("beat_id, beat_type, planner_decision, director_text, started_at")
        .eq("child_id", childA)
        .in("beat_type", ["CLOSE_SESSION", "SESSION_METRICS"])
        .order("started_at", { ascending: false })
        .limit(4);
      closeRow = (closeRows ?? []).find((r) => r.beat_type === "CLOSE_SESSION") as typeof closeRow;
    }
    const reason = closeRow?.planner_decision?.reason ?? "(none)";
    const limitLine = cardText.includes(AUTHORED_LINES.closeSessionDailyLimit.replace(/[.—].*$/u, "").trim());
    const wholeTable = seenAfterArm.includes(TABLE_LAST);
    closeDrill =
      `limit set 65 s away at ${armedAt.replace(/^authored:/u, "")} (inside ${TABLE_FIRST.replace(/^authored:/u, "")}…${TABLE_LAST.replace(/^authored:/u, "")}) · ` +
      `the exercise finished ${wholeTable ? "before the close" : "NOT — cut short"} (${seenAfterArm.length} table beat(s) after arming, last ${(seenAfterArm[seenAfterArm.length - 1] ?? "none").replace(/^authored:/u, "")}) · ` +
      `${closedInside || "no cut inside the exercise"} · closed at ${closedAt.replace(/^authored:/u, "")} · card "${cardText.slice(0, 60)}" · session_log close_reason=${reason} (minutes_today ${closeRow?.planner_decision?.minutesToday ?? "—"}) · overlay [${overlay}] · last beats ${recent.join(" → ")}`;
    drillNote("the close says why: the daily limit waits for the exercise, then closes with a reason", wholeTable && closedInside === "" && limitLine && reason === "daily_limit", closeDrill);
    const soonSaid = limitWarnings.filter((w) => w.kind === "soon");
    const lastSaid = limitWarnings.filter((w) => w.kind === "last");
    const at = (w: LimitWarning | undefined) => (w ? `${w.remaining} s left, before ${w.before.replace(/^authored:/u, "")}` : "—");
    limitWarningDrill =
      `set 5 min 8 s away at ${soonArmedAt.replace(/^authored:/u, "")}: five-minute line ${soonSaid.length}× (${at(soonSaid[0])}), shown ${captionsSeen.soon ? "yes" : "NO"}, the lesson went on ${beatsAfterSoon} beat(s) · ` +
      `set 65 s away at ${armedAt.replace(/^authored:/u, "")}: five-minute line not repeated ${soonSaid.length === 1 ? "yes" : "NO"} · one-minute line ${lastSaid.length}× (${at(lastSaid[0])}), shown ${captionsSeen.last ? "yes" : "NO"}, ${beatsAfterLast} beat(s) before the close · closed ${reason}`;
    drillNote("the daily lesson limit warns first: the five-minute line once and the lesson carries on", soonSaid.length === 1 && (soonSaid[0]?.remaining ?? 0) <= 300 && (soonSaid[0]?.remaining ?? 0) > 60 && captionsSeen.soon && beatsAfterSoon >= 2, limitWarningDrill);
    drillNote("the daily lesson limit warns first: the one-minute line once, then the close after the exercise", lastSaid.length === 1 && limitWarnings.length === 2 && (lastSaid[0]?.remaining ?? 99) <= 60 && captionsSeen.last && beatsAfterLast >= 1 && reason === "daily_limit" && wholeTable, limitWarningDrill);
    if (lastSeen === "—") console.log("      ⏱ close drill: the session never started");
  }

  console.log(`close-reason drill: ${closeDrill}`);
  console.log(`limit-warning drill: ${limitWarningDrill}`);
  console.log(`\nstep 1 screen text, both states:`);
  for (const entry of step1Texts) console.log(`  [${entry.state}]\n${entry.text.split("\n").map((l) => `    ${l}`).join("\n")}`);
  // The children this run created (and every row keyed to them) are removed again.
  if (childA) {
    const { data: mine } = await supabaseAdmin.from("children").select("id").eq("parent_contact", "+94770000002");
    for (const row of mine ?? []) {
      for (const table of ["session_log", "child_progress", "child_weaknesses", "child_profile"] as const) await supabaseAdmin.from(table).delete().eq("child_id", row.id);
      await supabaseAdmin.storage.from("child-extras").remove([`${row.id}.json`]).catch(() => undefined);
      await supabaseAdmin.from("children").delete().eq("id", row.id);
    }
    console.log(`cleanup: ${mine?.length ?? 0} test child(ren) and their rows removed`);
  }

  page.close();
  browser.kill();
  const layoutClean = flagged.filter((a) => a.audit!.portraitOverlap || a.audit!.cutOff || a.audit!.small.length).length === 0;
  const voiceClean = (apiCalls.get("hear") ?? 0) === 0 && (apiCalls.get("planner") ?? 0) === 0;
  const answerFlowClean = inputNotShown === 0 && rodRunBad === 0 && overlapFindings.length === 0 && paidCallCount === 0 && answerPathSpoken.every((ms) => ms <= 200);
  const latencyClean = latencies.length === 0 || [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)]! <= 200;
  const clusterClean = clusterA.every((r) => r.startsWith("PASS"));
  const drillsClean = !DRILLS || drillResults.every((r) => r.startsWith("PASS"));
  process.exit(done && layoutClean && voiceClean && latencyClean && clusterClean && drillsClean && answerFlowClean ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
