/**
 * Drives a real Chromium at /admin/board-gallery and photographs every
 * primitive in its animated-in state.
 *
 *   npm run board:check -- [baseUrl]
 *
 * Two viewports: a 390×844 phone held sideways (844×390, DPR 2) and a
 * desktop. For each `[data-primitive]` section the harness presses the
 * section's `[data-action="animate-in"]` button, waits for the motion to
 * settle, and clips the board itself to
 *
 *   .board-check/<viewport>-<primitive>.png
 *
 * It also checks the page at 390 wide (portrait) for sideways scroll,
 * counts console errors, and flags a pointer left pointing at nothing
 * (`[data-missing]`). Nothing ships until this looks right.
 *
 * Then the STROKE AUDIT (scripts/lib/strokeAudit.ts): every chalk stroke
 * the gallery can draw — highlight circle and underline on each target,
 * the card ring, the rod glow, chalk writing, the expansion reveal, the
 * table outline, the pointer — photographed mid-flight and at rest, and
 * measured: a stroke not fully drawn at rest, scaled unevenly, or landing
 * off its target fails the run. `--only=strokes` runs just that phase.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { connect, evaluate, launch, openPage, wait } from "./lib/cdp";
import { describeMid, judgeAtRest, judgeJump, MEASURE_JS, STROKE_PROBES, type Measured } from "./lib/strokeAudit";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? null;
const OUT_DIR = path.join(process.cwd(), ".board-check");
const SETTLE_MS = 1100;
/** When the stroke audit photographs a stroke mid-flight — inside every ≤ 250 ms draw. */
const MID_MS = 120;

