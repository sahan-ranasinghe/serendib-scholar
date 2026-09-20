/**
 * NOTHING OVERLAPS, EVER (18 Sep 2026, the device walk — cluster L).
 *
 * One probe answers "what on this board can be read, and is anything on top
 * of it?". The pointer uses it to choose a side of its target where the hand
 * covers nothing readable; the harnesses (board:check, session:check) call
 * the same code through `window.__boardLayout()` and fail a frame where
 *
 *   - two text-bearing elements' boxes intersect,
 *   - a chalk ring or underline crosses its own target's bounding box, or
 *     any readable box,
 *   - the pointer hand covers a readable box.
 *
 * "Text-bearing" is measured, not declared: every visible text node's own
 * glyph run (a Range's rects — a wide cell with a short number in it is as
 * wide as the number), plus the stroke-drawn numbers (`[data-readable]`,
 * which are SVG paths and have no text node). Decoration that is meant to
 * sit on something (`[data-layout-ignore]`: sparkles, a value in flight)
 * is left out.
 */

export interface LayoutBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ReadableBox extends LayoutBox {
  label: string;
  element: Element;
  /** Glyphs of one stroke-drawn run share a group: they sit side by side by construction and are never compared with each other. */
  group?: Element;
}

export interface LayoutOverlap {
  a: string;
  b: string;
  /** px² of intersection, in client pixels. */
  area: number;
}

export interface LayoutReport {
  readable: number;
  textOverlaps: LayoutOverlap[];
  /** A ring or underline: does any of its stroke fall inside its target's box, or on something readable? */
  marks: Array<{ kind: string; insideTarget: number; hits: string[] }>;
  pointer: { visible: boolean; hits: string[] };
  ok: boolean;
}

/** Boxes closer than this are touching, not overlapping (sub-pixel layout, antialiasing). */
const TOLERANCE = 1;

export function intersectionArea(a: LayoutBox, b: LayoutBox, tolerance = TOLERANCE): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left) - tolerance;
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) - tolerance;
  return w > 0 && h > 0 ? w * h : 0;
}

function visible(element: Element): boolean {
  let node: Element | null = element;
  let opacity = 1;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    opacity *= Number(style.opacity || 1);
    // The screen-reader-only readouts (1×1, clipped) are not on the board for anyone's eyes.
    if (style.clip !== "auto" && style.position === "absolute" && (node as HTMLElement).offsetWidth <= 1) return false;
    node = node.parentElement;
  }
  return opacity > 0.12;
}

function union(rects: DOMRect[]): LayoutBox | null {
  const real = rects.filter((r) => r.width > 0.5 && r.height > 0.5);
  if (!real.length) return null;
  return {
    left: Math.min(...real.map((r) => r.left)),
    top: Math.min(...real.map((r) => r.top)),
    right: Math.max(...real.map((r) => r.right)),
    bottom: Math.max(...real.map((r) => r.bottom)),
  };
}

/** Clipped by every scrolling / hidden-overflow ancestor: what is scrolled out of a table's window is not on the screen. */
function clipToAncestors(box: LayoutBox, element: Element, root: Element): LayoutBox | null {
  let out = { ...box };
  let node: Element | null = element.parentElement;
  while (node && node !== root.parentElement) {
    const style = getComputedStyle(node);
    if (/(hidden|auto|scroll|clip)/u.test(`${style.overflowX} ${style.overflowY}`)) {
      const r = node.getBoundingClientRect();
      out = { left: Math.max(out.left, r.left), top: Math.max(out.top, r.top), right: Math.min(out.right, r.right), bottom: Math.min(out.bottom, r.bottom) };
      if (out.right - out.left < 1 || out.bottom - out.top < 1) return null;
    }
    node = node.parentElement;
  }
  return out;
}

/** Everything a child could read inside `root`, in client coordinates. */
export function readableBoxes(root: Element): ReadableBox[] {
  const out: ReadableBox[] = [];
  const ignored = (element: Element) => element.closest("[data-layout-ignore], [aria-hidden='true'].wb-decor, [data-testid='pointer']") !== null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").trim();
    const parent = node.parentElement;
    // A blank's dotted placeholder ("……", "▢") is a space to write in, not something to read.
    if (/^[.…·▢_\s]+$/u.test(text)) continue;
    if (!text || !parent || ignored(parent) || parent.closest("[data-readable]") || !visible(parent)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const glyphs = union([...range.getClientRects()]);
    const box = glyphs ? clipToAncestors(glyphs, parent, root) : null;
    if (box) out.push({ ...box, label: text.slice(0, 24), element: parent });
  }
  // A stroke-drawn run ("5 421 - ") is measured glyph by glyph: a ring round its number must clear the dash beside it,
  // and the space inside a run is not something a mark can land on.
  for (const run of root.querySelectorAll("[data-readable]")) {
    if (ignored(run) || !visible(run)) continue;
    const label = `#${run.getAttribute("data-readable") || "number"}`.slice(0, 24);
    // A space is a glyph with nothing drawn in it: not something a mark can land on.
    const glyphs = [...run.querySelectorAll("svg")].filter((svg) => (svg.querySelector("path")?.getAttribute("d") ?? "") !== "");
    for (const element of glyphs.length ? glyphs : [run]) {
      const r = element.getBoundingClientRect();
      const box = r.width > 0.5 && r.height > 0.5 ? clipToAncestors({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }, element, root) : null;
      if (box) out.push({ ...box, label, element, group: run });
    }
  }
  return out;
}

