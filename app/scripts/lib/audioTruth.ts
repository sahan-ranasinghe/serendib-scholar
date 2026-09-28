/**
 * GROUND TRUTH FOR "NEVER TWO CLIPS AT ONCE" (28 Sep 2026).
 *
 * The drills used to read the player's own counter (window.__audio) — the
 * very thing under test. A real phone played two clips together while that
 * counter said 1: the player forgot a source it had not actually stopped.
 *
 * So the harnesses measure the browser instead. AUDIO_TRUTH_JS runs before
 * the app's first script (Page.addScriptToEvaluateOnNewDocument) and patches
 * the Web Audio and media element APIs themselves:
 *
 *   AudioContext              every context, and every change of its state
 *                             (a suspended context is silent; its clock stops)
 *   AudioScheduledSourceNode  start(when, offset, duration) / stop(when) and
 *                             the 'ended' event, on the context's own clock
 *   AudioNode.disconnect()    a source cut off from everything is silent
 *   HTMLMediaElement          'playing' → 'pause' / 'ended' / 'waiting'
 *
 * analyseTruth() turns the log into wall-time intervals of real sound —
 * mapping each context's clock through its running stretches, so a clip
 * frozen by ⏸ and resumed by ▶ counts again from the moment it resumes —
 * and measures how many voice clips sound at once. Nothing the app says
 * about itself enters the count; a source's `__label` (set by the app's
 * audio manager) is used only to NAME a clip in a report.
 *
 * Voice vs. effects: the board's sound effects (a bead click, the chalk,
 * the chime) are ≤ 300 ms by design and play over her voice on purpose.
 * A "voice" clip is a buffer stream of ≥ 350 ms (back-to-back chunks of one
 * request — the ✋ chat's PCM, which share a label — are one stream) or any
 * media element; oscillators and short one-shots are effects.
 */

export interface TruthAnchor {
  /** performance.now() */
  p: number;
  /** the context's currentTime at that moment */
  c: number;
  /** the context's state at that moment */
  s: string;
}
export interface TruthContext {
  id: number;
  rate: number;
  anchors: TruthAnchor[];
}
export interface TruthSource {
  id: number;
  ctx: number;
  kind: string;
  label: string | null;
  /** performance.now() / currentTime / state when start() was called */
  p: number;
  c: number;
  state: string;
  /** scheduled start and natural end, on the context's clock */
  S: number;
  E: number;
  stopAt: number | null;
  discC: number | null;
  endedP: number | null;
  endedC: number | null;
}
export interface TruthMedia {
  id: number;
  src: string;
  intervals: Array<[number, number]>;
  open: number | null;
}
export interface TruthLog {
  now: number;
  contexts: TruthContext[];
  sources: TruthSource[];
  media: TruthMedia[];
}

