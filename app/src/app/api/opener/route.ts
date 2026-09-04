import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";

/**
 * Picks the BREAK_CHAT question — context-aware: each opener carries
 * conditions on time-of-day and day-type, judged from the DEVICE's local
 * clock (sent by the client), so the tutor never asks "how was school
 * today?" on a Poya morning. No repeats of the last three topics; 20% of
 * sessions skip the opener entirely; when the context is uncertain, only
 * `any`-tagged openers (which assume nothing) are used.
 */

type TimeOfDay = "morning" | "afternoon" | "evening" | "night";
type DayType = "schoolday" | "weekend" | "holiday";

interface Opener {
  id: string;
  goal: string;
  /** Absent = `any`: assumes nothing about the day. */
  when?: { timeOfDay?: TimeOfDay[]; dayType?: DayType[] };
}

/**
 * SEED DATA — Sri Lankan non-school days 2026, to be verified/extended by
 * the project owner: Poya (full-moon) days, and typical school vacation
 * ranges (April new-year break, August break, December break). Dates are
 * best-effort; treat as a starting list, not an authority.
 */
const HOLIDAYS_2026 = new Set([
  "2026-01-03", "2026-02-01", "2026-03-03", "2026-04-02", "2026-05-01",
  "2026-05-31", "2026-06-29", "2026-07-29", "2026-08-27", "2026-09-26",
  "2026-10-26", "2026-11-24", "2026-12-23",
]);
const VACATION_RANGES_2026: Array<[string, string]> = [
  ["2026-04-06", "2026-04-20"], // April / Avurudu break (approx.)
  ["2026-08-03", "2026-08-21"], // August break (approx.)
  ["2026-12-04", "2026-12-31"], // December break (approx.)
];

/** ≥4 openers MUST stay untagged (`any`) — they assume nothing about the day. */
const OPENERS: Opener[] = [
  { id: "any-day", goal: 'Open with exactly "අද දවස කොහොමද?" and chat warmly from their answer.' },
  { id: "any-did", goal: 'Open with exactly "අද මොකද කරේ?" and chat warmly from their answer.' },
  { id: "any-happy", goal: 'Open with exactly "ඔයා අද සතුටින්ද?" and chat warmly from their answer.' },
  { id: "any-food", goal: 'Open with exactly "අද කන්න මොනවද ලැබුනේ?" and chat warmly from their answer.' },
  { id: "morning-start", goal: "Ask how their morning started — breakfast, who woke them up.", when: { timeOfDay: ["morning"] } },
  { id: "weekend-fun", goal: "Ask what fun thing they're doing this weekend / did today at home.", when: { dayType: ["weekend", "holiday"] } },
  { id: "tv-cartoon", goal: "Ask if they watched anything fun lately — a cartoon, a show, a video." },
  { id: "pets-animals", goal: "Ask whether they have a pet, or what animal they'd most like to have." },
  { id: "made-something", goal: "Ask if they made or drew or built anything lately." },
];

const NO_REPEAT_WINDOW = 3;
const SKIP_PROBABILITY = 0.2;

function timeOfDayFrom(hour: number): TimeOfDay {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 20) return "evening";
  return "night";
}

function dayTypeFrom(date: string, weekday: number): DayType {
  if (HOLIDAYS_2026.has(date)) return "holiday";
  if (VACATION_RANGES_2026.some(([from, to]) => date >= from && date <= to)) return "holiday";
  if (weekday === 0 || weekday === 6) return "weekend";
  return "schoolday";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const childId = getActiveChildId();

  if (Math.random() < SKIP_PROBABILITY) {
    return NextResponse.json({ ok: true, skip: true, goal: null, topic: null });
  }

  // Device-local context; anything missing or implausible → uncertain →
  // only `any` openers.
  const hour = typeof body.local_hour === "number" && body.local_hour >= 0 && body.local_hour <= 23 ? body.local_hour : null;
  const weekday = typeof body.weekday === "number" && body.weekday >= 0 && body.weekday <= 6 ? body.weekday : null;
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const certain = hour !== null && weekday !== null && date !== null;
  const timeOfDay = certain ? timeOfDayFrom(hour) : null;
  const dayType = certain ? dayTypeFrom(date, weekday) : null;

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

  const fitsContext = (opener: Opener): boolean => {
    if (!opener.when) return true; // `any`
    if (!certain) return false; // uncertain → only `any`
    if (opener.when.timeOfDay && !opener.when.timeOfDay.includes(timeOfDay!)) return false;
    if (opener.when.dayType && !opener.when.dayType.includes(dayType!)) return false;
    return true;
  };

  const anyOpeners = OPENERS.filter((opener) => !opener.when);
  const pool: Opener[] = [
    ...OPENERS.filter(fitsContext),
    // Weighted toward the `any` set: openers that assume nothing appear
    // twice more, so most breaks are context-free by design.
    ...anyOpeners,
    ...anyOpeners,
    ...interests.slice(0, 4).map((interest) => ({
      id: `interest:${interest.toLowerCase().slice(0, 24)}`,
      goal: `They've mentioned liking ${interest} before — ask something friendly and specific about that.`,
    })),
  ];

  const available = pool.filter((opener) => !recentTopics.includes(opener.id));
  const chosen = available[Math.floor(Math.random() * available.length)] ?? OPENERS[0];

  const updatedRecent = [chosen.id, ...recentTopics].slice(0, NO_REPEAT_WINDOW).join(",");
  const { error } = await supabaseAdmin
    .from("child_profile")
    .upsert({ child_id: childId, last_opener_topic: updatedRecent }, { onConflict: "child_id" });
  if (error) console.error("[opener] Could not record opener topic:", error.message);

  return NextResponse.json({
    ok: true,
    skip: false,
    goal: chosen.goal,
    topic: chosen.id,
    context: certain ? { timeOfDay, dayType } : null,
  });
}
