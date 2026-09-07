/**
 * Fold the actor's accepted wording into the authored script.
 *
 *   npm run portal:export-lines            # show what would change
 *   npm run portal:export-lines -- --write # take it
 *
 * Her re-wordings live in `actor_lines` so they survive a deploy and take
 * effect immediately (buildLessonScript overlays them). This script is the
 * separate, deliberate step of making them PERMANENT: it rewrites
 * src/data/lessons/authored/maths-5-1.json so the words are in the repo,
 * in the review doc, and in the diff a human reads.
 *
 * Kept manual on purpose. An accepted line has passed the number check and
 * the intent check, which is enough to put it in front of a child today —
 * but not enough to silently rewrite the reviewed script without anyone
 * seeing the change.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseAuthoredScript } from "../src/lib/authoredScript";
import { renderNumberMarkers } from "../src/lib/sinhalaNumber";

const WRITE = process.argv.includes("--write");
const SCRIPT_PATH = path.join(process.cwd(), "src/data/lessons/authored/maths-5-1.json");

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("actor_lines")
    .select("beat_id,original_text,actor_text,note,status,updated_at")
    .order("updated_at", { ascending: true });
  if (error) throw new Error(`actor_lines read failed: ${error.message}`);

  const rows = data ?? [];
  const accepted = rows.filter((row) => row.status === "accepted" && row.actor_text);
  const rejected = rows.filter((row) => row.status === "rejected");
  const notes = rows.filter((row) => row.note);

  const file = parseAuthoredScript(await readFile(SCRIPT_PATH, "utf8"));
  if (!file) throw new Error("Could not read the authored script.");
  const byId = new Map(file.beats.map((beat) => [beat.id, beat]));

  console.log(`\nACCEPTED RE-WORDINGS — ${accepted.length}\n${"=".repeat(70)}`);
  let applied = 0;
  for (const row of accepted) {
    const beat = byId.get(row.beat_id);
    if (!beat) {
      console.log(`  SKIP ${row.beat_id} — no such beat in the authored script.`);
      continue;
    }
    if (beat.spokenText === row.actor_text) continue;
    console.log(`\n  ${row.beat_id}`);
    console.log(`    was: ${beat.spokenText}`);
    console.log(`    now: ${row.actor_text}`);
    if (WRITE) {
      // Her transcript is final spoken Sinhala with no markers left in it;
      // sourceText follows so a later re-render cannot resurrect the old
      // words. The numbers were already verified against sinhalaNumberName
      // by the portal before this row was ever marked accepted.
      beat.spokenText = row.actor_text as string;
      beat.sourceText = row.actor_text as string;
      beat.numbers = renderNumberMarkers(row.actor_text as string).numbers;
      beat.actorRecorded = true;
      beat.humanEdited = true;
      applied += 1;
    }
  }

  if (rejected.length > 0) {
    console.log(`\nREJECTED (not applied) — ${rejected.length}\n${"=".repeat(70)}`);
    for (const row of rejected) console.log(`  ${row.beat_id}: ${row.actor_text?.slice(0, 90)}`);
  }

  if (notes.length > 0) {
    console.log(`\nHER NOTES — ${notes.length}\n${"=".repeat(70)}`);
    for (const row of notes) console.log(`  ${row.beat_id}: ${row.note}`);
  }

  if (!WRITE) {
    console.log(`\n(dry run — pass --write to apply ${accepted.length} accepted line(s))`);
    return;
  }
  await writeFile(SCRIPT_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${applied} line(s) into ${path.relative(process.cwd(), SCRIPT_PATH)}.`);
  console.log("Re-run npm run apply:review-edits to refresh the review doc.");
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
