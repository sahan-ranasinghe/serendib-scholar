/**
 * THE NAVIGATION SOAK (28 Sep 2026): the device sequence that played two
 * clips at once, forty times, measured by the browser (scripts/lib/audioTruth.ts).
 *
 * Each sequence lands on an origin beat (window.__dev.jump), waits for its
 * clip to be REALLY sounding, and then does what the child did:
 *
 *   ⏸ (at one of four moments: 400 ms into the line, 1200 ms in, 250 ms
 *   before its end, or just after it ends — the next line's fetch in flight)
 *   → ⏮ once (sequences 1–20) or five times (21–40)
 *   → 0, 100, 300 or 800 ms
 *   → ▶ දිගටම
 *
 * and then listens until the first clip after ▶ has finished. Per sequence:
 * the most voice clips sounding at once from ⏸ to the end, what sounded
 * while paused, which clips sounded after ▶, how many beats the runtime
 * served after ▶ (window.__served, where the build publishes it) and the
 * label of the clip that played (where the build labels its sources).
 *
 * Origins are runs of speech-only beats (nothing waits for an answer), so a
 * sequence never stalls on a question, and they rotate through the session so
 * the ⏮ targets' clips are fetched cold — the Slow 3G latency is real.
 */
import { evaluate, wait, type Cdp } from "./cdp";
import { ariaSel } from "./copyText";
import { analyseTruth, COLLECT_TRUTH_JS, type TruthLog, type TruthSummary } from "./audioTruth";

export interface SoakBeat {
  id: string;
  type: string;
  spokenText?: string | null;
  sayCandidates?: string[] | null;
}

export interface SoakRow {
  n: number;
  steps: number;
  delayMs: number;
  pause: string;
  origin: string;
  target: string;
  selected: string;
  /** voice clips that sounded while the lesson was paused (⏸ → ▶) */
  whilePaused: string[];
  /** voice clips that sounded after ▶, in order */
  afterResume: string[];
  /** voice clips that STARTED after ▶ */
  startedAfterResume: number;
  /** beats the runtime served after ▶ (null: this build does not publish them) */
  served: string[] | null;
  /** how each line after ▶ began, from the lesson's own trace: its clip, or read on the board (no clip in time) — and when */
  lines: string[];
  max: number;
  overlaps: string[];
  ok: boolean;
  note: string;
}

/** Chrome's "Slow 3G", as latency-check uses it. */
export const SLOW_3G = { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 };
export const CPU_RATE = 4;

const PAUSES = ["400 ms into the line", "1200 ms into the line", "250 ms before the line ends", "just after the line ends"] as const;
const DELAYS = [0, 100, 300, 800] as const;
const short = (id: string) => id.replace(/^authored:/u, "");

/** Origins: beat indices in the first session with five speech-only beats before them and one after. */
export function soakOrigins(beats: SoakBeat[], lastBeat: number, speechOnly: (beat: SoakBeat) => boolean): number[] {
  const ok = (i: number) => i >= 0 && i <= lastBeat && speechOnly(beats[i]!);
  const origins: number[] = [];
  for (let i = 5; i < lastBeat; i += 1) {
    let all = true;
    for (let k = i - 5; k <= i + 1 && all; k += 1) all = ok(k);
    // Spread out: a new origin at least three beats past the last one, so their targets differ.
    if (all && (origins.length === 0 || i - origins[origins.length - 1]! >= 3)) origins.push(i);
  }
  return origins;
}

