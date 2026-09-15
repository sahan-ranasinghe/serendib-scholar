import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireChild } from "@/lib/requireChild";

/**
 * The debug overlay's "reset this child" (DEV_MODE only): wipes the active
 * child's session_log, child_progress and child_profile rows so a test run
 * starts as a genuinely new child — what scripts/reset-child.ts does from
 * a laptop, reachable from the phone. Refused outright unless DEV_MODE=on.
 */
export async function POST() {
  if ((process.env.DEV_MODE ?? "").trim() !== "on") return NextResponse.json({ ok: false, error: "dev_mode_off" }, { status: 403 });
  const child = await requireChild();
  if (child instanceof NextResponse) return child;
  const childId = child;
  const deleted: Record<string, number | string> = {};
  for (const table of ["session_log", "child_progress", "child_profile"] as const) {
    const { error, count } = await supabaseAdmin.from(table).delete({ count: "exact" }).eq("child_id", childId);
    deleted[table] = error ? `error: ${error.message}` : (count ?? 0);
  }
  return NextResponse.json({ ok: true, child_id: childId, deleted });
}
