import { NextRequest, NextResponse } from "next/server";

const MAX_FIELD_LENGTH = 40;
const MAX_VALUE_LENGTH = 100;

/**
 * TEMPORARY PROOF-OF-CONCEPT — executes the model's submit_blank_answer
 * tool call. This is a view-only patch, not new content — like
 * zoom-to-region/route.ts, it doesn't know what's currently on the board
 * (stateless, no session), so it returns a `viewPatch` for
 * useGeminiLive.ts to merge into the current lesson_step board (turning
 * that one blank from a dashed placeholder into a filled, confirmed cell).
 * `step_number` is included so useGeminiLive.ts can guard against patching
 * the wrong step's board if a stray/late call arrives after the child has
 * already moved on. See src/data/lessons/lesson1-numbers.ts's module doc
 * for the full list of what to remove alongside this route.
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
      // source "child": this records an answer the child gave. Zara writing
      // a value herself while demonstrating goes through reveal_answer
      // instead, which tags it "tutor" so the board shows who wrote what.
      filledAnswer: { rowIndex: row_index, field, value, source: "child" },
    },
  });
}
