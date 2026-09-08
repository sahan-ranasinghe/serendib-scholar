/**
 * Drives a real Chromium at the portal and reports what it actually does.
 *
 *   npm run portal:check -- [baseUrl] [password]
 *
 * Written against the DevTools Protocol over the `ws` dependency the
 * project already has, rather than adding a browser-automation framework
 * for four checks. It exists because two of the portal's bugs were
 * invisible to code review and obvious to a browser:
 *
 *   RENDER RATE  — the page flickered because state was set on every
 *                  animation frame. useRenderGuard warns when a component
 *                  renders more than ten times a second; this counts those
 *                  warnings so a regression fails a command instead of
 *                  being noticed by the actor.
 *   CONTRAST     — computed colours of the line she reads, at phone width,
 *                  in BOTH colour schemes. The recording screen inherited
 *                  the system foreground onto an explicitly white card, so
 *                  dark mode put near-white text on white.
 *
 * Screenshots land in .portal-check/ for eyeballing.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { connect, evaluate, launch, openPage, type Cdp } from "./lib/cdp";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PASSWORD = process.argv[3] ?? process.env.PORTAL_PASSWORD ?? "";
const OUT_DIR = path.join(process.cwd(), ".portal-check");

interface Measured {
  ratio: number;
  color: string;
  bg: string;
  fontSize?: string;
  lineHeight?: string;
}

/** `_listOpen` is bookkeeping; every other key is a measured element. */
type ContrastProbe = { _listOpen?: boolean } & Record<string, Measured | boolean | undefined>;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const { browser, wsUrl } = await launch("portal-check");
  const root = await connect(wsUrl, "portal-check");
  // Flat sessions still multiplex over one socket; openPage wraps so every
  // call carries the sessionId.
  const page: Cdp = await openPage(root);

  const consoleLines: string[] = [];
  page.on("Runtime.consoleAPICalled", (params) => {
    const args = (params.args as Array<{ value?: unknown; description?: string }>) ?? [];
    consoleLines.push(`${params.type}: ${args.map((a) => String(a.value ?? a.description ?? "")).join(" ")}`);
  });
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("Network.enable");

  const failures: string[] = [];

  const gotoPortal = async (scheme: "light" | "dark", width: number, height: number) => {
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: width < 600 });
    await page.send("Page.navigate", { url: `${BASE}/portal` });
    await new Promise((resolve) => setTimeout(resolve, 2500));
  };

  // Unlock once; the cookie carries across navigations.
  await page.send("Page.navigate", { url: `${BASE}/portal` });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  if (PASSWORD) {
    const status = await evaluate<number>(
      page,
      `fetch("/api/portal/enter",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`,
    );
    console.log(`unlock: POST /api/portal/enter → ${status}`);
    const check = await evaluate<{ unlocked: boolean }>(page, `fetch("/api/portal/enter").then(r=>r.json())`);
    console.log(`unlock: GET  /api/portal/enter → unlocked=${check?.unlocked}`);
  }

  // --- 1. render rate ------------------------------------------------------
  consoleLines.length = 0;
  await gotoPortal("light", 1280, 900);
  const diagnostic = await evaluate<{ title: string; text: string; gate: boolean }>(
    page,
    `({ title: document.title, text: (document.body.innerText||"").slice(0,160), gate: !!document.querySelector('input[type=password]') })`,
  );
  console.log(`\nPAGE: gate=${diagnostic.gate} · "${diagnostic.text.replace(/\n/g, " | ").slice(0, 120)}"`);
  const watched = consoleLines.filter((line) => line.includes("watching <"));

  // The flicker only appears once the MICROPHONE IS OPEN: the analyser
  // outlives the take, so the old per-frame setState kept firing forever
  // after the first recording, recording or not. Measuring an untouched
  // page would have reported "fine" and missed the bug entirely — so press
  // record, let it run, stop, and measure the page while it sits idle with
  // a live analyser.
  await evaluate(page, `document.querySelector('[data-portal="record"]')?.click(); true`);
  await new Promise((resolve) => setTimeout(resolve, 4000));
  await evaluate(page, `document.querySelector('[data-portal="stop"]')?.click(); true`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const micLive = await evaluate<boolean>(page, `!!document.querySelector('[data-portal="level-meter"]')`);

  // A production build cannot run the dev-only render guard, so measure
  // the thing the flicker actually was: a main thread kept busy. Sixty
  // full re-renders a second show up as long tasks; a page at rest has
  // none. This is the check that works against the deployed site.
  await evaluate(
    page,
    `(() => {
      window.__longTasks = 0;
      window.__frames = 0;
      try {
        new PerformanceObserver((list) => { window.__longTasks += list.getEntries().length; })
          .observe({ entryTypes: ["longtask"] });
      } catch { /* not supported */ }
      const count = () => { window.__frames++; requestAnimationFrame(count); };
      requestAnimationFrame(count);
      return true;
    })()`,
  );

  const before = consoleLines.length;
  await new Promise((resolve) => setTimeout(resolve, 6000));
  const busy = await evaluate<{ longTasks: number; frames: number }>(
    page,
    `({ longTasks: window.__longTasks || 0, frames: window.__frames || 0 })`,
  );
  const guardWarnings = consoleLines
    .slice(before)
    .filter((line) => line.includes("[render-guard]") && line.includes("rendered"));
  console.log(`\nRENDER RATE (6s idle AFTER a take — analyser live: ${micLive})`);
  const devGuard = watched.length > 0;
  console.log(
    `  render-guard: ${devGuard ? watched.join(", ") : "not mounted (expected on a production build — it is dev-only)"}`,
  );
  console.log(`  main thread over 6 idle seconds: ${busy.longTasks} long task(s), ${busy.frames} animation frames`);
  // A page at rest should be doing essentially nothing. A handful of long
  // tasks is normal settling; a loop produces dozens.
  if (busy.longTasks > 10) {
    failures.push(`${busy.longTasks} long tasks in 6 idle seconds — the main thread is not at rest`);
  }
  if (guardWarnings.length > 0) {
    console.log(`  ${guardWarnings.length} over-budget warning(s):`);
    for (const warning of guardWarnings.slice(0, 3)) console.log(`    ${warning.slice(0, 150)}`);
    failures.push(`render loop: ${guardWarnings.length} render-guard warning(s) in 6 idle seconds`);
  } else if (!devGuard && BASE.includes("localhost")) {
    failures.push("render-guard never mounted locally — the dev-only counter is not wired up");
  } else {
    console.log(`  OK — no component exceeded the budget while idle.`);
  }

  // --- 2. contrast, both schemes, phone width ------------------------------
  // Colours are resolved through a CANVAS, not by parsing the computed
  // string: Tailwind v4 emits oklch, so getComputedStyle returns lab(...)
  // and reading the three numbers as if they were RGB gives nonsense
  // (a mid-grey measured as 19:1 against white).
  const CONTRAST_PROBE = `(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const paint = canvas.getContext("2d", { willReadFrequently: true });
    const toRgb = (css) => {
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = "#000";
      paint.fillStyle = css;
      paint.fillRect(0, 0, 1, 1);
      const [r, g, b] = paint.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    };
    const luminance = (rgb) => {
      const [r, g, b] = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const isTransparent = (css) => {
      const m = css.match(/rgba?\\(([^)]+)\\)/);
      if (m) { const parts = m[1].split(","); return parts.length === 4 && parseFloat(parts[3]) < 0.5; }
      return css === "transparent";
    };
    const effectiveBg = (el) => {
      let node = el;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (!isTransparent(bg)) return toRgb(bg);
        node = node.parentElement;
      }
      return toRgb(getComputedStyle(document.body).backgroundColor || "#fff");
    };
    const ratio = (el) => {
      const [a, b] = [luminance(toRgb(getComputedStyle(el).color)), luminance(effectiveBg(el))].sort((x, y) => y - x);
      return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
    };
    const describe = (el) => {
      const style = getComputedStyle(el);
      return {
        ratio: ratio(el),
        color: "rgb(" + toRgb(style.color).join(",") + ")",
        bg: "rgb(" + effectiveBg(el).join(",") + ")",
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    };
    const out = {};
    const line = document.querySelector('[data-portal="current-line"]');
    if (line) out.currentLine = describe(line);
    const context = document.querySelector('[data-portal="context-line"]');
    if (context) out.contextLine = describe(context);
    const row = document.querySelector('[data-portal="line-row-text"]');
    if (row) out.listRow = describe(row);
    out._listOpen = !!row;
    return out;
  })()`;

  for (const scheme of ["light", "dark"] as const) {
    await gotoPortal(scheme, 390, 844);
    // Open the lines panel so its rows can be measured too.
    // Retry: the first pass used to click before hydration had attached
    // the handler, so the panel silently stayed shut and its rows went
    // unmeasured.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const open = await evaluate<boolean>(
        page,
        `(() => {
          if (document.querySelector('[data-portal="line-row-text"]')) return true;
          document.querySelector('[data-portal="toggle-lines"]')?.click();
          return false;
        })()`,
      );
      if (open) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const probe = await evaluate<ContrastProbe>(
      page,
      CONTRAST_PROBE,
    );
    console.log(`\nCONTRAST — 390px wide, prefers-color-scheme: ${scheme}`);
    console.log(`  lines panel open: ${probe?._listOpen ? "yes" : "NO — rows not measured"}`);
    for (const [name, value] of Object.entries(probe ?? {})) {
      if (name.startsWith("_") || typeof value === "boolean" || !value) continue;
      const measured = value as Measured;
      const min = name === "contextLine" ? 4.5 : 7;
      const ok = measured.ratio >= min;
      console.log(
        `  ${name.padEnd(12)} ratio ${String(measured.ratio).padStart(6)}:1  ${measured.color} on ${measured.bg}` +
          `${measured.fontSize ? `  ${measured.fontSize}/${measured.lineHeight}` : ""}  ${ok ? "OK" : `FAIL (want >=${min}:1)`}`,
      );
      if (!ok) failures.push(`${name} contrast ${measured.ratio}:1 in ${scheme} mode`);
      if (name === "currentLine" && measured.fontSize && parseFloat(measured.fontSize) < 28) {
        failures.push(`current line is ${measured.fontSize} on a phone (want ≥28px)`);
      }
    }
    // An ABSENT target is a failure, not a pass. Pointed at a deployment
    // running older code the probes simply find nothing, and reporting
    // that as green is worse than reporting nothing at all.
    if (!probe?.currentLine) {
      failures.push(`no [data-portal="current-line"] in ${scheme} mode — is this build deployed?`);
    }
    if (!probe?._listOpen) {
      failures.push(`the lines panel did not open in ${scheme} mode — rows unmeasured`);
    }

    // A page that scrolls sideways on a phone is unusable however good the
    // contrast is: she is reading a line, not panning a map.
    const overflow = await evaluate<{ scrollWidth: number; clientWidth: number; widest: string }>(
      page,
      `(() => {
        const doc = document.documentElement;
        // The DEEPEST element wider than the viewport is the culprit; its
        // ancestors are merely stretched by it.
        const guilty = [...document.querySelectorAll("*")]
          .filter((el) => el.getBoundingClientRect().width > doc.clientWidth + 1)
          .map((el) => ({
            depth: (() => { let d = 0, n = el; while ((n = n.parentElement)) d++; return d; })(),
            label: Math.round(el.getBoundingClientRect().width) + "px " + el.tagName.toLowerCase() +
              "." + (el.className || "").toString().slice(0, 70),
          }))
          .sort((a, b) => b.depth - a.depth);
        return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest: guilty[0]?.label ?? "none" };
      })()`,
    );
    const overflows = overflow.scrollWidth > overflow.clientWidth + 1;
    console.log(
      `  horizontal overflow: ${overflows ? `YES ${overflow.scrollWidth}px > ${overflow.clientWidth}px — widest ${overflow.widest}` : "none"}`,
    );
    if (overflows) failures.push(`page scrolls sideways at 390px in ${scheme} mode (${overflow.scrollWidth}px)`);

    const shot = (await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })) as {
      data?: string;
    };
    if (shot.data) await writeFile(path.join(OUT_DIR, `portal-${scheme}-390.png`), Buffer.from(shot.data, "base64"));
    else console.log(`  (screenshot unavailable for ${scheme})`);
  }

  console.log(`\nScreenshots: ${path.relative(process.cwd(), OUT_DIR)}/`);
  if (failures.length > 0) {
    console.log(`\nFAILURES (${failures.length}):`);
    for (const failure of failures) console.log(`  ✗ ${failure}`);
  } else {
    console.log(`\nAll checks passed.`);
  }

  page.close();
  browser.kill();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
