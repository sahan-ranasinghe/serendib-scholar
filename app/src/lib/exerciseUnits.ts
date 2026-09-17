/**
 * EXERCISE UNITS — the stretches of a lesson that must never be cut.
 *
 * A staged exercise and every beat that works it are one unit: the packer
 * never ends a sitting inside one, the daily limit waits for one to finish,
 * and mastery never skips the rest of one (the "five builds" puzzle and the
 * place-value table are practice the child is owed, however well the first
 * two answers went). A unit is:
 *
 *   - from the beat that stages an item (or any SHOW_BOARD) to the last beat
 *     of the same concept that touches that item — a cell of it, a reveal
 *     into it — or belongs to the same guide step (the digit puzzle's five
 *     builds each re-stage their own picker, so the guide step holds them);
 *   - OR a maximal run of consecutive beats of one guide step that asks at
 *     least one question (the abacus reading — "how many beads on this
 *     rod?" four times over one abacus — has no SHOW_BOARD of its own; the
 *     device walk of 17 Sep showed the limit closing a sitting in the middle
 *     of it).
 *
 * Pure: a function of the beat list, safe for the orchestrator, the runtime,
 * the packer and the dry run alike.
 */
import type { Beat } from "@/lib/lessonOrchestrator";
import { FRAMING_CONCEPT } from "@/lib/lessonOrchestrator";

export interface ExerciseUnit {
  /** Inclusive indices into the list the units were computed on. */
  start: number;
  end: number;
  itemId: string | null;
  /** What held the unit together: an item, or a guide step. */
  by: "item" | "step";
}

const itemOf = (beat: Beat): string | null => beat.itemId ?? ("itemId" in beat.board ? (beat.board as { itemId: string }).itemId : null);

export function exerciseUnits(beats: Beat[]): ExerciseUnit[] {
  const units: ExerciseUnit[] = [];
  for (let i = 0; i < beats.length; i += 1) {
    const beat = beats[i]!;
    if (beat.conceptTag === FRAMING_CONCEPT) continue;
    const staged = beat.board.kind === "stage_item" || beat.type === "SHOW_BOARD";
    const step = beat.guideStep ?? null;
    let end = i;
    let by: ExerciseUnit["by"] = "item";
    if (staged) {
      const itemId = beat.board.kind === "stage_item" ? itemOf(beat) : null;
      for (let j = i + 1; j < beats.length; j += 1) {
        const other = beats[j]!;
        if (other.conceptTag !== beat.conceptTag) break;
        if (other.board.kind === "stage_item" && itemOf(other) !== itemId) break;
        if (other.board.kind === "clear" || other.board.kind === "title_card") break;
        if ((itemId !== null && itemOf(other) === itemId) || (step !== null && other.guideStep === step)) end = j;
      }
      if (end > i) {
        units.push({ start: i, end, itemId, by: "item" });
        i = end;
        continue;
      }
    }
    // A guided run: consecutive beats of one guide step, with a question in it.
    if (step === null) continue;
    let asks = beat.type === "ASK" ? 1 : 0;
    for (let j = i + 1; j < beats.length; j += 1) {
      const other = beats[j]!;
      if (other.conceptTag !== beat.conceptTag || other.guideStep !== step) break;
      if (other.type === "ASK") asks += 1;
      end = j;
    }
    if (end > i && asks > 0) {
      by = "step";
      units.push({ start: i, end, itemId: null, by });
    }
    i = end;
  }
  return units;
}

/** Whether index `i` sits INSIDE a unit (after its first beat) — no cut, no break, no skip there. */
export function insideExerciseUnit(units: ExerciseUnit[], i: number): boolean {
  return units.some((u) => u.start < i && i <= u.end);
}

/** The unit index `i` belongs to (its first beat included), if any. */
export function unitAt(units: ExerciseUnit[], i: number): ExerciseUnit | undefined {
  return units.find((u) => u.start <= i && i <= u.end);
}
