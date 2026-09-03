import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { LESSON_1_NUMBERS_STEPS } from "@/data/lessons/lesson1-numbers";

/**
 * Executes the model's get_lesson_concepts tool call — the tutor asking, at
 * the start of a session, what a lesson actually covers.
 *
 * This replaced the old teach_lesson1_step tool as the way a session gets
 * its bearings. That tool handed back a numbered step out of a 12-item
 * list, which the model read as a checklist to get through; this hands back
 * concepts to teach, with no notion of "done" attached to any of them.
 *
 * Ordering is the order the real recorded lesson taught them, derived from
 * the earliest video timestamp among each concept's rows (source
 * 'dp-video:HH:MM:SS'). Concepts sourced only from the textbook have no
 * timestamp to sort by and follow the video-ordered ones, in textbook step
 * order — as of writing every concept has video rows, so this is a
 * fallback, not the normal path.
 *
 * Counts and the concept list itself cover verified rows ONLY, matching
 * what find_teaching_content will actually hand back (see its route). A
 * concept whose rows are all still awaiting human review is not something
 * the tutor can teach, so it isn't announced as available.
 */

/** Sorts before every real timestamp is impossible; sorts after every real one. */
const NO_VIDEO_TIMESTAMP = Number.MAX_SAFE_INTEGER;
const VIDEO_SOURCE_TIMESTAMP = /^dp-video:(\d{2}):(\d{2}):(\d{2})$/;
const TEXTBOOK_SOURCE_STEP = /^textbook:[^:]+:step-(\d+)/;

/**
 * The catch-all bucket populate-content-bank.ts assigns when a problem
 * matches no concept pattern. Not a thing to teach, so it's never offered
 * as one — its rows stay reachable through find_teaching_content if the
 * model asks for that tag by name.
 */
const NOT_A_TEACHABLE_CONCEPT = "unclassified";

function videoTimestampSeconds(source: string): number | null {
  const match = VIDEO_SOURCE_TIMESTAMP.exec(source);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function textbookStepNumber(source: string): number | null {
  const match = TEXTBOOK_SOURCE_STEP.exec(source);
  return match ? Number(match[1]) : null;
}

/**
 * One-line descriptions of what each concept tag means, from the lesson's
 * own hand-transcribed data (the tags in content_bank were assigned from
 * it). Only a pointer for the model — never a script to read out.
 */
const CONCEPT_DESCRIPTIONS = new Map<string, string>(
  LESSON_1_NUMBERS_STEPS.map((step) => [step.conceptTag, step.conceptDescription]),
);

export async function POST(request: NextRequest) {
  const { subject, grade, lesson } = await request.json();

  if (typeof subject !== "string" || !subject.trim()) {
    return NextResponse.json({ ok: false, error: "subject (non-empty string) is required" }, { status: 400 });
  }
  if (typeof grade !== "number" || !Number.isInteger(grade)) {
    return NextResponse.json({ ok: false, error: "grade (integer) is required" }, { status: 400 });
  }
  if (typeof lesson !== "number" || !Number.isInteger(lesson)) {
    return NextResponse.json({ ok: false, error: "lesson (integer) is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("content_bank")
    .select("concept_tag, component_type, source")
    .eq("subject", subject.trim().toLowerCase())
    .eq("grade", grade)
    .eq("lesson", lesson)
    .eq("verified", true);

  if (error) {
    console.error("[get-lesson-concepts] Supabase error:", error.message);
    return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
  }

  const byConcept = new Map<
    string,
    { explanations: number; problems: number; earliestVideoSeconds: number; earliestTextbookStep: number }
  >();
  for (const row of data ?? []) {
    if (row.concept_tag === NOT_A_TEACHABLE_CONCEPT) continue;
    const entry = byConcept.get(row.concept_tag) ?? {
      explanations: 0,
      problems: 0,
      earliestVideoSeconds: NO_VIDEO_TIMESTAMP,
      earliestTextbookStep: NO_VIDEO_TIMESTAMP,
    };
    if (row.component_type === "explanation") entry.explanations += 1;
    else entry.problems += 1;

    const seconds = videoTimestampSeconds(row.source);
    if (seconds !== null) entry.earliestVideoSeconds = Math.min(entry.earliestVideoSeconds, seconds);
    const step = textbookStepNumber(row.source);
    if (step !== null) entry.earliestTextbookStep = Math.min(entry.earliestTextbookStep, step);

    byConcept.set(row.concept_tag, entry);
  }

  const concepts = [...byConcept.entries()]
    .sort(
      ([, a], [, b]) =>
        a.earliestVideoSeconds - b.earliestVideoSeconds || a.earliestTextbookStep - b.earliestTextbookStep,
    )
    .map(([concept_tag, entry]) => ({
      concept_tag,
      description: CONCEPT_DESCRIPTIONS.get(concept_tag) ?? null,
      explanations_available: entry.explanations,
      problems_available: entry.problems,
    }));

  if (concepts.length === 0) {
    return NextResponse.json({
      ok: true,
      found: false,
      concepts: [],
      reason: "No verified content bank material for this subject, grade and lesson yet.",
    });
  }

  return NextResponse.json({
    ok: true,
    found: true,
    subject: subject.trim().toLowerCase(),
    grade,
    lesson,
    // In the order the recorded lesson taught them — teach them in this
    // order, but nothing here is a checklist (see the TEST MODE section of
    // the system instructions).
    concepts,
  });
}
