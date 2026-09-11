/**
 * A thin DevTools-Protocol client over the `ws` dependency the project
 * already has — shared by the browser checks (portal-check, board-check)
 * so neither needs a browser-automation framework.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

export const CHROME = ["/snap/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/google-chrome"];

export interface Cdp {
  /** sessionId is a TOP-LEVEL field of a CDP message, never a member of params. */
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<Record<string, unknown>>;
  on: (method: string, handler: (params: Record<string, unknown>) => void) => void;
  close: () => void;
}

export async function launch(tag = "cdp", extraArgs: string[] = [], attempts = 60): Promise<{ browser: ChildProcess; wsUrl: string }> {
  const binary = CHROME.find((candidate) => existsSync(candidate)) ?? CHROME[0]!;
  const port = 9222 + Math.floor(Math.random() * 500);
  // Its own profile directory: a second Chromium beside a running one would otherwise attach to that instance and never open a debugging port.
  const browser = spawn(binary, [
    `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), `${tag}-profile-`))}`,
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
  ]);
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
  browser.kill();
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
  const handlers = new Map<string, Array<(params: Record<string, unknown>) => void>>();
  socket.on("message", (data) => {
    const message = JSON.parse(String(data)) as { id?: number; method?: string; result?: unknown; params?: unknown; error?: unknown };
    if (message.id && pending.has(message.id)) {
      if (message.error) {
        console.error(`[${tag}] CDP error: ${JSON.stringify(message.error).slice(0, 160)}`);
      }
      pending.get(message.id)!((message.result ?? {}) as Record<string, unknown>);
      pending.delete(message.id);
    } else if (message.method) {
      for (const handler of handlers.get(message.method) ?? []) handler((message.params ?? {}) as Record<string, unknown>);
    }
  });
  return {
    send: (method, params = {}, sessionId) =>
      new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
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
  return {
    send: (method, params = {}) => root.send(method, params, session.sessionId),
    on: root.on,
    close: root.close,
  };
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
