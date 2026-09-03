// Live-session diagnostic: mirrors geminiLiveClient.ts + useGeminiLive's
// session-start behavior exactly, with every wire event logged — token mint,
// setup, the self-start silent turn, next_beat round-trips, a simulated
// hold-to-speak, and the close code/reason verbatim. Needs the dev server on
// :3000. Run from app/: `node scripts/probe-live-session.mjs`
// (`client-setup` as arg to also put realtimeInputConfig in the client setup).
import WebSocket from "ws";

const res = await fetch("http://localhost:3000/api/gemini-session", { method: "POST" });
const { token, model, openMicChat } = await res.json();
console.log("[probe] token:", token?.slice(0, 30) + "…", "model:", model, "openMicChat:", openMicChat);

const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
const ws = new WebSocket(url);
const t0 = Date.now();
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;
let audioBytes = 0, toolCalls = 0, outputTranscript = "", heldOnce = false;

const send = (payload) => { ws.send(JSON.stringify(payload)); };

ws.on("open", () => {
  console.log(ts(), "[open] sending setup (same as geminiLiveClient)");
  const variant = process.argv[2] ?? "token-only";
  console.log("[probe] setup variant:", variant);
  const setup = { model, generationConfig: { responseModalities: ["AUDIO"] } };
  if (variant === "client-setup") {
    setup.realtimeInputConfig = { automaticActivityDetection: { disabled: true } };
  }
  send({ setup });
});

ws.on("message", async (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.setupComplete) {
    console.log(ts(), "[setupComplete] — self-start silent turn (as the FIXED onReady does)");
    send({ realtimeInput: { activityStart: {} } });
    send({ realtimeInput: { audio: { data: "A".repeat(4000), mimeType: "audio/pcm;rate=16000" } } });
    send({ realtimeInput: { activityEnd: {} } });
    return;
  }
  if (msg.toolCall?.functionCalls?.length) {
    for (const call of msg.toolCall.functionCalls) {
      toolCalls += 1;
      console.log(ts(), `[toolCall #${toolCalls}]`, call.name, JSON.stringify(call.args ?? {}));
      if (call.name === "next_beat") {
        send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: {
          instruction: "[DIRECTOR] Board shows: a title card. Goal: Say exactly one short warm Sinhala greeting sentence to the child. Speak at most 1 sentence, slowly, in Sinhala. End by pausing and waiting for the child. Then stop.",
        } }] } });
        console.log(ts(), "  -> responded with a test director instruction");
      } else {
        send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { ok: true } }] } });
      }
    }
    return;
  }
  const sc = msg.serverContent;
  if (sc) {
    for (const part of sc.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) audioBytes += Math.floor(part.inlineData.data.length * 3 / 4);
    }
    if (sc.outputTranscription?.text) outputTranscript += sc.outputTranscription.text;
    if (sc.turnComplete) {
      console.log(ts(), "[turnComplete] audioBytes:", audioBytes, "| said:", JSON.stringify(outputTranscript.slice(-200)));
      if (!heldOnce && toolCalls >= 1 && audioBytes > 0) {
        heldOnce = true;
        console.log(ts(), "[simulating hold-to-speak] activityStart + 1s of mic audio + activityEnd");
        send({ realtimeInput: { activityStart: {} } });
        send({ realtimeInput: { audio: { data: Buffer.alloc(32000).toString("base64"), mimeType: "audio/pcm;rate=16000" } } });
        send({ realtimeInput: { activityEnd: {} } });
      }
    }
    if (sc.interrupted) console.log(ts(), "[interrupted]");
    return;
  }
  console.log(ts(), "[other message]", JSON.stringify(msg).slice(0, 300));
});

ws.on("error", (err) => console.log(ts(), "[error]", String(err)));
ws.on("close", (code, reason) => {
  console.log(ts(), `[close] code=${code} reason=${JSON.stringify(reason.toString())}`);
  console.log(`[summary] toolCalls=${toolCalls} audioBytes=${audioBytes}`);
  process.exit(0);
});
setTimeout(() => { console.log(ts(), "[timeout] closing after 35s"); ws.close(); }, 35000);
