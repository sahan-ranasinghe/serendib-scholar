/**
 * REAL-SESSION mobile verification: opens the lesson in headless Chromium
 * with a mobile UA + touch + device metrics, a fake mic, and captures the
 * console for [pcm] drain-timing lines and [beat] runtime events. Taps the
 * screen once early (the user-gesture AudioContext resume path), then lets
 * the session run unattended.
 */
import WebSocket from "ws";

const RUN_MS = Number(process.argv[2] ?? 150000);
const URL = "http://localhost:3000/";
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const target = await (
  await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });

const t0 = Date.now();
const stamp = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

ws.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.consoleAPICalled") {
    const text = (m.params.args ?? [])
      .map((a) => (a.value !== undefined ? String(a.value) : a.description ?? ""))
      .join(" ");
    if (/\[pcm\]|\[beat\]|\[useLessonRuntime\]|error|Error|failed/.test(text)) {
      console.log(`${stamp()} ${m.params.type.toUpperCase().padEnd(5)} ${text.slice(0, 220)}`);
    }
  }
  if (m.method === "Runtime.exceptionThrown") {
    console.log(`${stamp()} EXCEPTION ${JSON.stringify(m.params.exceptionDetails).slice(0, 300)}`);
  }
});
await new Promise((r) => ws.on("open", r));

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setUserAgentOverride", { userAgent: MOBILE_UA, platform: "Android" });
await send("Emulation.setDeviceMetricsOverride", { width: 892, height: 412, deviceScaleFactor: 2.6, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Page.navigate", { url: URL });
console.log(`${stamp()} navigated (mobile UA, touch, 892x412)`);

// A real child's first tap — exercises the gesture-resume path.
setTimeout(async () => {
  for (const type of ["touchStart", "touchEnd"]) {
    await send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchStart" ? [{ x: 446, y: 206 }] : [],
    });
  }
  console.log(`${stamp()} tapped screen (gesture resume)`);
}, 6000);

// The device gate: if the access-code screen is up, type the code the way
// a parent would (ACCESS_CODE env var of this script's own process).
setTimeout(async () => {
  const result = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const input = document.querySelector('input[type="password"]');
      if (!input) return "no gate visible";
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(process.env.VERIFY_ACCESS_CODE ?? "")});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.closest("form").requestSubmit();
      return "code submitted";
    })()`,
  });
  console.log(`${stamp()} gate: ${result?.result?.value}`);
}, 9000);

// Periodic AudioContext ground truth, straight from the page.
const probe = setInterval(async () => {
  const r = await send("Runtime.evaluate", {
    expression: `(() => {
      const caption = document.querySelector('.whiteboard p');
      return (caption ? caption.textContent.slice(0, 48) : 'no caption');
    })()`,
    returnByValue: true,
  });
  console.log(`${stamp()} on board: ${r?.result?.value ?? "?"}`);
}, 60000);

setTimeout(async () => {
  clearInterval(probe);
  console.log(`${stamp()} closing`);
  await send("Page.close").catch(() => {});
  process.exit(0);
}, RUN_MS);
