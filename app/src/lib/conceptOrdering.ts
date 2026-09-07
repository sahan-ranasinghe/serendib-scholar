/**
 * Deriving the order a lesson's concepts should be taught in, from the
 * provenance recorded on each content_bank row.
 *
 * Shared by buildLessonScript.ts and the get-lesson-concepts route so the
 * lesson script and anything else reading the bank can never disagree about
 * what comes first.
 */

/** Sorts after every real timestamp. */
export const NO_TIMESTAMP = Number.MAX_SAFE_INTEGER;

const VIDEO_SOURCE_TIMESTAMP = /^dp-video:(\d{2}):(\d{2}):(\d{2})$/;
const TEXTBOOK_SOURCE_STEP = /^textbook:[^:]+:step-(\d+)/;

/**
 * Tags that are content but not concepts to teach: the catch-all bucket
 * populate-content-bank.ts assigns when a problem matches no concept
 * pattern, and the video's opening segment (LESSON_GOALS material). Never
 * ordered into a lesson as things to teach.
 */
export const NON_TEACHABLE_CONCEPTS = new Set(["unclassified", "lessonOpening"]);

export function videoTimestampSeconds(source: string): number | null {
  const match = VIDEO_SOURCE_TIMESTAMP.exec(source);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function textbookStepNumber(source: string): number | null {
  const match = TEXTBOOK_SOURCE_STEP.exec(source);
  return match ? Number(match[1]) : null;
}

export interface ConceptOrderRow {
  concept_tag: string;
  source: string;
}

/**
 * Orders concept tags by the earliest point the recorded lesson taught them.
 * Concepts with only textbook rows have no timestamp and follow, in textbook
 * step order.
 */
/**
 * The teacher's GUIDE order (see src/lib/lessonDesign.ts) outranks the
 * recorded video's order: since the design pass, concepts follow the
 * guide's four activities. Tags not in the design list (older data, other
 * lessons) keep the data-driven ordering after them.
 */
import { DESIGN_CONCEPTS } from "@/lib/lessonDesign";

const DESIGN_ORDER = new Map(DESIGN_CONCEPTS.map((tag, index) => [tag as string, index]));

export function orderConceptTags(rows: ConceptOrderRow[]): string[] {
  const earliest = new Map<string, { video: number; textbook: number }>();
  for (const row of rows) {
    if (NON_TEACHABLE_CONCEPTS.has(row.concept_tag)) continue;
    const entry = earliest.get(row.concept_tag) ?? { video: NO_TIMESTAMP, textbook: NO_TIMESTAMP };
    const seconds = videoTimestampSeconds(row.source);
    if (seconds !== null) entry.video = Math.min(entry.video, seconds);
    const step = textbookStepNumber(row.source);
    if (step !== null) entry.textbook = Math.min(entry.textbook, step);
    earliest.set(row.concept_tag, entry);
  }
  return [...earliest.entries()]
    .sort(([tagA, a], [tagB, b]) => {
      const designA = DESIGN_ORDER.get(tagA) ?? Number.MAX_SAFE_INTEGER;
      const designB = DESIGN_ORDER.get(tagB) ?? Number.MAX_SAFE_INTEGER;
      return designA - designB || a.video - b.video || a.textbook - b.textbook;
    })
    .map(([tag]) => tag);
}
