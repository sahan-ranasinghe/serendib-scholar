import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { clearCookieHeader } from "@/lib/parentAuth";
import { CHILD_COOKIE } from "@/lib/activeChild";
import { SESSION_COOKIE } from "@/lib/sessionAuth";
import { parentGuard } from "../_guard";

/**
 * "ගිණුම සහ දත්ත මකන්න" — really deletes the child's rows: every table
 * keyed by child_id, the extras object, then the children row itself. The
 * device's cookies for this child are cleared with the response.
 */
export async function POST(request: NextRequest) {
  const guard = await parentGuard(request);
  if (guard instanceof NextResponse) return guard;
  const childId = guard.childId;
  const deleted: Record<string, number | string> = {};
  for (const table of ["session_log", "child_progress", "child_weaknesses", "child_profile", "teacher_review_flags", "debug_reports"] as const) {
    const { error, count } = await supabaseAdmin.from(table).delete({ count: "exact" }).eq("child_id", childId);
    deleted[table] = error ? `error: ${error.message}` : (count ?? 0);
  }
  await supabaseAdmin.storage.from("child-extras").remove([`${childId}.json`]).catch(() => undefined);
  const { error, count } = await supabaseAdmin.from("children").delete({ count: "exact" }).eq("id", childId);
  deleted.children = error ? `error: ${error.message}` : (count ?? 0);
  const response = NextResponse.json({ ok: !error, deleted });
  response.headers.append("Set-Cookie", clearCookieHeader(CHILD_COOKIE));
  response.headers.append("Set-Cookie", clearCookieHeader(SESSION_COOKIE));
  response.headers.append("Set-Cookie", clearCookieHeader("ss_parent"));
  return response;
}
