/**
 * THE DEAD-CONTROL CRAWLER (a permanent gate, docs/qa/session1-triage.md
 * cluster H) — `npm run crawl:check -- <baseUrl>`.
 *
 * Visits every route of the app — and every sheet or dialog a route can
 * open — and clicks every tappable element on it. Each click must do
 * something the child can see: navigate, open something, or change state
 * (aria-pressed / aria-expanded / a data-* attribute / a DOM change within
 * 700 ms). A control that does nothing is a failure; the run prints the
 * route × control table and exits 1 on any dead control.
 *
 * Onboards its own child through the API (device-bound identity), and
 * removes it at the end. Needs the production build (`npm run build &&
 * DEV_ONBOARDING=stub DEV_MODE=on npx next start -p 3001`).
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { launch, connect, openPage, evaluate, wait, type Cdp } from "./lib/cdp";
import { ONBOARD_VIA_API_JS } from "./lib/onboard";
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3001";
const CHILD_NAME = "ක්‍රෝල් දරුවා";

interface Result { route: string; control: string; verdict: "navigates" | "opens" | "changes" | "prints" | "external" | "disabled" | "selected" | "DEAD"; detail: string }

/** Every route to crawl. Sheets and dialogs are discovered from the controls that open them. */
const ROUTES = ["/home", "/lessons", "/lessons/1", "/practice", "/rewards", "/rewards/certificate", "/progress", "/session/summary", "/parent", "/parent/settings", "/parent/pin", "/parent/profiles", "/parent/subscription", "/parent/report", "/parent/delete", "/offline"];

const CONTROLS_JS = `(() => {
  const els = [...document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], [role="tab"], summary')];
  const seen = new Set();
  return els.map((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return null;
    const label = (el.getAttribute('aria-label') || el.getAttribute('data-testid') || (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28) || el.tagName.toLowerCase());
    const key = label + '#' + i;
    if (seen.has(key)) return null;
    seen.add(key);
    el.setAttribute('data-crawl', String(i));
    return { index: i, label, href: el.getAttribute('href'), disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true', selected: el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-current') === 'page' || el.getAttribute('aria-selected') === 'true', tag: el.tagName.toLowerCase(), inDialog: !!el.closest('[role="dialog"], [data-sheet]') };
  }).filter(Boolean);
})()`;

const STATE_JS = `(() => ({
  url: location.pathname + location.search,
  html: document.body.innerHTML.length,
  dialogs: document.querySelectorAll('[role="dialog"], [data-sheet], [data-testid$="-sheet"]').length,
  printed: window.__printed || 0,
  pressed: [...document.querySelectorAll('[aria-pressed], [aria-expanded], [aria-current], [data-selected], [data-open], [data-confirm], [data-busy], [data-state], [data-mode]')].map((el) => (el.getAttribute('data-testid') || el.tagName) + '=' + (el.getAttribute('aria-pressed') ?? el.getAttribute('aria-expanded') ?? el.getAttribute('aria-current') ?? el.getAttribute('data-selected') ?? el.getAttribute('data-open') ?? el.getAttribute('data-confirm') ?? el.getAttribute('data-busy') ?? el.getAttribute('data-state') ?? el.getAttribute('data-mode'))).join('|'),
  focus: document.activeElement ? (document.activeElement.getAttribute('data-testid') || document.activeElement.tagName) : '',
}))()`;

async function ready(page: Cdp): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    const ok = await evaluate<boolean>(page, `document.documentElement.hasAttribute('data-hydrated') && !!document.querySelector('[data-screen-ready], [data-app-screen]:not(.app-skeleton [data-app-screen]), form, main, .lesson-screen') && !document.querySelector('.app-skeleton')`).catch(() => false);
    if (ok) return;
    await wait(150);
  }
}

