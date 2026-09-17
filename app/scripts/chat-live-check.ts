/**
 * THE ✋ VERIFICATION (docs/qa/session1-triage.md, cluster H item 12) —
 * `npm run chat:live-check -- <baseUrl>`.
 *
 * The ONE allowed model call of the QA suite: from a mobile user agent it
 * onboards a child, jumps (DEV_MODE) to a known beat — the abacus reading of
 * 5421 — taps ✋, answers the one-time P1 sheet with "ටයිප් කරන්නම්" (no
 * microphone in headless Chrome), and sends "මොකද්ද මේ?" through the
 * existing Live route. It asserts that she answered, that the reply refers
 * to what is on the board (the abacus / its rods / the number 5421 / place
 * values) and that it introduces no new topic, and prints the reply.
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { launch, connect, openPage, evaluate, wait } from "./lib/cdp";
import { ONBOARD_VIA_API_JS } from "./lib/onboard";
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3001";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const QUESTION = "මොකද්ද මේ?";
/** The board at the target beat: the abacus showing 5421 (placeValue4Digit:44). */
const TARGET_BEAT = "authored:placeValue4Digit:44";
const BOARD_WORDS = ["චක්‍රාවලිය", "ඇබකස", "abacus", "5421", "පන්දහස්", "පොල්", "කූරු", "කූර", "ස්ථාන", "දහස්", "සිය", "දහය", "ඒකක", "සංඛ්‍යා", "පබළු", "ගණන", "බෝල", "ඉලක්කම", "ලකුණු"];
const OFF_TOPIC = ["ගුණ කිරීම", "බෙදීම", "භාග", "දශම", "ත්‍රිකෝණ", "වර්ග", "කාලය", "මුදල්", "ක්‍රීඩා", "කතන්දර", "සින්දු", "multiplication", "fraction", "decimal"];

