import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";

/**
 * Executes the model's request_teacher_review tool call — flags the session
 * for a human adult to follow up on. This should never block or alter the
 * conversation; it's a fire-and-forget safety signal.
 */
export async function POST(request: NextRequest) {
  const { reason } = await request.json();

  if (!reason) {
    return NextResponse.json(
      { error: "reason is required" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin.from("teacher_review_flags").insert({
    // See activeChild.ts — identity is resolved server-side, never client-supplied.
    child_id: getActiveChildId(),
    reason,
  });

  if (error) {
    console.error("[request-teacher-review] Supabase error:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
