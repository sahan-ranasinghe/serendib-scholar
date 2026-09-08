/**
 * Board view patches — the partial updates board tools return instead of a
 * whole new board (a zoom, a filled blank, a bead landing on a rod).
 *
 * Extracted from the old live hook so both the lesson runtime
 * (useLessonRuntime) and the on-request chat (useLiveChat) apply them the
 * same way: one board, one set of rules for changing it.
 */
import type { BoardContent, PageImageView, TableBoardView } from "@/lib/board";
// TEMPORARY PROOF-OF-CONCEPT import — see src/data/lessons/lesson1-numbers.ts's module doc.
import type { FilledAnswer } from "@/data/lessons/lesson1-numbers";
import type { LessonScript } from "@/lib/lessonOrchestrator";

export // The last three fields belong to submit_blank_answer / reveal_answer /
// set_active_blank, which patch a lesson_content board.
type ViewPatch = Partial<PageImageView> & Partial<TableBoardView> & {
  filledAnswer?: FilledAnswer;
  activeBlank?: { rowIndex: number; field: string } | null;
  expectedItemId?: string;
  /** abacus_add_bead: beads landing on one or more rods of the animated abacus. */
  abacusAddBead?: { rod: number; count: number } | Array<{ rod: number; count: number }>;
};

/**
 * Merges a view-only patch (zoom, table scroll position, highlight) onto
 * whatever board content is currently displayed. A no-op (with a console
 * warning, for the same visibility reasons as the page-reference mismatch
 * check) if the current content doesn't support that kind of patch — e.g.
 * the model tried to zoom while an exercise, not a page image, is shown.
 */
export function applyViewPatch(current: BoardContent | null, patch: ViewPatch): BoardContent | null {
  if (current?.type === "page_image") {
    return {
      ...current,
      view: {
        zoom: patch.zoom ?? current.view.zoom,
        zoomFocus: patch.zoomFocus !== undefined ? patch.zoomFocus : current.view.zoomFocus,
        highlight: patch.highlight !== undefined ? patch.highlight : current.view.highlight,
        marker: patch.marker !== undefined ? patch.marker : current.view.marker,
      },
    };
  }
  if (current?.type === "table") {
    return {
      ...current,
      view: {
        scrollTo: patch.scrollTo !== undefined ? patch.scrollTo : current.view.scrollTo,
        highlight: patch.highlight !== undefined ? patch.highlight : current.view.highlight,
      },
    };
  }
  // The patches from submit_blank_answer (the child answered),
  // reveal_answer (Zara wrote it herself while demonstrating) and
  // set_active_blank. The first two share this branch deliberately: they
  // differ only by the `source` tag on the filled answer, so the item guard
  // and active-blank clearing below apply to both.
  if (current?.type === "lesson_content" && (patch.filledAnswer || "activeBlank" in patch)) {
    if (patch.expectedItemId !== undefined && patch.expectedItemId !== current.itemId) {
      console.warn(
        `[boardPatch] Ignored a blank-tracking action for item ${patch.expectedItemId} — the board is ` +
          `currently showing item ${current.itemId} (the lesson likely already moved on).`,
      );
      return current;
    }
    if (patch.filledAnswer) {
      const isSameCell = (a: FilledAnswer) =>
        a.rowIndex === patch.filledAnswer!.rowIndex && a.field === patch.filledAnswer!.field;
      return {
        ...current,
        filledAnswers: [...current.filledAnswers.filter((a) => !isSameCell(a)), patch.filledAnswer],
        // A filled blank is no longer "the one currently being asked
        // about" — clear the active highlight so it doesn't linger on an
        // already-confirmed cell.
        activeBlank:
          current.activeBlank?.rowIndex === patch.filledAnswer.rowIndex &&
          current.activeBlank?.field === patch.filledAnswer.field
            ? null
            : current.activeBlank,
      };
    }
    // set_active_blank's patch: `activeBlank` present (possibly null, to clear it).
    return { ...current, activeBlank: patch.activeBlank ?? null };
  }
  if (current?.type === "abacus" && patch.abacusAddBead) {
    const adds = Array.isArray(patch.abacusAddBead) ? patch.abacusAddBead : [patch.abacusAddBead];
    const shown = [...current.shown];
    for (const { rod, count } of adds) {
      if (rod >= 0 && rod < shown.length) shown[rod] = Math.min(current.digits[rod] ?? 0, shown[rod] + count);
    }
    return { ...current, shown, selfAnimate: false };
  }
  console.warn(
    `[boardPatch] Ignored a view-only board action — current board content ` +
      `(${current?.type ?? "none"}) doesn't support it.`,
  );
  return current;
}

/**
 * One concept a lesson covers, for the progress bar — derived from the
 * lesson script the app fetched, never from a model response.
 */
export interface LessonConcept {
  concept_tag: string;
  description: string | null;
  explanations_available: number;
  problems_available: number;
}

export function conceptsFromScript(script: LessonScript): LessonConcept[] {
  return script.concepts.map((summary) => {
    const beats = script.beats
      .slice(summary.firstBeat, summary.lastBeat + 1)
      .filter((beat) => beat.conceptTag === summary.conceptTag);
    return {
      concept_tag: summary.conceptTag,
      description: summary.description,
      explanations_available: beats.filter((beat) => beat.type === "EXPLAIN").length,
      problems_available: new Set(beats.filter((beat) => beat.itemId && beat.type === "SHOW_BOARD").map((b) => b.itemId))
        .size,
    };
  });
}
