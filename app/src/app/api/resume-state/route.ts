import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";

/**
 * Where the active child left off.
 *
 * A child is "returning" ONLY if they have a completed sitting behind them —
 * a CLOSE_SESSION beat in session_log. The anchor returned is that close
 * beat's id; the client resumes at the beat after it (the next session's
 * opener). Merely having rows is NOT enough: a crashed or abandoned sitting
 * (or leftover test traffic) has rows but no close, and treating that as
 * "returning" is exactly how RECAP once fired in a child's very first
 * session. No completed close → start from the beginning.
 *
 * If the anchor id no longer exists in the current script, the client falls
 * back to the start — re-teaching is cheap, skipping is not.
 */
export async function POST() {
  const { data, error } = await supabaseAdmin
    .from("session_log")
    .select("beat_id, session_id, created_at")
    .eq("child_id", getActiveChildId())
    .eq("beat_type", "CLOSE_SESSION")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[resume-state] Lookup failed:", error.message);
    return NextResponse.json({ ok: true, last_beat_id: null });
  }
  return NextResponse.json({
    ok: true,
    last_beat_id: data?.beat_id ?? null,
    last_session_id: data?.session_id ?? null,
  });
}
