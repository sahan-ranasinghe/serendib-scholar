/**
 * Prints the dev child's session_log beat trace since a given ISO time —
 * the ground truth for "did the lesson actually advance" in unattended
 * runs, and for counting STALL events.
 *
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/session-trace.ts 2026-09-04T06:00:00Z
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
async function main(){
  const sinceArg = process.argv[2];
  const { data } = await supabaseAdmin.from("session_log")
    .select("session_id, sequence, beat_id, beat_type, concept_tag, child_transcript, planner_decision, output_audio_ms, started_at")
    .eq("child_id", process.env.DEV_CHILD_ID!)
    .gte("created_at", sinceArg)
    .order("created_at", { ascending: true });
  const rows = data ?? [];
  const bySession = new Map<string, typeof rows>();
  for (const r of rows) { const a = bySession.get(r.session_id) ?? []; a.push(r); bySession.set(r.session_id, a); }
  for (const [sid, sessionRows] of bySession) {
    console.log(`session ${sid.slice(0,8)}: ${sessionRows.length} beats logged`);
    for (const r of sessionRows) {
      console.log(`  #${String(r.sequence).padStart(2)} ${String(r.beat_type).padEnd(13)} ${String(r.beat_id).slice(0,44).padEnd(44)} audio=${((r.output_audio_ms??0)/1000).toFixed(1)}s${r.beat_type==="STALL"?"  <<< STALL":""}`);
    }
  }
  const stalls = rows.filter(r=>r.beat_type==="STALL").length;
  console.log(`\ntotal beats: ${rows.length}, STALL events: ${stalls}`);
}
main().then(()=>process.exit(0));