const VIEWPORTS = [
  { name: "phone", width: 844, height: 390, mobile: true, scale: 2 },
  { name: "desktop", width: 1280, height: 860, mobile: false, scale: 1 },
] as const;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const { browser, wsUrl } = await launch("board-check");
  const root = await connect(wsUrl, "board-check");
  const page = await openPage(root);

  const consoleErrors: string[] = [];
  page.on("Runtime.consoleAPICalled", (params) => {
    if (params.type !== "error") return;
    const args = (params.args as Array<{ value?: unknown; description?: string }>) ?? [];
    consoleErrors.push(args.map((a) => String(a.value ?? a.description ?? "")).join(" ").slice(0, 200));
  });
  page.on("Runtime.exceptionThrown", (params) => {
    const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
    consoleErrors.push(`exception: ${details?.exception?.description ?? details?.text ?? "?"}`.slice(0, 200));
  });
  await page.send("Runtime.enable");
  await page.send("Page.enable");

  const failures: string[] = [];
  const written: string[] = [];

  for (const viewport of VIEWPORTS) {
    if (ONLY && ONLY !== "gallery") break;
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.scale,
      mobile: viewport.mobile,
    });
    await page.send("Page.navigate", { url: `${BASE}/admin/board-gallery?viewport=${viewport.name}` });
    await wait(3000);

    const primitives = await evaluate<string[]>(
      page,
      `[...document.querySelectorAll('[data-primitive]')].map((s) => s.getAttribute('data-primitive'))`,
    );
    if (primitives.length === 0) failures.push(`${viewport.name}: the gallery rendered no [data-primitive] sections`);
    console.log(`\n${viewport.name} (${viewport.width}×${viewport.height}): ${primitives.length} primitives`);

    for (const primitive of primitives) {
      const ok = await evaluate<{ hasButton: boolean; hasBoard: boolean }>(
        page,
        `(() => {
          const s = document.querySelector('[data-primitive="${primitive}"]');
          const reset = s.querySelector('[data-action="reset"]');
          const button = s.querySelector('[data-action="animate-in"]');
          const board = s.querySelector('[data-board]');
          if (reset) reset.click();
          board?.scrollIntoView({ block: "center", inline: "nearest" });
          return { hasButton: !!button, hasBoard: !!board };
        })()`,
      );
      if (!ok.hasButton || !ok.hasBoard) {
        failures.push(`${viewport.name}/${primitive}: ${!ok.hasButton ? "no animate-in button" : "no board"}`);
        continue;
      }
      await wait(120);
      await evaluate(page, `document.querySelector('[data-primitive="${primitive}"] [data-action="animate-in"]').click(); true`);
      await wait(SETTLE_MS);
      const shot = await evaluate<{ x: number; y: number; width: number; height: number; missing: number; overflow: boolean }>(
        page,
        `(() => {
          const s = document.querySelector('[data-primitive="${primitive}"]');
          const b = s.querySelector('[data-board]');
          const r = b.getBoundingClientRect();
          const surface = b.querySelector('.wb-surface');
          const sr = surface.getBoundingClientRect();
          // anything drawn outside the board surface is a layout bug, not a design choice
          const overflow = [...surface.querySelectorAll('.wb-content *')].some((el) => {
            const er = el.getBoundingClientRect();
            return er.width > 0 && (er.right > sr.right + 2 || er.left < sr.left - 2 || er.bottom > sr.bottom + 2);
          });
          return {
            x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height,
            missing: s.querySelectorAll('[data-missing]').length + document.querySelectorAll('[data-missing]').length,
            overflow,
          };
        })()`,
      );
      if (shot.missing > 0) failures.push(`${viewport.name}/${primitive}: the pointer is aimed at a target nothing registered`);
      if (shot.overflow) failures.push(`${viewport.name}/${primitive}: content is drawn outside the board surface`);
      const image = (await page.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: shot.x, y: shot.y, width: shot.width, height: shot.height, scale: 1 },
      })) as { data?: string };
      if (!image.data) {
        failures.push(`${viewport.name}/${primitive}: screenshot unavailable`);
        continue;
      }
      const file = path.join(OUT_DIR, `${viewport.name}-${primitive}.png`);
      await writeFile(file, Buffer.from(image.data, "base64"));
      written.push(path.relative(process.cwd(), file));
      console.log(`  ${primitive.padEnd(16)} ${Math.round(shot.width)}×${Math.round(shot.height)}${shot.overflow ? "  OVERFLOW" : ""}${shot.missing ? "  POINTER MISSING TARGET" : ""}`);
    }
  }

  // --- strokes: every chalk stroke, mid-flight and at rest -----------------
  // Each probe presses one button, photographs the board at MID_MS and
  // again settled, and reads the strokes off the DOM (see strokeAudit.ts):
  // a stroke not fully drawn at rest, scaled unevenly, or landing off its
  // target fails the run.
  if (!ONLY || ONLY === "strokes") {
    const strokeDir = path.join(OUT_DIR, "strokes");
    await mkdir(strokeDir, { recursive: true });
    for (const viewport of VIEWPORTS) {
      await page.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.scale, mobile: viewport.mobile });
      await page.send("Page.navigate", { url: `${BASE}/admin/board-gallery?viewport=${viewport.name}` });
      await wait(3000);
      console.log(`\nstrokes · ${viewport.name}`);
      for (const probe of STROKE_PROBES) {
        const pressed = await evaluate<boolean>(
          page,
          `(() => {
            const s = document.querySelector('[data-primitive="${probe.section}"]');
            if (!s) return false;
            s.querySelector('[data-action="reset"]')?.click();
            s.querySelector('[data-board]').scrollIntoView({ block: "center" });
            return true;
          })()`,
        );
        if (!pressed) {
          failures.push(`strokes/${probe.name}: section ${probe.section} not found`);
          continue;
        }
        await wait(350);
        const found = await evaluate<boolean>(
          page,
          `(() => {
            const s = document.querySelector('[data-primitive="${probe.section}"]');
            const b = [...s.querySelectorAll('.bg-toolbar button')].find((el) => el.textContent === ${JSON.stringify(probe.button)});
            if (!b) return false;
            b.click();
            return true;
          })()`,
        );
        if (!found) {
          failures.push(`strokes/${probe.name}: no button "${probe.button}" in ${probe.section}`);
          continue;
        }
        const ask = JSON.stringify({
          target: probe.expect.highlight?.target ?? probe.expect.pointerAt,
          ring: probe.expect.ring,
          glow: probe.expect.glow,
          part: probe.expect.part?.index,
          cell: probe.expect.cell,
        });
        const shoot = async (phase: "mid" | "rest") => {
          const m = await evaluate<Measured>(page, `(${MEASURE_JS})(${JSON.stringify(probe.section)}, ${ask})`);
          const r = m.boardRect;
          const image = (await page.send("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: true,
            clip: { x: r.left + (await evaluate<number>(page, "window.scrollX")), y: r.top + (await evaluate<number>(page, "window.scrollY")), width: r.width, height: r.height, scale: 1 },
          })) as { data?: string };
          if (image.data) {
            const file = path.join(strokeDir, `${viewport.name}-${probe.name}-${phase}.png`);
            await writeFile(file, Buffer.from(image.data, "base64"));
            written.push(path.relative(process.cwd(), file));
          }
          return m;
        };
        await wait(MID_MS);
        const mid = await shoot("mid");
        await wait(1000);
        const rest = await shoot("rest");
        const problems = [...judgeAtRest(probe, rest), ...judgeJump(probe, mid, rest)];
        console.log(`  ${problems.length ? "✗" : "✓"} ${probe.name.padEnd(30)} mid: ${describeMid(mid)}`);
        for (const problem of problems) {
          console.log(`      ${problem}`);
          failures.push(`strokes/${viewport.name}/${probe.name}: ${problem}`);
        }
      }
    }
  }

  // --- touch: the abacus, with a finger -----------------------------------
  if (ONLY && ONLY !== "touch") {
    console.log(`\nScreenshots (${written.length}): ${path.relative(process.cwd(), OUT_DIR)}/`);
    if (failures.length) {
      console.log(`\nFAILURES (${failures.length}):`);
      for (const failure of failures) console.log(`  ✗ ${failure}`);
    } else console.log(`\nAll checks passed.`);
    page.close();
    browser.kill();
    process.exit(failures.length ? 1 : 0);
  }
  // Turn touch mode on, drag a bead from the tray onto rod සි, and tap
  // the beads on that rod to take it off again. Real touch events, not
  // clicks — the drag is pointer-event driven and only a finger proves it.
  await page.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  await page.send("Page.navigate", { url: `${BASE}/admin/board-gallery?viewport=phone` });
  await wait(2500);
  // The toggle is a React state change: give it a frame before measuring.
  await evaluate(
    page,
    `(() => {
      const s = document.querySelector('[data-primitive="abacus"]');
      [...s.querySelectorAll('.bg-toolbar button')].find((b) => b.textContent.startsWith('touch mode'))?.click();
      s.querySelector('[data-board]').scrollIntoView({ block: "center" });
      return true;
    })()`,
  );
  await wait(400);
  const touch = await evaluate<{ tray: { x: number; y: number } | null; rod: { x: number; y: number } | null; before: string }>(
    page,
    `(() => {
      const s = document.querySelector('[data-primitive="abacus"]');
      const centre = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      return {
        tray: centre(s.querySelector('[data-testid="abacus-tray-bead"]')),
        rod: centre(s.querySelector('[data-testid="abacus-rod-1"]')),
        before: s.querySelector('[data-testid="abacus"]')?.getAttribute('data-number') ?? '',
      };
    })()`,
  );
  if (!touch.tray || !touch.rod) {
    failures.push("touch: the abacus tray or rod could not be found in touch mode");
  } else {
    const tap = async (x: number, y: number) => {
      await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await wait(40);
      await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touch.tray.x, y: touch.tray.y }] });
    for (let step = 1; step <= 8; step += 1) {
      const x = touch.tray.x + ((touch.rod.x - touch.tray.x) * step) / 8;
      const y = touch.tray.y + ((touch.rod.y - touch.tray.y) * step) / 8;
      await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      await wait(30);
    }
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await wait(700);
    const afterDrag = await evaluate<string>(page, `document.querySelector('[data-primitive="abacus"] [data-testid="abacus"]').getAttribute('data-number')`);
    await tap(touch.rod.x, touch.rod.y - 20);
    await wait(500);
    const afterTap = await evaluate<string>(page, `document.querySelector('[data-primitive="abacus"] [data-testid="abacus"]').getAttribute('data-number')`);
    console.log(`\ntouch: abacus ${touch.before} → drag a bead onto සි → ${afterDrag} → tap the rod → ${afterTap}`);
    if (afterDrag !== "0100") failures.push(`touch: dragging a bead onto rod සි gave ${afterDrag}, expected 0100`);
    if (afterTap !== "0000") failures.push(`touch: tapping the rod's beads gave ${afterTap}, expected 0000`);
    const shot = (await page.send("Page.captureScreenshot", { format: "png" })) as { data?: string };
    if (shot.data) {
      const file = path.join(OUT_DIR, "phone-abacus-touch.png");
      await writeFile(file, Buffer.from(shot.data, "base64"));
      written.push(path.relative(process.cwd(), file));
    }
  }

  // Every interactive target on every board, in touch mode, is at least 48 px.
  const small = await evaluate<string[]>(
    page,
    `(() => {
      for (const b of document.querySelectorAll('.bg-toolbar button')) if (b.textContent.startsWith('touch mode: off')) b.click();
      return new Promise((resolve) => setTimeout(() => {
        const out = [];
        for (const s of document.querySelectorAll('[data-primitive]')) {
          // the hit area may reach beyond the drawn box (a table cell's 30 px row, the tray's ♪ chip): measure what a finger meets
          const reach = (el, r0) => { el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const hits = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); }; let top = r.top, bottom = r.bottom, left = r.left, right = r.right; for (let y = r.top - 2; y > r.top - 30 && hits(cx, y); y -= 2) top = y; for (let y = r.bottom + 2; y < r.bottom + 30 && hits(cx, y); y += 2) bottom = y; for (let x = r.left - 2; x > r.left - 30 && hits(x, cy); x -= 2) left = x; for (let x = r.right + 2; x < r.right + 30 && hits(x, cy); x += 2) right = x; return { w: right - left, h: bottom - top }; };
          for (const el of s.querySelectorAll('[data-board] [role="button"], [data-board] button')) {
            const r = el.getBoundingClientRect();
            const eff = r.width > 0 && (r.width < 47.5 || r.height < 47.5) ? reach(el, r) : { w: r.width, h: r.height };
            if (r.width > 0 && (eff.w < 47.5 || eff.h < 47.5)) out.push(s.getAttribute('data-primitive') + ': ' + (el.getAttribute('aria-label') || el.textContent || el.tagName).slice(0, 40) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
          }
        }
        resolve(out);
      }, 400));
    })()`,
  );
  console.log(`touch targets under 48 px: ${small.length === 0 ? "none" : small.length}`);
  for (const line of small) {
    console.log(`  ✗ ${line}`);
    failures.push(`touch target under 48 px — ${line}`);
  }
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });

  // The gallery page itself, on a phone held upright: no sideways scroll.
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send("Page.navigate", { url: `${BASE}/admin/board-gallery?viewport=phone` });
  await wait(2500);
  const overflow = await evaluate<{ scrollWidth: number; clientWidth: number }>(
    page,
    `({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })`,
  );
  const sideways = overflow.scrollWidth > overflow.clientWidth + 1;
  console.log(`\n390 portrait: ${sideways ? `SCROLLS SIDEWAYS ${overflow.scrollWidth}px > ${overflow.clientWidth}px` : "no sideways scroll"}`);
  if (sideways) failures.push(`the gallery scrolls sideways at 390px (${overflow.scrollWidth}px)`);
  const full = (await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })) as { data?: string };
  if (full.data) {
    const file = path.join(OUT_DIR, "gallery-390-portrait.png");
    await writeFile(file, Buffer.from(full.data, "base64"));
    written.push(path.relative(process.cwd(), file));
  }

  if (consoleErrors.length) {
    console.log(`\nconsole errors (${consoleErrors.length}):`);
    for (const line of consoleErrors.slice(0, 12)) console.log(`  ${line}`);
    failures.push(`${consoleErrors.length} console error(s)`);
  }

  console.log(`\nScreenshots (${written.length}): ${path.relative(process.cwd(), OUT_DIR)}/`);
  if (failures.length) {
    console.log(`\nFAILURES (${failures.length}):`);
    for (const failure of failures) console.log(`  ✗ ${failure}`);
  } else {
    console.log(`\nAll checks passed.`);
  }
  page.close();
  browser.kill();
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
