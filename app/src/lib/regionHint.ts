/**
 * Resolves a free-text region description (from the model's zoom_to_region
 * or highlight_region tool call — e.g. "the table on the right", "top-left
 * diagram") into an approximate normalized focus point on whatever image is
 * currently shown, via simple directional keywords.
 *
 * There's no real vision-grounding available at tool-call time — asking
 * Gemini vision to re-locate the region on every zoom/highlight would add
 * real per-call latency and cost to a live voice conversation. A
 * keyword heuristic is deliberately approximate: both callers only need "a
 * simple overlay box"/"reasonably estimate," not pixel precision.
 */
export interface RegionFocus {
  x: number;
  y: number;
}

const AXIS_KEYWORDS: { pattern: RegExp; x?: number; y?: number }[] = [
  { pattern: /\bleft\b/i, x: 0.25 },
  { pattern: /\bright\b/i, x: 0.75 },
  { pattern: /\btop\b|\bupper\b/i, y: 0.25 },
  { pattern: /\bbottom\b|\blower\b/i, y: 0.75 },
  { pattern: /\bcenter\b|\bcentre\b|\bmiddle\b/i, x: 0.5, y: 0.5 },
];

/**
 * Returns a normalized {x, y} in [0, 1] (0,0 = top-left, 1,1 = bottom-right)
 * for a recognized directional description, or null when the description is
 * empty/unrecognized — callers should treat null as "center" (the default,
 * unzoomed/unfocused view).
 */
export function parseRegionHint(description: string | undefined | null): RegionFocus | null {
  if (!description || !description.trim()) return null;

  let x: number | undefined;
  let y: number | undefined;
  for (const { pattern, x: matchX, y: matchY } of AXIS_KEYWORDS) {
    if (!pattern.test(description)) continue;
    if (matchX !== undefined) x = matchX;
    if (matchY !== undefined) y = matchY;
  }

  if (x === undefined && y === undefined) return null;
  return { x: x ?? 0.5, y: y ?? 0.5 };
}
