import { NextRequest, NextResponse } from "next/server";
import type { BoardContent } from "@/lib/board";

const MAX_QUESTION_LENGTH = 1000;
const MAX_SUBPART_LENGTH = 500;
const MAX_SUBPARTS = 20;

/**
 * Executes the model's show_exercise tool call — displays a real practice
 * question/exercise (as retrieved from search_syllabus, never invented) on
 * the board so the child can read along.
 */
export async function POST(request: NextRequest) {
  const { question_text, subparts } = await request.json();

  if (typeof question_text !== "string" || !question_text.trim()) {
    return NextResponse.json(
      { ok: false, error: "question_text (non-empty string) is required" },
      { status: 400 },
    );
  }
  if (question_text.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `question_text is too long (max ${MAX_QUESTION_LENGTH} chars)` },
      { status: 400 },
    );
  }

  let normalizedSubparts: string[] = [];
  if (subparts !== undefined) {
    if (
      !Array.isArray(subparts) ||
      subparts.length > MAX_SUBPARTS ||
      !subparts.every((part) => typeof part === "string" && part.length <= MAX_SUBPART_LENGTH)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: `subparts must be an array of at most ${MAX_SUBPARTS} strings, each at most ${MAX_SUBPART_LENGTH} chars`,
        },
        { status: 400 },
      );
    }
    normalizedSubparts = subparts;
  }

  const board: BoardContent = {
    type: "exercise",
    questionText: question_text,
    subparts: normalizedSubparts,
  };
  return NextResponse.json({ ok: true, board });
}
