import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";

export async function POST(request: NextRequest) {
  const { question_id, correct, topic } = await request.json();

  if (!question_id || typeof correct !== "boolean" || !topic) {
    return NextResponse.json(
      { error: "question_id, correct, and topic are required" },
      { status: 400 },
    );
  }

  // Who this is about comes from the server's own notion of the active
  // child (see activeChild.ts) — never from the request body.
  const { error } = await supabaseAdmin.from("child_progress").insert({
    child_id: getActiveChildId(),
    topic,
    correct,
  });

  if (error) {
    console.error("[log-answer] Supabase error:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
