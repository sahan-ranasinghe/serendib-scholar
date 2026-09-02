import { NextRequest, NextResponse } from "next/server";

const MAX_LENGTH = 200;

/**
 * TEMPORARY PROOF-OF-CONCEPT — executes the model's check_answer tool call.
 * A deterministic, guaranteed-consistent comparison so the AI doesn't have
 * to do arithmetic or string-matching itself (and risk an occasional slip
 * on multi-digit arithmetic, or judging a Sinhala phrase inconsistently
 * turn to turn) — the model supplies both the expected value (computed or
 * known from the lesson data) and the child's spoken answer. Not aware of
 * the board or lesson data at all; purely a normalize-and-compare utility.
 * See src/data/lessons/lesson1-numbers.ts's module doc for the full list
 * of what to remove alongside this route.
 */

// Real numbers in this lesson are sometimes written with a thousands
// separator space (e.g. "10 000", matching the source textbook's own
// formatting) — strip whitespace/commas before comparing so that
// formatting alone never counts as a wrong answer.
function normalize(value: string | number): string {
  return String(value).replace(/[\s,]/g, "").toLowerCase();
}

export async function POST(request: NextRequest) {
  const { expected, given } = await request.json();

  for (const [name, value] of [
    ["expected", expected],
    ["given", given],
  ] as const) {
    if ((typeof value !== "string" && typeof value !== "number") || String(value).length > MAX_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `${name} (string or number, max ${MAX_LENGTH} chars) is required` },
        { status: 400 },
      );
    }
  }

  const correct = normalize(expected) === normalize(given);
  return NextResponse.json({ ok: true, correct, expected });
}
