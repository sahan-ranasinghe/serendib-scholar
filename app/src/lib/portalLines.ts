import "server-only";
import { buildLessonScript } from "@/lib/buildLessonScript";
import { clipKey } from "@/lib/audioCache";
import { ZARA_VOICE } from "@/lib/zaraVoice";
import { resolveAddress } from "@/lib/addressToken";
import { runtimeSpokenLines, type SpokenGroup, type SpokenLine } from "@/lib/spokenLines";
import { coverageOf, voiceShelf, type VoiceCoverage } from "@/lib/voiceCoverage";
import { listLines, listTakes, type ActorTake } from "@/lib/actorStore";

/**
 * THE VOICE ACTOR'S LINES (29 Sep 2026, docs/cms/content-inventory.md §16): one row per distinct line the runtime can
 * speak (src/lib/spokenLines.ts), grouped — the lesson she reads through, the fixed lines, the later sessions, the
 * per-question lines, the reteach lines, the number frames and the number words.
 *
 * A row's clip key is the key of the words that WILL BE SPOKEN — her accepted re-wording where there is one (the built
 * script carries it, src/lib/buildLessonScript.ts) — so a take is always stored where the runtime looks for it. It
 * used to be the original words' key while the text sent was the re-wording: a re-worded line lost its recording.
 * A row's take is found by that clip key (a line recorded under an older row id is still the same clip).
 */

export interface PortalRow {
  id: string;
  beatId: string;
  branchLabel: null;
  group: SpokenGroup;
  concept: string;
  type: string;
  pauseType: string | null;
  /** The line as written (the original words, where her re-wording was accepted). */
  text: string;
  /** What is spoken — and what she reads. */
  canonicalText: string;
  numbers: number[];
  expectedAnswer: string | null;
  clipKey: string;
  uses: number;
  note: string | null;
  lineStatus: string | null;
  actorText: string | null;
  take: {
    status: ActorTake["status"];
    durationMs: number | null;
    clipKey: string | null;
    trimStartMs: number;
    trimEndMs: number | null;
    sentences: Array<{ startMs: number; endMs: number }> | null;
    peakDbfs: number | null;
  } | null;
}

/** Every line the runtime can speak over the lesson as a child hears it (the built script, re-wordings included). */
export async function portalSpokenLines(): Promise<SpokenLine[]> {
  const { script } = await buildLessonScript("maths", 5, 1);
  return runtimeSpokenLines(script);
}

/** One line by its row id — what the take route stores a recording under (never a key the page sends). */
export async function portalLineById(id: string): Promise<{ line: SpokenLine; clipKey: string } | null> {
  const line = (await portalSpokenLines()).find((candidate) => candidate.id === id);
  return line ? { line, clipKey: clipKey(line.text, ZARA_VOICE) } : null;
}

const GROUP_TYPE: Record<SpokenGroup, string> = {
  lesson: "LESSON",
  "fixed lines": "FIXED_LINE",
  "later sessions": "LESSON",
  "per question": "PER_QUESTION",
  reteach: "RETEACH",
  "number frames": "NUMBER_FRAME",
  "number words": "NUMBER_WORD",
};

export async function portalLines(): Promise<{ lines: PortalRow[]; coverage: VoiceCoverage }> {
  const [spoken, takes, notes, shelf] = await Promise.all([portalSpokenLines(), listTakes(), listLines(), voiceShelf()]);
  const noteById = new Map(notes.map((n) => [n.beat_id, n]));
  // The newest take of each clip; one recorded under THIS row's id wins over another row's.
  const takesByKey = new Map<string, ActorTake[]>();
  for (const take of takes) if (take.clip_key) takesByKey.set(take.clip_key, [...(takesByKey.get(take.clip_key) ?? []), take]);
  const lines: PortalRow[] = spoken.map((line) => {
    const key = clipKey(line.text, ZARA_VOICE);
    const candidates = (takesByKey.get(key) ?? []).sort((a, b) => Number(b.beat_id === line.id) - Number(a.beat_id === line.id) || b.updated_at.localeCompare(a.updated_at));
    const take = candidates[0] ?? null;
    const note = noteById.get(line.id);
    const accepted = note?.status === "accepted" && note.actor_text;
    return {
      id: line.id,
      beatId: line.beat?.id ?? line.id,
      branchLabel: null,
      group: line.group,
      concept: line.beat?.conceptTag ?? line.group,
      type: line.beat?.type ?? GROUP_TYPE[line.group],
      pauseType: line.beat?.type === "SOFT_CHECK" ? "SOFT_CHECK" : line.beat?.type === "ASK" ? "ASK" : null,
      text: accepted && note.original_text ? resolveAddress(note.original_text, "unspecified") : line.text,
      canonicalText: line.text,
      numbers: [],
      expectedAnswer: line.beat?.expectedAnswer ?? null,
      clipKey: key,
      uses: line.uses,
      note: note?.note ?? null,
      lineStatus: note?.status ?? null,
      actorText: note?.actor_text ?? null,
      take: take
        ? { status: take.status, durationMs: take.duration_ms, clipKey: take.clip_key, trimStartMs: take.trim_start_ms, trimEndMs: take.trim_end_ms, sentences: take.sentences, peakDbfs: take.peak_dbfs }
        : null,
    };
  });
  return { lines, coverage: coverageOf(spoken, shelf) };
}
