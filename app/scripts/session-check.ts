/**
 * A REAL session, unattended, on a phone: headless Chromium under mobile
 * emulation opens the lesson, passes the device gate, and lets session 1
 * run — answering every question the way a child would on the board
 * (tapping the tiles, the cell, the pad; a tap on a soft check), and
 * photographing every beat to
 *
 *   .board-check/session-1/<seq>-<beatId>.png
 *
 * so the storyboard can be reviewed against what actually rendered.
 *
 *   npm run session:check -- [baseUrl] [--max-minutes=25]
 *
 * Needs the dev server up with ACCESS_CODE set (.env.local), and the
 * same code in this process's env. At the end it prints:
 *   - beats whose choreography events fired OUTSIDE their clip (from the
 *     runtime's own trace, window.__choreoLog),
 *   - storyboard events with no matching primitive,
 *   - beats whose clip had no stored sentence spans (estimated timing),
 *   - the answers it gave and what the lesson made of them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { connect, evaluate, launch, openPage, wait } from "./lib/cdp";
import { sinhalaNumberName } from "../src/lib/sinhalaNumber";

/** Sinhala number name → digits, for the questions that ask for a name. */
const NAME_TO_NUMBER = new Map<string, number>();
for (let n = 0; n <= 10_000; n += 1) NAME_TO_NUMBER.set(sinhalaNumberName(n).replace(/\s/gu, ""), n);
for (let n = 10_000; n <= 100_000; n += 100) NAME_TO_NUMBER.set(sinhalaNumberName(n).replace(/\s/gu, ""), n);

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const MAX_MINUTES = Number(process.argv.find((a) => a.startsWith("--max-minutes="))?.slice(14) ?? 25);
const OUT_DIR = path.join(process.cwd(), ".board-check", "session-1");
const ACCESS_CODE = process.env.ACCESS_CODE ?? process.env.VERIFY_ACCESS_CODE ?? "";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

interface AuthoredBeat {
  id: string;
  type: string;
  expectedAnswer?: string;
  answerChoices?: string[];
}

interface ChoreoLogEntry {
  beatId: string;
  sentenceIndex: number;
  event: string;
  firedAtMs: number;
  spanStartMs: number;
  spanEndMs: number;
  clipMs: number;
  estimated: boolean;
  outside: boolean;
  known: boolean;
}

interface Snapshot {
  beatId: string;
  beatType: string;
  status: string;
  yourTurn: string | null;
  character: string | null;
  stage: string | null;
  choreo: { beatId: string; fired: number; sentences: number } | null;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  // Expected answers and name choices live on the BUILT script the app
  // serves (the authored file carries only the words); fetched from inside
  // the page once the session cookie exists.
  const expectedById = new Map<string, AuthoredBeat>();

  const { browser, wsUrl } = await launch("session-check");
  const root = await connect(wsUrl, "session-check");
  const page = await openPage(root);
  const consoleLines: string[] = [];
  page.on("Runtime.consoleAPICalled", (params) => {
    const args = (params.args as Array<{ value?: unknown; description?: string }>) ?? [];
    const text = args.map((a) => String(a.value ?? a.description ?? "")).join(" ");
    if (/\[beat\]|\[useLessonRuntime\]|Error|error|failed/.test(text)) consoleLines.push(`${params.type}: ${text.slice(0, 200)}`);
  });
  page.on("Runtime.exceptionThrown", (params) => {
    const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
    consoleLines.push(`exception: ${details?.exception?.description ?? details?.text ?? "?"}`.slice(0, 200));
  });
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("Emulation.setUserAgentOverride", { userAgent: MOBILE_UA, platform: "Android" });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 892, height: 412, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await page.send("Page.navigate", { url: `${BASE}/` });
  await wait(3000);

