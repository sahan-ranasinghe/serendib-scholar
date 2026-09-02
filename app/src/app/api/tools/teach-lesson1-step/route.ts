import { NextRequest, NextResponse } from "next/server";
import type { BoardContent } from "@/lib/board";
import { LESSON_1_NUMBERS_STEPS } from "@/data/lessons/lesson1-numbers";

/**
 * TEMPORARY PROOF-OF-CONCEPT — executes the model's teach_lesson1_step tool
 * call by looking up a step directly from the hardcoded local data file, no
 * database, no embedding call, no search. See
 * src/data/lessons/lesson1-numbers.ts's module doc for the full list of
 * what to remove alongside this route once the real ingestion pipeline
 * replaces this path.
 */
export async function POST(request: NextRequest) {
  const { step_number } = await request.json();

  if (typeof step_number !== "number" || !Number.isInteger(step_number)) {
    return NextResponse.json({ ok: false, error: "step_number (integer) is required" }, { status: 400 });
  }

  const step = LESSON_1_NUMBERS_STEPS.find((s) => s.stepNumber === step_number);
  if (!step) {
    return NextResponse.json({
      ok: false,
      error: `No step ${step_number} — Lesson 1 has steps 1 through ${LESSON_1_NUMBERS_STEPS.length}.`,
    });
  }

  const board: BoardContent = {
    type: "lesson_step",
    stepNumber: step.stepNumber,
    components: step.components,
    teachingNote: step.teachingNote,
    filledAnswers: [],
    activeBlank: null,
  };
  return NextResponse.json({
    ok: true,
    board,
    teachingNote: step.teachingNote,
    // See prompt.ts's TEACHING STRUCTURE section: teach a conceptTag in
    // full the first time it's seen this session, then just briefly remind
    // on a later step reusing the same tag.
    conceptTag: step.conceptTag,
    conceptDescription: step.conceptDescription,
  });
}
