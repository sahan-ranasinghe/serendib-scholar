import { NextRequest, NextResponse } from "next/server";

const MAX_ITEM_ID_LENGTH = 64;
const MAX_FIELD_LENGTH = 40;
const MAX_VALUE_LENGTH = 100;

/**
 * TEMPORARY PROOF-OF-CONCEPT — executes the model's submit_blank_answer
 * tool call. This is a view-only patch, not new content — like
 * zoom-to-region/route.ts, it doesn't know what's currently on the board
 * (stateless, no session), so it returns a `viewPatch` for
 * useGeminiLive.ts to merge into the current lesson_content board (turning
 * that one blank from a dashed placeholder into a filled, confirmed cell).
 * `item_id` is included so useGeminiLive.ts can guard against patching the
 * wrong item's board if a stray/late call arrives after the board has
 * already moved on to a different content bank item.
 */
export async function POST(request: NextRequest) {
  const { item_id, row_index, field, value } = await request.json();

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
  if ((typeof value !== "string" && typeof value !== "number") || String(value).length > MAX_VALUE_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `value (string or number, max ${MAX_VALUE_LENGTH} chars) is required` },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    viewPatch: {
      expectedItemId: item_id,
      // source "child": this records an answer the child gave. Zara writing
      // a value herself while demonstrating goes through reveal_answer
      // instead, which tags it "tutor" so the board shows who wrote what.
      filledAnswer: { rowIndex: row_index, field, value, source: "child" },
    },
  });
}
