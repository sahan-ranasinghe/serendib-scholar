/**
 * children.avatar: display names → stable ids (src/lib/avatars.ts).
 *
 *   npm run migrate:avatars            what would change (writes nothing)
 *   npm run migrate:avatars -- --apply rewrite them
 *
 * A row already holding an id is left alone; a legacy display name (Sinhala or its English gloss) becomes its id; any
 * other value is reported and left for a person to decide. Prints counts and ids only — never a child's name.
 * Idempotent: a second --apply changes nothing. The app reads both forms (avatarIdOf), so this can run at any time.
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { avatarIdOf, isAvatarId } from "../src/lib/avatars";

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const { data, error } = await supabaseAdmin.from("children").select("id, avatar");
  if (error) throw new Error(`children read failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; avatar: string | null }>;
  const alreadyIds = rows.filter((r) => isAvatarId(r.avatar));
  const empty = rows.filter((r) => r.avatar === null || r.avatar === "");
  const toMigrate = rows.filter((r) => !isAvatarId(r.avatar) && avatarIdOf(r.avatar) !== null);
  const unknown = rows.filter((r) => r.avatar && !isAvatarId(r.avatar) && avatarIdOf(r.avatar) === null);
  console.log(`children: ${rows.length} · already an id ${alreadyIds.length} · no avatar ${empty.length} · display name → id ${toMigrate.length} · unrecognised ${unknown.length}`);
  const byId = new Map<string, number>();
  for (const r of toMigrate) byId.set(avatarIdOf(r.avatar)!, (byId.get(avatarIdOf(r.avatar)!) ?? 0) + 1);
  if (byId.size) console.log(`  to rewrite: ${[...byId.entries()].map(([id, n]) => `${id} ×${n}`).join(", ")}`);
  for (const r of unknown) console.log(`  unrecognised avatar on child ${r.id} (left as it is)`);
  if (!APPLY) {
    console.log(toMigrate.length ? "dry run — nothing written (add --apply)" : "nothing to migrate");
    return;
  }
  let written = 0;
  for (const r of toMigrate) {
    const { error: updateError } = await supabaseAdmin.from("children").update({ avatar: avatarIdOf(r.avatar) }).eq("id", r.id).eq("avatar", r.avatar!);
    if (updateError) console.error(`  child ${r.id}: ${updateError.message}`);
    else written += 1;
  }
  console.log(`applied: ${written} of ${toMigrate.length} rewritten`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
