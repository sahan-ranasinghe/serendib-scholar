/**
 * LATENCY (docs/qa/session1-triage.md, cluster H) — `npm run latency:check -- <baseUrl>`.
 *
 * Every tap in the app must answer at once. For EVERY route (and the sheets
 * reachable from it), at 4× CPU throttle, under three networks — online,
 * Slow 3G, offline — this measures, over five taps each:
 *
 *   tap → first visual response   the first DOM mutation after the tap
 *                                  (median < 100 ms, p95 < 200 ms)
 *   tap → interactive content     the destination's real, data-backed
 *                                  render ([data-screen-ready]), not its
 *                                  skeleton (median < 500 ms on Slow 3G
 *                                  with the cache warm)
 *
 * and layout shift while the content lands (CLS < 0.1). It prints the
 * per-route table for all three conditions and exits 1 on any route over
 * budget. Runs against the production build with a child onboarded through
 * the API; the app is warmed once so the store's cache and the service
 * worker's shell are in place, as they are on a child's phone.
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { launch, connect, openPage, evaluate, wait, type Cdp } from "./lib/cdp";
import { ONBOARD_VIA_API_JS } from "./lib/onboard";
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3001";
const SAMPLES = 5;

interface Target { name: string; from: string; tap: string; ready: string; kind: "route" | "sheet"; /** No control in the app leads here: the tap is a router push (the same client transition a link makes). */ push?: string }
/** From a screen where the control is visible: tap it, wait for the destination's ready marker. */
const TARGETS: Target[] = [
  { name: "/lessons (nav)", from: "/home", tap: 'nav[data-testid="bottom-nav"] a[href="/lessons"]', ready: '[data-screen-ready="lessons"]', kind: "route" },
  { name: "/practice (nav)", from: "/home", tap: 'nav[data-testid="bottom-nav"] a[href="/practice"]', ready: '[data-screen-ready="practice"]', kind: "route" },
  { name: "/rewards (nav)", from: "/home", tap: 'nav[data-testid="bottom-nav"] a[href="/rewards"]', ready: '[data-screen-ready="rewards"]', kind: "route" },
  { name: "/home (nav)", from: "/lessons", tap: 'nav[data-testid="bottom-nav"] a[href="/home"]', ready: '[data-screen-ready="home"]', kind: "route" },
  { name: "/lessons/1 (map node)", from: "/lessons", tap: 'a[href="/lessons/1"]', ready: '[data-screen-ready="lesson-detail"]', kind: "route" },
  { name: "/progress (push)", from: "/home", tap: "body", push: "/progress", ready: '[data-screen-ready="progress"]', kind: "route" },
  { name: "/session/summary (push)", from: "/home", tap: "body", push: "/session/summary", ready: '[data-screen-ready="summary"]', kind: "route" },
  { name: "/parent (gate)", from: "/home", tap: 'a[href="/parent"]', ready: '[data-screen-ready="parent"], [data-testid="pin-gate"], [data-testid="pin-create"]', kind: "route" },
  { name: "/parent/settings (row)", from: "/parent", tap: '[data-testid="row-limit"]', ready: '[data-screen-ready="parent-settings"], [data-testid="pin-gate"], [data-testid="pin-create"]', kind: "route" },
  { name: "/parent/report (row)", from: "/parent", tap: '[data-testid="row-report"]', ready: '[data-screen-ready="parent-report"], [data-testid="pin-gate"], [data-testid="pin-create"]', kind: "route" },
  { name: "/rewards/certificate (push)", from: "/rewards", tap: "body", push: "/rewards/certificate", ready: '[data-screen-ready="certificate"]', kind: "route" },
  { name: "/session (start)", from: "/home", tap: '[data-testid="start-lesson"], a[href="/session"]', ready: '.lesson-screen', kind: "route" },
  { name: "outfit sheet", from: "/rewards", tap: '[data-testid="outfit"][data-outfit="0"]', ready: '[data-testid="outfit-sheet"]', kind: "sheet" },
  { name: "stop confirm (lesson)", from: "/session", tap: 'button[aria-label="නවත්වන්න"]', ready: '[data-testid="confirm-sheet"]', kind: "sheet" },
  { name: "PIN reset panel (parent)", from: "/parent/pin", tap: '[data-testid="pin-reset-open"]', ready: '[data-testid="pin-reset-code"]', kind: "sheet" },
];

type Condition = "online" | "slow-3g" | "offline";
const CONDITIONS: Condition[] = ["online", "slow-3g", "offline"];

async function setNetwork(page: Cdp, condition: Condition): Promise<void> {
  await page.send("Network.enable");
  if (condition === "online") await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  else if (condition === "slow-3g") await page.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
  else await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : NaN);
const p95 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]! : NaN);

