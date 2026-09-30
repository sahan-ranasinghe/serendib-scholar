import { NextResponse } from "next/server";
import { listLines, listTakes } from "@/lib/actorStore";
import { portalLines } from "@/lib/portalLines";

/**
 * Progress, for the person who is not in the room.
 *
 * The actor records remotely; this is how her work can be followed without
 * interrupting her to ask: THE voice coverage count (src/lib/voiceCoverage.ts — distinct clips needed against hers
 * recorded and approved, by group; the same number the portal, portal:coverage and the dry run show), the takes
 * waiting for a reviewer's approve / reject (only approved takes reach a child), and every line she flagged with a
 * note — which is the part that actually needs answering.
 */
export async function GET() {
  const [{ lines, coverage }, takes, notes] = await Promise.all([portalLines(), listTakes(), listLines()]);
  const kept = takes.filter((take) => take.status === "saved" || take.status === "approved");
  const totalMs = kept.reduce((sum, take) => sum + (take.duration_ms ?? 0), 0);
  const awaiting = lines.filter((line) => line.take?.status === "saved");
  return NextResponse.json({
    ok: true,
    coverage,
    pending: takes.filter((take) => take.status === "pending_processing").length,
    failed: takes.filter((take) => take.status === "failed").length,
    minutes: Math.round((totalMs / 60000) * 10) / 10,
    review: awaiting.map((line) => ({ id: line.id, group: line.group, text: line.canonicalText, clipKey: line.clipKey, durationMs: line.take?.durationMs ?? null })),
    rejected: lines.filter((line) => line.take?.status === "rejected").map((line) => ({ id: line.id, text: line.canonicalText, clipKey: line.clipKey })),
    notes: notes
      .filter((line) => line.note)
      .map((line) => ({ beatId: line.beat_id, note: line.note, status: line.status, actorText: line.actor_text, originalText: line.original_text, updatedAt: line.updated_at })),
    rewordings: notes.filter((line) => line.actor_text).length,
  });
}
