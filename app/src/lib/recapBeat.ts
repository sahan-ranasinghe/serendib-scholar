/**
 * Builds one recap ASK beat from a content_bank item — shared by the
 * /api/recap route and the simulation harness (scripts/simulate-lesson.ts),
 * so the harness exercises EXACTLY the beat a live recap serves. The
 * CONFIRM-judged-wrong bug lived in how this beat's expectedAnswer was
 * chosen; keeping construction in one place is what lets a regression test
 * actually guard the live path.
 */
import { blanksForItem, solutionForItem, describeItem, type ItemBlank } from "@/lib/lessonBlanks";
import type { Beat } from "@/lib/lessonOrchestrator";

export interface RecapItem {
  id: string;
  concept_tag: string;
  component_type: string;
  component_props: unknown;
  answer: unknown;
}

export interface RecapAskable {
  item: RecapItem;
  blank: ItemBlank | undefined;
  solution: string | null;
}

/** Whether (and how) this item can be asked as a one-question review. */
export function recapAskable(item: RecapItem): RecapAskable | null {
  const blank = blanksForItem(item.component_type, item.component_props, item.answer).find((b) => b.value !== null);
  const solution = solutionForItem(item.answer);
  if (!blank && !solution) return null;
  return { item, blank, solution };
}

export function buildRecapAskBeat(askable: RecapAskable): Beat {
  const { item, blank, solution } = askable;
  return {
    id: `recap:${item.concept_tag}:${item.id.slice(0, 8)}`,
    type: "ASK",
    conceptTag: item.concept_tag,
    sessionIndex: -1, // runtime-inserted; never part of the scripted plan
    mode: 3,
    itemId: item.id,
    segmentIndex: -1,
    goal: blank
      ? `Quick review from last time: ask the child for ${blank.label}. Ask only this one thing.`
      : "Quick review from last time: ask the child for the answer to this one.",
    maxSentences: 2,
    boardDescription: describeItem(item.component_type, item.component_props),
    board: { kind: "stage_item", itemId: item.id },
    // The answer this exact item is looking for — a recap ASK is judged
    // against ITS item, never a leftover from whatever beat came before.
    expectedAnswer: blank ? (blank.value as string) : (solution as string),
    endBy: "asking",
  };
}