/** Injected before any app script. Idempotent. */
export const AUDIO_TRUTH_JS = `(() => {
  if (window.__audioTruth) return;
  const now = () => performance.now();
  const T = { contexts: [], sources: [], media: [] };
  window.__audioTruth = T;
  const ctxIds = new WeakMap();
  const isOffline = (ctx) => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
  const anchor = (ctx) => {
    let id = ctxIds.get(ctx);
    if (id === undefined) {
      id = T.contexts.length;
      ctxIds.set(ctx, id);
      T.contexts.push({ id, rate: ctx.sampleRate, anchors: [] });
      try { ctx.addEventListener('statechange', () => anchor(ctx)); } catch (e) {}
    }
    const rec = T.contexts[id];
    rec.anchors.push({ p: now(), c: ctx.currentTime, s: ctx.state });
    return rec;
  };
  const Base = window.AudioContext;
  if (Base) {
    const Tracked = class extends Base { constructor(...args) { super(...args); anchor(this); } };
    window.AudioContext = Tracked;
  }
  // start()/stop() live on more than one prototype (AudioBufferSourceNode declares its own start(when, offset, duration)),
  // so every source prototype that owns one is patched.
  const protos = ['AudioScheduledSourceNode', 'AudioBufferSourceNode', 'OscillatorNode', 'ConstantSourceNode'].map((n) => window[n] && window[n].prototype).filter(Boolean);
  const ids = new WeakMap();
  const record = (node, when, offset, duration) => {
    const ctx = node.context;
    if (isOffline(ctx) || ids.has(node)) return;
    const rec = anchor(ctx);
    const isBuffer = typeof AudioBufferSourceNode !== 'undefined' && node instanceof AudioBufferSourceNode;
    const buf = isBuffer ? node.buffer : null;
    const rate = isBuffer && node.playbackRate ? node.playbackRate.value || 1 : 1;
    const S = Math.max(Number(when) || 0, ctx.currentTime);
    const len = isBuffer && buf ? (duration !== undefined ? Number(duration) : Math.max(0, buf.duration - (Number(offset) || 0))) / rate : Infinity;
    const s = { id: T.sources.length, ctx: rec.id, kind: isBuffer ? 'buffer' : (node.constructor && node.constructor.name) || 'source', label: node.__label || null, p: now(), c: ctx.currentTime, state: ctx.state, S, E: S + len, stopAt: null, discC: null, endedP: null, endedC: null };
    ids.set(node, s.id);
    T.sources.push(s);
    node.addEventListener('ended', () => { s.endedP = now(); s.endedC = ctx.currentTime; anchor(ctx); });
  };
  const noteStop = (node, when) => {
    const id = ids.get(node);
    if (id === undefined) return;
    const s = T.sources[id];
    const ctx = node.context;
    anchor(ctx);
    const at = Math.max(Number(when) || 0, ctx.currentTime);
    s.stopAt = s.stopAt === null ? at : Math.min(s.stopAt, at);
  };
  for (const proto of protos) {
    if (Object.prototype.hasOwnProperty.call(proto, 'start')) {
      const origStart = proto.start;
      proto.start = function (when, offset, duration) { record(this, when, offset, duration); return origStart.apply(this, arguments); };
    }
    if (Object.prototype.hasOwnProperty.call(proto, 'stop')) {
      const origStop = proto.stop;
      proto.stop = function (when) { noteStop(this, when); return origStop.apply(this, arguments); };
    }
  }
  if (window.AudioNode) {
    const origDisconnect = AudioNode.prototype.disconnect;
    AudioNode.prototype.disconnect = function () {
      const id = ids.get(this);
      if (id !== undefined && arguments.length === 0) {
        const s = T.sources[id];
        anchor(this.context);
        if (s.discC === null) s.discC = this.context.currentTime;
      }
      return origDisconnect.apply(this, arguments);
    };
  }
  const M = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
  if (M) {
    const mediaIds = new WeakMap();
    const track = (el) => {
      if (mediaIds.has(el)) return T.media[mediaIds.get(el)];
      const m = { id: T.media.length, src: String(el.currentSrc || el.src || '').slice(-60), intervals: [], open: null };
      T.media.push(m);
      mediaIds.set(el, m.id);
      el.addEventListener('playing', () => { if (m.open === null) m.open = now(); });
      const close = () => { if (m.open !== null) { m.intervals.push([m.open, now()]); m.open = null; } };
      for (const type of ['pause', 'ended', 'emptied', 'waiting', 'abort']) el.addEventListener(type, close);
      return m;
    };
    const origPlay = M.play;
    M.play = function () { track(this); return origPlay.apply(this, arguments); };
  }
})();`;

/**
 * The part of the log that can bear on sound from `from` (performance.now) onwards: every source that may still have
 * been sounding then (a source frozen by a pause started long before), and the context anchors that map their clocks.
 */
export const COLLECT_TRUTH_JS = (from: number) => `(() => {
  const T = window.__audioTruth;
  if (!T) return null;
  const from = ${JSON.stringify(from)};
  const sources = T.sources.filter((s) => s.endedP === null || s.endedP >= from);
  const minP = sources.reduce((m, s) => Math.min(m, s.p), from);
  const contexts = T.contexts.map((c) => { let k = c.anchors.findIndex((a) => a.p >= minP); k = k <= 0 ? 0 : k - 1; return { id: c.id, rate: c.rate, anchors: c.anchors.slice(k) }; });
  const media = T.media.map((m) => ({ id: m.id, src: m.src, intervals: m.intervals.filter((i) => i[1] >= from), open: m.open }));
  return { now: performance.now(), contexts, sources, media };
})()`;

/** A stretch of wall time (performance.now ms) in which a source was really sounding. */
export interface Sounding {
  /** voice stream id (sources back to back on one context form one stream) */
  stream: string;
  label: string | null;
  kind: "voice" | "effect";
  start: number;
  end: number;
}

