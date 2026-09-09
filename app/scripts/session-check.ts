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
import { connect, evaluate, launch, openPage, wait } from "./lib/cdp";
import { sinhalaNumberName } from "../src/lib/sinhalaNumber";

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
  await page.send("Page.navigate", { url: `${BASE}/` });
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
      `(() => { const el = document.querySelector('.lesson-screen'); const d = el ? el.dataset : {}; return { beatId: d.beatId ?? '—', beatType: d.beatType ?? '—', status: d.status ?? '—', yourTurn: d.yourTurn ?? null, character: d.character ?? null, stage: window.__stage ?? null, choreo: window.__choreo ?? null }; })()`,
    );

  // A real child's first tap — the gesture-resume path.
  await tap(446, 206);
  await wait(1500);
  // The device gate, the way a parent would enter it.
  const gated = await evaluate<boolean>(page, `!!document.querySelector('input[type="password"]')`);
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
    const small = [...board.querySelectorAll('[role="button"], button')].filter(visible).filter((el) => { const r = el.getBoundingClientRect(); return r.width < 47.5 || r.height < 47.5; }).map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
    const tinyText = [];
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const node = walker.currentNode; if (!node.textContent.trim()) continue; const el = node.parentElement; if (!el || !visible(el) || el.closest('[aria-hidden="true"]')) continue; const size = parseFloat(getComputedStyle(el).fontSize); if (size < 16) tinyText.push(node.textContent.trim().slice(0, 16) + ' ' + Math.round(size) + 'px'); }
    const runningList = document.getAnimations().filter((a) => a.playState === 'running' && board.contains(a.effect && a.effect.target));
    const runningNames = [...new Set(runningList.map((a) => { const t = a.effect && a.effect.target; const name = a.animationName || (a.effect && a.effect.getKeyframes ? 'motion:' + Object.keys((a.effect.getKeyframes()[0] || {})).filter((k) => !['offset','computedOffset','easing','composite'].includes(k)).join('/') : 'js'); return name + ' on ' + (t ? (t.tagName.toLowerCase() + (t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0] : '') + (t.dataset && t.dataset.testid ? '#' + t.dataset.testid : '')) : '?'); }))].slice(0, 8);
    return { overlap, portraitOverlap, cutOff, small: [...new Set(small)], tinyText: [...new Set(tinyText)].slice(0, 6), running: runningList.length, runningNames };
  })()`;
  type Audit = { overlap: number; portraitOverlap: number; cutOff: number; small: string[]; tinyText: string[]; running: number; runningNames: string[] } | null;
  const audits: Array<{ beatId: string; audit: Audit }> = [];
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
    await page.send("Page.navigate", { url: `${BASE}/` });
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
  let lastTurnBeat = "";
  let turnClosed = true;
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
    // 4. A clip that cannot be fetched: :6's line is read on the board and its events still run. The
    //    runtime preloads the next three clips, so the door is shut at :3b — :6 is the first beat whose
    //    clip is fetched behind it (:4, :5, :5a were already in hand).
    if (short === "readWrite4Digit:3b" && !drillDone.has("clip")) {
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
          taken = (await snapshot()).status !== "listening";
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
      const flags = audit ? [audit.overlap ? `overlap ${audit.overlap}` : "", audit.portraitOverlap ? `PORTRAIT OVERLAP` : "", audit.cutOff ? `cut-off ${audit.cutOff}` : "", audit.small.length ? `small ${audit.small.length}` : "", audit.tinyText.length ? `tiny-text ${audit.tinyText.length}` : ""].filter(Boolean).join(" · ") : "";
      console.log(`  ${String(seq).padStart(3, "0")} ${short.padEnd(34)} ${snap.beatType.padEnd(12)} ${(snap.stage ?? "").slice(0, 48).padEnd(48)} ${flags}`);
      if (DRILLS) await drills(snap);
    }
    if (snap.status !== "listening") turnClosed = true;
    if (snap.status === "listening" && snap.yourTurn && (snap.beatId !== lastTurnBeat || turnClosed)) {
      lastTurnBeat = snap.beatId;
      turnClosed = false;
      await wait(700);
      await shoot(snap.beatId, "-your-turn");
      await answer(snap);
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
    for (const name of ["touch during playback", "rotation mid-beat", "backgrounded tab", "missing clip"]) if (!drillResults.some((r) => r.includes(name))) console.log(`  SKIP  ${name}: its beat was not reached`);
  }
  if (fpsSamples.length) console.log(`fps while animating${CPU_THROTTLE > 1 ? ` at cpu×${CPU_THROTTLE}` : ""}: ${fpsSamples.map((s) => `${s.beatId.replace(/^authored:/u, "")} ${s.fps}`).join(", ")}`);
  const flagged = audits.filter((a) => a.audit && (a.audit.overlap || a.audit.portraitOverlap || a.audit.cutOff || a.audit.small.length || a.audit.tinyText.length));
  console.log(`layout audit: ${audits.length} beats · overlap ${audits.filter((a) => a.audit?.overlap).length} · portrait-overlap ${audits.filter((a) => a.audit?.portraitOverlap).length} · cut-off ${audits.filter((a) => a.audit?.cutOff).length} · sub-48px ${audits.filter((a) => a.audit?.small.length).length} · text<16px ${audits.filter((a) => a.audit?.tinyText.length).length}`);
  for (const a of flagged.slice(0, 20)) {
    const d = a.audit!;
    console.log(`  ${a.beatId.replace(/^authored:/u, "").padEnd(34)} ${[d.overlap ? `overlap ${d.overlap}` : "", d.portraitOverlap ? "portrait overlap" : "", d.cutOff ? `cut-off ${d.cutOff}` : "", ...d.small.map((s) => `small: ${s}`), ...d.tinyText.map((t) => `tiny: ${t}`)].filter(Boolean).join(" · ")}`);
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

  page.close();
  browser.kill();
  const layoutClean = flagged.filter((a) => a.audit!.portraitOverlap || a.audit!.cutOff || a.audit!.small.length).length === 0;
  process.exit(done && layoutClean ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
