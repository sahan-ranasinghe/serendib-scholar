import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { parseAuthoredScript, type AuthoredBeat } from "@/lib/authoredScript";
import { authoredPath } from "@/lib/buildLessonScript";
import { AUTHORED_LINES } from "@/lib/authoredLines";
import { resolveAddress } from "@/lib/addressToken";
import { clipKey } from "@/lib/audioCache";
import { ZARA_VOICE } from "@/lib/zaraVoice";
import { listLines, listTakes } from "@/lib/actorStore";

/**
 * Everything the portal needs to draw a whole session, in one request.
 *
 * The actor's page must survive a reload mid-session with nothing lost, so
 * it holds no durable state of its own: it asks for this and redraws. That
 * means the response has to carry her takes and her notes alongside the
 * script, not just the lines.
 *
 * Text is delivered ADDRESS-RESOLVED. She reads what the child hears
 * ("පුතේ", never "{address}"), and the clip key is the hash of exactly
 * those words — the same key the AI clip for that line would have, which
 * is what lets the runtime prefer her recording without knowing the portal
 * exists.
 *
 * Proxy-gated by the portal cookie (src/proxy.ts); no child session is
 * involved, and none is accepted.
 */

/**
 * A beat with two authored responses is presented as two consecutive
 * lines, so she records the pair in one pass instead of meeting the second
 * half an hour later in a different mood.
 */
function branchLines(beat: AuthoredBeat): Array<{ suffix: string; label: string; text: string }> {
  if (beat.type !== "ASK" && beat.type !== "CHECK_MY_WORK") return [];
  const praise = AUTHORED_LINES.feedbackCorrect?.[0];
  const miss = AUTHORED_LINES.feedbackWrong?.[0];
  const branches: Array<{ suffix: string; label: string; text: string }> = [];
  if (typeof praise === "string") branches.push({ suffix: ":right", label: "if right", text: praise });
  if (typeof miss === "string") branches.push({ suffix: ":wrong", label: "if wrong", text: miss });
  return branches;
}

export async function GET() {
  const file = parseAuthoredScript(await readFile(authoredPath("maths", 5, 1), "utf8").catch(() => null));
  if (!file) {
    return NextResponse.json({ ok: true, lines: [], note: "Nothing authored yet — run npm run author:script." });
  }

  const [takes, notes] = await Promise.all([listTakes(), listLines()]);
  const takeByBeat = new Map(takes.map((take) => [take.beat_id, take]));
  const lineByBeat = new Map(notes.map((line) => [line.beat_id, line]));

  const lines = file.beats.flatMap((beat) => {
    const rows: Array<Record<string, unknown>> = [];
    const push = (id: string, text: string, label: string | null) => {
      const resolved = resolveAddress(text, "unspecified");
      const take = takeByBeat.get(id);
      const line = lineByBeat.get(id);
      rows.push({
        id,
        beatId: beat.id,
        branchLabel: label,
        concept: beat.conceptTag,
        type: beat.type,
        pauseType: beat.pauseType,
        text: resolved,
        // Her wording, once a human has accepted it, is what she now reads.
        canonicalText: line?.status === "accepted" && line.actor_text ? line.actor_text : resolved,
        numbers: beat.numbers ?? [],
        expectedAnswer: beat.expectedAnswer ?? null,
        clipKey: clipKey(resolved, ZARA_VOICE),
        note: line?.note ?? null,
        lineStatus: line?.status ?? null,
        actorText: line?.actor_text ?? null,
        take: take
          ? {
              status: take.status,
              durationMs: take.duration_ms,
              clipKey: take.clip_key,
              trimStartMs: take.trim_start_ms,
              trimEndMs: take.trim_end_ms,
              sentences: take.sentences,
              peakDbfs: take.peak_dbfs,
            }
          : null,
      });
    };
    push(beat.id, beat.spokenText, null);
    for (const branch of branchLines(beat)) push(`${beat.id}${branch.suffix}`, branch.text, branch.label);
    return rows;
  });

  return NextResponse.json({
    ok: true,
    approved: file.approved,
    lesson: `${file.subject}-${file.grade}-${file.lesson}`,
    concepts: file.concepts,
    lines,
  });
}
