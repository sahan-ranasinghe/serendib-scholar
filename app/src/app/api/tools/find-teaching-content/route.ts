import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

// Fetched-then-picked rather than ordered in SQL: PostgREST has no random
// ordering, and asking for a random row via an RPC would be a schema change
// for little gain. Pulling a small candidate set and choosing from it in
// here means repeated calls for the same concept don't hand back the same
// item every time.
const CANDIDATE_POOL_SIZE = 20;

/**
 * Executes the model's find_teaching_content tool call — the tutor asking
 * the content bank for verified material to teach with, instead of making a
 * practice problem up (see prompt.ts's rule that every problem shown must
 * come from here).
 *
 * Only ever returns rows with verified=true. Rows land in the bank
 * unverified (see scripts/populate-content-bank.ts) and stay invisible to
 * this endpoint until a human has checked them, so nothing unreviewed can
 * reach a child. An empty result is a normal, expected answer — the model
 * is told to say so honestly rather than fill the gap itself.
 */
export async function POST(request: NextRequest) {
  const { concept_tag, difficulty, exclude_ids } = await request.json();

  if (typeof concept_tag !== "string" || !concept_tag.trim()) {
    return NextResponse.json({ ok: false, error: "concept_tag (non-empty string) is required" }, { status: 400 });
  }
  if (difficulty !== undefined && !["intro", "standard", "challenge"].includes(difficulty)) {
    return NextResponse.json(
      { ok: false, error: 'difficulty, if given, must be "intro", "standard" or "challenge"' },
      { status: 400 },
    );
  }
  if (exclude_ids !== undefined && (!Array.isArray(exclude_ids) || exclude_ids.some((id) => typeof id !== "string"))) {
    return NextResponse.json({ ok: false, error: "exclude_ids, if given, must be an array of id strings" }, { status: 400 });
  }

  const excluded = new Set<string>(exclude_ids ?? []);

  // Practice problems, honouring the requested difficulty.
  let problemQuery = supabaseAdmin
    .from("content_bank")
    .select("id, concept_tag, difficulty, component_type, component_props, answer, source")
    .eq("concept_tag", concept_tag)
    .eq("verified", true)
    .neq("component_type", "explanation")
    .limit(CANDIDATE_POOL_SIZE);
  if (difficulty) problemQuery = problemQuery.eq("difficulty", difficulty);

  // How the real teacher taught this concept. Fetched regardless of the
  // requested difficulty — an explanation is MODE 1 material whatever
  // difficulty of practice is being asked for alongside it.
  const explanationQuery = supabaseAdmin
    .from("content_bank")
    .select("id, concept_tag, component_type, component_props, explanation, source")
    .eq("concept_tag", concept_tag)
    .eq("verified", true)
    .eq("component_type", "explanation")
    .limit(CANDIDATE_POOL_SIZE);

  const [problemResult, explanationResult] = await Promise.all([problemQuery, explanationQuery]);
  if (problemResult.error || explanationResult.error) {
    console.error(
      "[find-teaching-content] Supabase error:",
      problemResult.error?.message ?? explanationResult.error?.message,
    );
    return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
  }

  const problems = (problemResult.data ?? []).filter((row) => !excluded.has(row.id));
  // An explanation still in the pool means this concept hasn't been
  // explained yet this session — the model excludes what it has used, so
  // "not excluded" is exactly "not yet taught" without the stateless route
  // needing to track a session.
  const explanations = (explanationResult.data ?? []).filter((row) => !excluded.has(row.id));

  const pick = <T,>(rows: T[]): T | undefined =>
    rows.length === 0 ? undefined : rows[Math.floor(Math.random() * rows.length)];
  const item = pick(problems);
  const explanation = pick(explanations);

  if (!item && !explanation) {
    // Distinguish "nothing on this concept at all" from "you've used
    // everything already", so the model can respond usefully instead of
    // just saying it found nothing.
    const exhausted = (problemResult.data ?? []).length > 0 || (explanationResult.data ?? []).length > 0;
    return NextResponse.json({
      ok: true,
      found: false,
      reason: exhausted
        ? "Every verified item for this concept and difficulty has already been used this session."
        : "No verified content bank item matches this concept and difficulty.",
    });
  }

  return NextResponse.json({
    ok: true,
    found: true,
    // Either may be absent: a concept can have an explanation but no unused
    // practice left, or vice versa.
    ...(item ? { item } : {}),
    ...(explanation ? { explanation } : {}),
    remaining: { problems: Math.max(0, problems.length - (item ? 1 : 0)), explanations: Math.max(0, explanations.length - (explanation ? 1 : 0)) },
  });
}