export async function runNavSoak(page: Cdp, beats: SoakBeat[], origins: number[], log: (line: string) => void = console.log): Promise<SoakRow[]> {
  const now = () => evaluate<number>(page, "performance.now()");
  const touch = async (x: number, y: number) => {
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await wait(50);
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const tapSelector = async (selector: string): Promise<boolean> => {
    const point = await evaluate<{ x: number; y: number } | null>(page, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
    if (!point) return false;
    await touch(point.x, point.y);
    return true;
  };
  /** The voice clip (≥ 350 ms buffer) started after `since` that is still sounding — the origin's line. */
  const liveClip = (since: number) =>
    evaluate<{ index: number; clip: { id: number; p: number; ms: number; ended: boolean } | null }>(
      page,
      `(() => { const el = document.querySelector('.lesson-screen'); const index = Number(el && el.dataset.beatIndex !== undefined ? el.dataset.beatIndex : -1); const T = window.__audioTruth; const c = T ? T.sources.filter((s) => s.p > ${since} && s.kind === 'buffer' && (s.E - s.S) >= 0.35).pop() : null; return { index, clip: c ? { id: c.id, p: c.p, ms: (c.E - c.S) * 1000, ended: c.endedP !== null || c.stopAt !== null || c.discC !== null } : null }; })()`,
    );
  const collect = async (from: number) => (await evaluate<TruthLog | null>(page, COLLECT_TRUTH_JS(from))) ?? { now: 0, contexts: [], sources: [], media: [] };
  const served = (from: number, to: number) => evaluate<string[] | null>(page, `Array.isArray(window.__served) ? window.__served.filter((b) => b.p >= ${from} && b.p <= ${to}).map((b) => b.id) : null`);
  const name = (label: string | null, stream: string) => (label ? short(label) : `clip ${stream}`);

  const rows: SoakRow[] = [];
  for (let k = 0; k < 40; k += 1) {
    const steps = k < 20 ? 1 : 5;
    const delayMs = DELAYS[k % 4]!;
    const pause = PAUSES[Math.floor(k / 4) % 4]!;
    const origin = origins[k % origins.length]!;
    const target = origin - steps;
    const row: SoakRow = { n: k + 1, steps, delayMs, pause, origin: short(beats[origin]!.id), target: short(beats[target]!.id), selected: "—", whilePaused: [], afterResume: [], startedAfterResume: 0, served: null, lines: [], max: 0, overlaps: [], ok: false, note: "" };

    // Land on the origin and wait for its line to be sounding (the jump is taken at the next beat boundary). A landing
    // can miss — on Slow 3G a cold clip may time out and be read on the board, and the lesson moves on before any ⏸ —
    // so it is tried up to three times: the sequence under test has not begun until its line is really sounding.
    let live: Awaited<ReturnType<typeof liveClip>> = { index: -1, clip: null };
    for (let attempt = 1; attempt <= 3 && !(live.index === origin && live.clip && !live.clip.ended); attempt += 1) {
      const asked = await now();
      await evaluate(page, `window.__dev && window.__dev.jump(0, ${JSON.stringify(beats[origin]!.id)})`);
      live = await liveClip(asked);
      // Up to a minute: on Slow 3G a cold clip (and the look-ahead competing for the same 400 kb/s) takes a while. A miss
      // is the lesson reaching the origin and moving past it without its line having sounded.
      let reached = false;
      for (let i = 0; i < 480 && !(live.index === origin && live.clip && !live.clip.ended); i += 1) {
        if (live.index === origin) reached = true;
        else if (reached && live.index > origin) break;
        await wait(125);
        live = await liveClip(asked);
      }
      if (attempt > 1) row.note = `landed on attempt ${attempt}`;
    }
    if (!(live.index === origin && live.clip)) {
      row.note = `origin not reached in 3 attempts (at index ${live.index})`;
      rows.push(row);
      log(`  #${row.n} ${row.note}`);
      continue;
    }
    const clip = live.clip;
    // ⏸ at this sequence's moment.
    const into = pause.startsWith("400") ? 400 : pause.startsWith("1200") ? 1200 : pause.startsWith("250") ? Math.max(300, clip.ms - 250) : null;
    if (into !== null) {
      for (let i = 0; i < 200 && (await now()) - clip.p < Math.min(into, clip.ms - 150); i += 1) await wait(20);
    } else {
      const ended = () => evaluate<boolean>(page, `(() => { const s = window.__audioTruth.sources[${clip.id}]; return !!s && (s.endedP !== null || s.stopAt !== null || s.discC !== null); })()`);
      for (let i = 0; i < 400 && !(await ended()); i += 1) await wait(25);
    }
    const tPause = await now();
    await tapSelector(ariaSel("session.pause"));
    for (let i = 0; i < 40 && !(await evaluate<boolean>(page, `!!document.querySelector('[data-testid="playback-panel"]')`)); i += 1) await wait(75);
    await wait(500);
    for (let i = 0; i < steps; i += 1) {
      await tapSelector('[data-testid="nav-back"]');
      await wait(350);
    }
    row.selected = await evaluate<string>(page, `(() => { const el = document.querySelector('.lesson-screen'); return el && el.dataset.previewBeat ? el.dataset.previewBeat : '—'; })()`);
    row.selected = short(row.selected);
    await wait(delayMs);
    const tResume = await now();
    await tapSelector('[data-testid="nav-resume"]');
    // Listen for the selected beat: until the runtime serves the NEXT beat (where the build publishes window.__served), or
    // the first clip that starts after ▶ has finished — whichever comes first (a cold fetch on Slow 3G can take a while).
    let tEnd = 0;
    for (let i = 0; i < 400 && !tEnd; i += 1) {
      await wait(150);
      const state = await evaluate<{ endedP: number | null; end: boolean; next: number | null }>(page, `(() => { const T = window.__audioTruth; const s = T.sources.find((x) => x.p > ${tResume} && x.kind === 'buffer' && (x.E - x.S) >= 0.35); const served = Array.isArray(window.__served) ? window.__served.filter((b) => b.p >= ${tResume}) : []; return { endedP: s ? s.endedP : null, end: !!s && (s.endedP !== null || s.stopAt !== null || s.discC !== null), next: served.length >= 2 ? served[1].p : null }; })()`);
      if (state.next !== null) tEnd = state.next - 1;
      else if (state.end) tEnd = (state.endedP ?? (await now())) + 150;
    }
    if (!tEnd) {
      row.note = "no clip after ▶ in 60 s";
      tEnd = await now();
    }
    await wait(Math.max(0, tEnd - (await now())) + 50);
    const truth = await collect(tPause - 50);
    const whole: TruthSummary = analyseTruth(truth, tPause, tEnd);
    const paused = analyseTruth(truth, tPause, tResume + 30);
    const after = analyseTruth(truth, tResume + 30, tEnd);
    row.max = whole.maxConcurrent;
    row.overlaps = whole.overlaps.map((o) => `${o.a.replace(/authored:/gu, "")} + ${o.b.replace(/authored:/gu, "")} ${o.ms} ms @${o.at}`);
    // What the child heard while paused: anything that began sounding after the tap on ⏸ took hold (a clip running into
    // the tap for a frame is not "playing while paused").
    row.whilePaused = paused.sounding.filter((s) => s.at > 150 || s.ms > 250).map((s) => name(s.label, s.stream));
    row.afterResume = after.sounding.map((s) => name(s.label, s.stream));
    row.startedAfterResume = after.starts.length;
    row.served = await served(tResume, tEnd);
    row.lines = await evaluate<string[]>(page, `(window.__lineStarts ?? []).filter((l) => l.at >= ${tResume} && l.at <= ${tEnd}).map((l) => l.beatId.replace(/^authored:/u, '') + ' ' + l.via + ' +' + Math.round(l.at - ${tResume}) + ' ms')`);
    const labelled = after.sounding.every((s) => s.label !== null);
    // The selected beat's line: its clip — or, when its clip could not arrive in time on Slow 3G, read on the board (the
    // lesson's designed fallback), in which case no clip may sound at all.
    const readOnBoard = row.lines.some((l) => l.startsWith(`${row.target} caption`));
    if (readOnBoard && after.sounding.length === 0) row.note = `${row.target}'s clip did not arrive in time — read on the board`;
    const oneClip = readOnBoard
      ? after.sounding.length === 0 && row.startedAfterResume === 0
      : after.sounding.length === 1 && row.startedAfterResume === 1 && (!labelled || short(after.sounding[0]!.label ?? "") === row.target);
    const oneBeat = row.served === null || (row.served.length === 1 && short(row.served[0]!) === row.target);
    row.ok = row.max <= 1 && row.whilePaused.length === 0 && oneClip && oneBeat && row.selected === row.target;
    rows.push(row);
    log(`  #${String(row.n).padStart(2)} ⏮×${row.steps} +${String(row.delayMs).padStart(3)} ms ▶ · ⏸ ${row.pause.padEnd(27)} · ${row.origin} → ${row.selected} · max ${row.max} · paused: ${row.whilePaused.join(", ") || "silent"} · after ▶: ${row.afterResume.join(" | ") || "nothing"} (${row.startedAfterResume} started) · served ${row.served === null ? "n/a" : row.served.map(short).join(", ") || "none"} · lines ${row.lines.join(", ") || "—"}${row.overlaps.length ? ` · OVERLAP ${row.overlaps.join("; ")}` : ""}${row.note ? ` · ${row.note}` : ""} · ${row.ok ? "ok" : "FAIL"}`);
  }
  return rows;
}

/** The after/before table, one line per sequence. */
export function soakTable(rows: SoakRow[]): string {
  const head = " #  ⏮   gap   ⏸ moment                      max  paused   after ▶ (started)            served     ok";
  const lines = rows.map((r) => `${String(r.n).padStart(2)}  ×${r.steps}  ${String(r.delayMs).padStart(3)}ms  ${r.pause.padEnd(28)}  ${String(r.max).padStart(3)}  ${(r.whilePaused.length ? r.whilePaused.length + " clip" : "silent").padEnd(7)}  ${`${r.afterResume.length} sounded (${r.startedAfterResume})`.padEnd(27)}  ${(r.served === null ? "n/a" : String(r.served.length)).padEnd(9)}  ${r.ok ? "✓" : "✗"}${r.overlaps.length ? `  ${r.overlaps.join("; ")}` : ""}${r.note ? `  ${r.note}` : ""}`);
  return [head, ...lines].join("\n");
}
