/**
 * The stroke audit — the part of board-check that catches a half-drawn
 * or off-target chalk stroke without anyone's eye.
 *
 * Every animated stroke on the board is an SVG <path> whose `pathLength`
 * attribute Framer Motion sets to 1 and whose dash array it animates, so
 * "how much of this stroke is drawn" can be read straight off the DOM:
 * the first dash value over pathLength. The defect class this guards
 * against is a path animated inside an SVG that is scaled unevenly
 * (viewBox + preserveAspectRatio="none"): the dash is measured in one
 * space and drawn in another, and the stroke stops part-way. So each
 * path is also checked for a uniform screen CTM.
 *
 * Position checks compare the drawn thing with the element the board's
 * registry resolved — visible to the page as `data-targets` on the
 * registered element (see useBoardRegistry).
 */

export interface StrokeProbe {
  /** The gallery section (`[data-primitive]`). */
  section: string;
  /** Exact label of the toolbar button to press. */
  button: string;
  /** A short name for files and the report. */
  name: string;
  /** What must be true at rest. */
  expect: {
    /** A highlight of this kind around/under the element registered for this target key. */
    highlight?: { kind: "circle" | "underline"; target: string };
    /** A ring around this card. */
    ring?: number;
    /** A glow on this rod. */
    glow?: number;
    /** Every WriteOn in the section fully revealed. */
    written?: boolean;
    /** This expansion part carries this value. */
    part?: { index: number; value: string };
    /** This table cell is outlined. */
    cell?: string;
    /** The pointer's fingertip is at the element registered for this key. */
    pointerAt?: string;
    /** At least this many animated strokes exist in the section. */
    minStrokes?: number;
  };
}

export const STROKE_PROBES: StrokeProbe[] = [
  // highlight: every target the gallery offers
  { section: "highlight", button: "circle {number:5421}", name: "highlight-circle-number-5421", expect: { highlight: { kind: "circle", target: "number:5421" }, minStrokes: 1 } },
  { section: "highlight", button: "circle {card:101}", name: "highlight-circle-card-101", expect: { highlight: { kind: "circle", target: "card:101" }, minStrokes: 1 } },
  { section: "highlight", button: "circle {text:…, place:ද}", name: "highlight-circle-text-place", expect: { highlight: { kind: "circle", target: "text:84 = 80 + 4/place:ද" }, minStrokes: 1 } },
  { section: "highlight", button: 'underline {text:"84 = 80 + 4"}', name: "highlight-underline-text", expect: { highlight: { kind: "underline", target: "text:84 = 80 + 4" }, minStrokes: 1 } },
  { section: "highlight", button: "underline {number:80}", name: "highlight-underline-number-80", expect: { highlight: { kind: "underline", target: "number:80" }, minStrokes: 1 } },
  { section: "highlight", button: 'underline {text:"ලොකු සංඛ්‍යා"}', name: "highlight-underline-sinhala", expect: { highlight: { kind: "underline", target: "text:ලොකු සංඛ්‍යා" }, minStrokes: 1 } },
  // the other stroke-drawn visuals
  { section: "numberCards", button: "highlight_ring 528", name: "cards-ring-528", expect: { ring: 528, minStrokes: 1 } },
  { section: "abacus", button: "rod_glow ද", name: "abacus-rod-glow", expect: { glow: 2 } },
  { section: "chalkText", button: "write 84 = 80 + 4", name: "chalk-write-sum", expect: { written: true, minStrokes: 7 } },
  { section: "chalkText", button: "write සංඛ්‍යා නාමය", name: "chalk-write-sinhala", expect: { written: true } },
  { section: "chalkText", button: "append - තුන්දහස් පනස් අට", name: "chalk-append", expect: { written: true } },
  { section: "expansion", button: "part_reveal 1 = 400", name: "expansion-part-reveal", expect: { part: { index: 1, value: "400" }, minStrokes: 3 } },
  { section: "blankTable", button: "row_activate 1 · අගය", name: "table-cell-outline", expect: { cell: "cell-0-valueRepresented" } },
  { section: "pointer", button: "move_to {number:528}", name: "pointer-card", expect: { pointerAt: "number:528" } },
  { section: "pointer", button: "move_to {rod:2}", name: "pointer-rod", expect: { pointerAt: "rod:2" } },
  { section: "pointer", button: "move_to {text:…, place:එ}", name: "pointer-digit", expect: { pointerAt: "text:84 = 80 + 4/place:එ" } },
  { section: "digitPicker", button: "show pool 1 3 6 4", name: "picker-circle", expect: { minStrokes: 1 } },
];

