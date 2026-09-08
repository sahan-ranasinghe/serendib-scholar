/**
 * Hand-drawn chalk shapes in absolute pixel coordinates — a ring that
 * overshoots its start the way a quick circle does, and an underline
 * that dips and rises. Drawn in the SVG's own pixel space (no viewBox
 * scaling), so a stroke-length reveal measures the real path.
 */

/** A ring around a w×h box, starting at the top and closing a little past it. */
export function ringPath(w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 - 2;
  const ry = h / 2 - 2;
  const k = 0.5523;
  // Four cubic arcs, each nudged so the ring is not a perfect ellipse.
  return [
    `M ${cx + rx * 0.05} ${cy - ry}`,
    `C ${cx + rx * k} ${cy - ry * 1.02}, ${cx + rx * 1.02} ${cy - ry * k}, ${cx + rx} ${cy + ry * 0.04}`,
    `C ${cx + rx * 0.98} ${cy + ry * k * 1.05}, ${cx + rx * k * 0.95} ${cy + ry * 1.02}, ${cx - rx * 0.04} ${cy + ry}`,
    `C ${cx - rx * k * 1.04} ${cy + ry * 0.98}, ${cx - rx * 1.03} ${cy + ry * k * 0.9}, ${cx - rx} ${cy - ry * 0.06}`,
    `C ${cx - rx * 0.97} ${cy - ry * k * 1.1}, ${cx - rx * k * 0.8} ${cy - ry * 1.04}, ${cx + rx * 0.22} ${cy - ry * 0.96}`,
  ].join(" ");
}

/** A wavy line across a w×h box, sitting near its vertical middle. */
export function underlinePath(w: number, h: number): string {
  const y = h / 2;
  return `M 2 ${y} C ${w * 0.2} ${y - h * 0.3}, ${w * 0.4} ${y + h * 0.3}, ${w * 0.6} ${y - h * 0.1} C ${w * 0.75} ${y - h * 0.3}, ${w * 0.9} ${y + h * 0.2}, ${w - 2} ${y}`;
}
