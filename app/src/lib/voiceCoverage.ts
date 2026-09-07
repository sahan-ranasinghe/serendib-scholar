/**
 * How much of the lesson is in her voice yet.
 *
 * Coverage is per PROFILE because the two profiles fail differently:
 * 'ai' is complete as soon as the batch render has run, while 'human' is
 * complete only when the actor has reached every line — and the honest
 * answer to "can we ship the human voice" is the list of lines she has
 * not got to, not a percentage.
 *
 * Keyed on the resolved text, exactly as the clip cache is, so a line she
 * re-worded counts as covered only if she recorded the words that are now
 * canonical. Editing a line after recording it correctly shows the line as
 * uncovered again, which is the truth.
 */
// Deliberately NOT "server-only": the dry run and scripts/voice-coverage.ts
// import this from the CLI, where server-only throws. The real boundary is
// the service-role client it reaches Storage through, which is server-side
// by construction.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AUDIO_BUCKET, clipKey, clipPath } from "@/lib/audioCache";
import { humanClipPath } from "@/lib/humanClips";
import { resolveAddress } from "@/lib/addressToken";
import { ZARA_VOICE } from "@/lib/zaraVoice";
import type { AuthoredScriptFile } from "@/lib/authoredScript";

export interface CoverageLine {
  beatId: string;
  concept: string;
  text: string;
  key: string;
  human: boolean;
  ai: boolean;
}

export interface VoiceCoverage {
  total: number;
  human: number;
  ai: number;
  byConcept: Array<{ concept: string; total: number; human: number; ai: number }>;
  missingHuman: CoverageLine[];
}

/**
 * One listing per prefix rather than a HEAD per line: a 112-beat lesson
 * would otherwise be 224 round trips, and this runs inside the dry run.
 */
async function keysUnder(prefix: string): Promise<Set<string>> {
  const found = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await supabaseAdmin.storage
      .from(AUDIO_BUCKET)
      .list(prefix, { limit: 1000, offset: page * 1000 });
    if (error || !data || data.length === 0) break;
    for (const entry of data) {
      const match = /^([0-9a-f]{16,64})\.wav$/u.exec(entry.name);
      if (match) found.add(match[1]!);
    }
    if (data.length < 1000) break;
  }
  return found;
}

export async function voiceCoverage(file: AuthoredScriptFile): Promise<VoiceCoverage> {
  const [humanKeys, aiKeys] = await Promise.all([
    keysUnder(humanClipPath("x").split("/").slice(0, -1).join("/")),
    keysUnder(clipPath("x").split("/").slice(0, -1).join("/")),
  ]);

  const lines: CoverageLine[] = file.beats.map((beat) => {
    const text = resolveAddress(beat.spokenText, "unspecified");
    const key = clipKey(text, ZARA_VOICE);
    return {
      beatId: beat.id,
      concept: beat.conceptTag,
      text,
      key,
      human: humanKeys.has(key),
      ai: aiKeys.has(key),
    };
  });

  const byConcept = new Map<string, { concept: string; total: number; human: number; ai: number }>();
  for (const line of lines) {
    const entry = byConcept.get(line.concept) ?? { concept: line.concept, total: 0, human: 0, ai: 0 };
    entry.total += 1;
    if (line.human) entry.human += 1;
    if (line.ai) entry.ai += 1;
    byConcept.set(line.concept, entry);
  }

  return {
    total: lines.length,
    human: lines.filter((line) => line.human).length,
    ai: lines.filter((line) => line.ai).length,
    byConcept: [...byConcept.values()],
    missingHuman: lines.filter((line) => !line.human),
  };
}

export function formatCoverage(coverage: VoiceCoverage, profile: string): string {
  const out: string[] = [];
  const pct = (n: number) => `${Math.round((n / Math.max(1, coverage.total)) * 100)}%`;
  out.push(`  VOICE_PROFILE=${profile}`);
  out.push(`  human clips: ${coverage.human}/${coverage.total} (${pct(coverage.human)})`);
  out.push(`  ai clips:    ${coverage.ai}/${coverage.total} (${pct(coverage.ai)})`);
  for (const row of coverage.byConcept) {
    out.push(`    ${row.concept.padEnd(24)} human ${String(row.human).padStart(3)}/${row.total}   ai ${String(row.ai).padStart(3)}/${row.total}`);
  }
  if (coverage.missingHuman.length > 0) {
    out.push(`  lines still missing a human clip (${coverage.missingHuman.length}):`);
    for (const line of coverage.missingHuman) {
      out.push(`    ${line.beatId.replace("authored:", "").padEnd(30)} ${line.text.slice(0, 60)}`);
    }
  }
  return out.join("\n");
}
