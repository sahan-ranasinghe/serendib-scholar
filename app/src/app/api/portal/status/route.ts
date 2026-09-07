import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { parseAuthoredScript } from "@/lib/authoredScript";
import { authoredPath } from "@/lib/buildLessonScript";
import { listLines, listTakes } from "@/lib/actorStore";

/**
 * Progress, for the person who is not in the room.
 *
 * The actor records remotely; this is how her work can be followed without
 * interrupting her to ask. Counts, minutes, per-concept coverage, and
 * every line she flagged with a note — which is the part that actually
 * needs answering.
 */
export async function GET() {
  const file = parseAuthoredScript(await readFile(authoredPath("maths", 5, 1), "utf8").catch(() => null));
  const [takes, lines] = await Promise.all([listTakes(), listLines()]);

  const beats = file?.beats ?? [];
  const takeByBeat = new Map(takes.map((take) => [take.beat_id, take]));
  const savedFor = (id: string) => takeByBeat.get(id)?.status === "saved";

  const byConcept = new Map<string, { total: number; done: number }>();
  for (const beat of beats) {
    const entry = byConcept.get(beat.conceptTag) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (savedFor(beat.id)) entry.done += 1;
    byConcept.set(beat.conceptTag, entry);
  }

  const savedTakes = takes.filter((take) => take.status === "saved");
  const totalMs = savedTakes.reduce((sum, take) => sum + (take.duration_ms ?? 0), 0);

  return NextResponse.json({
    ok: true,
    total: beats.length,
    recorded: beats.filter((beat) => savedFor(beat.id)).length,
    remaining: beats.filter((beat) => !savedFor(beat.id)).length,
    pending: takes.filter((take) => take.status === "pending_processing").length,
    failed: takes.filter((take) => take.status === "failed").length,
    minutes: Math.round((totalMs / 60000) * 10) / 10,
    byConcept: [...byConcept.entries()].map(([concept, counts]) => ({ concept, ...counts })),
    notes: lines
      .filter((line) => line.note)
      .map((line) => ({
        beatId: line.beat_id,
        note: line.note,
        status: line.status,
        actorText: line.actor_text,
        originalText: line.original_text,
        updatedAt: line.updated_at,
      })),
    rewordings: lines.filter((line) => line.actor_text).length,
  });
}
