/**
 * The whiteboard's palette and motion constants — the ONE place the look
 * is decided. Every primitive in this folder reads from here; nothing
 * carries its own colours.
 *
 * The board is a real Sri Lankan classroom whiteboard: an off-white
 * surface with a faint grid, a wooden frame, and marker strokes that
 * wobble a little because a hand drew them. Warm and limited — board
 * white, marker blue, marker red (corrections only), chalk-yellow
 * highlight, wood brown, and four bead colours.
 */
import type { Transition } from "framer-motion";

export const BOARD = {
  surface: "#F6F1E4",
  surfaceGrid: "rgba(74, 58, 30, 0.08)",
  /** Labels, rod names, anything "printed" on the board. */
  ink: "#2A2418",
  inkSoft: "rgba(42, 36, 24, 0.55)",
  markerBlue: "#1E4C99",
  markerRed: "#B5382F",
  /** The child's colour — their number, their answer, their tick. */
  markerGreen: "#2F7A4D",
  chalkYellow: "#F3C64B",
  chalkYellowSoft: "rgba(243, 198, 75, 0.42)",
  woodDark: "#5E3B22",
  wood: "#8B5A35",
  woodLight: "#B8895A",
  /** Bead colours by rod, left→right: දා සි ද එ. */
  beads: ["#C9463D", "#E39B2C", "#3E8E5E", "#3B6FB6"],
  /** A fifth rod (දසදා) if a five-rod abacus is ever staged. */
  beadExtra: "#8A5BB8",
} as const;

/** Rod labels, right-aligned: the last four are the four-digit abacus. */
export const ROD_LABELS = ["දසදා", "දා", "සි", "ද", "එ"] as const;
export type Place = (typeof ROD_LABELS)[number];
export const PLACES_4 = ["දා", "සි", "ද", "එ"] as const;

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

/** Nothing on the board takes longer than this. */
export const MAX_MS = 600;
/** Every interactive target is at least this big. */
export const TOUCH_MIN = 48;

/** Settles in ~350 ms, no overshoot to speak of — the default. */
export const SPRING: Transition = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 };
/** One visible bounce, settled inside 600 ms — beads, digit drops. */
export const SPRING_BOUNCY: Transition = { type: "spring", stiffness: 640, damping: 17, mass: 0.6 };
/** Quick and dry — pointer moves, ring fades. */
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 700, damping: 40, mass: 0.5 };

export const FONT_SINHALA =
  'var(--font-noto-sinhala, "Noto Sans Sinhala"), "Noto Sans Sinhala", "Iskoola Pota", "Nirmala UI", "Malithi Web", system-ui, sans-serif';

/** Thousands are written with a thin space, as the textbook prints them. */
export function formatNumber(value: number | string): string {
  const raw = String(value);
  if (!/^\d+$/u.test(raw) || raw.length < 4) return raw;
  return raw.replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
}
