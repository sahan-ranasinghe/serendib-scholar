/**
 * The design fidelity harness.
 *
 *   npm run design:check -- [http://localhost:3001] [--only=<frame|section>] [--skip-components] [--skip-session]
 *
 * 1. MANIFEST — every frame title in the export's .dc.html pages against
 *    every reference PNG (named by title); unmatched on both sides.
 * 2. NUMBERS — the session shell's positions measured in the product at
 *    844×390 against the README's layout numbers, ±1 px.
 * 3. SESSION DIFF — every design frame staged in /admin/design-preview,
 *    photographed at 844×390 and compared with its reference (the frame
 *    located inside the PNG by its teal strip, cropped, scaled): SSIM +
 *    pixel diff, diffs written to .design-check/session/, the three
 *    largest differences named.
 * 4. COMPONENTS DIFF — every section of /admin/design-gallery against
 *    the components reference of the same title; a PNG that holds several
 *    cells is split by its board-coloured cell grid and each cell compared.
 * 5. RULES — one glow (or group) at a time, child-facing Sinhala ≥ 20 px,
 *    hit targets ≥ 56 px on child surfaces, never red for wrong, the
 *    *-text tokens on tinted grounds — on every staged frame.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import sharp from "sharp";
import { connect, evaluate, launch, openPage, wait, type Cdp } from "./lib/cdp";
import { DESIGN_FRAMES } from "../src/lib/designFrames";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3001";
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? null;
const SKIP_COMPONENTS = process.argv.includes("--skip-components");
const SKIP_SESSION = process.argv.includes("--skip-session");
const HANDOFF = path.resolve(process.cwd(), "../docs/design/export/handoff/design_handoff_serendib_scholar");
const REFERENCE = path.resolve(process.cwd(), "../docs/design/reference");
const OUT = path.join(process.cwd(), ".design-check");
const FRAME_W = 844;
const FRAME_H = 390;
/** Like-for-like renders (the export's own HTML in the same Chromium, same fonts, 1×) must reach this; a PNG fallback is judged the same way. */
const SSIM_TARGET = 0.9;
/** The export is served over http (support.js fetches its dc-imports); the app's font files are served beside it. */
const EXPORT_PORT = 3009;
const EXPORT_PAGES_SESSION = ["Session", "Session B", "Session Gaps", "Session Gaps B"];
/** Reference PNGs whose names are not their frame's title. */
const PNG_ALIASES: Record<string, string> = { "Lena - 8 states": "Lena (ලේනා) — three-striped palm squirrel, eight states" };

// --- helpers ----------------------------------------------------------------

const norm = (s: string) =>
  s
    .replace(/\.png$/u, "")
    .replace(/[‘’“”]/gu, (c) => (c === "‘" || c === "’" ? "'" : '"'))
    .replace(/&amp;/gu, "&")
    .replace(/[\s ]+/gu, " ")
    .replace(/\s*[-–·]\s*/gu, " ")
    .replace(/["'“”().,:;!?—…]/gu, "")
    .trim()
    .toLowerCase();

interface Rgba {
  data: Buffer;
  width: number;
  height: number;
}

async function loadRgba(file: string): Promise<Rgba> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function fromPng(buffer: Buffer): Promise<Rgba> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const px = (img: Rgba, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!] as const;
};
const near = (c: readonly [number, number, number], target: [number, number, number], tol = 18) => Math.abs(c[0] - target[0]) <= tol && Math.abs(c[1] - target[1]) <= tol && Math.abs(c[2] - target[2]) <= tol;
const TEAL: [number, number, number] = [0x0f, 0x4c, 0x5c];
const BOARD_PAPER: [number, number, number] = [0xf7, 0xf3, 0xea];
const PAGE_BG: [number, number, number] = [0xed, 0xe8, 0xdd];

/** Every session frame inside a reference PNG: a wide teal run (the strip) marks a frame's top-left; the frame is 844:390 wide. */
function findFrames(img: Rgba): Array<{ x: number; y: number; w: number; h: number }> {
  const frames: Array<{ x: number; y: number; w: number; h: number }> = [];
  let y = 0;
  while (y < img.height) {
    let best: { x: number; w: number } | null = null;
    let run = 0;
    let start = 0;
    for (let x = 0; x < img.width; x += 1) {
      if (near(px(img, x, y), TEAL)) {
        if (run === 0) start = x;
        run += 1;
      } else {
        if (run > (best?.w ?? 0)) best = { x: start, w: run };
        run = 0;
      }
    }
    if (run > (best?.w ?? 0)) best = { x: start, w: run };
    if (best && best.w > img.width * 0.4) {
      // The strip's exact extent: the widest teal run over its first rows;
      // the frame's bottom: the last wood / tray row under the strip's left edge.
      let x0 = best.x;
      let x1 = best.x + best.w - 1;
      for (let yy = y + 1; yy < Math.min(img.height, y + 12); yy += 1) {
        let l = -1;
        let r = -1;
        for (let x = 0; x < img.width; x += 1) {
          if (near(px(img, x, yy), TEAL)) {
            if (l < 0) l = x;
            r = x;
          }
        }
        if (l >= 0 && r - l > img.width * 0.4) {
          x0 = Math.min(x0, l);
          x1 = Math.max(x1, r);
        }
      }
      const w = x1 - x0 + 1;
      const ratioH = Math.round((w * FRAME_H) / FRAME_W);
      let yEnd = y;
      const probeX = Math.min(img.width - 1, x0 + Math.round(w * 0.5));
      for (let yy = y; yy < Math.min(img.height, y + ratioH + 40); yy += 1) {
        const c = px(img, probeX, yy);
        const wood = near(c, [0x8b, 0x5e, 0x3c], 22) || near(c, [0x6b, 0x45, 0x28], 22) || near(c, TEAL, 22);
        if (wood) yEnd = yy;
      }
      const measuredH = yEnd - y + 1;
      const h = Math.abs(measuredH - ratioH) <= ratioH * 0.03 ? measuredH : ratioH;
      frames.push({ x: x0, y, w, h });
      y += h;
      continue;
    }
    y += 2;
  }
  return frames;
}

/** Board-coloured cells (radius-12 rectangles) in a components reference: connected runs of board paper on the page ground. */
function findCells(img: Rgba, minSize = 60): Array<{ x: number; y: number; w: number; h: number }> {
  const step = 4;
  const cols = Math.floor(img.width / step);
  const rows = Math.floor(img.height / step);
  const grid = new Uint8Array(cols * rows);
  for (let gy = 0; gy < rows; gy += 1) for (let gx = 0; gx < cols; gx += 1) grid[gy * cols + gx] = near(px(img, gx * step + 1, gy * step + 1), BOARD_PAPER, 6) ? 1 : 0;
  const seen = new Uint8Array(cols * rows);
  const cells: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      const i = gy * cols + gx;
      if (!grid[i] || seen[i]) continue;
      // flood fill
      const stack = [i];
      seen[i] = 1;
      let minX = gx;
      let maxX = gx;
      let minY = gy;
      let maxY = gy;
      let count = 0;
      while (stack.length) {
        const j = stack.pop()!;
        count += 1;
        const jx = j % cols;
        const jy = Math.floor(j / cols);
        if (jx < minX) minX = jx;
        if (jx > maxX) maxX = jx;
        if (jy < minY) minY = jy;
        if (jy > maxY) maxY = jy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = jx + dx;
          const ny = jy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const k = ny * cols + nx;
          if (grid[k] && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
      const w = (maxX - minX + 1) * step;
      const h = (maxY - minY + 1) * step;
      // A cell is mostly paper (its content is small on it) and big enough.
      if (w >= minSize && h >= minSize && count >= ((w / step) * (h / step)) * 0.45) cells.push({ x: minX * step, y: minY * step, w, h });
    }
  }
  return cells.sort((a, b) => (Math.abs(a.y - b.y) > 20 ? a.y - b.y : a.x - b.x));
}

function gray(img: Rgba): Float32Array {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i += 1) out[i] = 0.299 * img.data[i * 4]! + 0.587 * img.data[i * 4 + 1]! + 0.114 * img.data[i * 4 + 2]!;
  return out;
}

