import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";

/**
 * Picks this session's CHAT_OPENER: one of a pool of twelve everyday
 * conversation starters, personalised from the child's known interests
 * where we have any, never repeating any of the last three topics used
 * with this child — the fastest way for a tutor to feel canned is to open
 * with the same "how was school?" every single day.
 *
 * 20% of sessions skip the opener entirely (`skip: true`): the runtime
 * then opens with "අද ඉක්මනට පටන් ගමුද?" and goes straight to the lesson —
 * variety includes sometimes not chatting at all.
 */

interface Opener {
  id: string;
  goal: string;
}

const OPENERS: Opener[] = [
  { id: "school-today", goal: "Ask how school was today — anything fun or annoying that happened." },
  { id: "played-today", goal: "Ask what they played or did after school today." },
  { id: "friends", goal: "Ask about their friends — who they sat with or played with today." },
  { id: "food", goal: "Ask what they ate today, and what their favourite food is." },
  { id: "weather-walk", goal: "Ask about the weather where they are and whether they went outside today." },
  { id: "family-moment", goal: "Ask what they did with their family this week — anything small and nice." },
  { id: "tv-cartoon", goal: "Ask if they watched anything fun lately — a cartoon, a show, a video." },
  { id: "pets-animals", goal: "Ask whether they have a pet, or what animal they'd most like to have." },
  { id: "weekend-plan", goal: "Ask what they're looking forward to this weekend." },
  { id: "best-thing", goal: "Ask about the best thing that happened to them this week." },
  { id: "made-something", goal: "Ask if they made or drew or built anything lately." },
  { id: "sports-games", goal: "Ask what game or sport they like playing the most these days." },
];

/** How many recent opener topics are barred from reuse. */
const NO_REPEAT_WINDOW = 3;
const SKIP_PROBABILITY = 0.2;

export async function POST() {
  const childId = getActiveChildId();

  if (Math.random() < SKIP_PROBABILITY) {
    return NextResponse.json({ ok: true, skip: true, goal: null, topic: null });
  }

  const { data: profile } = await supabaseAdmin
    .from("child_profile")
    .select("interests, last_opener_topic")
    .eq("child_id", childId)
    .maybeSingle();

  const recentTopics = (profile?.last_opener_topic ?? "")
    .split(",")
    .map((t: string) => t.trim())
    .filter(Boolean)
    .slice(0, NO_REPEAT_WINDOW);
  const interests = Array.isArray(profile?.interests)
    ? (profile!.interests as unknown[]).filter((i): i is string => typeof i === "string")
    : [];

  // An interest-based opener joins the pool when we know any — as its own
  // topic id per interest, so it too falls under the no-repeat window.
  const pool: Opener[] = [
    ...OPENERS,
    ...interests.slice(0, 4).map((interest) => ({
      id: `interest:${interest.toLowerCase().slice(0, 24)}`,
      goal: `They've mentioned liking ${interest} before — ask something friendly and specific about that.`,
    })),
  ];

  const available = pool.filter((opener) => !recentTopics.includes(opener.id));
  const chosen = available[Math.floor(Math.random() * available.length)] ?? OPENERS[0];

  // Remember it (newest first, capped) so the next sessions avoid it.
  const updatedRecent = [chosen.id, ...recentTopics].slice(0, NO_REPEAT_WINDOW).join(",");
  const { error } = await supabaseAdmin
    .from("child_profile")
    .upsert({ child_id: childId, last_opener_topic: updatedRecent }, { onConflict: "child_id" });
  if (error) console.error("[opener] Could not record opener topic:", error.message);

  return NextResponse.json({ ok: true, skip: false, goal: chosen.goal, topic: chosen.id });
}