/** Runs in the page: measures every stroke in a section, plus the things the probes ask about. */
export const MEASURE_JS = `(function (sectionId, ask) {
  const s = document.querySelector('[data-primitive="' + sectionId + '"]');
  const board = s.querySelector('[data-board]');
  // Everything in the board's own coordinates, so a page scroll between
  // the mid-flight and at-rest measurements is not mistaken for a jump.
  const origin = board.getBoundingClientRect();
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height, right: r.right - origin.left, bottom: r.bottom - origin.top }; };
  const label = (el) => { const t = el.closest('[data-testid]'); return (t ? t.getAttribute('data-testid') : el.tagName) + (el.closest('.hand-number') ? ' glyph' : ''); };
  const strokes = [...board.querySelectorAll('path[pathLength]')].map((path) => {
    const P = parseFloat(path.getAttribute('pathLength') || '0') || 1;
    const dash = getComputedStyle(path).strokeDasharray;
    const first = dash === 'none' ? P : parseFloat(dash);
    const drawn = Math.max(0, Math.min(1, first / P));
    const m = path.ownerSVGElement.getScreenCTM();
    const sx = Math.hypot(m.a, m.b), sy = Math.hypot(m.c, m.d);
    // The design's rings and underlines stretch a 100×80 / 100×10 path over the target (viewBox + preserveAspectRatio="none")
    // with vector-effect: non-scaling-stroke — the path scales, the 3.5 px stroke does not, so the mark stays uniform.
    const nonScaling = (path.getAttribute('vector-effect') || getComputedStyle(path).vectorEffect || '') === 'non-scaling-stroke';
    const uniform = nonScaling || Math.abs(sx - sy) / Math.max(sx, sy) < 0.02;
    return { label: label(path), drawn: Number(drawn.toFixed(3)), uniform, sx: Number(sx.toFixed(3)), sy: Number(sy.toFixed(3)), length: Math.round(path.getTotalLength()), box: rect(path.ownerSVGElement) };
  });
  // A key like "text:84 = 80 + 4/place:ද" back into a Target, resolved by the board's own registry.
  const targetFromKey = (key) => {
    const place = key.match(/[/]place:(.+)$/u);
    const bare = place ? key.slice(0, key.length - place[0].length) : key;
    const [kind, ...rest] = bare.split(':');
    const value = rest.join(':');
    if (kind === 'text') return place ? { text: value, place: place[1] } : { text: value };
    if (kind === 'card') return place ? { card: Number(value), place: place[1] } : { card: Number(value) };
    if (kind === 'cell') { const [row, field] = value.split('/'); return { cell: { row: Number(row), field } }; }
    return { [kind]: Number(value) };
  };
  const registry = board.querySelector('.wb-surface').__board;
  const byKey = (key) => {
    if (registry) return registry.resolve(targetFromKey(key));
    const els = [...board.querySelectorAll('[data-targets]')].filter((el) => el.getAttribute('data-targets').split('|').includes(key));
    return els.length ? els[els.length - 1] : null;
  };
  const out = { strokes, boardRect: { left: origin.left, top: origin.top, width: origin.width, height: origin.height, right: origin.right, bottom: origin.bottom } };
  if (ask.target) { const el = byKey(ask.target); out.target = el ? rect(el) : null; out.targetLabel = el ? label(el) : null; }
  const hl = board.querySelector('[data-testid^="highlight-"]');
  out.highlight = hl ? { kind: hl.getAttribute('data-testid').slice(10), box: rect(hl), opacity: parseFloat(getComputedStyle(hl).opacity) } : null;
  if (ask.ring !== undefined) { const card = board.querySelector('[data-card="' + ask.ring + '"]'); const ring = card && card.querySelector('svg.chalk-stroke'); out.card = card ? rect(card) : null; out.ring = ring ? rect(ring) : null; }
  if (ask.glow !== undefined) { const rod = board.querySelector('[data-testid="abacus-rod-' + ask.glow + '"]'); const halo = rod && rod.firstElementChild; out.rod = rod ? { box: rect(rod), glowing: rod.hasAttribute('data-glow') } : null; out.halo = halo ? { box: rect(halo), opacity: parseFloat(getComputedStyle(halo).opacity) } : null; }
  out.writeOns = [...board.querySelectorAll('.write-on')].map((el) => ({ text: el.textContent.slice(0, 20), clip: getComputedStyle(el).clipPath }));
  if (ask.part !== undefined) { const part = board.querySelector('[data-testid="expansion-part-' + ask.part + '"]'); out.part = part ? { value: part.getAttribute('data-value'), box: rect(part) } : null; }
  if (ask.cell) { const cell = board.querySelector('[data-testid="' + ask.cell + '"]'); out.cell = cell ? { active: cell.hasAttribute('data-active'), shadow: getComputedStyle(cell).boxShadow } : null; }
  const pointer = board.querySelector('[data-testid="pointer"]');
  out.pointer = pointer ? { box: rect(pointer), opacity: parseFloat(getComputedStyle(pointer).opacity), missing: pointer.hasAttribute('data-missing') } : null;
  return out;
})`;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface Measured {
  strokes: Array<{ label: string; drawn: number; uniform: boolean; sx: number; sy: number; length: number; box: Box }>;
  boardRect: Box;
  target?: Box | null;
  targetLabel?: string | null;
  highlight: { kind: string; box: Box; opacity: number } | null;
  card?: Box | null;
  ring?: Box | null;
  rod?: { box: Box; glowing: boolean } | null;
  halo?: { box: Box; opacity: number } | null;
  writeOns: Array<{ text: string; clip: string }>;
  part?: { value: string | null; box: Box } | null;
  cell?: { active: boolean; shadow: string } | null;
  pointer: { box: Box; opacity: number; missing: boolean } | null;
}

