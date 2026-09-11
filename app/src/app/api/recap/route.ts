import { NextRequest, NextResponse } from "next/server";
import { shuffleBySeed } from "@/lib/distractors";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";
import { buildRecapAskBeat, recapAskable } from "@/lib/recapBeat";
import type { Beat } from "@/lib/lessonOrchestrator";

/**
 * Builds the review questions behind a RECAP beat: 2-3 quick ASKs on the
 * concepts the child worked on last time, weakest mastery first.
 *
 * "Last time" comes from session_log (the most recent earlier session's
 * concept tags); mastery comes from child_progress (correct/total per
 * concept). Both are keyed to the server-resolved active child (see
 * activeChild.ts). The questions themselves are verified content_bank
 * items, returned as ready-made beats so the client inserts them without
 * knowing how they were chosen.
 *
 * An empty list is a normal answer: a first session, or no judged answers
 * yet. The runtime then just moves on past the RECAP intro.
 */

/**
 * Practice is MCQ only: up to five questions per concept from the verified
 * bank, each with three options from the distractor engine; every concept
 * the child worked on last time is reviewed, weakest first.
 */
const QUESTIONS_PER_CONCEPT = 5;

interface RecapCandidate {
  conceptTag: string;
  attempts: number;
  correct: number;
}

interface QuizFigure {
  number: string | null;
  /** The digit the question is about (a place-value row), when the item names one. */
  digit: string | null;
  field: string | null;
  expansion: string | null;
}

function quizFigure(entry: NonNullable<ReturnType<typeof recapAskable>>): QuizFigure {
  const props = (entry.item.component_props ?? {}) as { rows?: Array<Record<string, unknown>>; numeral?: unknown; content?: unknown };
  const row = entry.blank ? props.rows?.[entry.blank.rowIndex] : undefined;
  if (entry.item.component_type === "ExpansionExercise" && row && Array.isArray(row.parts)) {
    const blankIndex = Number(String(entry.blank?.field ?? "").replace(/^part/u, ""));
    const parts = (row.parts as unknown[]).map((p, i) => (i === blankIndex ? "▢" : p === null || p === undefined ? "▢" : String(p)));
    return { number: null, digit: null, field: null, expansion: `${String(row.prompt ?? "")} = ${parts.join(" + ")}` };
  }
  if (row && row.number !== null && row.number !== undefined) {
    return { number: String(row.number), digit: row.digit === null || row.digit === undefined ? null : String(row.digit), field: entry.blank?.field ?? null, expansion: null };
  }
  // A solution-only item (an abacus diagram, a worked example): the number it shows, asked for its name.
  if (props.numeral !== undefined) return { number: String(props.numeral), digit: null, field: "numberName", expansion: null };
  const content = Array.isArray(props.content) ? props.content.map(String).join(" ") : "";
  const inText = /(\d{1,3}(?: \d{3})+|\d{4,6})/u.exec(content)?.[1] ?? null;
  return { number: inText ? inText.replace(/\s/gu, "") : null, digit: null, field: inText ? "numberName" : null, expansion: null };
}

export async function POST(request: NextRequest) {
  const { exclude_session_id, concept_tags } = await request.json();
  const childId = await getActiveChildId();

  // Which concepts count as "last time": the most recent COMPLETED sitting
  // — one that reached its CLOSE_SESSION beat. An abandoned or crashed
  // sitting (or leftover test traffic) has rows but no close, and reviewing
  // "last time" against those is how RECAP once fired in a first session.
  let tags: string[] = Array.isArray(concept_tags) ? concept_tags.filter((t) => typeof t === "string") : [];
  if (tags.length === 0) {
    let closeQuery = supabaseAdmin
      .from("session_log")
      .select("session_id, created_at")
      .eq("child_id", childId)
      .eq("beat_type", "CLOSE_SESSION")
      .order("created_at", { ascending: false })
      .limit(1);
    if (typeof exclude_session_id === "string" && exclude_session_id) {
      closeQuery = closeQuery.neq("session_id", exclude_session_id);
    }
    const { data: closes, error: closeError } = await closeQuery;
    if (closeError) {
      console.error("[recap] session_log lookup failed:", closeError.message);
      return NextResponse.json({ ok: true, beats: [] });
    }
    const lastCompleted = closes?.[0]?.session_id;
    if (!lastCompleted) return NextResponse.json({ ok: true, beats: [] });
    const { data, error } = await supabaseAdmin
      .from("session_log")
      .select("concept_tag")
      .eq("child_id", childId)
      .eq("session_id", lastCompleted)
      .not("concept_tag", "is", null)
      .neq("concept_tag", "");
    if (error) {
      console.error("[recap] session_log lookup failed:", error.message);
      return NextResponse.json({ ok: true, beats: [] });
    }
    tags = [...new Set((data ?? []).map((row) => row.concept_tag as string))];
  }
  if (tags.length === 0) return NextResponse.json({ ok: true, beats: [] });

  // Weakest mastery first, among what was actually attempted.
  const { data: progress } = await supabaseAdmin
    .from("child_progress")
    .select("topic, correct")
    .eq("child_id", childId)
    .in("topic", tags);
  const byTag = new Map<string, RecapCandidate>();
  for (const tag of tags) byTag.set(tag, { conceptTag: tag, attempts: 0, correct: 0 });
  for (const row of progress ?? []) {
    const entry = byTag.get(row.topic);
    if (!entry) continue;
    entry.attempts += 1;
    if (row.correct) entry.correct += 1;
  }
  const chosen = [...byTag.values()]
    .sort((a, b) => {
      const masteryA = a.attempts === 0 ? 0.5 : a.correct / a.attempts;
      const masteryB = b.attempts === 0 ? 0.5 : b.correct / b.attempts;
      return masteryA - masteryB || b.attempts - a.attempts;
    })
    ;

  // Up to five verified, MCQ-askable items per chosen concept, in a
  // deterministic order per child so a repeat visit does not repeat.
  const beats: Array<Beat & { quiz: QuizFigure }> = [];
  for (const candidate of chosen) {
    const { data: items } = await supabaseAdmin
      .from("content_bank")
      .select("id, concept_tag, component_type, component_props, answer")
      .eq("concept_tag", candidate.conceptTag)
      .eq("verified", true)
      .neq("component_type", "explanation")
      .limit(40);
    const askable = (items ?? [])
      .map((item) => recapAskable(item))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (askable.length === 0) continue;
    const seen = new Set<string>();
    for (const entry of shuffleBySeed(askable, `${childId}:${candidate.conceptTag}:${candidate.attempts}`)) {
      // One question per distinct answer, so five items that all ask "6000" do not repeat.
      const key = `${entry.answerMode}:${(entry.blank?.value ?? entry.solution ?? "").toString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // What the practice quiz draws for this item: the number the blank
      // belongs to and which column is asked, or the expansion line with
      // the blank as ▢ — so the quiz page never has to parse a beat's goal.
      beats.push({ ...buildRecapAskBeat(entry), quiz: quizFigure(entry) });
      if (seen.size >= QUESTIONS_PER_CONCEPT) break;
    }
  }

  return NextResponse.json({ ok: true, beats });
}