/** The same frame with the strip, Zara, Lena and the ✋ painted board-paper in both images: what the board content alone scores. */
function maskShell(img: Rgba): Rgba {
  const out: Rgba = { data: Buffer.from(img.data), width: img.width, height: img.height };
  const paint = (x0: number, y0: number, w: number, h: number) => {
    for (let y = Math.max(0, y0); y < Math.min(img.height, y0 + h); y += 1)
      for (let x = Math.max(0, x0); x < Math.min(img.width, x0 + w); x += 1) {
        const i = (y * img.width + x) * 4;
        out.data[i] = 0xf7;
        out.data[i + 1] = 0xf3;
        out.data[i + 2] = 0xea;
      }
  };
  const sx = img.width / FRAME_W;
  const sy = img.height / FRAME_H;
  paint(0, 0, img.width, Math.round(28 * sy)); // the strip
  paint(0, Math.round((FRAME_H - 6 - 64 - 6) * sy), Math.round(84 * sx), Math.round(76 * sy)); // Zara
  paint(Math.round((FRAME_W - 14 - 48 - 8) * sx), Math.round((FRAME_H - 16 - 48 - 8) * sy), Math.round(70 * sx), Math.round(72 * sy)); // Lena
  paint(Math.round((FRAME_W - 12 - 56 - 6) * sx), Math.round((FRAME_H - 76 - 56 - 6) * sy), Math.round(68 * sx), Math.round(68 * sy)); // ✋
  return out;
}

/** Mean SSIM over 8×8 windows (gaussian-free; the standard constants). */
function ssim(a: Rgba, b: Rgba): number {
  const ga = gray(a);
  const gb = gray(b);
  const w = a.width;
  const h = a.height;
  const N = 8;
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let total = 0;
  let n = 0;
  for (let y = 0; y + N <= h; y += N) {
    for (let x = 0; x + N <= w; x += N) {
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) {
        ma += ga[(y + j) * w + x + i]!;
        mb += gb[(y + j) * w + x + i]!;
      }
      ma /= N * N;
      mb /= N * N;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) {
        const da = ga[(y + j) * w + x + i]! - ma;
        const db = gb[(y + j) * w + x + i]! - mb;
        va += da * da;
        vb += db * db;
        cov += da * db;
      }
      va /= N * N - 1;
      vb /= N * N - 1;
      cov /= N * N - 1;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n += 1;
    }
  }
  return n ? total / n : 0;
}

/** The share of pixels that differ (any channel by > 40), a diff mask, and where the differences sit. */
function pixelDiff(a: Rgba, b: Rgba): { share: number; mask: Buffer; regions: Array<{ name: string; share: number }> } {
  const w = a.width;
  const h = a.height;
  const mask = Buffer.alloc(w * h * 4);
  let differing = 0;
  const cols = 4;
  const rows = 3;
  const counts = new Array<number>(cols * rows).fill(0);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const d = Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!));
      const differs = d > 40;
      if (differs) {
        differing += 1;
        counts[Math.floor((y / h) * rows) * cols + Math.floor((x / w) * cols)]! += 1;
      }
      // the mask: ours faded, differences in coral
      mask[i] = differs ? 0xd9 : Math.min(255, Math.round(a.data[i]! * 0.5 + 128));
      mask[i + 1] = differs ? 0x64 : Math.min(255, Math.round(a.data[i + 1]! * 0.5 + 128));
      mask[i + 2] = differs ? 0x3a : Math.min(255, Math.round(a.data[i + 2]! * 0.5 + 128));
      mask[i + 3] = 255;
    }
  }
  const names = [
    ["top-left (Zara's corner column / strip)", "top-centre-left (inset top)", "top-centre-right (inset top · retry / tap hint)", "top-right (strip controls · retry)"],
    ["middle-left (inset left edge)", "centre-left (the primitive)", "centre-right (the primitive)", "middle-right (inset right edge · ✋)"],
    ["bottom-left (Zara 64 px)", "bottom-centre-left (chips row / caption / dock)", "bottom-centre-right (chips row / caption)", "bottom-right (Lena · ✋ · tray)"],
  ];
  const regions = counts
    .map((c, i) => ({ name: names[Math.floor(i / cols)]![i % cols]!, share: differing ? c / differing : 0, px: c }))
    .filter((r) => r.px > 0)
    .sort((x, y) => y.share - x.share);
  return { share: differing / (w * h), mask, regions };
}

