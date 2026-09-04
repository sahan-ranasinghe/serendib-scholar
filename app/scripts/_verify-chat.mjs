/**
 * Verification aid: taps the "✋ Zara එක්ක කතා කරන්න" button mid-lesson and
 * checks that a live chat actually opens (lesson pauses, socket connects,
 * her voice comes back through the same player), then taps it again to end
 * the chat and confirms the lesson resumes.
 */
import WebSocket from "ws";

const target = await (
  await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent("http://localhost:3000/")}`, { method: "PUT" })
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
    const text = (m.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (/chat|\[beat\]|\[pcm\]|rror/i.test(text)) console.log(`${stamp()} ${text.slice(0, 160)}`);
  }
});
await new Promise((r) => ws.on("open", r));
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 892, height: 412, deviceScaleFactor: 2.6, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

const clickChat = () =>
  send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('✋'));
      if (!button) return 'no button';
      button.click();
      return button.textContent;
    })()`,
  });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await wait(20000);
console.log(`${stamp()} tapping the chat button: ${(await clickChat()).result.value}`);
await wait(35000);
const during = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('✋'))?.textContent ?? '?'`,
});
console.log(`${stamp()} button now reads: ${during.result.value}`);
console.log(`${stamp()} tapping again to end: ${(await clickChat()).result.value}`);
await wait(20000);
console.log(`${stamp()} done`);
await send("Page.close").catch(() => {});
process.exit(0);
