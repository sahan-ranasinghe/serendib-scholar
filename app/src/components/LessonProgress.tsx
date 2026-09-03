"use client";

/**
 * Always-visible lesson progress bar, showing which concept of the lesson
 * is being taught — driven by the concepts get_lesson_concepts returned and
 * whichever one find_teaching_content last served material for (both
 * tracked in useGeminiLive.ts).
 *
 * Deliberately shows position, not completion: it marks where in the lesson
 * we are, and never claims a concept is "done". A concept is finished when
 * the child can do it, which this component has no way to know — and the
 * whole reason the old 12-step version was removed is that a countdown of
 * items remaining reads as a checklist to race through.
 */
import type { LessonConcept } from "@/hooks/useGeminiLive";

export default function LessonProgress({
  concepts,
  currentConceptTag,
}: {
  concepts: LessonConcept[];
  currentConceptTag: string | null;
}) {
  // Hidden until the lesson actually starts (the model's opening
  // get_lesson_concepts call) — "always visible" means it never disappears
  // again once shown, not that it shows an empty bar beforehand.
  if (concepts.length === 0) return null;

  const currentIndex = concepts.findIndex((concept) => concept.concept_tag === currentConceptTag);
  // Null before any material has been served — the bar then sits unfilled
  // rather than showing the first concept as if it were already underway.
  const current = currentIndex >= 0 ? concepts[currentIndex] : null;

  return (
    <div className="w-full max-w-2xl rounded-2xl bg-amber-50 px-5 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold text-orange-900">
        <span className="truncate">{current?.description ?? current?.concept_tag ?? "Getting started..."}</span>
        {current && (
          <span className="shrink-0 text-orange-600">
            {currentIndex + 1} / {concepts.length}
          </span>
        )}
      </div>
      <div className="mt-2 flex w-full gap-1" aria-hidden>
        {concepts.map((concept, index) => (
          <div
            key={concept.concept_tag}
            className={`h-2 flex-1 rounded-full transition-colors duration-300 ${
              index < currentIndex ? "bg-amber-400" : index === currentIndex ? "bg-amber-500" : "bg-amber-200"
            }`}
          />
        ))}
      </div>
      <span className="sr-only">
        {current
          ? `Working on concept ${currentIndex + 1} of ${concepts.length}: ${current.description ?? current.concept_tag}`
          : `Lesson has ${concepts.length} concepts`}
      </span>
    </div>
  );
}
