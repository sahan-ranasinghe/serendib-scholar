import { NextRequest, NextResponse } from "next/server";
import { buildLessonScript } from "@/lib/buildLessonScript";

/**
 * Hands the client the lesson script for a session.
 *
 * Not a Gemini tool — the voice model never calls this. The app fetches it
 * when a session starts and walks it itself (see useGeminiLive.ts), which is
 * the whole point of the orchestrator: sequencing is the app's job now.
 */
export async function POST(request: NextRequest) {
  const { subject, grade, lesson, force_rebuild } = await request.json();

  if (typeof subject !== "string" || !subject.trim()) {
    return NextResponse.json({ ok: false, error: "subject (non-empty string) is required" }, { status: 400 });
  }
  if (typeof grade !== "number" || !Number.isInteger(grade)) {
    return NextResponse.json({ ok: false, error: "grade (integer) is required" }, { status: 400 });
  }
  if (typeof lesson !== "number" || !Number.isInteger(lesson)) {
    return NextResponse.json({ ok: false, error: "lesson (integer) is required" }, { status: 400 });
  }

  try {
    const { script, fingerprint, fromCache } = await buildLessonScript(subject, grade, lesson, {
      forceRebuild: force_rebuild === true,
    });
    if (script.concepts.length === 0) {
      return NextResponse.json({
        ok: true,
        found: false,
        reason: "No verified content bank material for this subject, grade and lesson yet.",
      });
    }
    return NextResponse.json({ ok: true, found: true, script, fingerprint, from_cache: fromCache });
  } catch (error) {
    console.error("[lesson-script] Build failed:", error);
    return NextResponse.json({ ok: false, error: "Could not build the lesson script" }, { status: 500 });
  }
}
