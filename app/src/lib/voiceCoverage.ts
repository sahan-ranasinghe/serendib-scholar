/**
 * THE VOICE COVERAGE — one count, used everywhere (29 Sep 2026, docs/cms/content-inventory.md §16): the portal's
 * line list, /portal/status, `npm run portal:coverage` and the dry run's VOICE COVERAGE all call `coverageOf`. It
 * used to be computed three ways that disagreed (about 343 rows, 167 beats, 167 texts); now it is DISTINCT CLIPS —
 * one per distinct line the runtime can speak (src/lib/spokenLines.ts) — needed against present, by group.
 *
 *   recorded  her clip is in storage (human shelf)
 *   approved  … and a reviewer approved the take (actor_takes.status = 'approved'); only these are served when
 *             VOICE_PROFILE=human
 *   ai        the AI voice's clip is in storage (the fallback)
 */
// Deliberately NOT "server-only": the dry run and scripts/voice-coverage.ts
// import this from the CLI, where server-only throws. The real boundary is
// the service-role client it reaches Storage through, which is server-side
// by construction.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AUDIO_BUCKET, clipKey, clipPath } from "@/lib/audioCache";
import { humanClipPath } from "@/lib/humanClips";
import { ZARA_VOICE } from "@/lib/zaraVoice";
import { SPOKEN_GROUPS, type SpokenGroup } from "@/lib/spokenLines";

export interface VoiceShelf {
  human: Set<string>;
  approved: Set<string>;
  ai: Set<string>;
}

export interface CoverageGroup {
  group: SpokenGroup;
  needed: number;
  recorded: number;
  approved: number;
  ai: number;
}

export interface VoiceCoverage {
  needed: number;
  recorded: number;
  approved: number;
  ai: number;
  groups: CoverageGroup[];
  /** Lines with no approved recording of hers yet, in the portal's order. */
  missing: Array<{ id: string; group: SpokenGroup; text: string; recorded: boolean }>;
}

/** Distinct clips needed (one per distinct line) against the shelf, by group. Pure. */
export function coverageOf(lines: Array<{ id: string; group: SpokenGroup; text: string }>, shelf: VoiceShelf, voice = ZARA_VOICE): VoiceCoverage {
  const seen = new Set<string>();
  const rows = lines.flatMap((line) => {
    const key = clipKey(line.text, voice);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...line, key, recorded: shelf.human.has(key), approved: shelf.human.has(key) && shelf.approved.has(key), ai: shelf.ai.has(key) }];
  });
  const count = (list: typeof rows) => ({
    needed: list.length,
    recorded: list.filter((r) => r.recorded).length,
    approved: list.filter((r) => r.approved).length,
    ai: list.filter((r) => r.ai).length,
  });
  return {
    ...count(rows),
    groups: SPOKEN_GROUPS.map((group) => ({ group, ...count(rows.filter((r) => r.group === group)) })).filter((g) => g.needed > 0),
    missing: rows.filter((r) => !r.approved).map(({ id, group, text, recorded }) => ({ id, group, text, recorded })),
  };
}

async function keysUnder(prefix: string): Promise<Set<string>> {
  const found = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).list(prefix, { limit: 1000, offset: page * 1000 });
    if (error || !data || data.length === 0) break;
    for (const entry of data) {
      const match = /^([0-9a-f]{16,64})\.wav$/u.exec(entry.name);
      if (match) found.add(match[1]!);
    }
    if (data.length < 1000) break;
  }
  return found;
}

/** The shelf as it is: her clips and the AI clips in storage, and the clip keys of approved takes. */
export async function voiceShelf(): Promise<VoiceShelf> {
  const [human, ai, approvedRows] = await Promise.all([
    keysUnder(humanClipPath("x").split("/").slice(0, -1).join("/")),
    keysUnder(clipPath("x").split("/").slice(0, -1).join("/")),
    supabaseAdmin.from("actor_takes").select("clip_key").eq("status", "approved"),
  ]);
  const approved = new Set(((approvedRows.data ?? []) as Array<{ clip_key: string | null }>).flatMap((r) => (r.clip_key ? [r.clip_key] : [])));
  return { human, approved, ai };
}

export function formatCoverage(coverage: VoiceCoverage, profile: string): string {
  const out: string[] = [];
  const pct = (n: number, of: number) => `${Math.round((n / Math.max(1, of)) * 100)}%`;
  out.push(`  VOICE_PROFILE=${profile} · distinct clips needed ${coverage.needed}`);
  out.push(`  hers, recorded ${coverage.recorded} (${pct(coverage.recorded, coverage.needed)}) · approved ${coverage.approved} (${pct(coverage.approved, coverage.needed)}) · AI ${coverage.ai} (${pct(coverage.ai, coverage.needed)})`);
  for (const g of coverage.groups) out.push(`    ${g.group.padEnd(16)} needed ${String(g.needed).padStart(4)} · recorded ${String(g.recorded).padStart(4)} · approved ${String(g.approved).padStart(4)} · AI ${String(g.ai).padStart(4)}`);
  const unrecorded = coverage.missing.filter((m) => !m.recorded);
  if (unrecorded.length > 0) out.push(`  not yet recorded: ${unrecorded.length} (first: ${unrecorded.slice(0, 3).map((m) => `${m.id} "${m.text.slice(0, 30)}"`).join(" · ")})`);
  const awaiting = coverage.missing.filter((m) => m.recorded);
  if (awaiting.length > 0) out.push(`  recorded, awaiting approval: ${awaiting.length}`);
  return out.join("\n");
}
