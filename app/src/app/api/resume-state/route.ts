import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";

/**
 * Where the active child left off: the beat id of the last thing they did,
 * from session_log. The client locates that id in the current lesson script
 * and resumes at the next beat (see useGeminiLive.ts) — if the script has
 * changed since and the id no longer exists, the client falls back to the
 * start, which is safe: re-teaching is cheap, skipping is not.
 */
export async function POST() {
  const { data, error } = await supabaseAdmin
    .from("session_log")
    .select("beat_id, session_id, created_at")
    .eq("child_id", getActiveChildId())
    .order("created_at", { ascending: false })
    .order("sequence", { ascending: false })
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
