import { NextRequest, NextResponse } from "next/server";

const MAX_ITEM_ID_LENGTH = 64;
const MAX_FIELD_LENGTH = 40;

/**
 * TEMPORARY PROOF-OF-CONCEPT — executes the model's set_active_blank tool
 * call. A view-only patch (see zoom-to-region/route.ts for why) marking
 * which specific blank the AI is currently asking the child about, so the
 * board can visually highlight that one row/cell distinctly from other
 * still-blank cells — separate from and prior to submit_blank_answer's
 * "this one is now confirmed correct" state. See
 * src/data/lessons/lesson1-numbers.ts's module doc for the full list of
 * what to remove alongside this route.
 */
export async function POST(request: NextRequest) {
  const { item_id, row_index, field } = await request.json();

  if (typeof item_id !== "string" || !item_id.trim() || item_id.length > MAX_ITEM_ID_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `item_id (non-empty string, max ${MAX_ITEM_ID_LENGTH} chars) is required` },
      { status: 400 },
    );
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

  return NextResponse.json({
    ok: true,
    viewPatch: { expectedItemId: item_id, activeBlank: { rowIndex: row_index, field } },
  });
}
