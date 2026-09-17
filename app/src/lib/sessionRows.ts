import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LessonScript } from "@/lib/lessonOrchestrator";

/**
 * A packed session's footprint in session_log, and how a child resumes:
 * the FIRST session whose CLOSE_SESSION beat has not been logged is the
 * one to sit next (so restarting an earlier session replays it, and a
 * finished lesson resumes past its last session).
 */

export async function loadScript(subject = "maths", grade = 5, lesson = 1): Promise<LessonScript | null> {
  const { data } = await supabaseAdmin.from("lesson_scripts").select("script").eq("subject", subject).eq("grade", grade).eq("lesson", lesson).maybeSingle();
  return (data?.script as LessonScript | undefined) ?? null;
}

/** The beat ids of one packed session (0-based index). */
export function sessionBeatIds(script: LessonScript, index: number): string[] {
  const session = script.sessions[index];
  if (!session) return [];
  // The lesson's framing (the opening) sits before the first packed session's first beat: it belongs to session 1 here,
  // so a child who left during the opening resumes there, not at beat 0.
  const first = index === 0 ? 0 : session.firstBeat;
  return script.beats.slice(first, session.lastBeat + 1).map((b) => b.id);
}

/** The close beat of one packed session, if the packer gave it one. */
export function sessionCloseBeatId(script: LessonScript, index: number): string | null {
  const session = script.sessions[index];
  if (!session) return null;
  return script.beats.slice(session.firstBeat, session.lastBeat + 1).find((b) => b.type === "CLOSE_SESSION")?.id ?? null;
}

/** The child's logged CLOSE_SESSION beat ids. */
export async function closedBeatIds(childId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin.from("session_log").select("beat_id").eq("child_id", childId).eq("beat_type", "CLOSE_SESSION").limit(2000);
  return new Set((data ?? []).map((r) => r.beat_id as string));
}

/**
 * Where this child resumes: the FIRST packed session with no logged close.
 * Within it, the anchor is the last beat of that session the child actually
 * finished — ⏹ leaves without closing anything and never logs the beat it
 * interrupted, so the child comes back to the very beat they were on.
 * With nothing logged in that session yet, the anchor is the previous
 * session's close (or null: start from the very beginning).
 *
 * The runtime starts at the beat AFTER the anchor (useLessonRuntime).
 */
export async function resumeAnchor(script: LessonScript, childId: string): Promise<{ sessionIndex: number; lastBeatId: string | null; finished: boolean }> {
  const closed = await closedBeatIds(childId);
  for (let i = 0; i < script.sessions.length; i += 1) {
    const close = sessionCloseBeatId(script, i);
    if (close && closed.has(close)) continue;
    const inSession = new Set(sessionBeatIds(script, i));
    const { data } = await supabaseAdmin
      .from("session_log")
      .select("beat_id, created_at")
      .eq("child_id", childId)
      .order("created_at", { ascending: false })
      .limit(500);
    const lastInSession = (data ?? []).find((row) => inSession.has(row.beat_id as string))?.beat_id as string | undefined;
    if (lastInSession) return { sessionIndex: i, lastBeatId: lastInSession, finished: false };
    return { sessionIndex: i, lastBeatId: i > 0 ? sessionCloseBeatId(script, i - 1) : null, finished: false };
  }
  const last = script.sessions.length - 1;
  return { sessionIndex: last, lastBeatId: sessionCloseBeatId(script, last), finished: true };
}

/**
 * Restart one packed session for a child: every sitting (session_id) that
 * logged a beat of that session is deleted from session_log — the sitting's
 * recap rows go with it — and child_progress (mastery) is left alone.
 */
export async function restartSession(script: LessonScript, childId: string, index: number): Promise<{ sittings: number; rows: number }> {
  const ids = sessionBeatIds(script, index);
  if (ids.length === 0) return { sittings: 0, rows: 0 };
  const { data } = await supabaseAdmin.from("session_log").select("session_id").eq("child_id", childId).in("beat_id", ids).limit(5000);
  const sittings = [...new Set((data ?? []).map((r) => r.session_id as string))];
  if (sittings.length === 0) return { sittings: 0, rows: 0 };
  const { error, count } = await supabaseAdmin.from("session_log").delete({ count: "exact" }).eq("child_id", childId).in("session_id", sittings);
  if (error) throw new Error(error.message);
  return { sittings: sittings.length, rows: count ?? 0 };
}