const PAD = 10;
const TOL = 3;
const near = (a: number, b: number, tolerance = TOL) => Math.abs(a - b) <= tolerance;

/** The problems with a measurement at rest — an empty list is a pass. */
export function judgeAtRest(probe: StrokeProbe, m: Measured): string[] {
  const problems: string[] = [];
  const { expect } = probe;
  if (expect.minStrokes && m.strokes.length < expect.minStrokes) problems.push(`expected ≥ ${expect.minStrokes} animated strokes, found ${m.strokes.length}`);
  for (const stroke of m.strokes) {
    if (stroke.drawn < 0.98) problems.push(`half-drawn stroke: ${stroke.label} is ${(stroke.drawn * 100).toFixed(0)}% drawn at rest`);
    if (!stroke.uniform) problems.push(`non-uniform stroke scaling: ${stroke.label} is scaled ${stroke.sx}× by ${stroke.sy}×`);
  }
  if (expect.highlight) {
    const { kind, target } = expect.highlight;
    if (!m.target) problems.push(`target ${target} is not registered on the board`);
    else if (!m.highlight) problems.push(`no ${kind} was drawn for ${target}`);
    else {
      const t = m.target;
      const h = m.highlight.box;
      if (m.highlight.kind !== kind) problems.push(`drew a ${m.highlight.kind}, expected a ${kind}`);
      if (m.highlight.opacity < 0.98) problems.push(`${kind} is faded (opacity ${m.highlight.opacity})`);
      // The design's ring insets −14 (−8 round a target wider than 200 px); the underline hangs under the target's edge.
      const pad = kind === "circle" ? (t.width > 200 ? 8 : 14) : 0;
      if (!near(h.left, t.left - pad) || !near(h.width, t.width + pad * 2)) {
        problems.push(`${kind} is the wrong width/position: spans ${Math.round(h.left)}…${Math.round(h.right)} for a target at ${Math.round(t.left)}…${Math.round(t.right)} (${m.targetLabel})`);
      }
      if (kind === "circle" && (!near(h.top, t.top - pad) || !near(h.height, t.height + pad * 2))) {
        problems.push(`circle is the wrong height/position: ${Math.round(h.top)}…${Math.round(h.bottom)} for a target at ${Math.round(t.top)}…${Math.round(t.bottom)}`);
      }
      if (kind === "underline" && !near(h.top, t.bottom - 2, 4)) problems.push(`underline sits at ${Math.round(h.top)}, the target's bottom is ${Math.round(t.bottom)}`);
    }
  }
  if (expect.ring !== undefined) {
    if (!m.card) problems.push(`card ${expect.ring} not found`);
    else if (!m.ring) problems.push(`no ring drawn around card ${expect.ring}`);
    else if (!near(m.ring.left, m.card.left - 14, 4) || !near(m.ring.width, m.card.width + 28, 4) || !near(m.ring.top, m.card.top - 14, 4)) {
      problems.push(`ring off its card: ring ${Math.round(m.ring.left)}…${Math.round(m.ring.right)} vs card ${Math.round(m.card.left)}…${Math.round(m.card.right)}`);
    }
  }
  if (expect.glow !== undefined) {
    if (!m.rod?.glowing) problems.push(`rod ${expect.glow} is not glowing`);
    else if (!m.halo || m.halo.opacity < 0.95) problems.push(`rod ${expect.glow}'s halo is not up (opacity ${m.halo?.opacity ?? "none"})`);
    else if (m.halo.box.left < m.rod.box.left - 8 || m.halo.box.right > m.rod.box.right + 8) problems.push(`rod ${expect.glow}'s halo strays off its rod`);
  }
  if (expect.written) {
    for (const w of m.writeOns) {
      const insets = w.clip.match(/inset\(([^)]*)\)/u);
      const right = insets ? insets[1]!.trim().split(/\s+/u)[1] : null;
      if (w.clip !== "none" && right && parseFloat(right) > 0.5) problems.push(`write-on "${w.text}" is only partly revealed (${w.clip})`);
    }
  }
  if (expect.part) {
    if (!m.part) problems.push(`expansion part ${expect.part.index} not found`);
    else if (m.part.value !== expect.part.value) problems.push(`expansion part ${expect.part.index} shows "${m.part.value}", expected "${expect.part.value}"`);
  }
  if (expect.cell) {
    if (!m.cell?.active) problems.push(`cell ${expect.cell} is not active`);
    else if (!m.cell.shadow.includes("233, 180, 76")) problems.push(`cell ${expect.cell} has no saffron outline (${m.cell.shadow.slice(0, 60)})`);
  }
  if (expect.pointerAt) {
    if (!m.target) problems.push(`pointer target ${expect.pointerAt} is not registered`);
    else if (!m.pointer || m.pointer.missing || m.pointer.opacity < 0.98) problems.push(`pointer is hidden or aimed at nothing for ${expect.pointerAt}`);
    else {
      // the design's hand is 40 wide with the chalk at its centre
      const tipX = m.pointer.box.left + 20;
      const tipY = m.pointer.box.top;
      const cx = m.target.left + m.target.width / 2;
      if (!near(tipX, cx, 4) || !near(tipY, m.target.bottom - 4, 4)) {
        problems.push(`pointer tip at (${Math.round(tipX)}, ${Math.round(tipY)}) but the target's bottom-centre is (${Math.round(cx)}, ${Math.round(m.target.bottom - 4)})`);
      }
    }
  }
  return problems;
}

