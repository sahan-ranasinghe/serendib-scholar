import { NextRequest, NextResponse } from "next/server";

const MAX_FIELD_LENGTH = 40;
const MAX_VALUE_LENGTH = 100;

/**
 * TEMPORARY PROOF-OF-CONCEPT — executes the model's reveal_answer tool call:
 * Zara filling a blank in HERSELF while explaining that part, without the
 * child having answered.
 *
 * This is the demonstrating half of the teaching flow, and is deliberately
 * separate from submit_blank_answer (which records something the child got
 * right). Both produce a filled cell via the same `filledAnswers` state, but
 * this one is tagged source "tutor" so the board renders it distinctly — the
 * child can always tell which answers are hers and which are theirs.
 *
 * A view-only patch, like submit_blank_answer — see zoom-to-region/route.ts
 * for why these return a viewPatch rather than a full board, and
 * src/data/lessons/lesson1-numbers.ts's module doc for the full list of what
 * to remove alongside this route.
 */
export async function POST(request: NextRequest) {
  const { step_number, row_index, field, value } = await request.json();

  if (typeof step_number !== "number" || !Number.isInteger(step_number)) {
    return NextResponse.json({ ok: false, error: "step_number (integer) is required" }, { status: 400 });
  }
  if (typeof row_index !== "number" || !Number.isInteger(row_index) || row_index < 0) {
    return NextResponse.json({ ok: false, error: "row_index (non-negative integer) is required" }, { status: 400 });
  }
  if (typeof field !== "string" || !field.trim() || field.length > MAX_FIELD_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `field (non-empty string, max ${MAX_FIELD_LENGTH} chars) is required` },
      { status: 400 },
    );
  }
  if ((typeof value !== "string" && typeof value !== "number") || String(value).length > MAX_VALUE_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `value (string or number, max ${MAX_VALUE_LENGTH} chars) is required` },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    viewPatch: {
      expectedStepNumber: step_number,
      filledAnswer: { rowIndex: row_index, field, value, source: "tutor" },
    },
  });
}