/** One tap, measured inside the page: first mutation after the click, the ready marker, the layout shift meanwhile. */
const MEASURE_JS = (tap: string, ready: string, push?: string) => `new Promise((resolve) => {
  const el = document.querySelector(${JSON.stringify(tap)});
  if (!el) return resolve({ error: 'no control' });
  const push = ${JSON.stringify(push ?? null)};
  let first = null; let readyAt = null; let cls = 0;
  const t0 = performance.now();
  const mo = new MutationObserver(() => { if (first === null) first = performance.now() - t0; });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  let po = null;
  try { po = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value; }); po.observe({ type: 'layout-shift', buffered: false }); } catch {}
  if (push) { const r = window.next && window.next.router; if (!r) return resolve({ error: 'no app router' }); r.push(push); }
  else el.click();
  const started = performance.now();
  const tick = () => {
    const hit = document.querySelector(${JSON.stringify(ready)});
    if (hit && !hit.closest('.app-skeleton')) { readyAt = performance.now() - t0; }
    if (readyAt !== null || performance.now() - started > 8000) {
      setTimeout(() => { mo.disconnect(); po && po.disconnect(); resolve({ first, ready: readyAt, cls, skeleton: !!document.querySelector('.app-skeleton'), url: location.pathname }); }, 250);
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})`;

