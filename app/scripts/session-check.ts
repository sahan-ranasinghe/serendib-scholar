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
 * same code in this process's env. At the end it prints:
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
import { HOME_SESSION_JS, ONBOARD_VIA_API_JS } from "./lib/onboard";

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
  await tapInView('[data-testid="splash-start"]');
  // The device gate may cover the step the moment it mounts (a fresh device has no device cookie): the route is the assertion, the gate is handled next.
  const toOnboarding = await waitFor(`location.pathname === '/onboarding/1'`);
  checkA("fresh device → onboarding", splash.screen === "Splash" && toOnboarding, `splash "පටන් ගමු" → ${(await where()).url}`);
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
  checkA("step 1 with no SMS provider: dev notice shown, no countdown, any 4-digit code accepted", devNotice.includes("SMS තහවුරු කිරීම තවම සක්‍රීය නැහැ") && devNotice.includes("dev: any 4-digit code works") && noCountdown && toProfile, `notice "${devNotice.slice(0, 70)}" · countdown/send/resend controls absent ${noCountdown} · code 7319 → ${toProfile ? "/onboarding/2" : "stuck"}`);
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
      for (const table of ["session_log", "child_progress", "child_weaknesses", "child_profile"] as const) await supabaseAdmin.from(table).delete().eq("child_id", row.id);
      await supabaseAdmin.from("children").delete().eq("id", row.id);
    }
    browser.kill();
    process.exit(clusterA.every((r) => r.startsWith("PASS")) ? 0 : 1);
  }
  await setInput('[data-testid="onb-name"]', "හසිනි");
  await tapInView('[data-avatar="ලේනා"]');
  await tapInView('[data-grade="5"]');
  await wait(200);
  await tapInView('[data-testid="onb-next"]');
  const toConsent = await waitFor(`location.pathname === '/onboarding/3'`);
  await step(`onboarding 3 · consent${toConsent ? "" : " (NOT REACHED)"}`);
  await tapInView('[data-testid="onb-next"]');
  await waitFor(`location.pathname === '/onboarding/4'`);
  await step("onboarding 4 · subscription (stub) — skipped with පසුව තීරණය කරන්නම්");
  await tapInView('a[href="/home"]');
  const toHome = await waitFor(`location.pathname === '/home' && !!document.querySelector('[data-testid="start-lesson"]')`);
  const homeSession = toHome ? await evaluate<{ lesson: number; session: number } | null>(page, HOME_SESSION_JS) : null;
  await step(`home · continue card offers ${homeSession ? `session ${homeSession.session}` : "?"}`);
  checkA("onboarding writes the child and lands home at session 1", toHome && homeSession?.session === 1, `home continue card: ${JSON.stringify(homeSession)}`);
  await tapInView('[data-testid="start-lesson"]');
  await waitFor(`location.pathname === '/session'`);
  await step("session (\"පටන් ගමු\" on the continue card)");
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
    await tapSelector('[aria-label="නවත්වන්න"]');
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
    const strip = [...document.querySelectorAll('header button[aria-label]')].map((el) => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2; let reach = 0; for (let y = r.top + 2; y < r.top + 80; y += 2) { const hit = document.elementFromPoint(x, y); if (hit && (hit === el || el.contains(hit))) reach = Math.round(y - r.top); else if (y > r.bottom) break; } return { label: el.getAttribute('aria-label'), h: reach, w: Math.round(r.width + 8) }; });
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
    evaluate<number>(page, `new Promise((resolve) => { let frames = 0; const start = performance.now(); const tick = () => { frames += 1; if (performance.now() - start < 2000) requestAnimationFrame(tick); else resolve(Math.round(frames / ((performance.now() - start) / 1000))); }; requestAnimationFrame(tick); })`);
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
    inviteAt: number;
    cue: boolean;
    rowAtInvite: boolean;
    ringAtInvite: boolean;
    leakAtInvite: boolean;
    stepAtInvite: number | null;
    chipsAt: number | null;
    rowAtChips: boolean;
    leakAtChips: boolean;
    stepAtChips: number | null;
    readBackAt: number | null;
    readBack: string;
    nameInCard: string;
  }
  const practice = new Map<string, PracticeRecord>();
  /** What the board shows during reading practice: the cue, the primitive being read (the number row, the abacus, a card) and its ring, the step, and whether the expected name is visible anywhere but the chips. */
  const practiceLook = (expectedName: string) =>
    evaluate<{ cue: boolean; row: boolean; ring: boolean; step: number | null; leak: boolean }>(
      page,
      `(() => {
        const board = document.querySelector('[data-testid="lesson-board"]');
        const inBoard = (el) => { if (!el || !board) return false; const r = el.getBoundingClientRect(); const b = board.getBoundingClientRect(); return r.width > 0 && r.top >= b.top && r.bottom <= b.bottom; };
        const steps = document.querySelector('[data-testid="read-aloud-steps"]');
        const caption = (document.querySelector('[data-testid="caption"]')?.textContent ?? '');
        const name = ${JSON.stringify(expectedName)}.replace(/\\s+/g, '');
        const squash = (t) => (t || '').replace(/\\s+/g, '');
        return {
          cue: !!document.querySelector('[data-testid="pause-cue"]'),
          row: ['[data-testid="number-cards"]', '[data-testid="abacus"]', '[data-testid="text-card"]', '[data-testid="digit-picker"]'].some((sel) => inBoard(document.querySelector(sel))),
          ring: !!document.querySelector('[data-ringed], [data-testid="highlight-circle"]'),
          step: steps ? Number(steps.getAttribute('data-step')) : null,
          leak: name.length > 0 && (squash(steps ? steps.textContent : '').includes(name) || squash(caption).includes(name)),
        };
      })()`,
    );
  let retryTaps = 0;
  const practiceLog: string[] = [];
  /** Tap-to-feedback latencies, from the page's own clock (submitTypedAnswer → fireFeedback). */
  const latencies: number[] = [];
  const asksOf = new Map<string, number>();
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
      await tapSelector('[aria-label="විරාමය"]');
      await wait(400);
      const pausedNow = await isPaused();
      const eventsAtPause = await choreoCount();
      const beatAtPause = await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`);
      await wait(4000);
      const during = { paused: await isPaused(), events: await choreoCount(), beat: await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`) };
      await tapSelector('[aria-label="දිගටම"]');
      await wait(300);
      const after = { paused: await isPaused(), beat: await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`) };
      const ok = pausedNow && during.paused && during.events === eventsAtPause && during.beat === beatAtPause && !after.paused && after.beat === beatAtPause;
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
      drillNote("touch during playback", hint.includes("Zara කතා කරනවා") && !takenAsAnswer, `hint "${hint}" · not taken as an answer ${takenAsAnswer ? "NO" : "yes"} · now ${after.beatId.replace(/^authored:/u, "")} (${after.status})`);
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
      page.on("Fetch.requestPaused", (params) => {
        const id = String(params.requestId);
        const url = String((params.request as { url?: string })?.url ?? "");
        if (url.includes("/api/gemini-session")) held.push(id);
        else void page.send("Fetch.continueRequest", { requestId: id }).catch(() => undefined);
      });
      await tapSelector('[aria-label="Zara එක්ක කතා කරන්න"]');
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
      const sheet = await evaluate<{ up: boolean; portrait: number; lines: number; dimmed: boolean }>(page, `(() => { const s = document.querySelector('[data-testid="chat-sheet"]'); const p = s && s.querySelector('.zara-portrait'); return { up: !!s, portrait: p ? Math.round(p.getBoundingClientRect().width) : 0, lines: s ? s.querySelectorAll('[data-testid^="chat-line-"]').length : 0, dimmed: !!(s && s.querySelector('[data-testid="board-dim"]')) }; })()`);
      await shoot(snap.beatId, "-drill-first-hand");
      const returned = await tapSelector('[data-testid="chat-return"]');
      await wait(1200);
      for (const id of held) await page.send("Fetch.failRequest", { requestId: id, errorReason: "Aborted" }).catch(() => undefined);
      await page.send("Fetch.disable");
      const status = (await snapshot()).status;
      drillNote("first ✋ asks for the microphone", before === 0 && micAsk.up && micAsk.portrait >= 150 && micAsk.dimmed && micAsk.buttons === 2 && gumBeforeAllow === 0 && after === 1 && sheet.up && sheet.portrait >= 150 && sheet.lines === 2 && sheet.dimmed && returned && status !== "chatting", `getUserMedia calls before ✋: ${before} · P1 sheet ${micAsk.up ? "up" : "MISSING"} (Zara ${micAsk.portrait} px, dimmed ${micAsk.dimmed ? "yes" : "NO"}, ${micAsk.buttons} buttons, "${micAsk.title.trim().slice(0, 30)}") · calls before හරි: ${gumBeforeAllow} · after: ${after}${explained ? ` · her explanation: "${explained.slice(0, 40)}"` : ""} · chat sheet over the dimmed board ${sheet.up ? "up" : "MISSING"} (Zara ${sheet.portrait} px, ${sheet.lines} transcript lines) · පාඩමට ආයෙත් ${returned ? "tapped" : "MISSING"} → ${status}`);
    }
    // 3b. Zara is not a control: ten taps on her portrait change nothing and
    // start no audio. And three rapid ↺ taps ask ONCE; cancelling changes nothing.
    if (short === "readWrite4Digit:12" && !drillDone.has("audio") && snap.status === "teaching") {
      drillDone.add("audio");
      const portrait = await evaluate<{ role: string | null; cursor: string; label: string | null }>(page, `(() => { const el = document.querySelector('[data-testid="zara-portrait"]'); return el ? { role: el.getAttribute("role"), cursor: getComputedStyle(el).cursor, label: el.getAttribute("aria-label") } : { role: "MISSING", cursor: "", label: null }; })()`);
      const beforeTaps = await evaluate<{ beat: string; status: string; started: number; peak: number }>(page, `(() => { const el = document.querySelector('.lesson-screen'); const a = window.__audio ?? { started: 0, peak: 0 }; return { beat: el?.dataset.beatId ?? '—', status: el?.dataset.status ?? '—', started: a.started ?? 0, peak: a.peak ?? 0 }; })()`);
      for (let i = 0; i < 10; i += 1) {
        await tapSelector('[data-testid="zara-portrait"]');
        await wait(60);
      }
      await wait(1200);
      const afterTaps = await evaluate<{ beat: string; status: string; started: number; peak: number; sheet: boolean }>(page, `(() => { const el = document.querySelector('.lesson-screen'); const a = window.__audio ?? { started: 0, peak: 0 }; return { beat: el?.dataset.beatId ?? '—', status: el?.dataset.status ?? '—', started: a.started ?? 0, peak: a.peak ?? 0, sheet: !!document.querySelector('[data-testid="confirm-sheet"]') }; })()`);
      const inert = portrait.role === null && portrait.label === null && portrait.cursor !== "pointer" && afterTaps.beat === beforeTaps.beat && afterTaps.status === beforeTaps.status && afterTaps.started === beforeTaps.started && !afterTaps.sheet && afterTaps.peak <= 1;
      const portraitTrace = `10 portrait taps → beat ${afterTaps.beat === beforeTaps.beat ? "unchanged" : `CHANGED to ${afterTaps.beat}`}, status ${afterTaps.status === beforeTaps.status ? `unchanged (${afterTaps.status})` : `CHANGED to ${afterTaps.status}`}, clips started ${beforeTaps.started} → ${afterTaps.started} (Δ ${afterTaps.started - beforeTaps.started}), peak audible ${afterTaps.peak} · the portrait has role ${portrait.role ?? "none"}, aria-label ${portrait.label ?? "none"}, cursor ${portrait.cursor}`;
      drillNote("Zara's portrait is not a control: ten taps change nothing and start no audio", inert, portraitTrace);
      for (let i = 0; i < 3; i += 1) {
        await tapSelector('[aria-label="මුල ඉඳන් ආයෙත්"]');
        await wait(90);
      }
      await wait(600);
      const sheets = await evaluate<number>(page, `document.querySelectorAll('[data-testid="confirm-sheet"]').length`);
      const beforeCancel = await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`);
      await tapSelector('[data-testid="confirm-no"]');
      await wait(900);
      const afterCancel = await evaluate<{ beat: string; sheet: boolean; status: string; started: number }>(page, `(() => { const el = document.querySelector('.lesson-screen'); const a = window.__audio ?? { started: 0 }; return { beat: el?.dataset.beatId ?? '—', sheet: !!document.querySelector('[data-testid="confirm-sheet"]'), status: el?.dataset.status ?? '—', started: a.started ?? 0 }; })()`);
      replayTrace = `${portraitTrace} · 3 ↺ taps → ${sheets} confirm sheet(s) · cancel → beat ${afterCancel.beat === beforeCancel ? "unchanged" : `CHANGED to ${afterCancel.beat}`}, sheet ${afterCancel.sheet ? "STILL UP" : "gone"}, status ${afterCancel.status}`;
      drillNote("three ↺ taps are one question; cancel changes nothing", sheets === 1 && afterCancel.beat === beforeCancel && !afterCancel.sheet, `3 ↺ taps → ${sheets} confirm sheet(s) · cancel → beat ${afterCancel.beat === beforeCancel ? "unchanged" : `CHANGED to ${afterCancel.beat}`}, sheet ${afterCancel.sheet ? "STILL UP" : "gone"}, status ${afterCancel.status}`);
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
        digits = (JSON.parse(expected).digits as number[]).join("");
      } catch {
        digits = "";
      }
    } else if (!/\d/u.test(expected)) {
      const named = NAME_TO_NUMBER.get(expected.replace(/\s/gu, ""));
      digits = named === undefined ? "" : String(named);
    }
    if (!digits) {
      note({ beatId: snap.beatId, via: `nothing tappable for "${expected.slice(0, 24)}"`, answer: "" });
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
          await tapSelector('[data-testid="word-bank-done"]');
          note({ beatId: snap.beatId, via: `word bank (${placed}/${words.length} tiles)`, answer: expected });
          return;
        }
        for (const digit of digits) {
          await evaluate(page, `(() => { const k = [...document.querySelectorAll('[data-testid="number-pad"] button')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(digit)}); k && k.click(); return true; })()`);
          await wait(80);
        }
        await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[aria-label="done"]'); k && k.click(); return true; })()`);
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
        await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[aria-label="done"]'); k && k.click(); return true; })()`);
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
    await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[aria-label="done"]'); k && k.click(); return true; })()`);
    note({ beatId: snap.beatId, via: wrong ? "number pad (WRONG on purpose)" : "number pad", answer: digits });
  };

  const buildSeen = await evaluate<{ page: string; server: string }>(page, `(async () => ({ page: document.querySelector('meta[name="ss-build"]')?.getAttribute('content') ?? '?', server: await fetch("/api/build", { cache: "no-store" }).then((r) => r.json()).then((j) => j.sha).catch(() => "?") }))()`).catch(() => ({ page: "?", server: "?" }));
  console.log(`build under test: page ${buildSeen.page} · server ${buildSeen.server}${buildSeen.page === buildSeen.server ? "" : " — MISMATCH (a stale page)"}`);
  console.log(`session-1 run: ${BASE} · mobile ${VIEW_W}×${VIEW_H} ${SCHEME} · up to ${MAX_MINUTES} min`);
  let done = false;
  while (Date.now() - started < MAX_MINUTES * 60_000) {
    const snap = await snapshot();
    if (snap.beatId !== lastBeat && snap.beatId !== "—") {
      lastBeat = snap.beatId;
      // Let the beat's first events land, then photograph and audit it.
      await wait(900);
      await shoot(snap.beatId);
      const audit = await evaluate<Audit>(page, AUDIT_JS);
      audits.push({ beatId: snap.beatId, audit });
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
        console.log(`      ↻ tapped ආයෙත් උත්සාහ කරන්න on ${snap.beatId.replace(/^authored:/u, "")}`);
        await wait(400);
      }
    }
    // A soft check's pause: one tap counts as engagement. Reading practice: watch, never tap.
    if (snap.status === "pausing" && snap.yourTurn?.startsWith("soft") && snap.beatId !== lastTurnBeat) {
      lastTurnBeat = snap.beatId;
      await tapSelector('[data-soft-tap]');
      note({ beatId: snap.beatId, via: "tap on the board (soft pause)", answer: "(tapped)" });
    }
    // Reading practice, step 1 — the invitation. Cluster D: the number row (and its ring) must
    // still be on the board, and the answer must appear nowhere yet (not in the step cards, not
    // in the caption). The chips and her read-back are recorded at the turn, below.
    if (snap.status === "pausing" && snap.pause === "mic" && !practiceSeen.has(snap.beatId)) {
      practiceSeen.add(snap.beatId);
      const expectedName = expectedById.get(snap.beatId)?.expectedAnswer ?? "";
      const look = await practiceLook(expectedName);
      practice.set(snap.beatId, { inviteAt: Date.now(), cue: look.cue, rowAtInvite: look.row, ringAtInvite: look.ring, leakAtInvite: look.leak, stepAtInvite: look.step, chipsAt: null, rowAtChips: false, leakAtChips: false, stepAtChips: null, readBackAt: null, readBack: "", nameInCard: "" });
      await shoot(snap.beatId, "-reading-practice-invite");
    }
    if (snap.status === "turn" && snap.yourTurn && (snap.beatId !== lastTurnBeat || turnClosed)) {
      lastTurnBeat = snap.beatId;
      turnClosed = false;
      await wait(700);
      await shoot(snap.beatId, "-your-turn");
      const shortTurn = snap.beatId.replace(/^authored:/u, "");
      const record = practice.get(snap.beatId);
      if (record && record.chipsAt === null) {
        // Step 2 — the chips are up, the row is still there, and the answer is nowhere but the chips.
        const look = await practiceLook(expectedById.get(snap.beatId)?.expectedAnswer ?? "");
        record.chipsAt = Date.now();
        record.rowAtChips = look.row;
        record.leakAtChips = look.leak;
        record.stepAtChips = look.step;
      }
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
        for (const digit of ["0", "0"]) {
          await key(digit);
          await wait(80);
        }
        await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[aria-label="done"]'); k && k.click(); return true; })()`);
        note({ beatId: snap.beatId, via: "number pad (one digit at 11 s, one at 23 s, then the rest)", answer: "1000" });
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
        await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[aria-label="done"]'); k && k.click(); return true; })()`);
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
      if (record && record.readBackAt === null) {
        // Step 3 — her read-back, only after the judge: its text reaches the caption as it plays.
        const name = expectedById.get(snap.beatId)?.expectedAnswer ?? "";
        for (let i = 0; i < 60 && record.readBackAt === null; i += 1) {
          await wait(150);
          const seen = await evaluate<{ caption: string; card: string }>(page, `({ caption: (document.querySelector('[data-testid="caption"]')?.textContent ?? '').trim(), card: document.querySelector('[data-testid="read-aloud-steps"][data-step="3"]') ? 'step 3' : '' })`).catch(() => ({ caption: "", card: "" }));
          if (seen.caption.includes("මම කියන්නම්") || (name && seen.caption.replace(/\s+/gu, "").includes(name.replace(/\s+/gu, ""))) || seen.card) {
            // The card names the number the instant her read-back starts; the caption follows as the composed clip begins.
            record.readBackAt = Date.now();
            record.nameInCard = seen.card;
            let caption = seen.caption;
            // Up to 3 s: the composed clip for a four-digit name takes longer to assemble than a two-digit one.
            for (let j = 0; j < 20 && !(caption.includes("මම කියන්නම්") || (name && caption.replace(/\s+/gu, "").includes(name.replace(/\s+/gu, "")))); j += 1) {
              await wait(150);
              caption = await evaluate<string>(page, `(document.querySelector('[data-testid="caption"]')?.textContent ?? '').trim()`).catch(() => caption);
            }
            record.readBack = caption;
          }
        }
        await shoot(snap.beatId, "-reading-practice-readback");
        const r = record;
        const order = r.chipsAt !== null && r.readBackAt !== null && r.inviteAt < r.chipsAt && r.chipsAt < r.readBackAt;
        const line = `${shortTurn}: invite@0 s (🎤 ${r.cue ? "cue" : "NO CUE"}, row ${r.rowAtInvite ? "on screen" : "MISSING"}, ring ${r.ringAtInvite ? "yes" : "no"}, step ${r.stepAtInvite}, answer ${r.leakAtInvite ? "VISIBLE" : "hidden"}) → chips@${r.chipsAt ? ((r.chipsAt - r.inviteAt) / 1000).toFixed(1) : "?"} s (row ${r.rowAtChips ? "on screen" : "MISSING"}, step ${r.stepAtChips}, answer ${r.leakAtChips ? "VISIBLE" : "hidden"}) → readBack@${r.readBackAt ? ((r.readBackAt - r.inviteAt) / 1000).toFixed(1) : "?"} s ("${r.readBack.slice(0, 36)}", cards at ${r.nameInCard || "step ?"})`;
        practiceLog.push(line);
        console.log(`      📖 reading practice ${line}`);
        if (DRILLS) drillNote(`reading practice ${shortTurn}: row on screen · answer hidden until judged · invite → chips → read-back`, order && r.cue && r.rowAtInvite && r.rowAtChips && !r.leakAtInvite && !r.leakAtChips, line);
      }
      for (let i = 0; i < 20; i += 1) {
        const ms = await evaluate<number | null>(page, `(() => { const t = window.__lastTapAt, f = window.__lastFeedbackAt; return t && f && f >= t ? Math.round(f - t) : null; })()`);
        if (ms !== null) {
          latencies.push(ms);
          await evaluate(page, `window.__lastTapAt = undefined; true`);
          break;
        }
        await wait(50);
      }
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

  // ---- Cluster A / G regression assertions (after the sitting) ---------------------
  let restartTrace = "not run";
  if (childA) {
    // Two children on one device get separate resume points.
    const second = await evaluate<{ ok: boolean; child_id?: string; step?: string; error?: string }>(page, ONBOARD_VIA_API_JS(ACCESS_CODE, "රවිඳු", childA));
    const homeB = second.ok ? await evaluate<{ lesson: number; session: number } | null>(page, HOME_SESSION_JS) : null;
    const back = await evaluate<{ ok: boolean }>(page, `fetch("/api/child/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ child_id: ${JSON.stringify(childA)} }) }).then((r) => r.json())`);
    const homeA = back.ok ? await evaluate<{ lesson: number; session: number } | null>(page, HOME_SESSION_JS) : null;
    checkA("two children on one device get separate resume points", second.ok && homeB?.session === 1 && homeA?.session === (done ? 2 : 1), `second child ${second.ok ? second.child_id : `FAILED at ${second.step} (${second.error})`} → home session ${homeB?.session ?? "?"} · switch back → home session ${homeA?.session ?? "?"} (expected ${done ? 2 : 1})`);
    // The parent zone with no PIN shows create-PIN first.
    const parentHtml = await evaluate<string>(page, `fetch("/parent").then((r) => r.text())`);
    checkA("parent zone with no PIN shows create-PIN", /data-testid="pin-create"/u.test(parentHtml) && !/data-testid="pin-gate"/u.test(parentHtml), /data-testid="pin-create"/u.test(parentHtml) ? "pin-create form rendered, no gate" : "create-PIN form NOT rendered");
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
    await evaluate(page, `(() => { const b = document.querySelector('[aria-label="අවසන් කරන්න"]'); b && b.click(); return true; })()`).catch(() => undefined);
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
    await tapSelector('[aria-label="මුල ඉඳන් ආයෙත්"]');
    const askedRestart = await waitFor(`!!document.querySelector('[data-testid="confirm-sheet"][data-confirm="restart"]')`, 6000);
    await wait(400);
    const restartAsk = await evaluate<string>(page, `(document.querySelector('[data-testid="confirm-sheet"]')?.textContent ?? '').replace(/\s+/g, " ").trim()`).catch(() => "");
    await tapSelector('[data-testid="confirm-yes"]');
    let landed = "—";
    for (let i = 0; i < 200; i += 1) {
      await wait(500);
      landed = await evaluate<string>(page, `document.querySelector('.lesson-screen')?.dataset.beatId ?? '—'`).catch(() => "—");
      if (landed !== "—") break;
    }
    const audioAfter = await evaluate<{ active: number; peak: number }>(page, `window.__audio ?? { active: 0, peak: 0 }`).catch(() => ({ active: -1, peak: -1 }));
    const firstLogged = await firstBeatOfNewestSitting(childA, beforeSittings);
    const afterSittings = [...new Set((((await supabaseAdmin.from("session_log").select("session_id").eq("child_id", childA)).data ?? []) as Array<{ session_id: string }>).map((r) => r.session_id))];
    const survivors = beforeSittings.filter((id) => afterSittings.includes(id));
    const afterMastery = (await supabaseAdmin.from("child_progress").select("*", { count: "exact", head: true }).eq("child_id", childA)).count ?? 0;
    const beat0 = script?.beats?.[0]?.id ?? "?";
    restartControlTrace = `↺ asked ("${restartAsk.slice(0, 44)}") · sittings before ${beforeSittings.length} → ${survivors.length} of them left (${afterSittings.length} now, the replay's own) · the new sitting starts at ${String(firstLogged ?? "nothing logged").replace(/^authored:/u, "")} (beat 0 = ${String(beat0).replace(/^authored:/u, "")}) · page showed ${landed.replace(/^authored:/u, "")} · child_progress ${beforeMastery} → ${afterMastery} · clips audible at the restart ${audioAfter.active}`;
    checkA("↺ confirm restarts this session at beat 0, mastery kept, nothing carried over", askedRestart && firstLogged === beat0 && survivors.length === 0 && afterMastery === beforeMastery && audioAfter.active <= 1, restartControlTrace);
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
    console.log(`\nfailure-mode drills (${drillResults.filter((r) => r.startsWith("PASS")).length}/${drillResults.length} handled visibly):`);
    for (const line of drillResults) console.log(`  ${line}`);
    for (const name of ["touch during playback", "rotation mid-beat", "backgrounded tab", "missing clip", "first ✋ asks for the microphone", "Zara's portrait is not a control", "three ↺ taps are one question", "pause at beat 5", "pause at beat 40", "pause at beat 80", "type at 11 s and 23 s", "10000 on a 4-digit answer", "reading practice readWrite4Digit:2"]) if (!drillResults.some((r) => r.includes(name))) console.log(`  SKIP  ${name}: its beat was not reached`);
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
    const controls = strip.filter((b) => ["විරාමය", "නැවත කියන්න", "අවසන් කරන්න"].includes(b.label ?? ""));
    console.log(`strip controls ⏸ ↺ ⏹ hit areas: ${controls.map((b) => `${b.label} ${b.w}×${b.h}`).join(" · ") || "not seen"} — ${controls.length === 3 && controls.every((b) => b.h >= 56) ? "all reach 56 px" : "UNDER 56 px"}`);
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
    console.log(`tap → feedback latency: median ${median === null ? "n/a" : `${median} ms`} over ${latencies.length} judged answers${sorted.length ? ` (min ${sorted[0]}, max ${sorted[sorted.length - 1]})` : ""}`);
    {
      const r1 = practiceLog.find((l) => l.startsWith("readWrite4Digit:2:"));
      console.log(`R1 trace (readWrite4Digit:2, the first read-aloud): ${r1 ?? "not reached"}`);
    }
    console.log(`reading practice seen on ${practiceLog.length} beat(s):`);
    for (const line of practiceLog) console.log(`  ${line}`);
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
  if (WRONG_BEAT) console.log(`retry button (ආයෙත් උත්සාහ කරන්න) tapped ${retryTaps} time(s) — the visible way back after a miss`);
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
  {
    const audio = await evaluate<{ active: number; peak: number }>(page, `window.__audio ?? { active: 0, peak: 0 }`).catch(() => ({ active: -1, peak: -1 }));
    console.log(`audio: the most clips audible at once over the run: ${audio.peak} (the contract is 1)`);
  }
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
  const latencyClean = latencies.length === 0 || [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)]! <= 200;
  const clusterClean = clusterA.every((r) => r.startsWith("PASS"));
  const drillsClean = !DRILLS || drillResults.every((r) => r.startsWith("PASS"));
  process.exit(done && layoutClean && voiceClean && latencyClean && clusterClean && drillsClean ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
