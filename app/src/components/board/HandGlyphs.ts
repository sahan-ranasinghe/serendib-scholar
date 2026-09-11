/**
 * StrokeNum — the design's hand-stroke numerals, ported verbatim from
 * StrokeNum.dc.html: one path per glyph on a 24×40 grid inside a 42-unit
 * line box, a 28-unit advance, spaces 12, stroke 3.2 with round caps and
 * joins. Board numerals are these strokes, never a font (DESIGN.md).
 *
 * The design set covers 0–9 + = - . , : /. The few extra signs a Grade-5
 * board needs (? × → ▢) are drawn on the same grid in the same hand.
 */
export interface Glyph {
  d: string;
  /** Advance width in the 42-unit line box. */
  w: number;
}

/** Line-box height the paths are drawn in. */
export const GLYPH_BOX = 42;
/** The design's stroke weight (--stroke-numeral). */
export const GLYPH_STROKE = 3.2;

const ADVANCE = 28;

export const GLYPHS: Record<string, Glyph> = {
  "0": { d: "M12 3c-5 0-7 8-7 17s2 17 7 17 7-8 7-17-2-17-7-17z", w: ADVANCE },
  "1": { d: "M6 10l7-7v34", w: ADVANCE },
  "2": { d: "M5 10c0-9 14-9 14 0 0 6-12 14-14 27h15", w: ADVANCE },
  "3": { d: "M5 6c6-5 14-3 14 4 0 5-5 7-8 7 4 0 9 2 9 8 0 8-10 10-15 5", w: ADVANCE },
  "4": { d: "M16 37V3L4 26h17", w: ADVANCE },
  "5": { d: "M18 3H7l-2 15c8-4 15 0 15 8 0 9-10 12-15 6", w: ADVANCE },
  "6": { d: "M17 4c-8 2-12 10-12 22 0 12 14 12 14 2 0-8-11-9-14-2", w: ADVANCE },
  "7": { d: "M4 3h16L9 37", w: ADVANCE },
  "8": { d: "M12 19c-5 0-7-3-7-8s3-8 7-8 7 3 7 8-2 8-7 8-8 3-8 9 3 9 8 9 8-3 8-9-3-9-8-9z", w: ADVANCE },
  "9": { d: "M7 36c8-2 12-10 12-22 0-12-14-12-14-2 0 8 11 9 14 2", w: ADVANCE },
  "+": { d: "M12 11v18M3 20h18", w: ADVANCE },
  "=": { d: "M3 15h18M3 25h18", w: ADVANCE },
  "-": { d: "M3 20h18", w: ADVANCE },
  "−": { d: "M3 20h18", w: ADVANCE },
  ".": { d: "M12 36l1 1", w: ADVANCE },
  ",": { d: "M13 34l-3 6", w: ADVANCE },
  ":": { d: "M12 14v1M12 28v1", w: ADVANCE },
  "/": { d: "M18 4L6 38", w: ADVANCE },
  // the same hand, for signs the design set does not carry
  "?": { d: "M5 11c0-9 14-9 14 0 0 6-7 7-7 14M12 34v1", w: ADVANCE },
  "×": { d: "M5 12l14 16M19 12L5 28", w: ADVANCE },
  "→": { d: "M3 20h18M14 12l7 8-7 8", w: ADVANCE + 4 },
  "▢": { d: "M4 8h16v24H4z", w: ADVANCE + 2 },
  " ": { d: "", w: 12 },
};

export function isGlyph(char: string): boolean {
  return char in GLYPHS;
}

/** Whether every character of `text` has a stroke glyph (spaces included). */
export function isHandWritable(text: string): boolean {
  return text.length > 0 && [...text].every(isGlyph);
}
