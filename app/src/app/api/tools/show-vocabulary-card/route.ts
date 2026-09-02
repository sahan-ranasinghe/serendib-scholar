import { NextRequest, NextResponse } from "next/server";
import type { BoardContent } from "@/lib/board";

const MAX_WORD_LENGTH = 60;
const MAX_MEANING_LENGTH = 300;
const MAX_LANGUAGE_LENGTH = 30;

/**
 * Executes the model's show_vocabulary_card tool call — displays a large
 * word card on the board when introducing or explaining a new word.
 */
export async function POST(request: NextRequest) {
  const { word, meaning, language } = await request.json();

  if (
    typeof word !== "string" ||
    !word.trim() ||
    typeof meaning !== "string" ||
    !meaning.trim() ||
    typeof language !== "string" ||
    !language.trim()
  ) {
    return NextResponse.json(
      { ok: false, error: "word, meaning, and language (all non-empty strings) are required" },
      { status: 400 },
    );
  }
  if (word.length > MAX_WORD_LENGTH || meaning.length > MAX_MEANING_LENGTH || language.length > MAX_LANGUAGE_LENGTH) {
    return NextResponse.json({ ok: false, error: "word, meaning, or language is too long" }, { status: 400 });
  }

  const board: BoardContent = { type: "vocabulary_card", word, meaning, language };
  return NextResponse.json({ ok: true, board });
}
