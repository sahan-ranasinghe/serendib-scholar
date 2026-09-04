import { supabaseAdmin } from "../src/lib/supabaseAdmin";
async function main(){
  const { data: reports } = await supabaseAdmin.from("debug_reports")
    .select("*").order("created_at", { ascending: false }).limit(1);
  const report = reports?.[0];
  if (!report) { console.log("NO debug_reports rows"); }
  else {
    console.log("=== debug_report", report.created_at, "===");
    console.log("PANEL:", JSON.stringify(report.panel, null, 1));
    console.log("--- recent_log (first 30 rows, newest first) ---");
    for (const r of (report.recent_log as any[]) ?? []) {
      console.log(`  #${String(r.sequence).padStart(3)} ${String(r.beat_type).padEnd(13)} ${String(r.beat_id).slice(0,46).padEnd(46)} audio=${((r.output_audio_ms??0)/1000).toFixed(1)}s ${r.child_transcript?`child="${String(r.child_transcript).slice(0,30)}"`:""}`);
    }
  }
  console.log("\n=== last 30 session_log rows (direct) ===");
  const { data: logs } = await supabaseAdmin.from("session_log")
    .select("session_id, sequence, beat_id, beat_type, output_audio_ms, child_transcript, started_at, ended_at, director_text")
    .eq("child_id", process.env.DEV_CHILD_ID!)
    .order("created_at", { ascending: false }).limit(30);
  for (const r of (logs ?? []).reverse()) {
    const dur = r.ended_at && r.started_at ? ((new Date(r.ended_at).getTime()-new Date(r.started_at).getTime())/1000).toFixed(0) : "?";
    console.log(`  ${r.session_id.slice(0,8)} #${String(r.sequence).padStart(3)} ${String(r.beat_type).padEnd(13)} ${String(r.beat_id).slice(0,44).padEnd(44)} audio=${((r.output_audio_ms??0)/1000).toFixed(1)}s wall=${dur}s${r.beat_type==="STALL"?" <<< STALL: "+String(r.director_text).slice(0,50):""}`);
  }
}
main().then(()=>process.exit(0));
