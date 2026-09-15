import { NextRequest, NextResponse } from "next/server";
import { getActiveChildId } from "@/lib/activeChild";
import { loadScript, resumeAnchor } from "@/lib/sessionRows";

/**
 * Where the active child left off: the FIRST packed session whose
 * CLOSE_SESSION beat is not in session_log (src/lib/sessionRows.ts). The
 * anchor returned is the previous session's close beat; the client resumes
 * at the beat after it. A restarted session (its rows removed) is therefore
 * the one that replays, even when later sessions were closed.
 *
 * Merely having rows is NOT enough to count as returning: a crashed or
 * abandoned sitting has rows but no close, and treating that as "returning"
 * is exactly how RECAP once fired in a child's very first session.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const childId = await getActiveChildId();
  const script = await loadScript(typeof body.subject === "string" ? body.subject : "maths", Number.isInteger(body.grade) ? body.grade : 5, Number.isInteger(body.lesson) ? body.lesson : 1);
  if (!script) return NextResponse.json({ ok: true, last_beat_id: null, session_index: 0 });
  try {
    const anchor = await resumeAnchor(script, childId);
    return NextResponse.json({ ok: true, last_beat_id: anchor.lastBeatId, session_index: anchor.sessionIndex, finished: anchor.finished });
  } catch (error) {
    console.error("[resume-state] Lookup failed:", error);
    return NextResponse.json({ ok: true, last_beat_id: null, session_index: 0 });
  }
}