/** A stroke that moved between mid-flight and rest was drawn in the wrong place first. */
export function judgeJump(probe: StrokeProbe, mid: Measured, rest: Measured): string[] {
  const problems: string[] = [];
  const moved = (a: Box, b: Box) => !near(a.left, b.left) || !near(a.top, b.top) || !near(a.width, b.width) || !near(a.height, b.height);
  if (probe.expect.highlight && mid.highlight && rest.highlight && moved(mid.highlight.box, rest.highlight.box)) {
    problems.push(`${rest.highlight.kind} jumped: mid-flight at ${Math.round(mid.highlight.box.left)},${Math.round(mid.highlight.box.top)} ${Math.round(mid.highlight.box.width)}×${Math.round(mid.highlight.box.height)}, at rest ${Math.round(rest.highlight.box.left)},${Math.round(rest.highlight.box.top)} ${Math.round(rest.highlight.box.width)}×${Math.round(rest.highlight.box.height)}`);
  }
  if (probe.expect.ring !== undefined && mid.ring && rest.ring && moved(mid.ring, rest.ring)) problems.push(`ring jumped between mid-flight and rest`);
  return problems;
}

/** A one-line account of what is mid-flight. */
export function describeMid(m: Measured): string {
  const moving = m.strokes.filter((s) => s.drawn < 0.98);
  const parts = [`${moving.length}/${m.strokes.length} strokes in progress`];
  if (m.highlight) parts.push(`${m.highlight.kind} ${Math.round(m.highlight.box.width)}×${Math.round(m.highlight.box.height)}`);
  if (m.pointer) parts.push(`pointer opacity ${m.pointer.opacity.toFixed(2)}`);
  const revealing = m.writeOns.filter((w) => /inset\(/u.test(w.clip) && parseFloat(w.clip.match(/inset\(([^)]*)\)/u)![1]!.trim().split(/\s+/u)[1]!) > 0.5).length;
  if (m.writeOns.length) parts.push(`${revealing}/${m.writeOns.length} write-ons mid-wipe`);
  return parts.join(" · ");
}
