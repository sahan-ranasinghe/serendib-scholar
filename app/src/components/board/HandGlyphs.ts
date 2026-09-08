/**
 * The handwriting display for numbers: one stroke path per glyph, drawn
 * in a 40×60 box, revealed by animating the stroke's length. Digits 0–9
 * and the signs a Grade-5 board needs. Anything not here (Sinhala words,
 * "Rs") is written with the Sinhala face and a write-on wipe instead.
 *
 * The paths are deliberately a little uneven — a teacher's hand, not a
 * font — and the marker-wobble filter adds the rest.
 */
export interface Glyph {
  d: string;
  /** Advance width in the 40×60 box. */
  w: number;
}

export const GLYPHS: Record<string, Glyph> = {
  "0": { d: "M 21 5 C 9 5, 6 18, 6 30 C 6 44, 9 56, 20 56 C 32 56, 34 44, 34 30 C 34 16, 31 5, 21 5 Z", w: 40 },
  "1": { d: "M 10 15 C 14 12, 18 8, 21 4 L 21 56", w: 34 },
  "2": { d: "M 8 17 C 9 4, 32 2, 32 16 C 32 27, 14 38, 8 54 L 34 54", w: 40 },
  "3": { d: "M 8 11 C 14 2, 32 4, 30 16 C 29 25, 21 28, 17 28 C 25 28, 34 32, 32 44 C 30 56, 12 58, 6 48", w: 40 },
  "4": { d: "M 28 56 L 28 4 L 6 40 L 37 40", w: 40 },
  "5": { d: "M 32 5 L 11 5 L 8 28 C 16 22, 34 24, 33 40 C 32 54, 14 58, 6 48", w: 40 },
  "6": { d: "M 30 6 C 14 14, 6 30, 7 42 C 8 56, 32 58, 33 43 C 34 30, 12 28, 8 36", w: 40 },
  "7": { d: "M 6 6 L 34 5 C 24 20, 16 38, 14 56", w: 38 },
  "8": { d: "M 20 28 C 8 26, 6 6, 20 5 C 34 6, 32 26, 20 28 C 6 30, 4 56, 20 56 C 36 56, 34 30, 20 28", w: 40 },
  "9": { d: "M 32 22 C 30 6, 8 6, 8 20 C 8 32, 30 32, 32 20 C 33 34, 30 48, 20 56", w: 40 },
  "+": { d: "M 20 13 L 20 47 M 4 30 L 36 30", w: 40 },
  "-": { d: "M 7 31 L 33 30", w: 40 },
  "−": { d: "M 7 31 L 33 30", w: 40 },
  "=": { d: "M 6 23 L 34 22 M 6 38 L 34 37", w: 40 },
  "×": { d: "M 8 18 L 32 42 M 32 18 L 8 42", w: 40 },
  "?": { d: "M 9 17 C 9 2, 32 2, 32 16 C 32 26, 20 27, 20 38 M 20 50 L 20 53", w: 40 },
  ",": { d: "M 18 50 C 21 54, 20 59, 15 63", w: 22 },
  ".": { d: "M 18 53 L 19 54", w: 20 },
  ":": { d: "M 18 24 L 19 25 M 18 48 L 19 49", w: 22 },
  "→": { d: "M 4 30 L 36 30 M 26 20 L 36 30 L 26 40", w: 44 },
  "▢": { d: "M 6 12 L 34 12 L 34 50 L 6 50 Z", w: 44 },
  " ": { d: "", w: 16 },
};

export function isGlyph(char: string): boolean {
  return char in GLYPHS;
}

/** Whether every character of `text` has a stroke glyph (spaces included). */
export function isHandWritable(text: string): boolean {
  return text.length > 0 && [...text].every(isGlyph);
}