async function resizeTo(img: Rgba, width: number, height: number): Promise<Rgba> {
  if (img.width === width && img.height === height) return img;
  const { data, info } = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).resize(width, height, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function crop(img: Rgba, box: { x: number; y: number; w: number; h: number }): Promise<Rgba> {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const w = Math.min(box.w, img.width - x);
  const h = Math.min(box.h, img.height - y);
  const { data, info } = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).extract({ left: x, top: y, width: w, height: h }).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function writePng(img: Rgba, file: string): Promise<void> {
  await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).png().toFile(file);
}

async function sideBySide(ours: Rgba, ref: Rgba, mask: Buffer, file: string): Promise<void> {
  const w = ours.width;
  const h = ours.height;
  const composite = await sharp({ create: { width: w * 3 + 16, height: h, channels: 4, background: { r: 0xed, g: 0xe8, b: 0xdd, alpha: 1 } } })
    .composite([
      { input: await sharp(ours.data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), left: 0, top: 0 },
      { input: await sharp(ref.data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), left: w + 8, top: 0 },
      { input: await sharp(mask, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), left: 2 * w + 16, top: 0 },
    ])
    .png()
    .toBuffer();
  await writeFile(file, composite);
}

const safe = (s: string) => s.replace(/[^\w඀-෿-]+/gu, "_").slice(0, 60);

// --- the export, served ---------------------------------------------------------

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".md": "text/plain; charset=utf-8" };

/** The export directory over http, with the app's font files at /_next/static/media/ so the export's pages can use the very same fonts. */
function serveExport(): Promise<http.Server> {
  const media = path.join(process.cwd(), ".next/static/media");
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${EXPORT_PORT}`);
      const rel = decodeURIComponent(url.pathname);
      const file = rel.startsWith("/_next/static/media/") ? path.join(media, path.basename(rel)) : path.join(HANDOFF, rel.replace(/^\/+/u, ""));
      if (!file.startsWith(HANDOFF) && !file.startsWith(media)) throw new Error("outside");
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => server.listen(EXPORT_PORT, "127.0.0.1", () => resolve(server)));
}

/** The app's own @font-face rules (next/font's Gemunu Libre, Abhaya Libre, Yaldevi, Inter, Noto Sans Sinhala) with their files on the export server: the answer the export's Google Fonts link gets. */
async function appFontFaceCss(): Promise<string> {
  const dir = path.join(process.cwd(), ".next/static/chunks");
  if (!existsSync(dir)) return "";
  const rules: string[] = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".css")) continue;
    const css = await readFile(path.join(dir, f), "utf8");
    for (const m of css.matchAll(/@font-face\{[^}]*\}/gu)) {
      const rule = m[0];
      if (/Fallback/u.test(rule) || !/font-family:(Gemunu Libre|Abhaya Libre|Yaldevi|Inter|Noto Sans Sinhala)[;,]/u.test(rule)) continue;
      // the built CSS points at the files relatively (../media/…) or absolutely (/_next/static/media/…)
      rules.push(rule.replace(/url\((?:\.\.\/media\/|\/_next\/static\/media\/)/gu, `url(http://127.0.0.1:${EXPORT_PORT}/_next/static/media/`));
    }
  }
  return [...new Set(rules)].join("\n");
}

interface RenderedRef {
  file: string;
  complete: boolean;
  reason: string;
}

