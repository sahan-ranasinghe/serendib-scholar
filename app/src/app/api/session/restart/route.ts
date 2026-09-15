import { NextRequest, NextResponse } from "next/server";
import { requireChild } from "@/lib/requireChild";
import { loadScript, restartSession } from "@/lib/sessionRows";

/**
 * "මුල ඉඳන් ආයෙත්" — restart one packed session: its session_log rows for
 * this child are removed (the sitting replays from its first beat);
 * child_progress, the mastery record, is kept.
 */
export async function POST(request: NextRequest) {
  const child = await requireChild();
  if (child instanceof NextResponse) return child;
  const childId = child;
  const body = await request.json().catch(() => ({}));
  const lesson = Number.isInteger(body.lesson) ? body.lesson : 1;
  const session = Number.isInteger(body.session) ? body.session : -1;
  const script = await loadScript("maths", 5, lesson);
  if (!script) return NextResponse.json({ ok: false, error: "no_script" }, { status: 404 });
  if (session < 0 || session >= script.sessions.length) return NextResponse.json({ ok: false, error: "bad_session" }, { status: 400 });
  try {
    const result = await restartSession(script, childId, session);
    return NextResponse.json({ ok: true, session, ...result, first_beat: script.beats[script.sessions[session]!.firstBeat]?.id ?? null });
  } catch (error) {
    console.error("[session/restart] failed:", error);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}
