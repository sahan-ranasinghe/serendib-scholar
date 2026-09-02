import { NextResponse } from "next/server";
import type { BoardContent } from "@/lib/board";

/** Executes the model's clear_board tool call — clears whatever is currently shown. */
export async function POST() {
  const board: BoardContent = { type: "empty" };
  return NextResponse.json({ ok: true, board });
}