/** Tolerances: the audio clock and the page clock are sampled a moment apart, and back-to-back chunks may touch. */
const CHAIN_GAP_S = 0.012;
const VOICE_MIN_S = 0.35;
/** An overlap shorter than this is two clips touching at a boundary, not two clips at once. */
export const OVERLAP_MIN_MS = 20;

interface Piece {
  p0: number;
  p1: number;
  c0: number;
  c1: number;
}

/** The context's running stretches: wall time and clock time advance together inside each. */
function runningPieces(ctx: TruthContext, logNow: number): Piece[] {
  const pieces: Piece[] = [];
  const anchors = ctx.anchors;
  for (let i = 0; i < anchors.length; i += 1) {
    const a = anchors[i]!;
    if (a.s !== "running") continue;
    const b = anchors[i + 1];
    pieces.push({ p0: a.p, c0: a.c, p1: b ? b.p : logNow, c1: b ? b.c : a.c + (logNow - a.p) / 1000 });
  }
  return pieces;
}

/**
 * When sound scheduled at clock `x` is heard: inside the running stretch whose clock passes x — or, when x fell while the
 * clock was frozen (a clip started while suspended, the 🔊 preview), the moment it runs again. The 'running' anchor is
 * recorded by the statechange event, a little after the clock has already moved on, so the stretch that starts past x
 * is the one that plays it.
 */
function wallOfStart(pieces: Piece[], x: number): number {
  for (const piece of pieces) {
    if (x < piece.c1 - 1e-6) return piece.p0 + Math.max(0, x - piece.c0) * 1000;
  }
  return Number.POSITIVE_INFINITY;
}

/** The first moment the clock, running, reaches `x` (Infinity: it never has). */
function wallOfEnd(pieces: Piece[], x: number): number {
  for (const piece of pieces) {
    if (x <= piece.c1 + 1e-6) return Math.min(piece.p1, piece.p0 + Math.max(0, x - piece.c0) * 1000);
  }
  return Number.POSITIVE_INFINITY;
}

/** Where each source really sounded, in wall time, split by the context's pauses. */
export function soundings(log: TruthLog): Sounding[] {
  const out: Sounding[] = [];
  const byCtx = new Map<number, TruthSource[]>();
  for (const s of log.sources) byCtx.set(s.ctx, [...(byCtx.get(s.ctx) ?? []), s]);
  for (const ctx of log.contexts) {
    const pieces = runningPieces(ctx, log.now);
    const closedAt = ctx.anchors.find((a) => a.s === "closed")?.c ?? Number.POSITIVE_INFINITY;
    const sources = (byCtx.get(ctx.id) ?? []).slice().sort((a, b) => a.S - b.S);
    // Effective end on the context's clock: the natural end, a stop, a disconnect, the 'ended' event, the context closing.
    const endOf = (s: TruthSource) => Math.min(s.E, s.stopAt ?? Infinity, s.discC ?? Infinity, s.endedC ?? Infinity, closedAt);
    // Streams: buffer sources of one request that follow one another without a gap (the chat's PCM chunks, which share
    // a label) are one clip. Unlabelled sources are never chained: a run of chalk scratches one after another is
    // effects, not a voice; each unlabelled buffer is judged by its own length.
    const streamOf = new Map<number, string>();
    const streamLen = new Map<string, { start: number; end: number; label: string | null }>();
    for (const s of sources) {
      if (s.kind !== "buffer") continue;
      const end = endOf(s);
      let id = s.label === null ? undefined : [...streamLen.entries()].find(([, span]) => span.label === s.label && Math.abs(span.end - s.S) <= CHAIN_GAP_S)?.[0];
      if (!id) id = `${ctx.id}:${s.id}`;
      streamOf.set(s.id, id);
      const span = streamLen.get(id);
      streamLen.set(id, { start: span ? span.start : s.S, end: Math.max(span ? span.end : end, end), label: s.label });
    }
    for (const s of sources) {
      const end = endOf(s);
      if (!(end > s.S)) continue;
      const ws = wallOfStart(pieces, s.S);
      let we = wallOfEnd(pieces, end);
      if (!Number.isFinite(ws)) continue;
      if (!Number.isFinite(we)) we = log.now;
      const id = streamOf.get(s.id) ?? `${ctx.id}:fx${s.id}`;
      const span = streamLen.get(id);
      const kind: Sounding["kind"] = s.kind === "buffer" && span && span.end - span.start >= VOICE_MIN_S ? "voice" : "effect";
      for (const piece of pieces) {
        const a = Math.max(ws, piece.p0);
        const b = Math.min(we, piece.p1);
        if (b > a) out.push({ stream: id, label: s.label, kind, start: a, end: b });
      }
    }
  }
  for (const m of log.media) {
    for (const [a, b] of m.intervals) out.push({ stream: `media:${m.id}`, label: m.src, kind: "voice", start: a, end: b });
    if (m.open !== null) out.push({ stream: `media:${m.id}`, label: m.src, kind: "voice", start: m.open, end: log.now });
  }
  return out;
}