async function main(): Promise<void> {
  const accessCode = /ACCESS_CODE=(.+)/u.exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf8"))?.[1]?.trim() ?? "";
  const { browser, wsUrl } = await launch("crawl");
  process.on("exit", () => { try { browser.kill(); } catch { /* already gone */ } });
  const root = await connect(wsUrl, "crawl");
  const page = await openPage(root);
  // window.print() opens a native dialog a headless browser cannot show: count the call instead.
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__printed = 0; window.print = () => { window.__printed += 1; };" });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send("Page.navigate", { url: `${BASE}/` });
  await wait(1500);
  const onboarded = await evaluate<{ ok: boolean; child_id?: string; step?: string; status?: number; error?: string }>(page, ONBOARD_VIA_API_JS(accessCode, CHILD_NAME)).catch((e): { ok: boolean; child_id?: string; step?: string; status?: number; error?: string } => ({ ok: false, error: String(e) }));
  if (onboarded.child_id) (globalThis as { __harnessChild?: string }).__harnessChild = onboarded.child_id;
  if (!onboarded.ok) throw new Error(`could not onboard a child for the crawl (${onboarded.step ?? "?"} ${onboarded.status ?? ""} ${onboarded.error ?? ""})`);
  const results: Result[] = [];
  const crawled = new Set<string>();

  const crawl = async (route: string, opener: string | null, state: string | null = null): Promise<void> => {
    const label = `${route}${state ? ` (${state})` : ""}${opener ? ` › ${opener}` : ""}`;
    if (crawled.has(label)) return;
    crawled.add(label);
    await page.send("Page.navigate", { url: `${BASE}${route}` });
    await wait(600);
    await ready(page);
    if (opener) {
      // Re-open the sheet this row belongs to.
      await evaluate(page, `(() => { const el = [...document.querySelectorAll('a[href], button, [role="button"]')].find((e) => (e.getAttribute('aria-label') || e.getAttribute('data-testid') || (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28)) === ${JSON.stringify(opener)}); el && el.click(); })()`);
      await wait(500);
    }
    const controls = await evaluate<Array<{ index: number; label: string; href: string | null; disabled: boolean; selected: boolean; tag: string; inDialog: boolean }>>(page, CONTROLS_JS).catch(() => []);
    const scope = opener ? controls.filter((c) => c.inDialog) : controls;
    for (const control of scope) {
      if (control.disabled) {
        results.push({ route: label, control: control.label, verdict: "disabled", detail: "disabled until input (expected)" });
        continue;
      }
      if (control.selected) {
        // The pressed half of a toggle, the current tab: tapping what is already chosen is a no-op by design.
        results.push({ route: label, control: control.label, verdict: "selected", detail: "already the chosen state (aria-pressed / aria-current)" });
        continue;
      }
      if (control.href && /^https?:\/\//u.test(control.href) && !control.href.startsWith(BASE)) {
        results.push({ route: label, control: control.label, verdict: "external", detail: control.href.slice(0, 40) });
        continue;
      }
      // A fresh render for every control, so one click never poisons the next.
      await page.send("Page.navigate", { url: `${BASE}${route}` });
      await wait(500);
      await ready(page);
      if (opener) {
        await evaluate(page, `(() => { const el = [...document.querySelectorAll('a[href], button, [role="button"]')].find((e) => (e.getAttribute('aria-label') || e.getAttribute('data-testid') || (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28)) === ${JSON.stringify(opener)}); el && el.click(); })()`);
        await wait(500);
      }
      await evaluate(page, CONTROLS_JS);
      const before = await evaluate<{ url: string; html: number; dialogs: number; pressed: string; focus: string; printed: number }>(page, STATE_JS);
      const clicked = await evaluate<boolean>(page, `(() => { const el = document.querySelector('[data-crawl="${control.index}"]'); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`).catch(() => false);
      if (!clicked) {
        results.push({ route: label, control: control.label, verdict: "DEAD", detail: "control vanished before it could be clicked" });
        continue;
      }
      let verdict: Result["verdict"] = "DEAD";
      let detail = "nothing visible changed within 1500 ms";
      for (let i = 0; i < 15; i += 1) {
        await wait(100);
        const after = await evaluate<{ url: string; html: number; dialogs: number; pressed: string; focus: string; printed: number }>(page, STATE_JS).catch(() => before);
        if (after.url !== before.url) { verdict = "navigates"; detail = `→ ${after.url}`; break; }
        if (after.printed > before.printed) { verdict = "prints"; detail = "window.print()"; break; }
        if (after.dialogs > before.dialogs) { verdict = "opens"; detail = "a sheet / dialog"; break; }
        if (after.pressed !== before.pressed || Math.abs(after.html - before.html) > 40 || (after.focus !== before.focus && after.focus !== "BODY")) { verdict = "changes"; detail = after.pressed !== before.pressed ? "state" : Math.abs(after.html - before.html) > 40 ? `DOM Δ ${after.html - before.html}` : `focus → ${after.focus}`; break; }
      }
      results.push({ route: label, control: control.label, verdict, detail });
      if (verdict === "opens" && !opener) await crawl(route, control.label, state);
    }
  };

  for (const route of ROUTES) await crawl(route, null);
  // The parent zone has three states: no PIN (crawled above: the create-a-PIN screen), unlocked, and gated.
  const PARENT_ROUTES = ROUTES.filter((r) => r.startsWith("/parent"));
  await evaluate(page, `fetch("/api/parent/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "1234" }) }).then((r) => r.status)`);
  for (const route of PARENT_ROUTES) await crawl(route, null, "unlocked");
  await page.send("Network.deleteCookies", { name: "ss_parent", url: BASE });
  await crawl("/parent", null, "gated");

  console.log(`\nroute × control (${results.length} controls):`);
  let currentRoute = "";
  for (const r of results) {
    if (r.route !== currentRoute) { currentRoute = r.route; console.log(`  ${currentRoute}`); }
    console.log(`    ${r.verdict === "DEAD" ? "✗" : "✓"} ${r.control.padEnd(30)} ${r.verdict.padEnd(10)} ${r.detail}`);
  }
  const dead = results.filter((r) => r.verdict === "DEAD");
  console.log(`\ncrawl: ${ROUTES.length} routes, ${[...crawled].filter((c) => c.includes("›")).length} sheet(s), ${results.length} controls · dead ${dead.length}`);

  // Cleanup: the crawl's child and its rows.
  await cleanup();
  page.close();
  browser.kill();
  process.exit(dead.length === 0 ? 0 : 1);
}

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
