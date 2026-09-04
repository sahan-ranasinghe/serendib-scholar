import WebSocket from "ws";
const target = await (await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent("http://localhost:3000/")}`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.on("message", (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
await new Promise((r) => ws.on("open", r));
await new Promise((r) => setTimeout(r, 2500));
const res = await send("Runtime.evaluate", {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const gain = ctx.createGain(); gain.gain.value = 0;
    let peak = 0, frames = 0;
    proc.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i]*input[i];
      const rms = Math.sqrt(sum / input.length);
      if (rms > peak) peak = rms;
      frames++;
    };
    src.connect(proc); proc.connect(gain); gain.connect(ctx.destination);
    await new Promise((r) => setTimeout(r, 6000));
    return { ctxState: ctx.state, frames, peak: Number(peak.toFixed(4)), tracks: stream.getAudioTracks().map(t => t.label) };
  })()`,
});
console.log(JSON.stringify(res.result.value ?? res, null, 1));
await send("Page.close").catch(() => {});
process.exit(0);
