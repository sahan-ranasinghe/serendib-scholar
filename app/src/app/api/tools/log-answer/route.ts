import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export async function POST(request: NextRequest) {
  const { child_id, question_id, correct, topic } = await request.json();

  if (!child_id || !question_id || typeof correct !== "boolean" || !topic) {
    return NextResponse.json(
      { error: "child_id, question_id, correct, and topic are required" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin.from("child_progress").insert({
    child_id,
    topic,
    correct,
  });

  if (error) {
    console.error("[log-answer] Supabase error:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