/** Whether a rendered frame is whole: no placeholder boxes, no template text, its StrokeNum strokes and its characters present. */
const COMPLETE_JS = (selector: string, needsStrokes = true) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { complete: false, reason: 'not found' };
  const problems = [];
  if (el.querySelector('.sc-placeholder, .sc-placeholder-error')) problems.push('placeholder boxes');
  if (/\\{\\{/.test(el.innerText)) problems.push('template text left');
  // every session frame carries StrokeNum glyphs or a character; a components section may hold neither (chips, the pointer, app controls)
  if (${needsStrokes} && el.querySelectorAll('svg path').length === 0) problems.push('no strokes');
  const boxes = [...el.querySelectorAll('*')].filter((n) => { const r = n.getBoundingClientRect(); return r.width === 0 && r.height === 0 && n.children.length === 0 && n.textContent.trim() && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE'; });
  return { complete: problems.length === 0, reason: problems.join(', ') || 'complete', boxes: boxes.length, paths: el.querySelectorAll('svg path').length };
})()`;

// --- 1. the manifest ----------------------------------------------------------

interface Title {
  page: string;
  title: string;
  kind: "frame" | "section";
}

async function readManifest(): Promise<{ titles: Title[]; pngs: string[] }> {
  const files = (await readdir(HANDOFF)).filter((f) => f.endsWith(".dc.html"));
  const titles: Title[] = [];
  for (const file of files) {
    const html = await readFile(path.join(HANDOFF, file), "utf8");
    const page = file.replace(/\.dc\.html$/u, "");
    // Frame data: { id: '…', label: '…', note: '…' } — a field holding an apostrophe is double-quoted in the export.
    const q = `(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`;
    const frameRe = new RegExp(`\\{ id: ${q}, label: ${q}, note: ${q}`, "gu");
    for (const m of html.matchAll(frameRe)) {
      const un = (a: string | undefined, b: string | undefined) => (a ?? b ?? "").replace(/\\'/gu, "'");
      titles.push({ page, title: `${un(m[1], m[2])} - ${un(m[3], m[4])} - ${un(m[5], m[6])}`, kind: "frame" });
    }
    for (const m of html.matchAll(/font:700 18px\/1\.2 var\(--font-latin\)">([^<]+)</gu)) titles.push({ page, title: m[1]!.replace(/&amp;/gu, "&"), kind: "section" });
    for (const m of html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gu)) titles.push({ page, title: m[1]!.replace(/&amp;/gu, "&"), kind: "section" });
    // The onboarding / edge-state screens are data rows ({ label: 'Mic permission', … }) rendered through one caption.
    if (page.startsWith("Screens")) for (const m of html.matchAll(/\{ label: '([^']+)'/gu)) titles.push({ page, title: m[1]!, kind: "frame" });
    // Screens pages label each phone frame in a 12 px caption.
    for (const m of html.matchAll(/font:600 12px\/1 var\(--font-latin\);color:var\(--color-ink-70\)">([^<{]+)</gu)) titles.push({ page, title: m[1]!.replace(/&amp;/gu, "&").trim(), kind: "frame" });
  }
  // Session / Session B and Session Gaps / Session Gaps B carry the same frame data (each renders half): one title, both pages named.
  const merged = new Map<string, Title>();
  for (const t of titles) {
    if (/^Part \d/u.test(t.title)) continue;
    const key = t.title;
    const prev = merged.get(key);
    if (prev) prev.page = prev.page.includes(t.page) ? prev.page : `${prev.page} + ${t.page}`;
    else merged.set(key, { ...t });
  }
  const pngs = (await readdir(REFERENCE)).filter((f) => f.endsWith(".png"));
  return { titles: [...merged.values()], pngs };
}

function matchTitle(pngName: string, titles: Title[]): Title | null {
  const alias = PNG_ALIASES[pngName.replace(/\.png$/u, "")];
  const p = norm(alias ?? pngName);
  // A frame's PNG is "<id> - <label> - <note>" (or the id and label on their own lines); a section's is its heading.
  let best: Title | null = null;
  let bestLen = 0;
  for (const t of titles) {
    const n = norm(t.title);
    if (!n) continue;
    const idLabel = t.kind === "frame" ? norm(t.title.split(" - ").slice(0, 2).join(" ")) : n;
    if (p === n || p.startsWith(idLabel) || n.startsWith(p) || (p.length > 12 && p.endsWith(n))) {
      const len = Math.min(n.length, p.length);
      if (len > bestLen) {
        best = t;
        bestLen = len;
      }
    }
  }
  return best;
}

// --- references from the export's own HTML -----------------------------------------

interface RefIndex {
  session: Map<string, RenderedRef>;
  components: Map<string, RenderedRef>;
}

/**
 * Every session frame of the export's pages and every section of
 * components.dc.html rendered by support.js in this same Chromium at 1×,
 * the frame's own size, with the app's font files. A frame that renders
 * with placeholder boxes or template text is marked incomplete (its PNG
 * is used instead).
 */
async function renderExportReferences(page: Cdp): Promise<RefIndex> {
  const out: RefIndex = { session: new Map(), components: new Map() };
  await mkdir(path.join(OUT, "refs", "session"), { recursive: true });
  await mkdir(path.join(OUT, "refs", "components"), { recursive: true });
  const fontCss = await appFontFaceCss();
  // The export's pages link Google Fonts; they get the app's own font files instead (same faces, same binaries, offline).
  await page.send("Fetch.enable", { patterns: [{ urlPattern: "*fonts.googleapis.com*", requestStage: "Request" }, { urlPattern: "*fonts.gstatic.com*", requestStage: "Request" }] });
  page.on("Fetch.requestPaused", (params) => {
    const id = String(params.requestId);
    const url = String((params.request as { url?: string })?.url ?? "");
    if (url.includes("fonts.googleapis.com")) {
      void page.send("Fetch.fulfillRequest", { requestId: id, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/css" }, { name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from(fontCss).toString("base64") }).catch(() => undefined);
    } else void page.send("Fetch.failRequest", { requestId: id, errorReason: "BlockedByClient" }).catch(() => undefined);
  });
  const settle = async () => {
    for (let i = 0; i < 100; i += 1) {
      await wait(150);
      const ready = await evaluate<boolean>(page, `document.fonts.status === 'loaded' && !document.documentElement.classList.contains('sc-dc-streaming') && document.querySelectorAll('.sc-placeholder.sc-streaming').length === 0`).catch(() => false);
      if (ready) break;
    }
    await wait(1200);
  };
  const shotOf = async (selector: string, file: string): Promise<{ w: number; h: number }> => {
    const box = await evaluate<{ x: number; y: number; w: number; h: number }>(page, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'start' }); const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
    await wait(150);
    const shot = (await page.send("Page.captureScreenshot", { format: "png", clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 }, captureBeyondViewport: true })) as { data?: string };
    await writeFile(file, Buffer.from(shot.data ?? "", "base64"));
    return { w: box.w, h: box.h };
  };
  for (const pageName of EXPORT_PAGES_SESSION) {
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1900, height: 1300, deviceScaleFactor: 1, mobile: false });
    await page.send("Page.navigate", { url: `http://127.0.0.1:${EXPORT_PORT}/${encodeURIComponent(pageName)}.dc.html` });
    await settle();
    const ids = await evaluate<string[]>(page, `[...document.querySelectorAll('[data-screen-label]')].map((e) => e.getAttribute('data-screen-label'))`);
    for (const id of ids) {
      const selector = `[data-screen-label="${id}"]`;
      const check = await evaluate<{ complete: boolean; reason: string }>(page, COMPLETE_JS(selector));
      const file = path.join(OUT, "refs", "session", `${safe(id)}.png`);
      const size = await shotOf(selector, file);
      const sized = Math.round(size.w) === FRAME_W && Math.round(size.h) === FRAME_H;
      out.session.set(id, { file, complete: check.complete && sized, reason: sized ? check.reason : `frame is ${Math.round(size.w)}×${Math.round(size.h)}` });
    }
  }
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1300, deviceScaleFactor: 1, mobile: false });
  await page.send("Page.navigate", { url: `http://127.0.0.1:${EXPORT_PORT}/components.dc.html` });
  await settle();
  // The rendered DOM normalises inline styles: a section heading is the 18 px / 700 leaf div; its parent is the section.
  const headings = await evaluate<string[]>(page, `[...document.querySelectorAll('div')].filter((d) => d.children.length === 0 && getComputedStyle(d).fontSize === '18px' && getComputedStyle(d).fontWeight === '700').map((d) => { d.parentElement.setAttribute('data-export-section', d.textContent.trim()); return d.textContent.trim(); })`);
  for (const title of headings) {
    const selector = `[data-export-section="${title.replace(/"/gu, '\\"')}"]`;
    const check = await evaluate<{ complete: boolean; reason: string }>(page, COMPLETE_JS(selector, false));
    const file = path.join(OUT, "refs", "components", `${safe(title)}.png`);
    await shotOf(selector, file);
    out.components.set(title, { file, complete: check.complete, reason: check.reason });
  }
  await page.send("Fetch.disable");
  return out;
}

