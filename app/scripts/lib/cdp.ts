/**
 * A thin DevTools-Protocol client over the `ws` dependency the project
 * already has — shared by the browser checks (portal-check, board-check)
 * so neither needs a browser-automation framework.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { HARNESS_HEADER } from "../../src/lib/harness";

export const CHROME = ["/snap/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/google-chrome"];

/**
 * The mark every harness profile directory carries, so a browser of ours
 * is identifiable from the outside — by killOrphans() below, and by a
 * human reading `ps`. A browser started by anything else never matches it.
 */
const PROFILE_MARK = "serendib-harness";
/**
 * What that looks like on a browser's command line — the only thing
 * killOrphans() will kill. Written WITHOUT its leading `--`, because it is
 * also the pattern handed to pgrep, which reads an argument starting with
 * two dashes as one of its own options and prints its usage instead.
 */
const PROFILE_FLAG = `user-data-dir=${path.join(os.tmpdir(), PROFILE_MARK)}`;

/**
 * THE HARNESS'S IDENTITY (see src/lib/harness.ts).
 *
 * Set on every request every harness page makes, so the proxy counts the
 * check in its own generous bucket instead of the 60/min one the app
 * defends a real phone with. With HARNESS_TOKEN unset there is no header
 * and nothing changes — the checks simply share the child's bucket again.
 */
export function harnessHeaders(): Record<string, string> {
  const token = harnessToken();
  return token ? { [HARNESS_HEADER]: token } : {};
}

/**
 * Not every check is launched with `node --env-file=.env.local` (board:check
 * and design:check are plain `tsx`), so the token is read from the file when
 * it is not already in the environment — the same way latency-check reads
 * ACCESS_CODE. The dev server gets it from .env.local by itself.
 */
let cachedToken: string | null = null;
function harnessToken(): string {
  if (cachedToken !== null) return cachedToken;
  const fromEnv = (process.env.HARNESS_TOKEN ?? "").trim();
  if (fromEnv) return (cachedToken = fromEnv);
  try {
    const file = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    return (cachedToken = /^HARNESS_TOKEN=(.*)$/mu.exec(file)?.[1]?.trim() ?? "");
  } catch {
    return (cachedToken = "");
  }
}

/**
 * EVERY BROWSER DIES WITH ITS RUN (20 Sep 2026).
 *
 * A check that threw, or was interrupted, used to leave its headless
 * Chromium alive and polling the dev server — which is how three runs in
 * a row hung on a rate limit. Each launch registers its browser here, and
 * these handlers kill the lot on EVERY way out of the process: a clean
 * exit, an uncaught throw, an unhandled rejection, Ctrl-C, SIGTERM,
 * SIGHUP. A check does not have to remember to do anything.
 *
 * Chromium is spawned in its own process group (detached), so the whole
 * tree — browser, renderers, GPU process, the zygote — goes with one
 * signal to -pid. That is the part `browser.kill()` alone never did.
 */
const live = new Set<ChildProcess>();
const profileDirs = new Set<string>();
let handlersInstalled = false;
let sweptOnce = false;

function killTree(child: ChildProcess, signal: NodeJS.Signals = "SIGKILL"): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal); // the group: browser + renderers + GPU + zygote
  } catch {
    try {
      child.kill(signal); // the group is gone (or was never ours): the process itself, then
    } catch {
      /* already reaped */
    }
  }
}

/** Kill every browser this process launched, and take its profile directory with it. Safe to call twice. */
export function killBrowsers(): void {
  for (const child of live) killTree(child);
  live.clear();
  for (const dir of profileDirs) {
    try {
      rmSync(dir, { recursive: true, force: true }); // a chromium profile is tens of megabytes; they used to pile up in /tmp
    } catch {
      /* the browser is still letting go of it — /tmp will */
    }
  }
  profileDirs.clear();
}

function installExitHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  process.on("exit", killBrowsers);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      killBrowsers();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
  // A check that throws still exits through here: the browser must not outlive the stack trace.
  process.on("uncaughtException", (error) => {
    killBrowsers();
    console.error(`\nFAILED (uncaught): ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    killBrowsers();
    console.error(`\nFAILED (unhandled rejection): ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`);
    process.exit(1);
  });
}

/**
 * Sweep browsers left behind by an EARLIER run — a check killed with -9,
 * a machine that lost the terminal. Matched on the profile mark above, so
 * only our own headless browsers are ever touched; the human's Chrome or
 * Brave on the same machine cannot match it.
 *
 * Runs ONCE per process, at the first launch, so a run never inherits the
 * last one's traffic — and never touches a browser of its own: design-check
 * opens a second, windowed browser halfway through its run, and a sweep at
 * that launch would have shot the first one. Browsers this process started
 * are excluded outright, so a stray call cannot do it either.
 *
 * It does assume the checks are run ONE AT A TIME, which is the standing
 * rule anyway (they share a dev server, a Supabase project and a rate
 * bucket): start a second check while one is walking and the second's
 * sweep takes the first's browser with it.
 */
export function killOrphans(tag = "cdp"): number {
  const ours = new Set([...live].map((child) => child.pid).filter((pid): pid is number => pid !== undefined));
  let candidates: number[] = [];
  try {
    candidates = execFileSync("pgrep", ["-f", PROFILE_FLAG], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid && pid !== process.ppid && !ours.has(pid));
  } catch {
    // pgrep exits 1 when nothing matches — the good case — and may not exist at all.
    return 0;
  }
  let killed = 0;
  for (const pid of candidates) {
    // pgrep -f matches ANY process whose command line contains the string —
    // the shell that typed it, a grep looking for it. Only a headless browser
    // started from one of our profile directories is killed, read from the
    // kernel's own copy of the argv rather than from the pattern that found it.
    const argv = ((): string[] => {
      try {
        return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
      } catch {
        return []; // exited between the listing and the read, or not a Linux /proc
      }
    })();
    if (!argv.some((a) => a.startsWith(`--${PROFILE_FLAG}`)) || !argv.some((a) => a.startsWith("--headless"))) continue;
    try {
      process.kill(pid, "SIGKILL");
      killed += 1;
    } catch {
      /* gone between the listing and the signal */
    }
  }
  if (killed > 0) console.log(`[${tag}] killed ${killed} orphaned harness browser(s) from an earlier run`);
  return killed;
}

/** How long any one DevTools call may take before the check gives up on it. */
const CALL_TIMEOUT_MS = Number(process.env.CDP_TIMEOUT_MS ?? 120_000);

export interface Cdp {
  /** sessionId is a TOP-LEVEL field of a CDP message, never a member of params. */
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<Record<string, unknown>>;
  on: (method: string, handler: (params: Record<string, unknown>) => void) => void;
  close: () => void;
}

export async function launch(tag = "cdp", extraArgs: string[] = [], attempts = 60): Promise<{ browser: ChildProcess; wsUrl: string }> {
  const binary = CHROME.find((candidate) => existsSync(candidate)) ?? CHROME[0]!;
  const port = 9222 + Math.floor(Math.random() * 500);
  installExitHandlers();
  if (!sweptOnce) {
    sweptOnce = true;
    killOrphans(tag);
  }
  // Its own profile directory: a second Chromium beside a running one would otherwise attach to that instance and never open a debugging port.
  const profileDir = mkdtempSync(path.join(os.tmpdir(), `${PROFILE_MARK}-${tag}-profile-`));
  profileDirs.add(profileDir);
  const browser = spawn(binary, [
    `--user-data-dir=${profileDir}`,
    ...extraArgs,
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "about:blank",
  ], { detached: true }); // its own process group, so killTree() takes the renderers with it
  live.add(browser);
  browser.on("exit", () => live.delete(browser));
  browser.on("error", (error) => console.error(`[${tag}] chromium: ${error.message}`));
  let stderr = "";
  browser.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-2000);
  });

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      const info = (await response.json()) as { webSocketDebuggerUrl: string };
      if (info.webSocketDebuggerUrl) return { browser, wsUrl: info.webSocketDebuggerUrl };
    } catch {
      /* not up yet */
    }
  }
  killTree(browser);
  throw new Error(`Chromium did not expose a debugging port. ${stderr.trim().split("\n").slice(-2).join(" | ").slice(0, 200)}`);
}

export async function connect(wsUrl: string, tag = "cdp"): Promise<Cdp> {
  const socket = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  let nextId = 1;
  const pending = new Map<number, (value: Record<string, unknown>) => void>();
  const timers = new Map<number, NodeJS.Timeout>();
  const handlers = new Map<string, Array<(params: Record<string, unknown>) => void>>();
  socket.on("message", (data) => {
    const message = JSON.parse(String(data)) as { id?: number; method?: string; result?: unknown; params?: unknown; error?: unknown };
    if (message.id && pending.has(message.id)) {
      if (message.error) {
        console.error(`[${tag}] CDP error: ${JSON.stringify(message.error).slice(0, 160)}`);
      }
      clearTimeout(timers.get(message.id));
      timers.delete(message.id);
      pending.get(message.id)!((message.result ?? {}) as Record<string, unknown>);
      pending.delete(message.id);
    } else if (message.method) {
      for (const handler of handlers.get(message.method) ?? []) handler((message.params ?? {}) as Record<string, unknown>);
    }
  });
  return {
    /**
     * A CALL THAT NEVER COMES BACK IS A FAILURE, NOT A WAIT (20 Sep 2026).
     *
     * A reply that never arrives — a navigation that does not commit, an
     * `awaitPromise` evaluate over a promise that never settles — used to
     * park the whole check forever, with nothing printed and its browser
     * still polling the server. That is what "the run hung" was. Every
     * call now has a deadline, and blowing it throws, naming the method
     * that stalled: the check dies loudly, its browser dies with it
     * (installExitHandlers above), and the next one starts clean.
     *
     * Generous on purpose — a cold dev-server route, a screenshot of a
     * whole board and the page's own multi-second probes all live well
     * under it — so a trip means something is actually wrong.
     */
    send: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, resolve);
        timers.set(
          id,
          setTimeout(() => {
            pending.delete(id);
            timers.delete(id);
            reject(new Error(`CDP ${method} did not answer in ${Math.round(CALL_TIMEOUT_MS / 1000)}s (the browser is wedged, or the page is waiting on something that never settles)`));
          }, CALL_TIMEOUT_MS),
        );
        socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      }),
    on: (method, handler) => {
      handlers.set(method, [...(handlers.get(method) ?? []), handler]);
    },
    close: () => socket.close(),
  };
}

/** A page session: one tab, every call carrying its sessionId. */
export async function openPage(root: Cdp): Promise<Cdp> {
  const target = (await root.send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
  const session = (await root.send("Target.attachToTarget", { targetId: target.targetId, flatten: true })) as {
    sessionId: string;
  };
  const page: Cdp = {
    send: (method, params = {}) => root.send(method, params, session.sessionId),
    on: root.on,
    close: root.close,
  };
  // The harness's identity, on every request this tab makes — navigations,
  // fetches, XHRs alike — so no check has to remember to send it.
  const headers = harnessHeaders();
  if (Object.keys(headers).length > 0) {
    await page.send("Network.enable");
    await page.send("Network.setExtraHTTPHeaders", { headers });
  }
  return page;
}

export async function evaluate<T>(page: Cdp, expression: string): Promise<T> {
  const result = (await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })) as { result?: { value?: T }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
  if (result.exceptionDetails) {
    throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  }
  return result.result?.value as T;
}

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