export interface TruthSummary {
  /** The most voice clips sounding at once in the window (an overlap under OVERLAP_MIN_MS does not count). */
  maxConcurrent: number;
  /** Every pair of voice clips that sounded together, how long, and from when (ms after `from`). */
  overlaps: Array<{ a: string; b: string; ms: number; at: number }>;
  /** Voice clips that began sounding inside the window, in order (ms after `from`). */
  starts: Array<{ stream: string; label: string | null; at: number; ms: number }>;
  /** Every voice clip that sounded at all inside the window — including one that began before it (a clip frozen by ⏸). */
  sounding: Array<{ stream: string; label: string | null; at: number; ms: number }>;
  /** How many voice clips were sounding at the window's end. */
  soundingAtEnd: number;
}

/** Real concurrency of voice clips between `from` and `to` (performance.now ms). */
export function analyseTruth(log: TruthLog, from: number, to: number): TruthSummary {
  const voice = soundings(log)
    .filter((s) => s.kind === "voice")
    .map((s) => ({ ...s, start: Math.max(s.start, from), end: Math.min(s.end, to) }))
    .filter((s) => s.end > s.start);
  const name = (s: Sounding) => `${s.label ?? "(unlabelled)"} [${s.stream}]`;
  const overlaps: TruthSummary["overlaps"] = [];
  for (let i = 0; i < voice.length; i += 1) {
    for (let j = i + 1; j < voice.length; j += 1) {
      const a = voice[i]!;
      const b = voice[j]!;
      if (a.stream === b.stream) continue;
      const ms = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (ms >= OVERLAP_MIN_MS) overlaps.push({ a: name(a), b: name(b), ms: Math.round(ms), at: Math.round(Math.max(a.start, b.start) - from) });
    }
  }
  // Depth: every stretch shrunk by half the tolerance at each end, then swept.
  const half = OVERLAP_MIN_MS / 2;
  const edges: Array<[number, number]> = [];
  for (const s of voice) {
    if (s.end - s.start <= OVERLAP_MIN_MS) continue;
    edges.push([s.start + half, 1], [s.end - half, -1]);
  }
  edges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let depth = 0;
  let maxConcurrent = voice.length ? 1 : 0;
  for (const [, delta] of edges) {
    depth += delta;
    maxConcurrent = Math.max(maxConcurrent, depth);
  }
  const firsts = new Map<string, Sounding>();
  for (const s of soundings(log).filter((v) => v.kind === "voice")) {
    const seen = firsts.get(s.stream);
    if (!seen || s.start < seen.start) firsts.set(s.stream, s);
  }
  const starts = [...firsts.values()]
    .filter((s) => s.start >= from && s.start <= to)
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ stream: s.stream, label: s.label, at: Math.round(s.start - from), ms: Math.round(s.end - s.start) }));
  const byStream = new Map<string, { stream: string; label: string | null; at: number; ms: number }>();
  for (const s of voice) {
    const seen = byStream.get(s.stream);
    if (seen) {
      seen.at = Math.min(seen.at, Math.round(s.start - from));
      seen.ms += Math.round(s.end - s.start);
    } else byStream.set(s.stream, { stream: s.stream, label: s.label, at: Math.round(s.start - from), ms: Math.round(s.end - s.start) });
  }
  const sounding = [...byStream.values()].filter((s) => s.ms >= OVERLAP_MIN_MS).sort((a, b) => a.at - b.at);
  const soundingAtEnd = voice.filter((s) => s.end >= to - 1).length;
  return { maxConcurrent, overlaps: overlaps.sort((x, y) => x.at - y.at), starts, sounding, soundingAtEnd };
}
