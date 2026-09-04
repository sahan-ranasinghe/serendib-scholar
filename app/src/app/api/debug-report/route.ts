import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";

/**
 * The debug overlay's "send diagnostics": stores the panel snapshot plus
 * the child's last 30 session_log rows in debug_reports, so a phone-test
 * stall can be diagnosed after the fact without adb or screen recordings.
 */
export async function POST(request: NextRequest) {
  const { panel } = await request.json();
  const childId = getActiveChildId();
  const { data: recent } = await supabaseAdmin
    .from("session_log")
    .select("sequence, beat_id, beat_type, concept_tag, director_text, child_transcript, planner_decision, started_at, ended_at, output_audio_ms")
    .eq("child_id", childId)
    .order("created_at", { ascending: false })
    .limit(30);
  const { error } = await supabaseAdmin.from("debug_reports").insert({
    child_id: childId,
    panel: panel ?? {},
    recent_log: recent ?? [],
  });
  if (error) {
    console.error("[debug-report] Insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "Could not save the report" });
  }
  return NextResponse.json({ ok: true });
}
