"use client";

/**
 * TEMPORARY PROOF-OF-CONCEPT — always-visible Lesson 1 progress bar, driven
 * by the current stepNumber tracked in useGeminiLive.ts (from the
 * lesson_step board state). See
 * src/data/lessons/lesson1-numbers.ts's module doc for the full list of
 * what to remove alongside this component.
 */
import { LESSON_1_NUMBERS_TITLE, LESSON_1_NUMBERS_STEPS } from "@/data/lessons/lesson1-numbers";

const TOTAL_STEPS = LESSON_1_NUMBERS_STEPS.length;

export default function LessonProgress({ currentStepNumber }: { currentStepNumber: number | null }) {
  // Hidden until the lesson actually starts (first teach_lesson1_step call)
  // — "always visible" means it never disappears again once shown, not
  // that it shows a meaningless "step 0" before anything's happened.
  if (currentStepNumber === null) return null;

  const percent = Math.round((currentStepNumber / TOTAL_STEPS) * 100);

  return (
    <div className="w-full max-w-2xl rounded-2xl bg-amber-50 px-5 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold text-orange-900">
        <span className="truncate">{LESSON_1_NUMBERS_TITLE}</span>
        <span className="shrink-0 text-orange-600">
          step {currentStepNumber} / {TOTAL_STEPS}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-amber-200">
        <div
          className="h-full rounded-full bg-amber-500 transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
