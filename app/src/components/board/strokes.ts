/**
 * The design's chalk marks: a slightly wobbly ring (100×80 units) and an
 * underline (100×10), both saffron, 3.5 px, round caps, drawn with
 * non-scaling strokes so they can stretch to any target.
 */
export const RING_D = "M50 6C22 4 6 18 8 42c2 26 24 34 46 32s42-14 40-36C92 14 74 4 48 8";
export const RING_FRAME_D = "M50 4C20 2 4 16 6 42c2 28 24 36 46 34s44-14 42-38C92 12 76 2 48 6";
export const UNDERLINE_D = "M2 6c20-4 40 2 60-2 14-3 26-1 36 2";

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

