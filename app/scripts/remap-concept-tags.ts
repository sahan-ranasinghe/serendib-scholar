/**
 * Re-maps every content_bank row from the old (video-derived) concept tags
 * to the new design concepts (the teacher's guide's four activities — see
 * src/lib/lessonDesign.ts).
 *
 * Textbook rows map by STEP NUMBER (exact); video rows map by their old
 * tag, with one split: placeValueBreakdown covered both 4- and 5-digit
 * material, so video rows after the 5-digit work begins (00:42:00) go to
 * placeValueTable5Digit instead of placeValue4Digit.
 *
 * Anything unmappable is REPORTED and left untouched.
 *
 *   npm run remap:concepts            # dry run (prints the plan)
 *   npm run remap:concepts -- --apply
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { videoTimestampSeconds, textbookStepNumber } from "../src/lib/conceptOrdering";
import { OLD_TAG_CONCEPT, TEXTBOOK_STEP_CONCEPT, DESIGN_CONCEPTS } from "../src/lib/lessonDesign";

const APPLY = process.argv.includes("--apply");
/** 00:42:00 — where the recorded lesson moves to 5-digit place-value work. */
const FIVE_DIGIT_FROM_SECONDS = 42 * 60;

async function main() {
  const { data, error } = await supabaseAdmin
    .from("content_bank")
    .select("id, source, concept_tag, component_type")
    .eq("subject", "maths")
    .eq("grade", 5)
    .eq("lesson", 1);
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const designTags = new Set<string>(DESIGN_CONCEPTS);
  const plan: Array<{ id: string; source: string; from: string; to: string }> = [];
  const unmapped: Array<{ id: string; source: string; concept_tag: string }> = [];
  let alreadyNew = 0;

  for (const row of rows) {
    if (designTags.has(row.concept_tag) || row.concept_tag === "lessonOpening") {
      alreadyNew += 1;
      continue;
    }
    const step = textbookStepNumber(row.source);
    let to: string | undefined;
    if (step !== null) {
      to = TEXTBOOK_STEP_CONCEPT[step];
    } else {
      const mapped = OLD_TAG_CONCEPT[row.concept_tag];
      to = mapped === "lessonOpening" ? "lessonOpening" : mapped;
      // Three old tags spanned 4- AND 5-digit material; split by when the
      // recorded lesson moved to 5-digit work.
      const seconds = videoTimestampSeconds(row.source);
      const fiveDigit = seconds !== null && seconds >= FIVE_DIGIT_FROM_SECONDS;
      if (row.concept_tag === "placeValueBreakdown") {
        to = fiveDigit ? "placeValueTable5Digit" : "placeValue4Digit";
      } else if (row.concept_tag === "numberExpansion") {
        to = fiveDigit ? "expandedForm5Digit" : "expandedForm4Digit";
      } else if (row.concept_tag === "placeValueReading") {
        to = fiveDigit ? "tenThousandsPlace" : "readWrite4Digit";
      }
    }
    if (!to) {
      unmapped.push({ id: row.id, source: row.source, concept_tag: row.concept_tag });
      continue;
    }
    plan.push({ id: row.id, source: row.source, from: row.concept_tag, to });
  }

  const byMove = new Map<string, number>();
  for (const move of plan) {
    const key = `${move.from} → ${move.to}`;
    byMove.set(key, (byMove.get(key) ?? 0) + 1);
  }
  console.log(`${rows.length} rows: ${plan.length} to re-map, ${alreadyNew} already new/framing, ${unmapped.length} unmapped.\n`);
  for (const [move, count] of [...byMove.entries()].sort()) console.log(`  ${String(count).padStart(3)}  ${move}`);
  if (unmapped.length > 0) {
    console.log("\nUNMAPPED (left untouched):");
    for (const row of unmapped) console.log(`  ${row.id} ${row.source} (${row.concept_tag})`);
  }

  if (!APPLY) {
    console.log("\nDry run — re-run with --apply to write.");
    return;
  }
  let updated = 0;
  for (const move of plan) {
    const { error: updateError } = await supabaseAdmin
      .from("content_bank")
      .update({ concept_tag: move.to })
      .eq("id", move.id);
    if (updateError) throw new Error(`update failed for ${move.id}: ${updateError.message}`);
    updated += 1;
  }
  console.log(`\nApplied: ${updated} rows re-tagged. (The lesson_scripts cache invalidates itself — the fingerprint hashes row tags.)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
