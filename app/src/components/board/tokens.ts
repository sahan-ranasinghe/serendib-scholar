/**
 * The board reads tokens.css and nothing else. Every value here is a
 * `var(--…)` reference into src/app/tokens.css (the design's token sheet,
 * verbatim), so nothing on the board can resolve to a colour, size or
 * easing the design did not name. The few helpers that are not tokens —
 * rod labels, place maths, number formatting — live here too.
 */
import type { Transition } from "framer-motion";

export const BOARD = {
  surface: "var(--color-board)",
  surfaceGrid: "var(--color-grid)",
  ink: "var(--color-ink)",
  inkSoft: "var(--color-ink-70)",
  ink40: "var(--color-ink-40)",
  ink18: "var(--color-ink-18)",
  ink10: "var(--color-ink-10)",
  paper: "var(--color-paper)",
  card: "var(--color-card)",
  teal: "var(--color-teal)",
  tealDark: "var(--color-teal-dark)",
  markerBlue: "var(--color-marker)",
  /** Nothing is ever red: the warm accent is coral, and only for fills. */
  coral: "var(--color-coral)",
  coralSoft: "var(--color-coral-soft)",
  coralText: "var(--color-coral-text)",
  markerGreen: "var(--color-success)",
  successSoft: "var(--color-success-soft)",
  successText: "var(--color-success-text)",
  chalkYellow: "var(--color-saffron)",
  saffronSoft: "var(--color-saffron-soft)",
  saffronText: "var(--color-saffron-text)",
  chalkYellowSoft: "var(--color-saffron-glow)",
  woodDark: "var(--color-wood-dark)",
  wood: "var(--color-wood)",
  dim: "var(--color-dim)",
  white: "var(--color-white)",
  /** Bead colours by rod, left→right: 1000 · 100 · 10 · 1. */
  beads: ["var(--bead-1000)", "var(--bead-100)", "var(--bead-10)", "var(--bead-1)"],
  /** A fifth rod (10 000) if a five-rod abacus is ever staged. */
  beadExtra: "var(--zara-saree)",
} as const;

/** The design's shadows and glow, by name. */
export const SHADOW = {
  paper: "var(--shadow-paper)",
  lift: "var(--shadow-lift)",
  glow: "var(--shadow-glow)",
  card: "var(--shadow-card)",
  button: "var(--shadow-button)",
  frame: "var(--shadow-frame)",
  /** The 2 px hard edge under a paper tile (the design writes it literally). */
  edge: "0 2px 0 #D8D1C2",
} as const;

/** Rod labels, right-aligned: the last four are the four-digit abacus. */
export const ROD_LABELS = ["දසදා", "දා", "සි", "ද", "එ"] as const;
export type Place = (typeof ROD_LABELS)[number];
export const PLACES_4 = ["දා", "සි", "ද", "එ"] as const;
/** What the design prints beneath the rods. */
export const ROD_VALUE_LABELS = ["10000", "1000", "100", "10", "1"] as const;

/** The rod index (0 = leftmost) a place occupies on an abacus of `rods` rods. */
export function rodOfPlace(place: Place, rods = 4): number {
  const fromRight = ROD_LABELS.length - 1 - ROD_LABELS.indexOf(place);
  return rods - 1 - fromRight;
}

/** The place of digit `index` in a number written with `length` digits. */
export function placeOfDigit(index: number, length: number): Place | null {
  const fromRight = length - 1 - index;
  const label = ROD_LABELS[ROD_LABELS.length - 1 - fromRight];
  return label ?? null;
}

/** Nothing on the board takes longer than this (--dur-board). */
export const MAX_MS = 600;
/** Every touch target on a child surface is at least this big (rule 6). */
export const TOUCH_MIN = 56;
/** The floor elsewhere. */
export const TOUCH_FLOOR = 48;

/** The design's one overshoot (--ease-spring), settled inside --dur-board. */
export const EASE_SPRING = [0.34, 1.3, 0.64, 1] as const;
/** --ease-settle, for UI motion (--dur-ui). */
export const EASE_SETTLE = [0.22, 0.9, 0.32, 1] as const;
export const SPRING: Transition = { type: "tween", ease: [...EASE_SPRING], duration: MAX_MS / 1000 };
/** Beads and digit drops: the same overshoot, a little quicker. */
export const SPRING_BOUNCY: Transition = { type: "tween", ease: [...EASE_SPRING], duration: 0.45 };
/** Pointer moves, ring fades: UI motion, 300 ms, settles without overshoot. */
export const SPRING_SNAPPY: Transition = { type: "tween", ease: [...EASE_SETTLE], duration: 0.3 };

/** Sinhala on the board: Gemunu Libre (--font-display). */
export const FONT_SINHALA = "var(--font-display)";
export const FONT_LABEL = "var(--font-label)";
export const FONT_BODY = "var(--font-body)";
export const FONT_LATIN = "var(--font-latin)";

/** Thousands are written with a thin space, as the textbook prints them. */
export function formatNumber(value: number | string): string {
  const raw = String(value);
  if (!/^\d+$/u.test(raw) || raw.length < 4) return raw;
  return raw.replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
}