// --- main ---------------------------------------------------------------------

async function main(): Promise<void> {
  await mkdir(path.join(OUT, "session"), { recursive: true });
  await mkdir(path.join(OUT, "components"), { recursive: true });
  const failures: string[] = [];
  const notes: string[] = [];

  // 1. manifest
  const { titles, pngs } = await readManifest();
  const matched = new Map<string, Title>();
  const usedTitles = new Set<string>();
  for (const png of pngs) {
    const t = matchTitle(png, titles);
    if (t) {
      matched.set(png, t);
      usedTitles.add(`${t.page}::${t.title}`);
    }
  }
  const unmatchedPngs = pngs.filter((p) => !matched.has(p));
  const frameTitles = titles.filter((t) => t.kind === "frame" || /^(Abacus|Place-value strip|Expansion|Digit picker|Number cards|Chalk text|Pointer|Highlight|Title card|Money|Blank table|Choice chips|Feedback|Stretch|App controls|Zara — face A, the eight|Lena \(ලේනා\))/u.test(t.title));
  const unmatchedTitles = frameTitles.filter((t) => !usedTitles.has(`${t.page}::${t.title}`));
  console.log(`\n== MANIFEST ==`);
  console.log(`titles parsed: ${titles.length} across ${new Set(titles.map((t) => t.page)).size} pages · reference PNGs: ${pngs.length} · matched: ${matched.size}`);
  const byPage = new Map<string, number>();
  for (const t of matched.values()) byPage.set(t.page, (byPage.get(t.page) ?? 0) + 1);
  for (const [page, n] of [...byPage].sort()) console.log(`  ${page}: ${n} matched`);
  if (unmatchedPngs.length) console.log(`PNGs with no title: ${unmatchedPngs.length}\n  - ${unmatchedPngs.map((p) => p.replace(/\n/gu, " ⏎ ").slice(0, 90)).join("\n  - ")}`);
  if (unmatchedTitles.length) console.log(`titles with no PNG: ${unmatchedTitles.length}\n  - ${unmatchedTitles.map((t) => `${t.page}: ${t.title.slice(0, 90)}`).join("\n  - ")}`);

  const exportServer = await serveExport();
  const { browser, wsUrl } = await launch("design-check");
  const root = await connect(wsUrl, "design-check");
  const page = await openPage(root);
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  // The references: the export's own HTML, rendered here.
  const refs = SKIP_SESSION && SKIP_COMPONENTS ? { session: new Map<string, RenderedRef>(), components: new Map<string, RenderedRef>() } : await renderExportReferences(page);
  const renderedComplete = [...refs.session.values()].filter((r) => r.complete).length;
  console.log(`\n== REFERENCES (the export's HTML rendered over http at 1×, ${FRAME_W}×${FRAME_H}) ==`);
  console.log(`session frames rendered: ${refs.session.size} · complete: ${renderedComplete} · components sections rendered: ${refs.components.size} · complete: ${[...refs.components.values()].filter((r) => r.complete).length}`);
  for (const [id, r] of refs.session) if (!r.complete) console.log(`  ${id}: incomplete (${r.reason}) — its PNG will be used`);
  for (const [id, r] of refs.components) if (!r.complete) console.log(`  ${id}: incomplete (${r.reason}) — its PNG will be used`);
  const errors: string[] = [];
  page.on("Runtime.exceptionThrown", (params) => {
    const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
    errors.push(`exception: ${details?.exception?.description ?? details?.text ?? "?"}`.slice(0, 200));
  });
  await page.send("Emulation.setDeviceMetricsOverride", { width: FRAME_W, height: FRAME_H, deviceScaleFactor: 1, mobile: true });
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  const gotoFrame = async (id: string) => {
    await page.send("Page.navigate", { url: `${BASE}/admin/design-preview?frame=${encodeURIComponent(id)}` });
    for (let i = 0; i < 80; i += 1) {
      await wait(100);
      const ready = await evaluate<boolean>(page, `!!document.querySelector('[data-design-frame]') && document.fonts.status === 'loaded'`).catch(() => false);
      if (ready) break;
    }
    await wait(900);
  };

  const shoot = async (): Promise<Rgba> => {
    const shot = (await page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: FRAME_W, height: FRAME_H, scale: 1 } })) as { data?: string };
    return fromPng(Buffer.from(shot.data ?? "", "base64"));
  };

  // 2. numeric assertions
  const numeric: Array<{ item: string; expected: string; actual: string; ok: boolean }> = [];
  const measure = async (frameId: string) => {
    await gotoFrame(frameId);
    return evaluate<Record<string, { l: number; t: number; r: number; b: number; w: number; h: number } | null>>(
      page,
      `(() => {
        const W = ${FRAME_W}, H = ${FRAME_H};
        // Sizes are the README's CSS sizes (a 56 px ✋ is drawn 60 px with its border, as in the export); offsets are the drawn box's.
        const cssSize = (el) => { const cs = getComputedStyle(el); return { w: parseFloat(cs.width), h: parseFloat(cs.height) }; };
        const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const c = cssSize(el); return { l: r.left, t: r.top, r: W - r.right, b: H - r.bottom, w: c.w, h: c.h }; };
        const main = document.querySelector('[data-testid="session-main"]');
        const mr = main ? main.getBoundingClientRect() : { top: 28, left: 0, bottom: H, right: W };
        const inFrame = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const c = cssSize(el); return { l: r.left - mr.left, t: r.top - mr.top, r: mr.right - r.right, b: mr.bottom - r.bottom, w: c.w, h: c.h }; };
        return {
          strip: rect(document.querySelector('[data-testid="session-strip"]')),
          title: rect(document.querySelector('[data-testid="session-title"]')),
          main: rect(main),
          surface: inFrame(document.querySelector('.wb-surface')),
          tray: inFrame(document.querySelector('.wb-tray')),
          content: inFrame(document.querySelector('.wb-content')),
          zara: (() => { const wrap = document.querySelector('.wb-corner .zara-portrait'); const box = wrap && wrap.firstElementChild; if (!box) return null; const r = box.getBoundingClientRect(); const c = cssSize(box); return { l: r.left - mr.left, t: r.top - mr.top, r: mr.right - r.right, b: mr.bottom - r.bottom, w: c.w, h: c.h }; })(),
          lena: inFrame(document.querySelector('.wb-lena [data-testid="lena"]')),
          hand: inFrame(document.querySelector('.wb-hand')),
          retry: inFrame(document.querySelector('.wb-retry')),
          caption: inFrame(document.querySelector('.wb-caption')),
          chips: inFrame(document.querySelector('.wb-footer')),
          dock: inFrame(document.querySelector('.wb-dock[data-up]')),
          pad: (() => { const el = document.querySelector('[data-testid="number-pad"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left - mr.left, t: r.top - mr.top, r: mr.right - r.right, b: mr.bottom - r.bottom, w: r.width, h: r.height }; })(),
          ctrl: [...document.querySelectorAll('.strip-control')].map((el) => { const c = cssSize(el); return { w: c.w, h: c.h }; }),
          titleFont: (() => { const el = document.querySelector('[data-testid="session-title"]'); return el ? getComputedStyle(el).fontSize + ' ' + getComputedStyle(el).fontFamily.split(',')[0] : ''; })(),
          captionFont: (() => { const el = document.querySelector('.wb-caption'); return el ? getComputedStyle(el).fontSize + ' ' + getComputedStyle(el).fontFamily.split(',')[0] : ''; })(),
          stops: document.querySelectorAll('[data-stop]').length,
        };
      })()`,
    );
  };
  const expect = (item: string, actual: number | undefined | null, expected: number, tol = 1) => {
    const ok = actual !== undefined && actual !== null && Math.abs(actual - expected) <= tol;
    numeric.push({ item, expected: String(expected), actual: actual === undefined || actual === null ? "missing" : (Math.round(actual * 10) / 10).toString(), ok });
    if (!ok) failures.push(`numeric: ${item} expected ${expected} got ${actual}`);
  };
  if (!SKIP_SESSION) {
    const plain = await measure("M1");
    expect("strip height", plain.strip?.h, 28);
    expect("strip title left", plain.title?.l, 14);
    expect("frame top (under the strip)", plain.main?.t, 28);
    expect("surface inset left", plain.surface?.l, 10);
    expect("surface inset right", plain.surface?.r, 10);
    expect("surface inset top", plain.surface?.t, 10);
    expect("surface inset bottom (tray)", plain.surface?.b, 22);
    expect("tray height", plain.tray?.h, 22);
    expect("content left", plain.content?.l, 94);
    expect("content right", plain.content?.r, 82);
    expect("content top", plain.content?.t, 22);
    expect("content bottom (no foot)", plain.content?.b, 64);
    expect("Zara size", plain.zara?.w, 64);
    expect("Zara left", plain.zara?.l, 10);
    expect("Zara bottom", plain.zara?.b, 6);
    expect("Lena size", plain.lena?.w, 48);
    expect("Lena right", plain.lena?.r, 14);
    expect("Lena bottom", plain.lena?.b, 16);
    expect("✋ size", plain.hand?.w, 56);
    expect("✋ right", plain.hand?.r, 12);
    expect("✋ bottom", plain.hand?.b, 76);
    expect("caption left", plain.caption?.l, 94);
    expect("caption right", plain.caption?.r, 82);
    expect("caption bottom", plain.caption?.b, 26);
    expect("strip ⏸ ↺ ⏹ සි cells (28 px tall)", Math.min(...((plain.ctrl as unknown as Array<{ h: number }>) ?? []).map((c) => c.h)), 28);
    numeric.push({ item: "strip title font", expected: "20px Yaldevi", actual: String(plain.titleFont), ok: /^20px/u.test(String(plain.titleFont)) });
    numeric.push({ item: "caption font", expected: "20px Gemunu Libre", actual: String(plain.captionFont), ok: /^20px/u.test(String(plain.captionFont)) });
    numeric.push({ item: "concept stops", expected: "8", actual: String(plain.stops), ok: plain.stops === (8 as unknown) });
    const withChips = await measure("M3");
    expect("content bottom with chips", withChips.content?.b, 124);
    expect("chips row left", withChips.chips?.l, 94);
    expect("chips row right", withChips.chips?.r, 130);
    expect("chips row bottom", withChips.chips?.b, 64);
    const withDock = await measure("M10");
    expect("content bottom with a dock", withDock.content?.b, 190);
    expect("dock left", withDock.dock?.l, 94);
    expect("dock bottom", withDock.dock?.b, 64);
    expect("pad dock height, drawn (6 + 56 + 4 + 56)", withDock.pad?.h, 122, 2);
    const withRetry = await measure("S2");
    expect("retry note right", withRetry.retry?.r, 82);
    expect("retry note top", withRetry.retry?.t, 22);
    expect("retry note height", withRetry.retry?.h, 56);
    console.log(`\n== NUMBERS (README layout, ±1 px; sizes are CSS sizes — the export draws a bordered box 2 px larger each side) ==`);
    console.log(`${"item".padEnd(40)} ${"expected".padEnd(18)} ${"actual".padEnd(22)} ok`);
    for (const n of numeric) console.log(`${n.item.padEnd(40)} ${n.expected.padEnd(18)} ${n.actual.padEnd(22)} ${n.ok ? "✓" : "✗"}`);
  }

  // 3 + 5. the session frames
  const ssimRows: Array<{ frame: string; ssim: number; diff: number; top: string[]; gap?: string; ref: string; source: "html" | "png"; split: number }> = [];
  const RULES_JS = `(() => {
    const board = document.querySelector('[data-testid="lesson-board"]');
    const out = { glows: 0, glowGroups: 0, smallSinhala: [], smallHits: [], reds: [], tinted: [] };
    if (!board) return out;
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0; };
    const glows = [...board.querySelectorAll('.wb-glow, [data-glow="true"]')].filter(visible);
    out.glows = glows.length;
    // a glow group: elements that share a parent glow container (the abacus's rods) count once
    const groups = new Set(glows.map((el) => el.closest('[data-testid="abacus"]') ?? el.closest('.wb-glow') ?? el));
    out.glowGroups = groups.size;
    const sinhala = /[\\u0D80-\\u0DFF]/;
    for (const el of board.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (own && sinhala.test(own)) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 20) out.smallSinhala.push(own.slice(0, 20) + ' ' + size + 'px');
      }
      const cs = getComputedStyle(el);
      const isRed = (c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m && Number(m[1]) > 170 && Number(m[2]) < 75 && Number(m[3]) < 75; };
      if (isRed(cs.color) || isRed(cs.backgroundColor) || isRed(cs.borderColor)) out.reds.push(el.tagName + ' ' + (el.getAttribute('data-testid') || el.className || '').toString().slice(0, 30));
      const tints = { 'rgb(251, 239, 211)': 'saffron', 'rgb(223, 240, 228)': 'success', 'rgb(247, 224, 214)': 'coral' };
      const tint = tints[cs.backgroundColor];
      if (tint && own) {
        const allowed = ['rgb(27, 27, 27)', 'rgba(27, 27, 27, 0.7)', 'rgb(122, 86, 10)', 'rgb(47, 112, 72)', 'rgb(154, 61, 25)', 'rgb(47, 95, 166)'];
        if (!allowed.includes(cs.color)) out.tinted.push(own.slice(0, 16) + ' on ' + tint + ' in ' + cs.color);
      }
    }
    for (const el of board.querySelectorAll('button, [role="button"]')) {
      if (!visible(el)) continue;
      // the tray's ♪ is the design's 26×16 chip, not a child answer surface
      if (el.getAttribute('data-testid') === 'board-mute') continue;
      const r = el.getBoundingClientRect();
      // a rod's hit column is the design's 48 px (rule c); the chat's return button is drawn 48 px tall in S3
      const floor = el.hasAttribute('data-rod') ? 47 : 55;
      if (el.getAttribute('data-testid') === 'chat-return') continue;
      if (r.width < floor || r.height < 55 && !el.hasAttribute('data-rod')) out.smallHits.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
    }
    return out;
  })()`;
  const ruleFindings: string[] = [];
  const splits: string[] = [];
  if (!SKIP_SESSION) {
    for (const frame of DESIGN_FRAMES) {
      if (ONLY && ONLY !== frame.id) continue;
      const refName = pngs.find((p) => matched.get(p)?.kind === "frame" && norm(p).startsWith(norm(`${frame.id} ${frame.label}`))) ?? pngs.find((p) => norm(p).startsWith(norm(frame.id) + " "));
      await gotoFrame(frame.id);
      const rules = await evaluate<{ glows: number; glowGroups: number; smallSinhala: string[]; smallHits: string[]; reds: string[]; tinted: string[] }>(page, RULES_JS);
      if (rules.glowGroups > 1) ruleFindings.push(`${frame.id}: ${rules.glowGroups} glow groups at once`);
      if (rules.smallSinhala.length) ruleFindings.push(`${frame.id}: Sinhala under 20 px — ${rules.smallSinhala.slice(0, 3).join(", ")}`);
      const hits = rules.smallHits.filter((h) => !/^row \d/u.test(h));
      if (hits.length) ruleFindings.push(`${frame.id}: hit targets under 56 px — ${hits.slice(0, 4).join(", ")}`);
      if (rules.reds.length) ruleFindings.push(`${frame.id}: red used — ${rules.reds.slice(0, 3).join(", ")}`);
      if (rules.tinted.length) ruleFindings.push(`${frame.id}: text on a tinted ground not in a *-text token — ${rules.tinted.slice(0, 3).join(", ")}`);
      const ours = await shoot();
      await writePng(ours, path.join(OUT, "session", `${safe(frame.id)}-ours.png`));
      if (!refName) {
        ssimRows.push({ frame: frame.id, ssim: 0, diff: 1, top: ["no reference PNG matched"], gap: frame.knownGap, ref: "—", source: "png", split: 0 });
        continue;
      }
      // The reference: the export's own render of this frame when it rendered whole; else the frame located inside its PNG.
      const rendered = refs.session.get(frame.id);
      let candidates: Rgba[] = [];
      let source: "html" | "png" = "png";
      let boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
      if (rendered?.complete) {
        candidates = [await resizeTo(await loadRgba(rendered.file), FRAME_W, FRAME_H)];
        source = "html";
      } else {
        const ref = await loadRgba(path.join(REFERENCE, refName));
        boxes = findFrames(ref);
        if (boxes.length !== 1) splits.push(`${refName.replace(/\n/gu, " ").slice(0, 60)}: ${boxes.length} frame(s) found`);
        for (const box of boxes.length ? boxes : [{ x: 0, y: 0, w: ref.width, h: Math.round((ref.width * FRAME_H) / FRAME_W) }]) candidates.push(await resizeTo(await crop(ref, box), FRAME_W, FRAME_H));
      }
      let best: { s: number; d: ReturnType<typeof pixelDiff>; refCrop: Rgba } | null = null;
      for (const cropped of candidates) {
        // Full resolution, nothing masked: the reference is the same renderer at the same size.
        const s = ssim(ours, cropped);
        const d = pixelDiff(ours, cropped);
        if (!best || s > best.s) best = { s, d, refCrop: cropped };
      }
      const b = best!;
      await writePng(b.refCrop, path.join(OUT, "session", `${safe(frame.id)}-ref.png`));
      await sideBySide(ours, b.refCrop, b.d.mask, path.join(OUT, "session", `${safe(frame.id)}-diff.png`));
      ssimRows.push({ frame: frame.id, ssim: b.s, diff: b.d.share, top: b.d.regions.slice(0, 3).map((r) => `${r.name} ${Math.round(r.share * 100)} %`), gap: frame.knownGap, ref: source === "html" ? "export html" : refName.replace(/\n/gu, " ").slice(0, 50), source, split: boxes.length });
    }
    console.log(`\n== SESSION FRAMES (SSIM at 844×390, nothing masked, vs the export's own render (html) or its PNG (png); target ≥ ${SSIM_TARGET}) ==`);
    console.log(`${"frame".padEnd(32)} ${"SSIM".padEnd(7)} ${"source".padEnd(7)} ${"px diff".padEnd(8)} top differences`);
    for (const r of ssimRows) {
      console.log(`${r.frame.padEnd(32)} ${r.ssim.toFixed(3).padEnd(7)} ${r.source.padEnd(7)} ${(Math.round(r.diff * 1000) / 10 + " %").padEnd(8)} ${r.top.join(" · ")}`);
      if (Math.round(r.ssim * 1000) / 1000 < SSIM_TARGET) console.log(`${"".padEnd(32)} ${r.gap ? `why: ${r.gap}` : "why: (unexplained)"}`);
    }
    console.log(`reference sources: html ${ssimRows.filter((r) => r.source === "html").length} · png ${ssimRows.filter((r) => r.source === "png").length}`);
    if (splits.length) console.log(`references split: ${splits.join(" · ")}`);
    else console.log(`references split: none — every session PNG used holds one frame`);
  }

  // 4. components
  const componentRows: Array<{ section: string; ssim: number; diff: number; cells: string; ref: string }> = [];
  if (!SKIP_COMPONENTS) {
    // The components page was captured wide (its sections score best at 1320 CSS px: a 1400 px page with 40 px padding each side).
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.send("Page.navigate", { url: `${BASE}/admin/design-gallery` });
    for (let i = 0; i < 80; i += 1) {
      await wait(100);
      const ready = await evaluate<boolean>(page, `!!document.querySelector('[data-design-gallery]') && document.fonts.status === 'loaded'`).catch(() => false);
      if (ready) break;
    }
    await wait(1500);
    const sections = await evaluate<Array<{ title: string; x: number; y: number; w: number; h: number; cells: Array<{ x: number; y: number; w: number; h: number }> }>>(
      page,
      `[...document.querySelectorAll('[data-design-section]')].map((s) => { const r = s.getBoundingClientRect(); return { title: s.getAttribute('data-design-section'), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, cells: [...s.querySelectorAll('[data-design-cell]')].map((c) => { const cr = c.getBoundingClientRect(); return { x: cr.left + scrollX, y: cr.top + scrollY, w: cr.width, h: cr.height }; }) }; })`,
    );
    for (const section of sections) {
      if (ONLY && ONLY !== section.title) continue;
      const refName = pngs.find((p) => norm(PNG_ALIASES[p.replace(/\.png$/u, "")] ?? p) === norm(section.title)) ?? pngs.find((p) => norm(p).startsWith(norm(section.title).slice(0, 24)));
      const renderedSection = refs.components.get(section.title);
      await evaluate(page, `window.scrollTo(0, ${Math.max(0, section.y - 8)})`);
      await wait(300);
      const shot = (await page.send("Page.captureScreenshot", { format: "png", clip: { x: section.x, y: section.y, width: section.w, height: section.h, scale: 1 }, captureBeyondViewport: true })) as { data?: string };
      const ours = await fromPng(Buffer.from(shot.data ?? "", "base64"));
      await writePng(ours, path.join(OUT, "components", `${safe(section.title)}-ours.png`));
      if (!refName && !renderedSection?.complete) {
        componentRows.push({ section: section.title, ssim: 0, diff: 1, cells: "no reference", ref: "—" });
        continue;
      }
      const ref = renderedSection?.complete ? await loadRgba(renderedSection.file) : await loadRgba(path.join(REFERENCE, refName!));
      const refLabel = renderedSection?.complete ? "export html" : refName!.slice(0, 40);
      // The reference at the same width as ours.
      const scaled = await resizeTo(ref, ours.width, Math.round((ref.height * ours.width) / ref.width));
      const h = Math.min(scaled.height, ours.height);
      const a = await crop(ours, { x: 0, y: 0, w: ours.width, h });
      const b = await crop(scaled, { x: 0, y: 0, w: ours.width, h });
      const s = ssim(a, b);
      const d = pixelDiff(a, b);
      await sideBySide(a, b, d.mask, path.join(OUT, "components", `${safe(section.title)}-diff.png`));
      // Split by the cell grid: board-coloured cells in the reference against ours.
      const refCells = findCells(ref, 40);
      let cellNote = `${refCells.length} cell(s) in the reference · ${section.cells.length} in ours`;
      if (refCells.length > 1 && refCells.length === section.cells.length) {
        const scores: string[] = [];
        for (let i = 0; i < refCells.length; i += 1) {
          const rc = refCells[i]!;
          const oc = section.cells[i]!;
          const ourCell = await crop(ours, { x: Math.round(oc.x - section.x), y: Math.round(oc.y - section.y), w: Math.round(oc.w), h: Math.round(oc.h) });
          const refCell = await resizeTo(await crop(ref, rc), ourCell.width, ourCell.height);
          scores.push(ssim(ourCell, refCell).toFixed(2));
          await sideBySide(ourCell, refCell, pixelDiff(ourCell, refCell).mask, path.join(OUT, "components", `${safe(section.title)}-cell${i + 1}-diff.png`));
        }
        cellNote = `split into ${refCells.length} cells · SSIM per cell ${scores.join(" ")}`;
        splits.push(`${refLabel}: ${refCells.length} cells`);
      }
      componentRows.push({ section: section.title, ssim: s, diff: d.share, cells: `${renderedSection?.complete ? "html" : "png"} · ${cellNote}`, ref: refLabel });
    }
    console.log(`\n== COMPONENTS (SSIM vs the components reference of the same title) ==`);
    for (const r of componentRows) console.log(`${r.section.slice(0, 44).padEnd(46)} ${r.ssim.toFixed(3)}  px diff ${(Math.round(r.diff * 1000) / 10).toString().padStart(5)} %  ${r.cells}`);
  }

  console.log(`\n== RULES (one glow group · Sinhala ≥ 20 px · hits ≥ 56 px · never red · *-text on tints) ==`);
  if (ruleFindings.length) {
    for (const f of ruleFindings) console.log(`  ✗ ${f}`);
    failures.push(...ruleFindings);
  } else console.log(`  every staged frame passes`);
  if (errors.length) console.log(`\npage exceptions: ${errors.slice(0, 5).join(" | ")}`);
  if (notes.length) console.log(notes.join("\n"));

  browser.kill();
  exportServer.close();
  const below = ssimRows.filter((r) => Math.round(r.ssim * 1000) / 1000 < SSIM_TARGET && !r.gap);
  if (below.length) failures.push(`${below.length} frame(s) under SSIM ${SSIM_TARGET} without an explanation: ${below.map((r) => r.frame).join(", ")}`);
  console.log(`\n${failures.length ? `FAILURES (${failures.length}):\n  - ${failures.join("\n  - ")}` : "PASS  the session shell and every primitive match the design within tolerance (or the gap is explained)"}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
