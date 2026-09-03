import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";

/**
 * Appends one finished beat to session_log.
 *
 * Every beat the orchestrator runs lands here — what was on the board, the
 * exact director line, how long the model actually spoke for, what the child
 * said, and what the planner decided. That record is what the simulator
 * replays and what the parent report will later be built from, so it is
 * written even for beats where nothing interesting happened.
 *
 * Logging is best-effort by design: a failed write is logged and swallowed,
 * because losing a log row is a much smaller problem than interrupting a
 * lesson a child is in the middle of.
 */

const MAX_TEXT = 4000;

function trim(value: unknown): string | null {
  return typeof value === "string" ? value.slice(0, MAX_TEXT) : null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, sequence, beat_id, beat_type } = body;

  if (typeof session_id !== "string") {
    return NextResponse.json({ ok: false, error: "session_id is required" }, { status: 400 });
  }
  if (typeof sequence !== "number" || !Number.isInteger(sequence)) {
    return NextResponse.json({ ok: false, error: "sequence (integer) is required" }, { status: 400 });
  }
  if (typeof beat_id !== "string" || typeof beat_type !== "string") {
    return NextResponse.json({ ok: false, error: "beat_id and beat_type are required" }, { status: 400 });
  }

  // child_id is a uuid FK into `children` — resolved server-side (see
  // activeChild.ts), never trusted from the request body.
  const { error } = await supabaseAdmin.from("session_log").insert({
    session_id,
    child_id: getActiveChildId(),
    sequence,
    beat_id,
    beat_type,
    concept_tag: trim(body.concept_tag),
    mode: typeof body.mode === "number" ? body.mode : null,
    board_state: body.board_state ?? null,
    director_text: trim(body.director_text),
    output_audio_ms: typeof body.output_audio_ms === "number" ? Math.round(body.output_audio_ms) : null,
    child_transcript: trim(body.child_transcript),
    planner_decision: body.planner_decision ?? null,
    started_at: typeof body.started_at === "string" ? body.started_at : new Date().toISOString(),
    ended_at: typeof body.ended_at === "string" ? body.ended_at : null,
  });

  if (error) {
    console.error("[session-log] Insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "Log write failed" });
  }
  return NextResponse.json({ ok: true });
}
