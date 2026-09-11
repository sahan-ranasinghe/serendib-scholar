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
