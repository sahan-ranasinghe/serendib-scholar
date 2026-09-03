import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";
import { blanksForItem, solutionForItem, describeItem } from "@/lib/lessonBlanks";
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

const RECAP_QUESTIONS = 3;

interface RecapCandidate {
  conceptTag: string;
  attempts: number;
  correct: number;
}

export async function POST(request: NextRequest) {
  const { exclude_session_id, concept_tags } = await request.json();
  const childId = getActiveChildId();

  // Which concepts count as "last time".
  let tags: string[] = Array.isArray(concept_tags) ? concept_tags.filter((t) => typeof t === "string") : [];
  if (tags.length === 0) {
    let query = supabaseAdmin
      .from("session_log")
      .select("session_id, concept_tag, created_at")
      .eq("child_id", childId)
      .not("concept_tag", "is", null)
      .neq("concept_tag", "")
      .order("created_at", { ascending: false })
      .limit(200);
    if (typeof exclude_session_id === "string" && exclude_session_id) {
      query = query.neq("session_id", exclude_session_id);
    }
    const { data, error } = await query;
    if (error) {
      console.error("[recap] session_log lookup failed:", error.message);
      return NextResponse.json({ ok: true, beats: [] });
    }
    const lastSession = data?.[0]?.session_id;
    tags = lastSession
      ? [...new Set((data ?? []).filter((row) => row.session_id === lastSession).map((row) => row.concept_tag as string))]
      : [];
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
    .slice(0, RECAP_QUESTIONS);

  // One verified, askable item per chosen concept.
  const beats: Beat[] = [];
  for (const candidate of chosen) {
    const { data: items } = await supabaseAdmin
      .from("content_bank")
      .select("id, concept_tag, component_type, component_props, answer")
      .eq("concept_tag", candidate.conceptTag)
      .eq("verified", true)
      .neq("component_type", "explanation")
      .limit(20);
    const askable = (items ?? [])
      .map((item) => ({
        item,
        blank: blanksForItem(item.component_type, item.component_props, item.answer).find((b) => b.value !== null),
        solution: solutionForItem(item.answer),
      }))
      .filter((entry) => entry.blank || entry.solution);
    if (askable.length === 0) continue;
    const pick = askable[Math.floor(Math.random() * askable.length)];
    const description = describeItem(pick.item.component_type, pick.item.component_props);

    beats.push({
      id: `recap:${candidate.conceptTag}:${pick.item.id.slice(0, 8)}`,
      type: "ASK",
      conceptTag: candidate.conceptTag,
      sessionIndex: -1, // runtime-inserted; never part of the scripted plan
      mode: 3,
      itemId: pick.item.id,
      segmentIndex: -1,
      goal: pick.blank
        ? `Quick review from last time: ask the child for ${pick.blank.label}. Ask only this one thing.`
        : "Quick review from last time: ask the child for the answer to this one.",
      maxSentences: 2,
      boardDescription: description,
      board: pick.blank
        ? { kind: "stage_item", itemId: pick.item.id }
        : { kind: "stage_item", itemId: pick.item.id },
      expectedAnswer: pick.blank ? (pick.blank.value as string) : (pick.solution as string),
      endBy: "asking",
    });
  }

  return NextResponse.json({ ok: true, beats });
}