async function main(): Promise<void> {
  const accessCode = /ACCESS_CODE=(.+)/u.exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf8"))?.[1]?.trim() ?? "";
  const { browser, wsUrl } = await launch("latency");
  process.on("exit", () => { try { browser.kill(); } catch { /* already gone */ } });
  const root = await connect(wsUrl, "latency");
  const page = await openPage(root);
  // Diagnostics for a full page load: the page's own console/exceptions and the navigations the browser reports.
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  const consoleLines: string[] = [];
  page.on("Runtime.consoleAPICalled", (raw) => {
    const e = raw as unknown as { type: string; args: Array<{ value?: unknown; description?: string }> };
    if (e.type === "error" || e.type === "warning") consoleLines.push(`${e.type}: ${e.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200)}`);
  });
  page.on("Runtime.exceptionThrown", (raw) => {
    const e = raw as unknown as { exceptionDetails: { text: string; exception?: { description?: string } } };
    consoleLines.push(`EXCEPTION: ${(e.exceptionDetails.exception?.description ?? e.exceptionDetails.text).slice(0, 300)}`);
  });
  const navigations: string[] = [];
  page.on("Page.frameNavigated", (raw) => {
    const e = raw as unknown as { frame: { parentId?: string; url: string }; type?: string };
    if (!e.frame.parentId) navigations.push(`${e.type ?? "?"} → ${e.frame.url.replace(BASE, "")}`);
  });
  page.on("Page.frameRequestedNavigation", (raw) => {
    const e = raw as unknown as { url: string; reason: string; disposition: string };
    navigations.push(`requested (${e.reason}, ${e.disposition}) → ${e.url.replace(BASE, "")}`);
  });
  page.on("Page.frameScheduledNavigation", (raw) => {
    const e = raw as unknown as { url: string; reason: string; delay: number };
    navigations.push(`scheduled (${e.reason}, ${e.delay}s) → ${e.url.replace(BASE, "")}`);
  });
  page.on("Page.frameStartedNavigating", (raw) => {
    const e = raw as unknown as { url: string; navigationType: string };
    navigations.push(`started (${e.navigationType}) → ${e.url.replace(BASE, "")}`);
  });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send("Page.navigate", { url: `${BASE}/` });
  await wait(1500);
  const onboarded = await evaluate<{ ok: boolean; child_id?: string; step?: string; status?: number; error?: string }>(page, ONBOARD_VIA_API_JS(accessCode, "වේග දරුවා")).catch((e): { ok: boolean; child_id?: string; step?: string; status?: number; error?: string } => ({ ok: false, error: String(e) }));
  if (onboarded.child_id) (globalThis as { __harnessChild?: string }).__harnessChild = onboarded.child_id;
  if (!onboarded.ok) throw new Error(`could not onboard a child (${onboarded.step ?? "?"} ${onboarded.status ?? ""} ${onboarded.error ?? ""})`);
  // A parent PIN, so /parent is the zone (its rows are the taps measured below), not the create-a-PIN screen.
  await evaluate(page, `fetch("/api/parent/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "1234" }) }).then((r) => r.status)`);
  // Warm: the store hydrates, the service worker installs and precaches the shell, every route is visited once.
  for (const route of ["/home", "/lessons", "/lessons/1", "/practice", "/rewards", "/progress", "/session/summary", "/parent"]) {
    await page.send("Page.navigate", { url: `${BASE}${route}` });
    await wait(1200);
  }
  await wait(2500);
  await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const rows: Array<{ condition: Condition; target: string; first: number[]; ready: number[]; cls: number[]; notes: string[] }> = [];
  for (const condition of CONDITIONS) {
    for (const target of TARGETS) {
      const row = { condition, target: target.name, first: [] as number[], ready: [] as number[], cls: [] as number[], notes: [] as string[] };
      for (let i = 0; i < SAMPLES; i += 1) {
        await setNetwork(page, "online");
        await page.send("Page.navigate", { url: `${BASE}${target.from}` });
        await wait(900);
        // The control must be there AND the page hydrated (a tap on the server HTML before React attaches is a plain anchor click — a full load).
        for (let w = 0; w < 100; w += 1) {
          if (await evaluate<boolean>(page, `!!document.querySelector(${JSON.stringify(target.tap)}) && document.documentElement.hasAttribute('data-hydrated')`).catch(() => false)) break;
          await wait(100);
        }
        // A settled screen, as a child sees it before tapping: the store's first refresh has had its moment.
        await wait(600);
        await setNetwork(page, condition);
        navigations.length = 0;
        consoleLines.length = 0;
        const m = await evaluate<{ error?: string; first: number | null; ready: number | null; cls: number; skeleton: boolean; url: string } | undefined>(page, MEASURE_JS(target.tap, target.ready, target.push)).catch((e) => ({ error: String(e), first: null, ready: null, cls: 0, skeleton: false, url: "" }));
        if (!m) {
          // The page's JS context was torn down mid-measurement: the tap caused a FULL page load, not a client transition.
          row.notes.push(`FULL PAGE LOAD (context destroyed; navigations: ${navigations.slice(-4).join(", ") || "none reported"}; console: ${consoleLines.slice(-2).join(" | ") || "clean"})`);
          continue;
        }
        if (m.error) { row.notes.push(m.error); continue; }
        if (m.first !== null) row.first.push(m.first);
        if (m.ready !== null) row.ready.push(m.ready);
        else row.notes.push(`no content in 8 s (${m.skeleton ? "skeleton up" : "no skeleton"}, at ${m.url})`);
        row.cls.push(m.cls);
      }
      rows.push(row);
    }
  }
  await setNetwork(page, "online");

  const failures: string[] = [];
  for (const condition of CONDITIONS) {
    console.log(`\n== ${condition} · 4× CPU · tap → first visual response / tap → interactive content (ms, ${SAMPLES} taps) ==`);
    console.log(`${"route / sheet".padEnd(28)} ${"first p50".padStart(9)} ${"first p95".padStart(9)} ${"ready p50".padStart(9)} ${"ready p95".padStart(9)} ${"CLS".padStart(6)}  notes`);
    for (const r of rows.filter((x) => x.condition === condition)) {
      const f50 = median(r.first), f95 = p95(r.first), r50 = median(r.ready), r95 = p95(r.ready), cls = Math.max(0, ...r.cls);
      const over: string[] = [];
      if (!(f50 < 100)) over.push("first p50");
      if (!(f95 < 200)) over.push("first p95");
      // Interactive content: budgeted with the cache warm (online and Slow 3G); offline must still render the cached copy for the store-backed screens.
      const interactiveBudget = r.target.startsWith("/session (") ? null : 500;
      if (interactiveBudget !== null && !(r50 < interactiveBudget)) over.push("ready p50");
      if (!(cls < 0.1)) over.push("CLS");
      if (r.notes.some((n) => n.startsWith("FULL PAGE LOAD"))) over.push("full page load");
      if (r.first.length === 0 && r.ready.length === 0 && !r.notes.some((n) => n.startsWith("FULL PAGE LOAD"))) over.push("no measurement");
      const flag = over.length ? `OVER: ${over.join(", ")}` : "";
      console.log(`${r.target.padEnd(28)} ${fmt(f50)} ${fmt(f95)} ${fmt(r50)} ${fmt(r95)} ${cls.toFixed(3).padStart(6)}  ${[flag, ...new Set(r.notes)].filter(Boolean).join(" · ")}`);
      if (over.length) failures.push(`${condition} ${r.target}: ${over.join(", ")}`);
    }
  }
  console.log(`\nlatency: ${failures.length === 0 ? "every route and sheet within budget under all three networks" : `${failures.length} over budget`}`);
  for (const f of failures) console.log(`  ✗ ${f}`);

  await cleanup();
  page.close();
  browser.kill();
  process.exit(failures.length === 0 ? 0 : 1);
}

const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n)).padStart(9) : "—".padStart(9));

const cleanup = async (): Promise<void> => {
  const id = (globalThis as { __harnessChild?: string }).__harnessChild;
  if (!id) return;
  for (const table of ["session_log", "child_progress", "child_weaknesses", "child_profile", "debug_reports"] as const) await supabaseAdmin.from(table).delete().eq("child_id", id);
  await supabaseAdmin.storage.from("child-extras").remove([`${id}.json`]).catch(() => undefined);
  await supabaseAdmin.from("children").delete().eq("id", id);
};

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  void cleanup().finally(() => process.exit(1));
});
