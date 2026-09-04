/**
 * One-off: copies each 3-minute segment's boardContent (what the teacher
 * had written on the board during that stretch) from the verbatim
 * extraction file into the matching content_bank explanation row's
 * `explanation` jsonb — the script builder parses it into EXPLAIN-beat
 * board actions. Merges only; verified flags and all other fields
 * untouched. Idempotent.
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import full from "../src/data/lessons/lesson1-teaching-plan-full.json";

async function main() {
  const bySegment = new Map<string, string>(
    (full as { segments: Array<{ segmentStart: string; boardContent?: string }> }).segments
      .filter((s) => typeof s.boardContent === "string" && s.boardContent.trim() !== "")
      .map((s) => [s.segmentStart, s.boardContent as string]),
  );
  const { data, error } = await supabaseAdmin
    .from("content_bank")
    .select("id, source, explanation")
    .eq("component_type", "explanation");
  if (error) throw new Error(error.message);

  let updated = 0, already = 0, noContent = 0;
  for (const row of data ?? []) {
    const start = row.source.match(/^dp-video:(\d{2}:\d{2}:\d{2})$/)?.[1];
    const boardContent = start ? bySegment.get(start) : undefined;
    if (!boardContent) { noContent += 1; continue; }
    const explanation = (row.explanation ?? {}) as Record<string, unknown>;
    if (explanation.boardContent === boardContent) { already += 1; continue; }
    const { error: updateError } = await supabaseAdmin
      .from("content_bank")
      .update({ explanation: { ...explanation, boardContent } })
      .eq("id", row.id);
    if (updateError) console.error(`  FAILED ${row.id}: ${updateError.message}`);
    else updated += 1;
  }
  console.log(`boardContent backfill: ${updated} updated, ${already} already set, ${noContent} without segment boardContent.`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
