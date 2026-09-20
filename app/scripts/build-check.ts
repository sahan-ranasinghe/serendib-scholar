/**
 * Build identity, end to end: deploy A, load the app, deploy B, and prove
 * the running page notices and can land on B.
 *
 * "Deploy" here restarts `next start` with a different BUILD_SHA against the
 * same build output — exactly the situation a phone is in after a real
 * deploy: it holds the old page while the server serves new code. The page
 * carries its own SHA in a meta tag; /api/build reports the server's; the
 * update banner appears when they differ and reloads on tap.
 *
 *   npm run build:check
 */
import { spawn, type ChildProcess } from "node:child_process";
import { connect, evaluate, harnessHeaders, launch, openPage, wait } from "./lib/cdp";

const PORT = Number(process.argv.find((a) => a.startsWith("--port="))?.slice(7) ?? 3007);
const BASE = `http://127.0.0.1:${PORT}`;
const SHA_A = "aaaaaa1";
const SHA_B = "bbbbbb2";

/**
 * One "deploy": next start in its own process group (npx spawns a shell that
 * spawns next-server, and only killing the group frees the port again).
 */
async function serve(sha: string, time: string): Promise<ChildProcess> {
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, BUILD_SHA: sha, BUILD_TIME: time, DEV_ONBOARDING: "stub", DEV_MODE: "on" },
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; i < 120; i += 1) {
    await wait(250);
    const ok = await fetch(`${BASE}/api/build`, { headers: harnessHeaders() }).then((r) => r.json()).then((j) => j?.sha === sha).catch(() => false);
    if (ok) return server;
  }
  stopServer(server);
  throw new Error(`the server did not come up on ${PORT} with BUILD_SHA=${sha}`);
}

function stopServer(server: ChildProcess): void {
  try {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

/** The port is free again (the old deploy is really gone) before the next one starts. */
async function portFree(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const up = await fetch(`${BASE}/api/build`, { headers: harnessHeaders() }).then(() => true).catch(() => false);
    if (!up) return;
    await wait(250);
  }
}

async function main(): Promise<void> {
  const rows: Array<{ item: string; expected: string; actual: string; ok: boolean }> = [];
  const check = (item: string, expected: string, actual: string, ok: boolean) => rows.push({ item, expected, actual, ok });

  let server = await serve(SHA_A, "2026-09-16T04:00:00.000Z");
  const { browser, wsUrl } = await launch("build-check");
  const root = await connect(wsUrl, "build-check");
  const page = await openPage(root);
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  try {
    // ---- deploy A: load the app --------------------------------------------------
    await page.send("Page.navigate", { url: `${BASE}/` });
    for (let i = 0; i < 60; i += 1) {
      await wait(200);
      if (await evaluate<boolean>(page, `!!document.querySelector('[data-testid="build-stamp"]')`).catch(() => false)) break;
    }
    const stampA = await evaluate<string>(page, `(document.querySelector('[data-testid="build-stamp"]')?.textContent ?? '').trim()`);
    const metaA = await evaluate<string>(page, `document.querySelector('meta[name="ss-build"]')?.getAttribute('content') ?? ''`);
    const apiA = await evaluate<string>(page, `fetch("/api/build", { cache: "no-store" }).then((r) => r.json()).then((j) => j.sha)`);
    check("deploy A: the splash footer prints the build", `${SHA_A} · …`, stampA, stampA.startsWith(SHA_A));
    check("deploy A: page meta and /api/build agree", SHA_A, `meta ${metaA} · api ${apiA}`, metaA === SHA_A && apiA === SHA_A);
    await wait(1500);
    const bannerBefore = await evaluate<boolean>(page, `!!document.querySelector('[data-testid="update-banner"]')`);
    check("deploy A: no update banner", "absent", bannerBefore ? "PRESENT" : "absent", !bannerBefore);

    // ---- deploy B: the server now serves different code ---------------------------
    stopServer(server);
    await portFree();
    server = await serve(SHA_B, "2026-09-16T05:00:00.000Z");
    // The page checks when the tab comes back (and every 30 s); the harness asks now.
    await evaluate(page, `document.dispatchEvent(new Event("visibilitychange")); true`);
    let banner = false;
    for (let i = 0; i < 40 && !banner; i += 1) {
      await wait(500);
      banner = await evaluate<boolean>(page, `!!document.querySelector('[data-testid="update-banner"]')`).catch(() => false);
      if (!banner && i % 4 === 3) await evaluate(page, `document.dispatchEvent(new Event("visibilitychange")); true`).catch(() => undefined);
    }
    const bannerText = banner ? await evaluate<string>(page, `(document.querySelector('[data-testid="update-banner"]')?.textContent ?? '').trim()`) : "";
    check("deploy B: the banner appears on the old page", "අලුත් අනුවාදයක් — යාවත්කාලීන කරන්න", banner ? bannerText : "NOT SHOWN", banner && bannerText.includes("අලුත් අනුවාදයක්"));
    const metaStale = await evaluate<string>(page, `document.querySelector('meta[name="ss-build"]')?.getAttribute('content') ?? ''`);
    check("deploy B: the loaded page is still A until it reloads", SHA_A, metaStale, metaStale === SHA_A);

    // ---- tap it: the reload lands on B --------------------------------------------
    if (banner) {
      await evaluate(page, `(() => { document.querySelector('[data-testid="update-banner"]').click(); return true; })()`);
      for (let i = 0; i < 60; i += 1) {
        await wait(250);
        const now = await evaluate<string>(page, `document.querySelector('meta[name="ss-build"]')?.getAttribute('content') ?? ''`).catch(() => "");
        if (now === SHA_B) break;
      }
    }
    const metaAfter = await evaluate<string>(page, `document.querySelector('meta[name="ss-build"]')?.getAttribute('content') ?? ''`);
    const stampAfter = await evaluate<string>(page, `(document.querySelector('[data-testid="build-stamp"]')?.textContent ?? '').trim()`);
    const bannerAfter = await evaluate<boolean>(page, `!!document.querySelector('[data-testid="update-banner"]')`);
    check("deploy B: tapping the banner lands on B", SHA_B, `${metaAfter} · footer "${stampAfter}"`, metaAfter === SHA_B && stampAfter.startsWith(SHA_B));
    check("deploy B: the banner is gone after the reload", "absent", bannerAfter ? "PRESENT" : "absent", !bannerAfter);
  } finally {
    browser.kill();
    stopServer(server);
  }

  console.log(`\n== BUILD IDENTITY (deploy ${SHA_A} → load → deploy ${SHA_B} → banner → reload) ==`);
  for (const r of rows) console.log(`${r.item.padEnd(58)} ${r.expected.slice(0, 34).padEnd(36)} ${r.actual.slice(0, 44).padEnd(46)} ${r.ok ? "✓" : "✗"}`);
  const failed = rows.filter((r) => !r.ok);
  console.log(failed.length ? `\nFAILURES (${failed.length})` : `\nPASS  a new deploy is visible to a running page, and the reload lands on it`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`FAILED: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
