/**
 * Wipes the active dev child's accumulated state — session_log,
 * child_progress and child_profile rows for DEV_CHILD_ID — so a test run
 * starts as a genuinely new child instead of resuming into leftovers from
 * earlier test sessions (the exact way stale rows made RECAP fire in
 * session 1).
 *
 *   npm run reset:child
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";

async function main() {
  const childId = process.env.DEV_CHILD_ID;
  if (!childId) throw new Error("DEV_CHILD_ID is not set.");
  console.log(`Resetting state for child ${childId}…`);

  for (const table of ["session_log", "child_progress", "child_profile"] as const) {
    const { error, count } = await supabaseAdmin
      .from(table)
      .delete({ count: "exact" })
      .eq("child_id", childId);
    if (error) console.error(`  ${table}: FAILED — ${error.message}`);
    else console.log(`  ${table}: deleted ${count ?? 0} row(s)`);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
