/**
 * THE DEAD-CONTROL CRAWLER (a permanent gate, docs/qa/session1-triage.md
 * cluster H) — `npm run crawl:check -- <baseUrl>`.
 *
 * Visits every route of the app — and every sheet or dialog a route can
 * open — and clicks every tappable element on it. Each click must do
 * something the child can see: navigate, open something, or change state
 * (aria-pressed / aria-expanded / a data-* attribute / a DOM change within
 * 1500 ms). A control that does nothing is a failure; the run prints the
 * route × control table and exits 1 on any dead control.
 *
 * A CHOICE IS READ FROM ITS OWN SELECTION (3 Oct 2026). A choice in a group (the parent's daily limit and chat
 * minutes: `data-selected` on the chosen one) moves its selection the moment it is tapped, before the server has
 * answered. The crawl used to see only HOW MANY were selected — one before, one after — and so waited for the
 * "saved" note the server's answer brings: on a slow link that note came after the 1500 ms and the choice was
 * called dead. Each selected choice is now known by its label, so the move itself is the change, and the one already
 * chosen is "selected" like the pressed half of a toggle. Controls whose effect IS the server's (a profile row, a
 * link to a gated screen) are judged as before. `--slow-settings=<ms>` shows it on any link.
 *
 * THE GATED ZONE IS CRAWLED WHILE THE CRAWL'S CHILD EXISTS (3 Oct 2026): after the PIN is set, before the unlocked
 * crawl — whose last control, the delete screen's confirm, really deletes the child. It used to come last, and so
 * drew the PIN gate for a child the server no longer had, from the app's cached snapshot alone.
 *
 * Onboards its own child through the API (device-bound identity), and
 * removes it at the end. Needs the production build (`npm run build &&
 * DEV_ONBOARDING=stub DEV_MODE=on npx next start -p 3001`).
 *
 * THE CMS IS NOT THE CRAWL'S (1 Oct 2026, docs/cms/SETUP.md). Payload's panel (/admin, the app's own QA galleries
 * aside) and its API (/api/payload) hold the editors' work: a crawler that clicks every control there would save,
 * delete and sign out. So the crawl never goes in — no route of its list is the CMS's, a control whose link leads
 * there is recorded and NOT clicked, and every request the browser makes is watched: one request to the CMS, from a
 * click, a redirect or a prefetch, fails the run.
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { launch, connect, openPage, evaluate, wait, type Cdp } from "./lib/cdp";
import { ONBOARD_VIA_API_JS } from "./lib/onboard";
import { copy } from "./lib/copyText";
import { cmsArea } from "../src/cms/routes";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3001";
const CHILD_NAME = "ක්‍රෝල් දරුවා";
/** `--only-m`: skip the dead-control crawl and run only cluster M's parent-zone / home-header assertions. */
const ONLY_M = process.argv.includes("--only-m");

interface Result { route: string; control: string; verdict: "navigates" | "opens" | "changes" | "prints" | "external" | "cms" | "disabled" | "selected" | "DEAD"; detail: string }

/** Every route to crawl. Sheets and dialogs are discovered from the controls that open them. */
const ROUTE_FILTER = process.argv.find((a) => a.startsWith("--routes="))?.slice(9).split(",") ?? null;
const ALL_ROUTES = ["/home", "/lessons", "/lessons/1", "/practice", "/rewards", "/rewards/certificate", "/progress", "/session/summary", "/parent", "/parent/settings", "/parent/pin", "/parent/profiles", "/parent/subscription", "/parent/report", "/parent/delete", "/offline"];
/** `--routes=/parent,/home` narrows the crawl (debugging one screen); the gate is the full list. */
const ROUTES = ROUTE_FILTER ? ALL_ROUTES.filter((r) => ROUTE_FILTER.includes(r)) : ALL_ROUTES;
/**
 * `--slow-settings=3000`: a slow link, on demand. The page hears the answer to every settings write that many ms late
 * (the write itself reaches the server at once). Off by default; it is how "a choice responds before the server
 * answers" is shown on a day when the link is fast.
 */
const SLOW_SETTINGS_MS = Number(process.argv.find((a) => a.startsWith("--slow-settings="))?.slice(16) ?? 0);

/** Is this URL (absolute on this server, or a path) the CMS's — the panel or its API? */
const inCms = (url: string): boolean => {
  try {
    const parsed = new URL(url, BASE);
    return parsed.origin === new URL(BASE).origin && cmsArea(parsed.pathname) !== null;
  } catch {
    return false;
  }
};
const cmsRoutes = ALL_ROUTES.filter(inCms);
if (cmsRoutes.length > 0) throw new Error(`crawl-check: the route list names the CMS (${cmsRoutes.join(", ")}) — the crawl never enters it`);
/** Every request the crawl's browser made to the CMS. The gate is that this stays empty. */
const cmsRequests: string[] = [];