  const tap = async (x: number, y: number) => {
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await wait(50);
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const centre = async (selector: string): Promise<{ x: number; y: number } | null> =>
    evaluate(page, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  const tapSelector = async (selector: string): Promise<boolean> => {
    const point = await centre(selector);
    if (!point) return false;
    await tap(point.x, point.y);
    return true;
  };
  const snapshot = (): Promise<Snapshot> =>
    evaluate(
      page,
      `(() => { const el = document.querySelector('.lesson-screen'); const d = el ? el.dataset : {}; return { beatId: d.beatId ?? '—', beatType: d.beatType ?? '—', status: d.status ?? '—', yourTurn: d.yourTurn ?? null, character: d.character ?? null, stage: window.__stage ?? null, choreo: window.__choreo ?? null }; })()`,
    );

  // A real child's first tap — the gesture-resume path.
  await tap(446, 206);
  await wait(1500);
  // The device gate, the way a parent would enter it.
  const gated = await evaluate<boolean>(page, `!!document.querySelector('input[type="password"]')`);
  if (gated) {
    if (!ACCESS_CODE) throw new Error("the device gate is up and ACCESS_CODE is not set");
    await evaluate(
      page,
      `(() => { const input = document.querySelector('input[type="password"]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(input, ${JSON.stringify(ACCESS_CODE)}); input.dispatchEvent(new Event("input", { bubbles: true })); input.form.requestSubmit(); return true; })()`,
    );
    console.log("device gate: code entered");
    await wait(3000);
  }
  const script = await evaluate<{ beats?: AuthoredBeat[] } | null>(
    page,
    `fetch("/api/lesson-script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "maths", grade: 5, lesson: 1 }) }).then((r) => r.json()).then((j) => j.script ?? null).catch(() => null)`,
  );
  for (const beat of script?.beats ?? []) expectedById.set(beat.id, beat);
  console.log(`lesson script: ${expectedById.size} beats (${[...expectedById.values()].filter((b) => b.expectedAnswer).length} with an expected answer)`);

  const shots: Array<{ seq: number; beatId: string; file: string; stage: string | null }> = [];
  const answers: Array<{ beatId: string; via: string; answer: string }> = [];
  const note = (entry: { beatId: string; via: string; answer: string }) => {
    answers.push(entry);
    console.log(`      ↳ answered ${entry.beatId.replace(/^authored:/u, "")} via ${entry.via}: ${entry.answer}`);
  };
  let lastBeat = "";
  let lastTurnBeat = "";
  let seq = 0;
  const started = Date.now();
  const shoot = async (beatId: string, tag = "") => {
    seq += 1;
    const snap = await snapshot();
    const image = (await page.send("Page.captureScreenshot", { format: "png" })) as { data?: string };
    if (!image.data) return;
    const safe = beatId.replace(/[^a-zA-Z0-9:_-]/gu, "_").replace(/:/gu, "-");
    const file = path.join(OUT_DIR, `${String(seq).padStart(3, "0")}-${safe}${tag}.png`);
    await writeFile(file, Buffer.from(image.data, "base64"));
    shots.push({ seq, beatId, file: path.relative(process.cwd(), file), stage: snap.stage });
  };

  /** The child answers on the board: the surface first, the pad as the fallback. */
  const answer = async (snap: Snapshot) => {
    // The silence ladder's nudges (:wait, :help) re-open the SAME question.
    const questionId = snap.beatId.replace(/:(wait|help|reask)$/u, "");
    const beat = expectedById.get(questionId);
    const [kind, surface, touch] = (snap.yourTurn ?? "").split(":");
    if (kind === "soft") {
      const tapped = (await tapSelector('[data-soft-tap]')) || (await tapSelector('[data-testid="lesson-board"]'));
      note({ beatId: snap.beatId, via: tapped ? "tap on the board" : "no surface", answer: "(tapped)" });
      return;
    }
    const expected = beat?.expectedAnswer ?? "";
    if (beat?.answerChoices && beat.answerChoices.length >= 2) {
      const ok = await evaluate<boolean>(page, `(() => { const b = [...document.querySelectorAll('[data-testid="turn-choice"]')].find((el) => el.textContent.trim() === ${JSON.stringify(expected)}); if (!b) return false; b.click(); return true; })()`);
      note({ beatId: snap.beatId, via: ok ? "choice button" : "no choice button", answer: expected });
      return;
    }
    let digits = expected.replace(/\D/gu, "");
    if (expected.startsWith("{")) {
      try {
        digits = (JSON.parse(expected).digits as number[]).join("");
      } catch {
        digits = "";
      }
    } else if (!/\d/u.test(expected)) {
      const named = NAME_TO_NUMBER.get(expected.replace(/\s/gu, ""));
      digits = named === undefined ? "" : String(named);
    }
    if (!digits) {
      note({ beatId: snap.beatId, via: `nothing tappable for "${expected.slice(0, 24)}"`, answer: "" });
      return;
    }
    if (surface === "numberCards" && touch === "touch") {
      const tapped = await tapSelector(`[data-card="${digits}"]`);
      if (tapped) {
        note({ beatId: snap.beatId, via: "card tap", answer: digits });
        return;
      }
    }
    if (surface === "digitPicker" && touch === "touch") {
      // Tap the tiles in the expected order, then commit.
      for (const digit of digits) {
        const ok = await evaluate<boolean>(page, `(() => { const tile = [...document.querySelectorAll('[data-testid^="picker-tile-"]')].find((el) => el.getAttribute('aria-label')?.startsWith(${JSON.stringify(digit)}) && el.getAttribute('role') === 'button'); if (!tile) return false; tile.click(); return true; })()`);
        if (!ok) break;
        await wait(250);
      }
      await wait(300);
      const placed = await evaluate<number>(page, `document.querySelectorAll('[data-testid^="picker-slot-"] .hand-number').length`);
      const committed = await tapSelector('[data-testid="turn-commit"]');
      if (committed) {
        await wait(900);
        const taken = (await snapshot()).status !== "listening";
        if (!taken) await evaluate(page, `document.querySelector('[data-testid="turn-commit"]')?.click(); true`);
        note({ beatId: snap.beatId, via: `${placed} tiles placed + ✓ ${taken ? "(touch)" : "(touch ignored — clicked)"}`, answer: digits });
        return;
      }
      note({ beatId: snap.beatId, via: `${placed} tiles placed, no ✓`, answer: digits });
    }
    if (surface === "blankTable" && touch === "touch") {
      const cell = await tapSelector('[data-testid^="cell-"][data-active]');
      if (cell) {
        await wait(400);
        for (const digit of digits) {
          await evaluate(page, `(() => { const k = [...document.querySelectorAll('[data-testid="number-pad"] button')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(digit)}); k && k.click(); return true; })()`);
          await wait(80);
        }
        await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[aria-label="done"]'); k && k.click(); return true; })()`);
        note({ beatId: snap.beatId, via: "table cell + pad", answer: digits });
        return;
      }
    }
    if (surface === "expansion" && touch === "touch") {
      const part = await tapSelector('[data-testid^="expansion-part-"][role="button"]');
      if (part) {
        await wait(400);
        for (const digit of digits) {
          await evaluate(page, `(() => { const k = [...document.querySelectorAll('[data-testid="number-pad"] button')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(digit)}); k && k.click(); return true; })()`);
          await wait(80);
        }
        await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[aria-label="done"]'); k && k.click(); return true; })()`);
        note({ beatId: snap.beatId, via: "expansion blank + pad", answer: digits });
        return;
      }
    }
    // The fallback: the pad behind 🔢.
    const opened = await tapSelector('[data-testid="turn-pad-toggle"]');
    if (!opened) {
      note({ beatId: snap.beatId, via: "no pad", answer: digits });
      return;
    }
    await wait(400);
    for (const digit of digits) {
      await evaluate(page, `(() => { const k = [...document.querySelectorAll('[data-testid="number-pad"] button')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(digit)}); k && k.click(); return true; })()`);
      await wait(80);
    }
    await evaluate(page, `(() => { const k = document.querySelector('[data-testid="number-pad"] button[aria-label="done"]'); k && k.click(); return true; })()`);
    note({ beatId: snap.beatId, via: "number pad", answer: digits });
  };

  console.log(`session-1 run: ${BASE} · mobile 892×412 · up to ${MAX_MINUTES} min`);
  let done = false;
  while (Date.now() - started < MAX_MINUTES * 60_000) {
    const snap = await snapshot();
    if (snap.beatId !== lastBeat && snap.beatId !== "—") {
      lastBeat = snap.beatId;
      // Let the beat's first events land, then photograph it.
      await wait(900);
      await shoot(snap.beatId);
      const short = snap.beatId.replace(/^authored:/u, "");
      console.log(`  ${String(seq).padStart(3, "0")} ${short.padEnd(34)} ${snap.beatType.padEnd(12)} ${(snap.stage ?? "").slice(0, 60)}`);
    }
    if (snap.status === "listening" && snap.yourTurn && snap.beatId !== lastTurnBeat) {
      lastTurnBeat = snap.beatId;
      await wait(700);
      await shoot(snap.beatId, "-your-turn");
      await answer(snap);
    }
    if (snap.status === "done") {
      await wait(1200);
      await shoot("session-summary");
      done = true;
      break;
    }
    if (snap.status === "error" || snap.status === "locked") {
      console.log(`  stopped: status ${snap.status}`);
      break;
    }
    await wait(250);
  }

  const log = (await evaluate<ChoreoLogEntry[]>(page, `window.__choreoLog ?? []`)) ?? [];
  const seen = new Set(shots.map((s) => s.beatId));
  const outside = new Map<string, ChoreoLogEntry[]>();
  const estimated = new Set<string>();
  const unknown: string[] = [];
  for (const entry of log) {
    if (entry.outside) outside.set(entry.beatId, [...(outside.get(entry.beatId) ?? []), entry]);
    if (entry.estimated) estimated.add(entry.beatId);
    if (!entry.known) unknown.push(`${entry.beatId} ${entry.event}`);
  }

  console.log(`\n${done ? "session ended" : "stopped at the time cap"} after ${Math.round((Date.now() - started) / 1000)}s · ${shots.length} screenshots in ${path.relative(process.cwd(), OUT_DIR)}/`);
  console.log(`beats seen: ${seen.size} · choreography events fired: ${log.length} on ${new Set(log.map((e) => e.beatId)).size} beats`);
  console.log(`\nanswers given (${answers.length}):`);
  for (const a of answers) console.log(`  ${a.beatId.replace(/^authored:/u, "").padEnd(34)} ${a.via.padEnd(22)} ${a.answer}`);
  console.log(`\nbeats whose events fired OUTSIDE their clip: ${outside.size}`);
  for (const [beatId, entries] of outside) {
    for (const e of entries) console.log(`  ${beatId.replace(/^authored:/u, "")} s${e.sentenceIndex} ${e.event} fired at ${e.firedAtMs}ms, sentence ${e.spanStartMs}–${e.spanEndMs}ms of a ${e.clipMs}ms clip${e.estimated ? " (estimated spans)" : ""}`);
  }
  console.log(`\nstoryboard events with no matching primitive: ${unknown.length}`);
  for (const u of unknown) console.log(`  ${u}`);
  console.log(`\nbeats with estimated sentence spans (no stored spans that fit): ${estimated.size}`);
  if (estimated.size) console.log(`  ${[...estimated].map((b) => b.replace(/^authored:/u, "")).join(", ")}`);
  const problems = consoleLines.filter((line) => /error|exception|failed/i.test(line));
  console.log(`\nconsole errors: ${problems.length}`);
  for (const line of problems.slice(0, 15)) console.log(`  ${line}`);

  page.close();
  browser.kill();
  process.exit(done ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