/** The stroke of a chalk mark, sampled every few px, in client coordinates. */
function strokePoints(svg: SVGSVGElement): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const matrix = svg.getScreenCTM();
  if (!matrix) return points;
  for (const path of svg.querySelectorAll("path")) {
    const length = path.getTotalLength();
    for (let at = 0; at <= length; at += 4) {
      const p = path.getPointAtLength(at);
      points.push({ x: p.x * matrix.a + p.y * matrix.c + matrix.e, y: p.x * matrix.b + p.y * matrix.d + matrix.f });
    }
  }
  return points;
}

const inside = (p: { x: number; y: number }, box: LayoutBox, grow: number) => p.x > box.left - grow && p.x < box.right + grow && p.y > box.top - grow && p.y < box.bottom + grow;

/** The whole report for one board (the element the Whiteboard draws into, frame and all). */
export function boardLayoutReport(root: Element): LayoutReport {
  const readable = readableBoxes(root);
  const textOverlaps: LayoutOverlap[] = [];
  for (let i = 0; i < readable.length; i += 1) {
    for (let j = i + 1; j < readable.length; j += 1) {
      const a = readable[i]!;
      const b = readable[j]!;
      if (a.element === b.element || a.element.contains(b.element) || b.element.contains(a.element) || (a.group && a.group === b.group)) continue;
      const area = intersectionArea(a, b);
      if (area > 0) textOverlaps.push({ a: a.label, b: b.label, area: Math.round(area) });
    }
  }

  const marks: LayoutReport["marks"] = [];
  for (const wrapper of root.querySelectorAll<HTMLElement>("[data-testid='highlight-circle'], [data-testid='highlight-underline'], [data-testid='card-ring']")) {
    if (!visible(wrapper)) continue;
    const svg = wrapper instanceof SVGSVGElement ? wrapper : wrapper.querySelector("svg");
    if (!svg) continue;
    const kind = wrapper.getAttribute("data-testid") ?? "mark";
    const r = wrapper.getBoundingClientRect();
    // The mark's own target, recovered from its box: a ring's box is the target's plus its pad; an underline hangs below it.
    const pad = Number(wrapper.getAttribute("data-pad") ?? 14);
    const scale = wrapper instanceof HTMLElement && wrapper.offsetWidth ? r.width / wrapper.offsetWidth : 1;
    const target: LayoutBox | null = kind === "highlight-underline" ? null : { left: r.left + pad * scale, top: r.top + pad * scale, right: r.right - pad * scale, bottom: r.bottom - pad * scale };
    const points = strokePoints(svg as SVGSVGElement);
    const half = 1.75 * scale;
    const insideTarget = target ? points.filter((p) => inside(p, target, half)).length : 0;
    const hits = new Set<string>();
    for (const box of readable) {
      // What is INSIDE the ring's target is what the ring is around; the stroke stays off everything else, too.
      if (points.some((p) => inside(p, box, half))) hits.add(box.label);
    }
    marks.push({ kind, insideTarget, hits: [...hits] });
  }

  const hand = root.querySelector<HTMLElement>("[data-testid='pointer']");
  const handShown = hand !== null && Number(getComputedStyle(hand).opacity) > 0.1;
  const handBox = handShown ? hand.getBoundingClientRect() : null;
  const pointerHits = handBox ? readable.filter((box) => intersectionArea(box, handBox) > 0).map((box) => box.label) : [];

  const ok = textOverlaps.length === 0 && marks.every((m) => m.insideTarget === 0 && m.hits.length === 0) && pointerHits.length === 0;
  return { readable: readable.length, textOverlaps, marks, pointer: { visible: handShown, hits: pointerHits }, ok };
}

/** The harnesses' door: every board on the page, judged by the code the board itself uses. */
export function installLayoutProbe(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __boardLayout?: () => LayoutReport[] }).__boardLayout = () =>
    [...document.querySelectorAll("[data-board-root]")].map((root) => boardLayoutReport(root));
}