/**
 * `selected`: a control already in its chosen state — the pressed half of a pair, the current tab, the chosen one of a
 * group — which is recorded and not clicked. A toggle with an on/off of its own (`data-state`: the sound and captions
 * rows) is NOT one of those even when it is on: tapping it turns it off, and that is what the crawl judges.
 */
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
    return { index: i, label, href: el.getAttribute('href'), disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true', selected: (el.getAttribute('aria-pressed') === 'true' && !el.hasAttribute('data-state')) || el.getAttribute('aria-current') === 'page' || el.getAttribute('aria-selected') === 'true' || el.hasAttribute('data-selected'), tag: el.tagName.toLowerCase(), inDialog: !!el.closest('[role="dialog"], [data-sheet]') };
  }).filter(Boolean);
})()`;

/**
 * What a click is judged on. The "updating" badge (AppStateBadge) is left out of it altogether (3 Oct 2026): it comes
 * and goes with the store's background fetch, not with anything a control did, and while it counted a dead control
 * tapped during a revalidation passed on the badge going away — as a state change, and as ~300 characters of DOM.
 */
const STATE_JS = `(() => { const badge = document.querySelector('[data-testid="app-state-badge"]'); return {
  url: location.pathname + location.search,
  html: document.body.innerHTML.length - (badge ? badge.outerHTML.length : 0),
  dialogs: document.querySelectorAll('[role="dialog"], [data-sheet], [data-testid$="-sheet"]').length,
  printed: window.__printed || 0,
  pressed: [...document.querySelectorAll('[aria-pressed], [aria-expanded], [aria-current], [data-selected], [data-open], [data-confirm], [data-busy], [data-state], [data-mode]')].filter((el) => el !== badge).map((el) => (el.getAttribute('data-testid') || el.tagName) + (el.hasAttribute('data-selected') ? ':' + (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28) : '') + '=' + (el.getAttribute('aria-pressed') ?? el.getAttribute('aria-expanded') ?? el.getAttribute('aria-current') ?? el.getAttribute('data-selected') ?? el.getAttribute('data-open') ?? el.getAttribute('data-confirm') ?? el.getAttribute('data-busy') ?? el.getAttribute('data-state') ?? el.getAttribute('data-mode'))).join('|'),
  focus: document.activeElement ? (document.activeElement.getAttribute('data-testid') || document.activeElement.tagName) : '',
}; })()`;

/** What changed between two readings of STATE_JS's `pressed`, for the table: "state: DIV:30=true → DIV:15=true". */
const stateChange = (before: string, after: string): string => {
  // Entry for entry: two groups may each have a choice labelled 30, and only one of them moved.
  const come = after.split("|");
  const gone = before.split("|").filter((entry) => {
    const at = come.indexOf(entry);
    if (at >= 0) come.splice(at, 1);
    return at < 0;
  });
  return `state: ${gone.join(", ") || "—"} → ${come.join(", ") || "—"}`;
};

async function ready(page: Cdp): Promise<void> {
  for (let i = 0; i < 180; i += 1) {
    const ok = await evaluate<boolean>(page, `document.documentElement.hasAttribute('data-hydrated') && !!document.querySelector('[data-screen-ready], [data-app-screen]:not(.app-skeleton [data-app-screen]), form, main, .lesson-screen') && !document.querySelector('.app-skeleton')`).catch(() => false);
    if (ok) return;
    // Still a skeleton after 4 s (and every 4 s after): the store's fetch was refused (proxy.ts: 60 API requests a minute per IP, and a crawl
    // spends them). Wait for the window to reopen and revalidate — a PIN-gated zone is never drawn from the cached copy.
    if (i % 27 === 26 && (await evaluate<boolean>(page, `!!document.querySelector('.app-skeleton')`).catch(() => false))) {
      await apiWindow(page);
      await evaluate(page, `window.dispatchEvent(new Event('focus'))`).catch(() => undefined);
    }
    await wait(150);
  }
}

interface Check { name: string; ok: boolean; detail: string }

/**
 * THE WIDTH CHECK (29 Sep 2026, the app-copy native review): at 390 px no string may be cut off or run past its box or
 * the screen. Measured on the TEXT itself — the union of each element's own text boxes (never an icon inside it) —
 * for every visible control, label and title, and every element that holds text of its own: text wider than its
 * element (a nowrap label, an ellipsis), taller than it (a fixed-height button whose words wrap to a second line), or
 * reaching past the screen's edge outside a sideways scroller. One line of text is judged by its INK (canvas
 * measureText): a Sinhala font's line box is taller than its letters, and a tight line-height is not an overflow.
 */
const TEXT_FIT_JS = `(() => {
  const vw = window.innerWidth;
  const LETTERS = /[A-Za-z\u0D80-\u0DFF]/u;
  const own = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && LETTERS.test(n.textContent || ''));
  const set = new Set(document.querySelectorAll('button, a[href], [role="button"], [role="tab"], label, h1, h2, h3, [data-testid$="-title"], [data-testid$="-label"]'));
  for (const el of document.querySelectorAll('body *')) if (own(el)) set.add(el);
  const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const ctx = document.createElement('canvas').getContext('2d');
  const textBox = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let box = null;
    const tops = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!LETTERS.test(n.textContent || '')) continue;
      const parent = n.parentElement;
      if (parent && (getComputedStyle(parent).display === 'none' || getComputedStyle(parent).visibility === 'hidden')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width === 0 || r.height === 0) continue;
        if (!tops.some((t) => Math.abs(t - r.top) < 4)) tops.push(r.top);
        box = box ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
      }
    }
    return box ? { ...box, lines: tops.length } : null;
  };
  /** The letters' own height on one line (ascent + descent of the ink), in the element's font. */
  const inkHeight = (el, text) => {
    ctx.font = getComputedStyle(el).font;
    const m = ctx.measureText(text);
    return m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  };
  const out = [];
  for (const el of set) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || cs.display === 'inline') continue;
    const tb = textBox(el);
    if (!tb) continue;
    const wide = tb.r > r.right + 2 || tb.l < r.left - 2;
    const oneLine = (el.innerText || el.textContent || '').trim();
    const tall = tb.lines > 1 ? tb.b > r.bottom + 2 || tb.t < r.top - 2 : inkHeight(el, oneLine) > r.height + 2;
    const off = !inScroller(el) && (tb.r > vw + 1 || tb.l < -1);
    if (!wide && !tall && !off) continue;
    const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
    out.push({ text: text.slice(0, 70), id: el.getAttribute('data-testid') || el.tagName.toLowerCase(), why: [wide ? 'text ' + Math.round(tb.r - tb.l) + ' px wide in a ' + Math.round(r.width) + ' px box' : '', tall ? 'text ' + Math.round(tb.b - tb.t) + ' px tall in a ' + Math.round(r.height) + ' px box' : '', off ? 'text runs to ' + Math.round(tb.l) + '…' + Math.round(tb.r) + ' on a ' + vw + ' px screen' : ''].filter(Boolean).join(', ') });
  }
  return out;
})()`;
interface Overflow { screen: string; text: string; id: string; why: string }
const overflows: Overflow[] = [];
/** Every screen state the width check measured, and how many strings on it overflowed. */
const measured: Array<{ screen: string; count: number }> = [];
const fitProbe = async (page: Cdp, screen: string): Promise<void> => {
  const found = (await evaluate<Array<{ text: string; id: string; why: string }>>(page, TEXT_FIT_JS).catch(() => null)) ?? [];
  measured.push({ screen, count: found.length });
  for (const f of found) if (!overflows.some((o) => o.text === f.text && o.id === f.id)) overflows.push({ screen, ...f });
};

const SHOT_DIR = path.join(process.cwd(), ".board-check", "cluster-m");
const shot = async (page: Cdp, name: string): Promise<void> => {
  mkdirSync(SHOT_DIR, { recursive: true });
  const png = (await page.send("Page.captureScreenshot", { format: "png" })) as { data: string };
  writeFileSync(path.join(SHOT_DIR, `${name}.png`), Buffer.from(png.data, "base64"));
};

const goto = async (page: Cdp, route: string): Promise<void> => {
  await page.send("Page.navigate", { url: `${BASE}${route}` });
  await wait(600);
  await ready(page);
};
/**
 * proxy.ts allows 60 API requests a minute per IP, and the crawl has just spent them: a PIN POST would get a 429
 * ("සම්බන්ධ වෙන්න බැරි වුණා") that says nothing about the screen. Wait for the window to reopen before a step that writes.
 */
async function apiWindow(page: Cdp): Promise<void> {
  for (let i = 0; i < 16; i += 1) {
    const status = await evaluate<number>(page, `fetch("/api/build", { cache: "no-store" }).then((r) => r.status).catch(() => 0)`).catch(() => 0);
    if (status !== 429) return;
    await wait(5000);
  }
}
/** Focus a PIN field's input and type into it the way a keypad does (one input event per digit). */
const typePin = async (page: Cdp, testId: string | null, digits: string): Promise<void> => {
  if (testId) await evaluate(page, `document.querySelector('[data-testid="${testId}"] input').focus()`);
  for (const d of digits) {
    await page.send("Input.insertText", { text: d });
    await wait(40);
  }
};
const FIELD_JS = (testId: string) => `(() => { const f = document.querySelector('[data-testid="${testId}"]'); if (!f) return null; const caret = f.querySelector('[data-testid="pin-caret"]'); const cr = caret ? caret.getBoundingClientRect() : null; const boxes = [...f.querySelectorAll('[data-pin-box]')]; return { focused: f.hasAttribute('data-focused'), active: document.activeElement === f.querySelector('input'), filled: Number(f.getAttribute('data-filled')), caretBox: boxes.findIndex((b) => b.hasAttribute('data-caret')), caretW: cr ? cr.width : 0, caretH: cr ? cr.height : 0, caretShown: caret ? getComputedStyle(caret).display !== 'none' && getComputedStyle(caret).backgroundColor : '', boxH: boxes[0] ? boxes[0].getBoundingClientRect().height : 0, text: boxes.map((b) => (b.querySelector('[data-pin-digit]') || {}).textContent || '').join(''), inputMode: f.querySelector('input').getAttribute('inputmode'), invalid: f.hasAttribute('data-invalid') }; })()`;
interface Field { focused: boolean; active: boolean; filled: number; caretBox: number; caretW: number; caretH: number; caretShown: string; boxH: number; text: string; inputMode: string; invalid: boolean }

/** Issues 7 + 8: the labelled parent entry (≥ 56 px), the child's avatar + name, the switcher with "add a child", nothing in the header overlapping. */
async function homeHeaderChecks(page: Cdp, checks: Check[]): Promise<void> {
  for (const [w, h] of [[360, 800], [412, 915]] as const) {
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await goto(page, "/home");
    const m = await evaluate<{ parent: { w: number; h: number; label: string; labelPx: number } | null; chip: { w: number; h: number; text: string } | null; overlaps: string[]; overflowX: boolean }>(page, `(() => {
      const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const p = document.querySelector('[data-testid="parent-lock"]');
      const pl = document.querySelector('[data-testid="parent-lock-label"]');
      const c = document.querySelector('[data-testid="child-switcher-open"]');
      const named = [['state-badge', document.querySelector('[data-testid="app-state-badge"]')], ['parent', p], ['child', c], ['greeting', document.querySelector('[data-testid="home-greeting"]')], ['goal-ring', document.querySelector('[data-testid="goal-ring"]')], ['streak', document.querySelector('[data-testid="streak"]')], ['continue-card', document.querySelector('[data-testid="continue-card"]')]].filter(([, el]) => el).map(([n, el]) => [n, rect(el)]);
      const overlaps = [];
      for (let i = 0; i < named.length; i += 1) for (let j = i + 1; j < named.length; j += 1) { const a = named[i][1], b = named[j][1]; if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) overlaps.push(named[i][0] + '×' + named[j][0]); }
      return { parent: p ? { w: rect(p).w, h: rect(p).h, label: pl ? pl.textContent.trim() : '', labelPx: pl ? parseFloat(getComputedStyle(pl).fontSize) : 0 } : null, chip: c ? { w: rect(c).w, h: rect(c).h, text: c.textContent.trim() } : null, overlaps, overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
    })()`);
    await shot(page, `home-${w}x${h}`);
    checks.push({ name: `home ${w}×${h}: parent entry ≥ 56 px with a Sinhala label`, ok: !!m.parent && m.parent.w >= 56 && m.parent.h >= 56 && /[඀-෿]/u.test(m.parent.label) && m.parent.labelPx >= 16, detail: m.parent ? `${Math.round(m.parent.w)}×${Math.round(m.parent.h)} px · "${m.parent.label}" ${m.parent.labelPx}px` : "missing" });
    checks.push({ name: `home ${w}×${h}: child avatar + name in the header (≥ 56 px)`, ok: !!m.chip && m.chip.h >= 56 && m.chip.text.includes(CHILD_NAME), detail: m.chip ? `${Math.round(m.chip.w)}×${Math.round(m.chip.h)} px · "${m.chip.text}"` : "missing" });
    checks.push({ name: `home ${w}×${h}: nothing in the header overlaps, no sideways scroll`, ok: m.overlaps.length === 0 && !m.overflowX, detail: m.overlaps.length ? m.overlaps.join(", ") : m.overflowX ? "page scrolls sideways" : "0 intersections" });
  }
  await evaluate(page, `document.querySelector('[data-testid="child-switcher-open"]').click()`);
  await wait(400);
  await shot(page, "child-switcher");
  const sheet = await evaluate<{ open: boolean; kids: number; active: string; add: string | null; addText: string }>(page, `(() => { const s = document.querySelector('[data-testid="child-switcher-sheet"]'); const add = s && s.querySelector('[data-testid="switcher-add-child"]'); const act = s && s.querySelector('[data-testid="switch-child"][aria-pressed="true"]'); return { open: !!s, kids: s ? s.querySelectorAll('[data-testid="switch-child"]').length : 0, active: act ? act.textContent.trim() : '', add: add ? add.getAttribute('href') : null, addText: add ? add.textContent.trim() : '' }; })()`);
  checks.push({ name: "home: the avatar opens the child switcher with add-a-child", ok: sheet.open && sheet.kids >= 1 && sheet.active.includes(CHILD_NAME) && sheet.add === "/parent/profiles/new", detail: `${sheet.kids} child(ren), active "${sheet.active.slice(0, 24)}", add → ${sheet.add} "${sheet.addText}"` });
  await evaluate(page, `document.querySelector('[data-testid="child-switcher-close"]').click()`);
  await wait(300);
  const closed = await evaluate<boolean>(page, `!document.querySelector('[data-testid="child-switcher-sheet"]')`);
  checks.push({ name: "home: the switcher closes again", ok: closed, detail: closed ? "closed" : "still open" });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
}

/** Issue 6, setting a PIN: two labelled fields, caret, auto-advance, the eye, the mismatch error — then the PIN is saved through the screen. */
async function pinCreateChecks(page: Cdp, checks: Check[]): Promise<void> {
  await apiWindow(page);
  await goto(page, "/parent");
  const labels = await evaluate<{ form: boolean; first: string; second: string; fields: number }>(page, `(() => ({ form: !!document.querySelector('[data-testid="pin-create"]'), first: (document.querySelector('[data-testid="pin-new-label"]') || {}).textContent || '', second: (document.querySelector('[data-testid="pin-again-label"]') || {}).textContent || '', fields: document.querySelectorAll('[data-testid="pin-create"] [data-pin-box]').length / 4 }))()`);
  checks.push({ name: `set PIN: two fields, labelled ${copy("pin.label")} / ${copy("pin.again")}`, ok: labels.form && labels.fields === 2 && labels.first.trim() === copy("pin.label") && labels.second.trim() === copy("pin.again"), detail: `${labels.fields} field(s): "${labels.first}" / "${labels.second}"` });
  const start = await evaluate<Field>(page, FIELD_JS("pin-new"));
  checks.push({ name: "set PIN: first field focused on arrival, caret visible in box 1", ok: start.active && start.caretBox === 0 && start.caretW >= 2 && start.caretH >= 20, detail: `focused ${start.active}, caret box ${start.caretBox + 1}, ${start.caretW}×${start.caretH} px ${start.caretShown}` });
  checks.push({ name: "set PIN: boxes ≥ 56 px, numeric keypad", ok: start.boxH >= 56 && start.inputMode === "numeric", detail: `${start.boxH} px · inputmode=${start.inputMode}` });
  await typePin(page, null, "12");
  const mid = await evaluate<Field>(page, FIELD_JS("pin-new"));
  checks.push({ name: "set PIN: the caret advances digit by digit", ok: mid.filled === 2 && mid.caretBox === 2 && mid.text === "••", detail: `after 2 digits: caret box ${mid.caretBox + 1}, shows "${mid.text}"` });
  await typePin(page, null, "34");
  await wait(150);
  const again0 = await evaluate<Field>(page, FIELD_JS("pin-again"));
  checks.push({ name: "set PIN: focus moves to the second field after 4 digits", ok: again0.active && again0.caretBox === 0, detail: `second field focused ${again0.active}, caret box ${again0.caretBox + 1}` });
  await evaluate(page, `document.querySelector('[data-testid="pin-eye"]').click()`);
  await wait(150);
  const shown = await evaluate<Field>(page, FIELD_JS("pin-new"));
  const eye = await evaluate<string>(page, `document.querySelector('[data-testid="pin-eye"]').getAttribute('aria-pressed')`);
  checks.push({ name: "set PIN: the eye reveals the digits", ok: shown.text === "1234" && eye === "true", detail: `shows "${shown.text}", aria-pressed=${eye}` });
  await evaluate(page, `document.querySelector('[data-testid="pin-eye"]').click()`);
  await typePin(page, "pin-again", "1235");
  await wait(200);
  await shot(page, "pin-set-mismatch");
  const mismatch = await evaluate<{ text: string; disabled: boolean; invalid: boolean }>(page, `(() => ({ text: (document.querySelector('[data-testid="pin-mismatch"]') || {}).textContent || '', disabled: document.querySelector('[data-testid="pin-change-submit"]').disabled, invalid: document.querySelector('[data-testid="pin-again"]').hasAttribute('data-invalid') }))()`);
  checks.push({ name: "set PIN: a mismatch says so at once, in Sinhala", ok: /[඀-෿]/u.test(mismatch.text) && mismatch.disabled && mismatch.invalid, detail: `"${mismatch.text}" · field marked ${mismatch.invalid} · save disabled ${mismatch.disabled}` });
  // Correct it (backspace, the right digit) and save.
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await typePin(page, null, "4");
  await wait(200);
  const fixed = await evaluate<{ gone: boolean; disabled: boolean }>(page, `(() => ({ gone: !document.querySelector('[data-testid="pin-mismatch"]'), disabled: document.querySelector('[data-testid="pin-change-submit"]').disabled }))()`);
  checks.push({ name: "set PIN: backspace + retype clears the error", ok: fixed.gone && !fixed.disabled, detail: `error gone ${fixed.gone}, save enabled ${!fixed.disabled}` });
  await evaluate(page, `document.querySelector('[data-testid="pin-change-submit"]').click()`);
  let zone = false;
  let savedMeasured = false;
  for (let i = 0; i < 100 && !zone; i += 1) {
    await wait(150);
    if (!savedMeasured && (await evaluate<boolean>(page, `!!document.querySelector('[data-testid="pin-saved"]')`).catch(() => false))) {
      savedMeasured = true;
      await fitProbe(page, "/parent (set PIN) › saved");
    }
    zone = await evaluate<boolean>(page, `!!document.querySelector('[data-screen-ready="parent"]')`);
  }
  const saveState = zone ? "" : await evaluate<string>(page, `'saved: ' + !!document.querySelector('[data-testid="pin-saved"]') + ' · form text: ' + (document.querySelector('[data-testid="pin-create"]') || { textContent: '' }).textContent.slice(-80)`);
  checks.push({ name: "set PIN: saving it opens the zone (no second ask)", ok: zone, detail: zone ? "parent zone shown" : `zone never appeared (${saveState})` });
}

/** The settings' two groups of choices tell a screen reader which one is chosen: aria-pressed on every choice, true on exactly the one shown as chosen. */
async function settingsChoiceChecks(page: Cdp, checks: Check[]): Promise<void> {
  await apiWindow(page);
  await goto(page, "/parent/settings");
  for (let i = 0; i < 100 && !(await evaluate<boolean>(page, `!!document.querySelector('[data-testid="limit-choices"] [role="button"]')`).catch(() => false)); i += 1) await wait(150);
  const groups = await evaluate<Array<{ id: string; said: string[]; agrees: boolean }>>(page, `['limit-choices', 'chat-limit-choices'].map((id) => { const els = [...document.querySelectorAll('[data-testid="' + id + '"] [role="button"]')]; return { id, said: els.map((el) => (el.textContent || '').trim() + ' ' + el.getAttribute('aria-pressed')), agrees: els.every((el) => (el.getAttribute('aria-pressed') === 'true') === el.hasAttribute('data-selected')) }; })`).catch((): Array<{ id: string; said: string[]; agrees: boolean }> => []);
  for (const id of ["limit-choices", "chat-limit-choices"]) {
    const group = groups.find((g) => g.id === id);
    const ok = !!group && group.said.length === 3 && group.said.every((s) => /^\d+ (true|false)$/u.test(s)) && group.said.filter((s) => s.endsWith(" true")).length === 1 && group.agrees;
    checks.push({ name: `settings: ${id} says which choice is chosen (aria-pressed)`, ok, detail: group ? `${group.said.join(" · ")} · the pressed one is the one shown as chosen: ${group.agrees}` : "the group is not on the screen" });
  }
  // The sound and captions rows are toggles: each says on or off, and what it says is what its ✓ and its data-state show.
  const rows = await evaluate<Array<{ id: string; pressed: string | null; state: string | null; tick: boolean }>>(page, `['toggle-sound', 'toggle-captions'].map((id) => { const el = document.querySelector('[data-testid="' + id + '"]'); return { id, pressed: el ? el.getAttribute('aria-pressed') : null, state: el ? el.getAttribute('data-state') : null, tick: !!el && (el.textContent || '').includes('✓') }; })`).catch((): Array<{ id: string; pressed: string | null; state: string | null; tick: boolean }> => []);
  const rowsOk = rows.length === 2 && rows.every((r) => (r.pressed === "true" || r.pressed === "false") && (r.pressed === "true") === (r.state === "on") && (r.pressed === "true") === r.tick);
  checks.push({ name: "settings: the sound and captions rows say whether they are on (aria-pressed)", ok: rowsOk, detail: rows.length ? rows.map((r) => `${r.id} ${r.pressed} (data-state ${r.state}, ✓ ${r.tick ? "shown" : "not shown"})`).join(" · ") : "the rows are not on the screen" });
}

/**
 * The onboarding avatar picker, grade picker and pay-method picker, and the quiz's answer options. Every choice says
 * aria-pressed, "true" or "false": none is chosen on arrival in the avatar picker and the quiz, one is in the other
 * two (grade 5, card). A choice that is not chosen is tapped (local state only — no profile or payment is saved, no
 * answer is checked or logged) and exactly that one says "true", the one shown as chosen.
 */
async function tappedChoiceChecks(page: Cdp, checks: Check[]): Promise<void> {
  const groups: Array<{ name: string; route: string; choices: string; chosenOnArrival: 0 | 1 }> = [
    { name: "onboarding: the avatar picker says which avatar is chosen (aria-pressed)", route: "/onboarding/2", choices: '[data-testid="onb-avatars"] [role="button"]', chosenOnArrival: 0 },
    { name: "onboarding: the grade picker says which grade is chosen (aria-pressed)", route: "/onboarding/2", choices: '[role="button"][data-grade]', chosenOnArrival: 1 },
    { name: "onboarding: the pay-method picker says which method is chosen (aria-pressed)", route: "/onboarding/4", choices: '[role="button"][data-method]', chosenOnArrival: 1 },
    // Lesson 1's first concept (src/lib/lessonDesign.ts): its questions come from the verified bank, whoever the child is.
    { name: "quiz: the answer options say which one is chosen (aria-pressed)", route: "/practice/quiz?concept=readWrite4Digit", choices: '[data-testid="quiz-chips"] button', chosenOnArrival: 0 },
  ];
  for (const group of groups) {
    await apiWindow(page);
    await goto(page, group.route);
    for (let i = 0; i < 100 && !(await evaluate<boolean>(page, `document.querySelectorAll(${JSON.stringify(group.choices)}).length >= 2`).catch(() => false)); i += 1) await wait(150);
    const read = () => evaluate<{ said: string[]; agrees: boolean }>(page, `(() => { const els = [...document.querySelectorAll(${JSON.stringify(group.choices)})]; return { said: els.map((el) => String(el.getAttribute('aria-pressed'))), agrees: els.every((el) => (el.getAttribute('aria-pressed') === 'true') === el.hasAttribute('data-selected')) }; })()`).catch(() => ({ said: [] as string[], agrees: false }));
    const before = await read();
    // The one to tap: a choice that is not the chosen one — the second, unless the second is.
    const free = before.said.map((s, i) => (s === "false" ? i : -1)).filter((i) => i >= 0);
    const tapped = before.said.length >= 2 && free.length > 0 ? (free.includes(1) ? 1 : free[0]!) : -1;
    if (tapped >= 0) await evaluate(page, `document.querySelectorAll(${JSON.stringify(group.choices)})[${tapped}].click()`).catch(() => undefined);
    await wait(250);
    const after = await read();
    const ok = tapped >= 0 && before.said.every((s) => s === "true" || s === "false") && before.said.filter((s) => s === "true").length === group.chosenOnArrival && before.agrees && after.said.length === before.said.length && after.said.every((s, i) => s === (i === tapped ? "true" : "false")) && after.agrees;
    checks.push({ name: group.name, ok, detail: before.said.length >= 2 ? `${before.said.length} choices · on arrival: ${before.said.join(" ")} · after tapping no. ${tapped + 1}: ${after.said.join(" ")} · the pressed one is the one shown as chosen: ${after.agrees}` : `${before.said.length} choice(s) on the screen` });
  }
}

/** Issue 5: entering the PIN is ONCE — with a background revalidation of /api/app-state in the air when the PIN is submitted. */
async function pinEntryChecks(page: Cdp, checks: Check[]): Promise<void> {
  await apiWindow(page);
  await goto(page, "/parent");
  // The device's cached snapshot still carries the zone for a moment; the revalidation (no cookie now) brings the gate.
  for (let i = 0; i < 100; i += 1) {
    if (await evaluate<boolean>(page, `!!document.querySelector('[data-testid="pin-gate"]')`)) break;
    await wait(150);
  }
  const gate = await evaluate<{ gate: boolean; fields: number }>(page, `(() => ({ gate: !!document.querySelector('[data-testid="pin-gate"]'), fields: document.querySelectorAll('[data-testid="pin-gate"] [data-pin-box]').length / 4 }))()`);
  checks.push({ name: "enter PIN: the gate has ONE field", ok: gate.gate && gate.fields === 1, detail: `${gate.fields} field(s)` });
  if (!gate.gate) {
    const where = await evaluate<string>(page, `location.pathname + ' · screens: ' + [...document.querySelectorAll('[data-app-screen]')].map((e) => e.getAttribute('data-app-screen')).join(',') + ' · skeleton: ' + !!document.querySelector('.app-skeleton')`);
    const cookies = ((await page.send("Network.getCookies", { urls: [BASE] })) as { cookies: Array<{ name: string }> }).cookies.map((c) => c.name).join(",");
    const status = await evaluate<string>(page, `(document.querySelector('[data-store-status]') || { getAttribute: () => '?' }).getAttribute('data-store-status')`);
    checks.push({ name: "enter PIN: asked once, with a stale app-state fetch in flight", ok: false, detail: `the gate never appeared (${where} · store ${status} · cookies ${cookies})` });
    return;
  }
  // Hold every /api/app-state response for 2.5 s (the server answers at once — BEFORE the cookie — and the answer lands late), and count the door's POSTs.
  await evaluate(page, `(() => { const real = window.fetch.bind(window); window.__enterPosts = 0; window.__stateGets = 0; window.fetch = (input, init) => { const url = typeof input === 'string' ? input : input.url; if (url.includes('/api/parent/enter')) window.__enterPosts += 1; if (url.includes('/api/app-state')) { window.__stateGets += 1; const n = window.__stateGets; return real(input, init).then((r) => n === 1 ? new Promise((res) => setTimeout(() => res(r), 2500)) : r); } return real(input, init); }; window.dispatchEvent(new Event('focus')); })()`);
  await wait(300);
  await typePin(page, "pin-boxes", "12");
  await shot(page, "pin-enter");
  await typePin(page, null, "34");
  await evaluate(page, `document.querySelector('[data-testid="pin-submit"]').click()`);
  let zone = false;
  let sawEmptyGate = false;
  for (let i = 0; i < 150 && !zone; i += 1) {
    await wait(100);
    const s = await evaluate<{ zone: boolean; gateIdle: boolean }>(page, `(() => { const g = document.querySelector('[data-testid="pin-gate"]'); const b = document.querySelector('[data-testid="pin-submit"]'); return { zone: !!document.querySelector('[data-screen-ready="parent"]'), gateIdle: !!g && !!b && !b.hasAttribute('data-busy') }; })()`);
    zone = s.zone;
    if (s.gateIdle) sawEmptyGate = true;
  }
  const counts = await evaluate<{ posts: number; gets: number }>(page, `({ posts: window.__enterPosts, gets: window.__stateGets })`);
  checks.push({ name: "enter PIN: asked once, with a stale app-state fetch in flight", ok: zone && !sawEmptyGate && counts.posts === 1, detail: `zone ${zone ? "opened" : "NEVER opened"} · gate asked again: ${sawEmptyGate} · PIN posts ${counts.posts} · app-state fetches ${counts.gets} (1 stale in flight + 1 after the PIN)` });
}

async function main(): Promise<void> {
  const accessCode = /ACCESS_CODE=(.+)/u.exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf8"))?.[1]?.trim() ?? "";
  const { browser, wsUrl } = await launch("crawl");
  process.on("exit", () => { try { browser.kill(); } catch { /* already gone */ } });
  const root = await connect(wsUrl, "crawl");
  const page = await openPage(root);
  // A script for every new document only runs once the Page domain is enabled (3 Oct 2026): without this line the
  // print counter below was never installed, and a print button was judged by its busy state instead.
  await page.send("Page.enable");
  // window.print() opens a native dialog a headless browser cannot show: count the call instead.
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__printed = 0; window.print = () => { window.__printed += 1; };" });
  if (SLOW_SETTINGS_MS > 0) {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const real = window.fetch.bind(window); window.fetch = (input, init) => { const url = String((input && input.url) || input); const answer = real(input, init); return url.includes('/api/parent/settings') ? answer.then((r) => new Promise((done) => setTimeout(() => done(r), ${SLOW_SETTINGS_MS}))) : answer; }; })();` });
    console.log(`--slow-settings: the answer to every settings write is held ${SLOW_SETTINGS_MS} ms`);
  }
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  // The CMS watch: every request of this tab, whatever started it.
  await page.send("Network.enable");
  page.on("Network.requestWillBeSent", (params) => {
    const url = (params.request as { url?: string } | undefined)?.url ?? "";
    if (inCms(url)) cmsRequests.push(url.replace(BASE, ""));
  });
  await page.send("Page.navigate", { url: `${BASE}/` });
  await wait(1500);
  const onboarded = await evaluate<{ ok: boolean; child_id?: string; step?: string; status?: number; error?: string }>(page, ONBOARD_VIA_API_JS(accessCode, CHILD_NAME)).catch((e): { ok: boolean; child_id?: string; step?: string; status?: number; error?: string } => ({ ok: false, error: String(e) }));
  if (onboarded.child_id) (globalThis as { __harnessChild?: string }).__harnessChild = onboarded.child_id;
  if (!onboarded.ok) throw new Error(`could not onboard a child for the crawl (${onboarded.step ?? "?"} ${onboarded.status ?? ""} ${onboarded.error ?? ""})`);
  const results: Result[] = [];
  const crawled = new Set<string>();

  /** The gated zone: wait for the gate itself (the cached zone draws first, until the revalidation brings the gate). */
  const gateUp = async (): Promise<void> => {
    for (let i = 0; i < 100; i += 1) {
      if (await evaluate<boolean>(page, `!!document.querySelector('[data-testid="pin-gate"]')`).catch(() => false)) return;
      await wait(150);
    }
  };
  const crawl = async (route: string, opener: string | null, state: string | null = null): Promise<void> => {
    const label = `${route}${state ? ` (${state})` : ""}${opener ? ` › ${opener}` : ""}`;
    if (crawled.has(label)) return;
    crawled.add(label);
    await page.send("Page.navigate", { url: `${BASE}${route}` });
    await wait(600);
    await ready(page);
    // Gated: the device's cached snapshot still draws the zone for a moment, until the revalidation (no cookie now)
    // brings the gate — collected before that, the zone's rows are "dead" because the gate replaced them (29 Sep 2026,
    // a slow revalidation under the proxy's rate limit). The gate is what this state crawls; wait for it, as
    // pinEntryChecks does.
    if (state === "gated") await gateUp();
    if (opener) {
      // Re-open the sheet this row belongs to.
      await evaluate(page, `(() => { const el = [...document.querySelectorAll('a[href], button, [role="button"]')].find((e) => (e.getAttribute('aria-label') || e.getAttribute('data-testid') || (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28)) === ${JSON.stringify(opener)}); el && el.click(); })()`);
      await wait(500);
    }
    await fitProbe(page, label);
    const controls = await evaluate<Array<{ index: number; label: string; href: string | null; disabled: boolean; selected: boolean; tag: string; inDialog: boolean }>>(page, CONTROLS_JS).catch(() => []);
    // The one control that ends the crawl's own child (the delete screen's confirm really deletes) goes last on its screen.
    const scope = (opener ? controls.filter((c) => c.inDialog) : controls).sort((a, b) => Number(a.label === "delete-confirm") - Number(b.label === "delete-confirm"));
    // A control's number is its DOM position at collection time. A click that PERSISTS (switching the active child on
    // /parent/profiles re-orders the list on every render after it) moves the later controls to other positions, so a
    // control is also known by its label and its ordinal among same-labelled controls — the second "profile-row" is the
    // second profile-row whatever position it now has. A control found neither way has genuinely vanished.
    const ordinals = new Map<number, number>();
    const seenLabels = new Map<string, number>();
    for (const control of scope) {
      const n = seenLabels.get(control.label) ?? 0;
      ordinals.set(control.index, n);
      seenLabels.set(control.label, n + 1);
    }
    for (const control of scope) {
      if (control.disabled) {
        results.push({ route: label, control: control.label, verdict: "disabled", detail: "disabled until input (expected)" });
        continue;
      }
      if (control.selected) {
        // The pressed half of a toggle, the current tab: tapping what is already chosen is a no-op by design.
        results.push({ route: label, control: control.label, verdict: "selected", detail: "already the chosen state (aria-pressed / aria-current / data-selected)" });
        continue;
      }
      if (control.href && /^https?:\/\//u.test(control.href) && !control.href.startsWith(BASE)) {
        results.push({ route: label, control: control.label, verdict: "external", detail: control.href.slice(0, 40) });
        continue;
      }
      if (control.href && inCms(control.href)) {
        results.push({ route: label, control: control.label, verdict: "cms", detail: `${control.href.slice(0, 40)} — the CMS panel, not clicked` });
        continue;
      }
      // A fresh render for every control, so one click never poisons the next.
      await page.send("Page.navigate", { url: `${BASE}${route}` });
      await wait(500);
      await ready(page);
      if (state === "gated") await gateUp();
      if (opener) {
        await evaluate(page, `(() => { const el = [...document.querySelectorAll('a[href], button, [role="button"]')].find((e) => (e.getAttribute('aria-label') || e.getAttribute('data-testid') || (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28)) === ${JSON.stringify(opener)}); el && el.click(); })()`);
        await wait(500);
      }
      await evaluate(page, CONTROLS_JS);
      // THE DEVICE STAYS THE CRAWL'S OWN (23 Sep 2026). A control may persist device state in a cookie — a profile row on
      // /parent/profiles switches the active child, and the crawl's parent unlock is bound to its own child — and whether
      // that lands before the next fresh render was a race with the server (a warm server won it; a cold one lost it),
      // which surfaced as every later parent route "gated" and its controls "vanished". The cookies are snapshotted here
      // and put back after the verdict, so one click never changes the device the next control is judged on.
      const cookiesBefore = ((await page.send("Network.getCookies")) as { cookies: Array<Record<string, unknown>> }).cookies;
      // …and so is the app's cached snapshot (localStorage): what the next fresh render draws before the server answers.
      const cacheBefore = await evaluate<Array<[string, string]>>(page, `(() => { try { return Object.keys(localStorage).filter((k) => k.startsWith('ss:app-state')).map((k) => [k, localStorage.getItem(k)]); } catch { return []; } })()`).catch((): Array<[string, string]> => []);
      const before = await evaluate<{ url: string; html: number; dialogs: number; pressed: string; focus: string; printed: number }>(page, STATE_JS);
      const clicked = await evaluate<boolean>(page, `(() => { const labelOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('data-testid') || (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28) || el.tagName.toLowerCase()); let el = document.querySelector('[data-crawl="${control.index}"]'); if (!el) el = [...document.querySelectorAll('[data-crawl]')].filter((e) => labelOf(e) === ${JSON.stringify(control.label)})[${ordinals.get(control.index) ?? 0}] ?? null; if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`).catch(() => false);
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
        if (after.pressed !== before.pressed || Math.abs(after.html - before.html) > 40 || (after.focus !== before.focus && after.focus !== "BODY")) { verdict = "changes"; detail = after.pressed !== before.pressed ? stateChange(before.pressed, after.pressed) : Math.abs(after.html - before.html) > 40 ? `DOM Δ ${after.html - before.html}` : `focus → ${after.focus}`; break; }
      }
      results.push({ route: label, control: control.label, verdict, detail });
      if (control.label === "delete-confirm") await fitProbe(page, `${label} › deleted`);
      const cookiesAfter = ((await page.send("Network.getCookies")) as { cookies: Array<Record<string, unknown>> }).cookies;
      const sameCookies = cookiesAfter.length === cookiesBefore.length && cookiesAfter.every((c) => cookiesBefore.some((b) => b.name === c.name && b.value === c.value));
      if (!sameCookies) {
        await page.send("Network.clearBrowserCookies");
        await page.send("Network.setCookies", { cookies: cookiesBefore.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expires: c.expires })) });
        // The cached snapshot goes back to what it was before the click too (3 Oct 2026). It used to be CLEARED here, for
        // the case this was written for — a switch of the active child leaves the other child's snapshot in the cache.
        // But a routine re-mint of the session cookies landing in a click's window takes this branch as well, and then
        // clearing threw away the crawl's own child's snapshot for nothing (when the gated crawl still ran after the
        // child was deleted, that left the PIN gate nothing to be drawn from: the eye was "dead"). The snapshot from
        // before the click is the crawl's own child's in both cases.
        await evaluate(page, `(() => { try { Object.keys(localStorage).filter((k) => k.startsWith('ss:app-state')).forEach((k) => localStorage.removeItem(k)); for (const [k, v] of ${JSON.stringify(cacheBefore)}) localStorage.setItem(k, v); } catch {} return true; })()`).catch(() => undefined);
        results.push({ route: label, control: control.label, verdict: "changes", detail: "(persisted device state — the crawl's cookies and cached snapshot were restored)" });
      }
      if (verdict === "opens" && !opener) await crawl(route, control.label, state);
    }
  };

  if (!ONLY_M) for (const route of ROUTES) await crawl(route, null);
  // The parent zone has three states: no PIN (crawled above: the create-a-PIN screen), unlocked, and gated.
  const PARENT_ROUTES = ROUTES.filter((r) => r.startsWith("/parent"));
  // Cluster M: the PIN is SET through the screen (new + again), which leaves the zone unlocked…
  const checks: Check[] = [];
  await evaluate(page, `(() => { try { localStorage.setItem("ss:lang", "si"); } catch {} })()`);
  await homeHeaderChecks(page, checks);
  await pinCreateChecks(page, checks);
  // The zone is unlocked now: the settings screen itself is on show.
  await settingsChoiceChecks(page, checks);
  // …and two choices that start with nothing chosen say so, and say which once one is tapped.
  await tappedChoiceChecks(page, checks);
  // The parent's cookie goes, and the zone is GATED. It is crawled now, while the crawl's child still exists: the gate
  // is the server's answer for a real child, not a picture kept in the cache (see the header).
  await page.send("Network.deleteCookies", { name: "ss_parent", url: BASE });
  if (!ONLY_M) {
    await crawl("/parent", null, "gated");
    // The language toggle was among its controls: everything after runs in Sinhala, as it did before the move.
    await evaluate(page, `(() => { try { localStorage.setItem("ss:lang", "si"); } catch {} })()`).catch(() => undefined);
  }
  // …then the PIN is ENTERED once, even with a revalidation in the air, which unlocks the zone again…
  await pinEntryChecks(page, checks);
  // …for the unlocked crawl. It goes last of the three: it ends by really deleting the child.
  if (!ONLY_M) for (const route of PARENT_ROUTES) await crawl(route, null, "unlocked");
  if (!ONLY_M) {
    await page.send("Page.navigate", { url: `${BASE}/admin/design-preview?screen=list` });
    await wait(1200);
    const labels = (await evaluate<string[]>(page, `[...document.querySelectorAll('li a')].map((a) => a.textContent.trim())`).catch(() => [])) ?? [];
    for (const screen of [...labels, "Session summary · limit"]) {
      await page.send("Page.navigate", { url: `${BASE}/admin/design-preview?screen=${encodeURIComponent(screen)}` });
      await wait(900);
      await fitProbe(page, `design preview · ${screen}`);
    }
  }

  console.log(`\nroute × control (${results.length} controls):`);
  let currentRoute = "";
  for (const r of results) {
    if (r.route !== currentRoute) { currentRoute = r.route; console.log(`  ${currentRoute}`); }
    console.log(`    ${r.verdict === "DEAD" ? "✗" : "✓"} ${r.control.padEnd(30)} ${r.verdict.padEnd(10)} ${r.detail}`);
  }
  const dead = results.filter((r) => r.verdict === "DEAD");
  console.log(`\ncrawl: ${ROUTES.length} routes, ${[...crawled].filter((c) => c.includes("›")).length} sheet(s), ${results.length} controls · dead ${dead.length}`);

  console.log(`\nwidth check at 390 px: ${measured.length} screen state(s) measured · ${overflows.length} string(s) overflow`);
  for (const o of overflows) console.log(`    ✗ ${o.screen.padEnd(34)} [${o.id}] "${o.text}" — ${o.why}`);
  checks.push({ name: "width check: no button or label string overflows at 390 px", ok: overflows.length === 0 && measured.length > 0, detail: `${measured.length} screen states, ${overflows.length} overflow(s)` });

  const cmsLinks = results.filter((r) => r.verdict === "cms");
  console.log(`\nthe CMS (/admin, /api/payload): ${cmsRequests.length} request(s) from the crawl · ${cmsLinks.length} link(s) into it left unclicked`);
  for (const url of [...new Set(cmsRequests)].slice(0, 10)) console.log(`    ✗ ${url}`);
  checks.push({ name: "the crawl never entered the CMS panel or called its API", ok: cmsRequests.length === 0, detail: cmsRequests.length === 0 ? `0 requests to /admin (Payload's) or /api/payload in the whole run` : `${cmsRequests.length} request(s): ${[...new Set(cmsRequests)].slice(0, 3).join(", ")}` });

  console.log(`\ncluster M — parent zone and navigation (${checks.length} assertions):`);
  for (const c of checks) console.log(`    ${c.ok ? "✓" : "✗"} ${c.name.padEnd(64)} ${c.detail}`);
  const failed = checks.filter((c) => !c.ok);
  console.log(`cluster M: ${checks.length - failed.length}/${checks.length} passed`);

  // Cleanup: the crawl's child and its rows.
  await cleanup();
  page.close();
  browser.kill();
  process.exit(dead.length === 0 && failed.length === 0 ? 0 : 1);
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
