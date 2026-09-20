/**
 * The design's chalk marks: a slightly wobbly ring (100×80 units) and an
 * underline (100×10), both saffron, 3.5 px, round caps, drawn with
 * non-scaling strokes so they can stretch to any target.
 */
export const RING_D = "M50 6C22 4 6 18 8 42c2 26 24 34 46 32s42-14 40-36C92 14 74 4 48 8";
export const RING_FRAME_D = "M50 4C20 2 4 16 6 42c2 28 24 36 46 34s44-14 42-38C92 12 76 2 48 6";
export const UNDERLINE_D = "M2 6c20-4 40 2 60-2 14-3 26-1 36 2";

/** How far inside its box the lasso's centre line runs — the rest of the ring's pad is clear air between the stroke and its target. */
export const LASSO_MARGIN = 4;

/**
 * THE RING, since 18 Sep 2026 (the device walk: "nothing overlaps, ever").
 *
 * The design's ring is an ellipse stretched over the target's box plus a
 * pad — and an ellipse inscribed in a box cuts its corners, so round an
 * abacus it ran straight through the "1000" label. A ring is now a chalk
 * LASSO: a hand-drawn rounded rectangle whose centre line stays within
 * LASSO_MARGIN (+ ≤ 1.5 px of wobble, outward only) of the box's edge, all
 * the way round — so with the target inset by `pad` in that box, the stroke
 * is never nearer the target than pad − LASSO_MARGIN − half the stroke.
 * It starts a little right of top-centre, runs clockwise and overshoots its
 * own start, the way the design's ring does.
 */
export function lassoPath(width: number, height: number, pad = 14): string {
  // A ring drawn in close (a number inside a line of chalk) runs nearer its own edge, so the air stays on the target's side.
  const m = pad >= 12 ? LASSO_MARGIN : Math.max(2, pad / 3);
  // A rounded corner cuts towards the target's own corner: the radius is capped so the arc still clears it by 3 px
  // (r − √2·(m + r − pad) ≥ 3). A full pad allows the full 18; a ring drawn in close to its neighbours turns squarer.
  const clearCorner = (Math.SQRT2 * (pad - m) - 3) / (Math.SQRT2 - 1);
  const r = Math.max(2, Math.min(18, clearCorner, width / 2 - m - 1, height / 2 - m - 1));
  const k = r * 0.5523;
  const l = m;
  const t = m;
  const rt = width - m;
  const b = height - m;
  const f = (n: number) => Math.round(n * 10) / 10;
  const startX = Math.min(rt - r, width * 0.56);
  const endX = Math.min(rt - r, width * 0.56 + Math.min(28, width * 0.12));
  return [
    `M${f(startX)} ${f(t)}`,
    // top edge → top-right corner (each edge bows a hair OUTWARD — a hand, not a ruler — never inward)
    `Q${f((startX + rt - r) / 2)} ${f(t - 1.2)} ${f(rt - r)} ${f(t)}`,
    `C${f(rt - r + k)} ${f(t)} ${f(rt)} ${f(t + r - k)} ${f(rt)} ${f(t + r)}`,
    `Q${f(rt + 1.4)} ${f((t + b) / 2)} ${f(rt)} ${f(b - r)}`,
    `C${f(rt)} ${f(b - r + k)} ${f(rt - r + k)} ${f(b)} ${f(rt - r)} ${f(b)}`,
    `Q${f((l + rt) / 2)} ${f(b + 1.5)} ${f(l + r)} ${f(b)}`,
    `C${f(l + r - k)} ${f(b)} ${f(l)} ${f(b - r + k)} ${f(l)} ${f(b - r)}`,
    `Q${f(l - 1.3)} ${f((t + b) / 2)} ${f(l)} ${f(t + r)}`,
    `C${f(l)} ${f(t + r - k)} ${f(l + r - k)} ${f(t)} ${f(l + r)} ${f(t)}`,
    // home, and a little past it: the overshoot lifts outward, away from the target
    `Q${f((l + r + endX) / 2)} ${f(t - 1)} ${f(endX)} ${f(t - 2)}`,
  ].join("");
}

/** Kept for callers that size a path themselves: the ring in a w×h box. */
export function ringPath(): string {
  return RING_D;
}
export function underlinePath(): string {
  return UNDERLINE_D;
}

/**
 * A hand-drawn path re-plotted into a box of `width` × `height` px, from
 * its 100 × 80 design space. Rings used to be drawn through
 * preserveAspectRatio="none" with a non-scaling stroke, and under that
 * combination the dash that animates the stroke was measured in a
 * different space from the path — the ring stopped at roughly half. In
 * pixel space the dash and the path agree, and the stroke stays 3.5 px.
 */
export function scaledPath(d: string, width: number, height: number, designWidth = 100, designHeight = 80): string {
  const sx = width / designWidth;
  const sy = height / designHeight;
  let axis = 0;
  return d.replace(/[-+]?\d*\.?\d+/gu, (token) => {
    const n = Number(token);
    const scaled = axis % 2 === 0 ? n * sx : n * sy;
    axis += 1;
    return String(Math.round(scaled * 100) / 100);
  }).replace(/[A-Za-z]/gu, (command) => {
    axis = 0;
    return command;
  });
}