async function main(): Promise<void> {
  const accessCode = /ACCESS_CODE=(.+)/u.exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf8"))?.[1]?.trim() ?? "";
  // A fake microphone: the P1 sheet is answered "හරි, අවසර දෙන්න" and the browser grants it without a prompt (typed chat is not a path yet).
  const { browser, wsUrl } = await launch("chat-live", ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]);
  process.on("exit", () => { try { browser.kill(); } catch { /* already gone */ } });
  const root = await connect(wsUrl, "chat-live");
  const page = await openPage(root);
  await page.send("Runtime.enable");
  const consoleLines: string[] = [];
  page.on("Runtime.consoleAPICalled", (raw) => {
    const e = raw as unknown as { type: string; args: Array<{ value?: unknown; description?: string }> };
    consoleLines.push(`${e.type}: ${e.args.map((a) => (a.value ?? a.description ?? "")).join(" ").slice(0, 220)}`);
  });
  page.on("Runtime.exceptionThrown", (raw) => {
    const e = raw as unknown as { exceptionDetails: { text: string; exception?: { description?: string } } };
    consoleLines.push(`EXCEPTION: ${(e.exceptionDetails.exception?.description ?? e.exceptionDetails.text).slice(0, 400)}`);
  });
  await page.send("Emulation.setUserAgentOverride", { userAgent: MOBILE_UA });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send("Page.navigate", { url: `${BASE}/` });
  await wait(1500);
  console.log("onboarding a child…");
  const onboarded = await evaluate<{ ok: boolean; child_id?: string; step?: string; status?: number; error?: string }>(page, ONBOARD_VIA_API_JS(accessCode, "කතා දරුවා")).catch((e): { ok: boolean; child_id?: string; step?: string; status?: number; error?: string } => ({ ok: false, error: String(e) }));
  if (onboarded.child_id) (globalThis as { __harnessChild?: string }).__harnessChild = onboarded.child_id;
  if (!onboarded.ok) throw new Error(`could not onboard a child (${onboarded.step ?? "?"} ${onboarded.status ?? ""} ${onboarded.error ?? ""})`);
  console.log(`child ${onboarded.child_id ?? "?"} · opening the session…`);
  // The device's one-time consent for the live chat is what the P1 sheet asks; the session runs in a fresh tab.
  await page.send("Page.navigate", { url: `${BASE}/session` });
  // Wait for the lesson to be under way (the script and settings loaded) before asking for the jump.
  for (let i = 0; i < 120; i += 1) {
    const teaching = await evaluate<boolean>(page, `(() => { const d = (document.querySelector('.lesson-screen') || { dataset: {} }).dataset; return !!d.beatId && d.beatId !== '—'; })()`).catch(() => false);
    if (teaching) break;
    await wait(500);
  }
  let jumped = false;
  for (let i = 0; i < 80 && !jumped; i += 1) {
    // Jump to the abacus reading of 5421 (DEV_MODE): session 1, the beat with the target id.
    jumped = await evaluate<boolean>(page, `(() => { const d = window.__dev; if (!d || !d.jump || !document.querySelector('.lesson-screen')) return false; d.jump(0, ${JSON.stringify(TARGET_BEAT)}); return true; })()`).catch(() => false);
    if (!jumped) await wait(250);
  }
  if (!jumped) throw new Error("window.__dev.jump is not installed — is DEV_MODE=on?");
  // Wait until the lesson screen reports the target beat.
  let beatId = "";
  for (let i = 0; i < 120; i += 1) {
    beatId = await evaluate<string>(page, `(document.querySelector('.lesson-screen') || { dataset: {} }).dataset.beatId || ''`).catch(() => "");
    if (beatId.startsWith(TARGET_BEAT)) break;
    await wait(500);
  }
  console.log(`at beat: ${beatId.trim() || "(unknown)"}`);
  // ✋ — ONE tap.
  const tapped = await evaluate<boolean>(page, `(() => { const b = document.querySelector('[data-testid="hand"]'); if (!b) return false; b.click(); return true; })()`);
  if (!tapped) throw new Error("no ✋ control on the lesson screen");
  // The one-time P1 sheet: allow (the fake microphone answers the browser's prompt).
  let p1 = "never shown";
  for (let i = 0; i < 80; i += 1) {
    const found = await evaluate<string>(page, `(() => { const b = document.querySelector('[data-testid="mic-ask-allow"]'); if (b) { b.click(); return 'allowed'; } return document.querySelector('[data-testid="chat-sheet"]') ? 'chat open' : ''; })()`).catch(() => "");
    if (found) { p1 = `${found} after ${(i * 250) / 1000} s`; break; }
    await wait(250);
  }
  console.log(`P1 sheet: ${p1}`);
  // Connected?
  let chatState = "";
  for (let i = 0; i < 160; i += 1) {
    chatState = await evaluate<string>(page, `(() => { const d = (document.querySelector('.lesson-screen') || { dataset: {} }).dataset; return (d.chat || '') + (d.chatError ? ' — ' + d.chatError : ''); })()`).catch(() => "");
    if (/connected|error/u.test(chatState)) break;
    await wait(250);
  }
  console.log(`✋ state: ${chatState.trim()}`);
  const interesting = consoleLines.filter((l) => !/\[pcm\]|\[beat\] sentence|React DevTools|\[proxy\]/u.test(l));
  console.log(`runtime log (last ${Math.min(30, interesting.length)}):\n  ${interesting.slice(-30).join("\n  ")}`);
  if (!/connected/u.test(chatState)) throw new Error(`the chat did not connect: ${chatState}`);
  const sent = await evaluate<boolean>(page, `window.__dev.chatSend(${JSON.stringify(QUESTION)})`);
  if (!sent) throw new Error("chatSend refused (not connected)");
  let reply = "";
  for (let i = 0; i < 80; i += 1) {
    const t = await evaluate<{ zara: string }>(page, `window.__dev.chatTranscript()`).catch(() => ({ zara: "" }));
    reply = t?.zara ?? "";
    if (reply.trim().length > 20) { await wait(4000); reply = (await evaluate<{ zara: string }>(page, `window.__dev.chatTranscript()`)).zara ?? reply; break; }
    await wait(500);
  }
  console.log(`\nchild: ${QUESTION}\nzara: ${reply.trim() || "(no reply)"}`);
  const mentionsBoard = BOARD_WORDS.some((w) => reply.includes(w));
  const offTopic = OFF_TOPIC.filter((w) => reply.includes(w));
  console.log(`\nreferences the board: ${mentionsBoard ? "yes" : "NO"} · new topic: ${offTopic.length ? offTopic.join(", ") : "none"}`);
  await evaluate(page, `(() => { const b = document.querySelector('[data-testid="chat-return"]'); b && b.click(); })()`).catch(() => undefined);
  await wait(500);

  await cleanup();
  page.close();
  browser.kill();
  if (!reply.trim()) throw new Error("no reply");
  if (!mentionsBoard) throw new Error("the reply does not reference the current board");
  if (offTopic.length) throw new Error(`the reply introduces a new topic: ${offTopic.join(", ")}`);
  process.exit(0);
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
