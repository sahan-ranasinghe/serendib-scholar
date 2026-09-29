import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveChild, getActiveChildId } from "@/lib/activeChild";
import { readChildExtras, type ChildExtras } from "@/lib/childStore";
import { conceptTitle, itemTitle } from "@/lib/choreography";
import { DAY_LETTERS, LESSON_NAMES, OUTFITS, STICKERS, STICKER_SLOTS, t } from "@/lib/appCopy";
import type { CertificateData, HomeData, LessonDetailData, LessonMapData, MapNode, NodeKind, ParentZoneData, PracticeData, ProfilesData, ProgressData, ReportData, RewardsData, SummaryData } from "@/lib/appTypes";
import type { LessonScript } from "@/lib/lessonOrchestrator";

/**
 * What the app screens show, from the database — real where a record
 * exists, and honestly empty where it does not (a placeholder is a locked
 * node, a grey sticker, an empty list; never a number that looks measured).
 *
 * Sources: `lesson_scripts` (the packed sessions and concepts), `session_log`
 * (every beat a child has sat through — minutes, streak, resume point,
 * missed questions), `child_progress` (judged answers per concept —
 * mastery, stars, stickers, certificates), `children` + the extras store
 * (name, grade, settings, PIN).
 *
 * Mastery, in one place: a concept's score is correct ÷ answered from
 * child_progress. MASTERED at ≥ 85 % with at least three answers; a lesson's
 * stars are its mastered concepts scaled to three; a mastered concept earns
 * the next sticker; the latest one has a certificate.
 */

const TZ = "Asia/Colombo";
const MASTERY_PCT = 85;
const MASTERY_MIN_ANSWERS = 3;
const GOOD_PCT = 60;
const BEST_PCT = 95;
/** The path's six slots, as the design draws them; a slot without a script is locked. */
const PATH_SLOTS: Array<{ x: number; y: number }> = [
  { x: 100, y: 160 },
  { x: 300, y: 250 },
  { x: 100, y: 360 },
  { x: 290, y: 510 },
  { x: 90, y: 640 },
  { x: 300, y: 720 },
];
/** Zara stands to the right of a left-hand node and to the left of a right-hand one (the export: node 3 at 100/360 → Zara at 150/312). */
const ZARA_OFFSET = { x: 50, y: -48 };

// --- raw rows -----------------------------------------------------------------------

interface LogRow {
  session_id: string;
  beat_id: string;
  beat_type: string;
  concept_tag: string | null;
  director_text: string | null;
  child_transcript: string | null;
  planner_decision: { understood?: boolean } | null;
  started_at: string;
  ended_at: string | null;
}

interface ProgressRow {
  topic: string;
  correct: boolean;
  timestamp: string;
}

interface Lesson {
  number: number;
  title: string;
  script: LessonScript;
}

export interface ChildState {
  id: string;
  name: string;
  grade: number;
  extras: ChildExtras;
  logs: LogRow[];
  progress: ProgressRow[];
  lessons: Lesson[];
}

async function loadLessons(): Promise<Lesson[]> {
  const { data, error } = await supabaseAdmin.from("lesson_scripts").select("lesson, script").eq("subject", "maths").eq("grade", 5).order("lesson");
  if (error) {
    console.error("[appData] lesson_scripts:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ number: Number(row.lesson), title: LESSON_NAMES[Number(row.lesson)] ?? `${t("common.lessonN", { n: row.lesson })}`, script: row.script as LessonScript }));
}

export async function loadChildState(): Promise<ChildState> {
  const child = await getActiveChild();
  const [extras, logs, progress, lessons] = await Promise.all([
    readChildExtras(child.id),
    supabaseAdmin
      .from("session_log")
      .select("session_id, beat_id, beat_type, concept_tag, director_text, child_transcript, planner_decision, started_at, ended_at")
      .eq("child_id", child.id)
      .order("started_at", { ascending: true })
      .limit(6000)
      .then(({ data, error }) => {
        if (error) console.error("[appData] session_log:", error.message);
        return (data ?? []) as LogRow[];
      }),
    supabaseAdmin
      .from("child_progress")
      .select("topic, correct, timestamp")
      .eq("child_id", child.id)
      .order("timestamp", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("[appData] child_progress:", error.message);
        return (data ?? []) as ProgressRow[];
      }),
    loadLessons(),
  ]);
  return { id: child.id, name: child.displayName, grade: child.grade, extras, logs, progress, lessons };
}

// --- dates ---------------------------------------------------------------------------

function dayKey(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(typeof iso === "string" ? new Date(iso) : iso);
}

function shiftDay(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + days);
  return dayKey(d);
}

/** Monday of the week containing `key` (Colombo). */
function weekStart(key: string): string {
  const d = new Date(`${key}T12:00:00+05:30`);
  const weekday = (new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d) as string).slice(0, 3);
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  return shiftDay(key, -Math.max(0, index));
}

/** The twelve short month names (the native review, 29 Sep 2026): "ජන., පෙබ., …, දෙසැ." — month 1 first. */
const MONTH_SHORT: Record<number, string> = Object.fromEntries(t("month.names").split(/,\s*/u).map((name, i) => [i + 1, name]));
const MONTH_LONG: Record<number, string> = { 9: t("cert.month.9") };

/** "සැප්. 2 – 8", or "සැප්. 29 – ඔක්. 5" across a month's end; numerals only if a name is missing. */
function rangeLabel(start: string, end: string): string {
  const [, sm, sd] = start.split("-").map(Number);
  const [, em, ed] = end.split("-").map(Number);
  const from = MONTH_SHORT[sm!];
  const to = MONTH_SHORT[em!];
  if (from && sm === em) return `${from} ${sd} – ${ed}`;
  if (from && to) return `${from} ${sd} – ${to} ${ed}`;
  return `${sm}/${sd} – ${em}/${ed}`;
}

/** "2026 සැප්තැම්බර් 9" with the export's long name, else the short one ("2026 ඔක්. 3"); the ISO date only if neither. */
function certificateDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const month = MONTH_LONG[m!] ?? MONTH_SHORT[m!];
  return month ? t("cert.dateFormat", { year: y!, month, day: d! }) : key;
}

// --- sessions from the log ----------------------------------------------------------

interface Sitting {
  id: string;
  day: string;
  startedAt: string;
  minutes: number;
  closed: boolean;
  concepts: string[];
  rows: LogRow[];
}

function sittings(logs: LogRow[]): Sitting[] {
  const byId = new Map<string, LogRow[]>();
  for (const row of logs) {
    const list = byId.get(row.session_id) ?? [];
    list.push(row);
    byId.set(row.session_id, list);
  }
  const out: Sitting[] = [];
  for (const [id, rows] of byId) {
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    const end = new Date(last.ended_at ?? last.started_at).getTime();
    const span = Math.max(0, end - new Date(first.started_at).getTime());
    out.push({
      id,
      day: dayKey(first.started_at),
      startedAt: first.started_at,
      minutes: Math.min(60, Math.max(1, Math.round(span / 60000))),
      closed: rows.some((r) => r.beat_type === "CLOSE_SESSION"),
      concepts: [...new Set(rows.map((r) => r.concept_tag).filter((c): c is string => Boolean(c) && c !== "lessonOpening"))],
      rows,
    });
  }
  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function minutesOn(list: Sitting[], day: string): number {
  return list.filter((s) => s.day === day).reduce((n, s) => n + s.minutes, 0);
}

/** Consecutive days with a sitting, ending today (or yesterday if today has none yet). */
function streak(list: Sitting[], today: string): number {
  const days = new Set(list.map((s) => s.day));
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}

// --- mastery -------------------------------------------------------------------------

interface Mastery {
  tag: string;
  answered: number;
  correct: number;
  pct: number;
  mastered: boolean;
  /** When the mastering answer landed (the last correct one), for ordering stickers. */
  masteredAt: string | null;
}

function masteryByTag(progress: ProgressRow[]): Map<string, Mastery> {
  const map = new Map<string, Mastery>();
  for (const row of progress) {
    const m = map.get(row.topic) ?? { tag: row.topic, answered: 0, correct: 0, pct: 0, mastered: false, masteredAt: null };
    m.answered += 1;
    if (row.correct) m.correct += 1;
    m.pct = Math.round((m.correct / m.answered) * 100);
    const now = m.answered >= MASTERY_MIN_ANSWERS && m.pct >= MASTERY_PCT;
    if (now && !m.mastered) m.masteredAt = row.timestamp;
    m.mastered = now;
    map.set(row.topic, m);
  }
  return map;
}

function statusFor(pct: number | null): string {
  if (pct === null || pct === 0) return t("common.notYet");
  if (pct >= BEST_PCT) return t("progress.status.best");
  if (pct >= GOOD_PCT) return t("progress.status.good");
  return t("progress.status.practise");
}

function title(tag: string, lessons: Lesson[]): string {
  const description = lessons.flatMap((l) => l.script.concepts).find((c) => c.conceptTag === tag)?.description ?? null;
  return conceptTitle(tag, description);
}

// --- resume point --------------------------------------------------------------------

interface Resume {
  lesson: Lesson;
  /** 0-based index of the session to sit next. */
  sessionIndex: number;
  /** Sessions of this lesson already closed. */
  done: number;
  lessonFinished: boolean;
}

function resumePoint(state: ChildState): Resume | null {
  const lesson = state.lessons[0];
  if (!lesson) return null;
  // The same rule as /api/resume-state (src/lib/sessionRows.ts): the first
  // packed session whose CLOSE_SESSION beat was never logged is next, so a
  // restarted session replays even when later ones were closed.
  const closed = new Set(state.logs.filter((r) => r.beat_type === "CLOSE_SESSION").map((r) => r.beat_id));
  const total = lesson.script.sessions.length;
  const isClosed = (i: number) => {
    const s = lesson.script.sessions[i]!;
    const close = lesson.script.beats.slice(s.firstBeat, s.lastBeat + 1).find((b) => b.type === "CLOSE_SESSION")?.id;
    return Boolean(close && closed.has(close));
  };
  let next = 0;
  while (next < total && isClosed(next)) next += 1;
  const done = lesson.script.sessions.filter((_, i) => isClosed(i)).length;
  return { lesson, sessionIndex: Math.min(next, total - 1), done, lessonFinished: next >= total };
}

function sessionMinutes(lesson: Lesson, index: number): number {
  const s = lesson.script.sessions[index];
  return s ? Math.max(1, Math.round(s.estimatedSeconds / 60)) : 0;
}

function lessonStars(lesson: Lesson, mastery: Map<string, Mastery>): number {
  const tags = lesson.script.concepts.map((c) => c.conceptTag).filter((c) => c !== "lessonOpening");
  if (tags.length === 0) return 0;
  const mastered = tags.filter((c) => mastery.get(c)?.mastered).length;
  return Math.round((3 * mastered) / tags.length);
}

// --- screens --------------------------------------------------------------------------

export async function homeData(state: ChildState): Promise<HomeData> {
  const today = dayKey(new Date());
  const list = sittings(state.logs);
  const mastery = masteryByTag(state.progress);
  const resume = resumePoint(state);
  const yesterday = shiftDay(today, -1);
  const wrongYesterday = state.logs.filter((r) => dayKey(r.started_at) === yesterday && r.planner_decision?.understood === false && r.concept_tag);
  const counts = new Map<string, number>();
  for (const r of wrongYesterday) counts.set(r.concept_tag!, (counts.get(r.concept_tag!) ?? 0) + 1);
  const weakestTag = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const masteredInOrder = [...mastery.values()].filter((m) => m.mastered).sort((a, b) => (a.masteredAt ?? "").localeCompare(b.masteredAt ?? ""));
  const latest = masteredInOrder[masteredInOrder.length - 1];
  return {
    name: state.name,
    minutesToday: minutesOn(list, today),
    dailyGoal: state.extras.settings.dailyLimitMinutes,
    streakDays: streak(list, today),
    continue: resume
      ? {
          lessonNumber: resume.lesson.number,
          lessonTitle: resume.lesson.title,
          sessionNumber: resume.sessionIndex + 1,
          sessionsDone: resume.done,
          sessionsTotal: resume.lesson.script.sessions.length,
          minutes: sessionMinutes(resume.lesson, resume.sessionIndex),
        }
      : null,
    weakest: weakestTag ? title(weakestTag, state.lessons) : null,
    badge: latest ? { name: STICKERS[(masteredInOrder.length - 1) % STICKERS.length]!, conceptTitle: title(latest.tag, state.lessons) } : null,
  };
}

export function lessonMapData(state: ChildState): LessonMapData {
  const mastery = masteryByTag(state.progress);
  const resume = resumePoint(state);
  const nodes: MapNode[] = PATH_SLOTS.map((slot, i) => {
    const lesson = state.lessons[i];
    const kind: NodeKind = !lesson ? "locked" : resume && resume.lesson.number === lesson.number && !resume.lessonFinished ? "current" : resume && lesson.number < resume.lesson.number ? "done" : resume?.lessonFinished && resume.lesson.number === lesson.number ? "done" : "locked";
    return { num: String(i + 1), name: lesson?.title ?? LESSON_NAMES[i + 1] ?? t("common.lessonN", { n: i + 1 }), x: slot.x, y: slot.y, kind, stars: lesson ? lessonStars(lesson, mastery) : 0, lessonNumber: lesson?.number ?? null };
  });
  const current = nodes.find((n) => n.kind === "current");
  return {
    lessonsCount: nodes.length,
    stars: nodes.reduce((n, node) => n + node.stars, 0),
    starsTotal: nodes.length * 3,
    nodes,
    zaraAt: current ? { x: current.x + ZARA_OFFSET.x, y: current.y + ZARA_OFFSET.y } : null,
  };
}

export function lessonDetailData(state: ChildState, lessonNumber: number): LessonDetailData | null {
  const lesson = state.lessons.find((l) => l.number === lessonNumber);
  if (!lesson) return null;
  const mastery = masteryByTag(state.progress);
  const resume = resumePoint(state);
  const current = resume && resume.lesson.number === lesson.number ? resume.sessionIndex : 0;
  const finished = Boolean(resume && resume.lesson.number === lesson.number && resume.lessonFinished);
  const logged = new Set(state.logs.map((r) => r.beat_id));
  const sessions = lesson.script.sessions.map((s, i) => {
    const tags = s.conceptTags.filter((c) => c !== "lessonOpening");
    const kind: NodeKind = finished || i < current ? "done" : i === current ? "current" : "locked";
    const started = lesson.script.beats.slice(s.firstBeat, s.lastBeat + 1).some((b) => logged.has(b.id));
    // Each session names its concepts AND the textbook exercises it works, so the big table reads as "next", never as missing (issue 22).
    const names = tags.map((c) => title(c, state.lessons));
    for (const item of s.exercises ?? []) {
      const name = itemTitle(item);
      if (name && !names.includes(name)) names.push(name);
    }
    return { title: t("common.sessionNth", { n: i + 1 }), sub: names.join(" · "), min: t("common.minutesN", { n: Math.max(1, Math.round(s.estimatedSeconds / 60)) }), kind, started };
  });
  const tags = lesson.script.concepts.map((c) => c.conceptTag).filter((c) => c !== "lessonOpening");
  return {
    lessonNumber: lesson.number,
    title: lesson.title,
    sessionsCount: sessions.length,
    minutes: Math.round(lesson.script.sessions.reduce((n, s) => n + s.estimatedSeconds, 0) / 60),
    stars: lessonStars(lesson, mastery),
    starsTotal: 3,
    concepts: tags.map((c) => title(c, state.lessons)),
    sessions,
    ctaSession: finished ? null : current + 1,
    currentStarted: !finished && Boolean(sessions[current]?.started),
  };
}

export function summaryData(state: ChildState): SummaryData {
  const today = dayKey(new Date());
  const list = sittings(state.logs);
  const last = list[list.length - 1];
  const mastery = masteryByTag(state.progress);
  if (!last) return { name: state.name, lines: [], stars: 0, streakDays: streak(list, today), plusOne: false, hasSession: false, moreAllowed: true };
  // What happened in the last sitting: per concept, the answers judged there.
  const asks = last.rows.filter((r) => r.planner_decision && typeof r.planner_decision.understood === "boolean");
  const byConcept = new Map<string, { asked: number; correct: number }>();
  for (const r of asks) {
    const tag = r.concept_tag ?? "";
    const c = byConcept.get(tag) ?? { asked: 0, correct: 0 };
    c.asked += 1;
    if (r.planner_decision?.understood) c.correct += 1;
    byConcept.set(tag, c);
  }
  const lines: string[] = [];
  for (const tag of last.concepts) {
    const c = byConcept.get(tag);
    lines.push(c ? `${title(tag, state.lessons)} · ${t("summary.questions", { asked: c.asked, correct: c.correct })}` : `${title(tag, state.lessons)} · ${t("summary.looked")}`);
  }
  lines.push(t("summary.minutes", { n: last.minutes }));
  const masteredHere = last.concepts.filter((c) => {
    const m = mastery.get(c);
    return m?.mastered && m.masteredAt && new Date(m.masteredAt).getTime() >= new Date(last.startedAt).getTime();
  }).length;
  const todaysFirst = list.filter((s) => s.day === last.day)[0]?.id === last.id;
  const minutesToday = minutesOn(list, today);
  return {
    name: state.name,
    lines: lines.slice(0, 4),
    stars: Math.min(3, masteredHere),
    streakDays: streak(list, today),
    plusOne: todaysFirst && last.day === today,
    hasSession: true,
    moreAllowed: minutesToday < state.extras.settings.dailyLimitMinutes,
  };
}

export async function practiceData(state: ChildState): Promise<PracticeData> {
  const mastery = masteryByTag(state.progress);
  // Concepts the child has worked on, weakest first (the same rule as /api/recap), each with its verified bank count.
  const worked = [...new Set(state.logs.map((r) => r.concept_tag).filter((c): c is string => Boolean(c) && c !== "lessonOpening"))];
  if (worked.length === 0) return { rows: [] };
  const { data } = await supabaseAdmin.from("content_bank").select("concept_tag").eq("verified", true).in("concept_tag", worked).neq("component_type", "explanation");
  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.concept_tag, (counts.get(row.concept_tag) ?? 0) + 1);
  const rows = worked
    .filter((tag) => (counts.get(tag) ?? 0) > 0)
    .map((tag) => {
      const m = mastery.get(tag);
      return { tag, title: title(tag, state.lessons), sub: t("practice.rowSub", { n: Math.min(5, counts.get(tag) ?? 0) }), pct: m ? m.pct : null };
    })
    .sort((a, b) => (a.pct ?? 50) - (b.pct ?? 50));
  return { rows };
}

export function rewardsData(state: ChildState): RewardsData {
  const mastery = masteryByTag(state.progress);
  const masteredInOrder = [...mastery.values()].filter((m) => m.mastered).sort((a, b) => (a.masteredAt ?? "").localeCompare(b.masteredAt ?? ""));
  const stickers = Array.from({ length: STICKER_SLOTS }, (_, i) => ({ name: STICKERS[i] ?? t("common.soon"), earned: i < masteredInOrder.length, conceptTitle: masteredInOrder[i] ? title(masteredInOrder[i]!.tag, state.lessons) : null }));
  const latest = masteredInOrder[masteredInOrder.length - 1];
  return {
    earned: Math.min(STICKER_SLOTS, masteredInOrder.length),
    total: STICKER_SLOTS,
    certificates: masteredInOrder.length,
    stickers,
    // Outfits are earned one per three stickers; none of the art exists yet (docs/design/art-needed.md).
    outfits: OUTFITS.map((o, i) => ({ name: o.name, hat: o.hat, owned: masteredInOrder.length >= (i + 1) * 3 })),
    certificate: latest ? { conceptTitle: title(latest.tag, state.lessons) } : null,
  };
}

export function certificateData(state: ChildState): CertificateData {
  const mastery = masteryByTag(state.progress);
  const masteredInOrder = [...mastery.values()].filter((m) => m.mastered).sort((a, b) => (a.masteredAt ?? "").localeCompare(b.masteredAt ?? ""));
  const latest = masteredInOrder[masteredInOrder.length - 1];
  return { name: state.name, conceptTitle: latest ? title(latest.tag, state.lessons) : null, date: certificateDate(dayKey(latest?.masteredAt ?? new Date())), grade: state.grade };
}

export function progressData(state: ChildState): ProgressData {
  const mastery = masteryByTag(state.progress);
  const tags = [...new Set(state.lessons.flatMap((l) => l.script.concepts.map((c) => c.conceptTag)))].filter((c) => c !== "lessonOpening");
  const rows = tags.map((tag) => {
    const m = mastery.get(tag);
    return { title: title(tag, state.lessons), pct: m ? m.pct : 0, status: statusFor(m ? m.pct : null) };
  });
  const scored = tags.map((tag) => ({ tag, m: mastery.get(tag) })).filter((x) => x.m);
  const best = scored.filter((x) => x.m!.pct >= MASTERY_PCT).sort((a, b) => b.m!.pct - a.m!.pct)[0];
  const weak = scored.filter((x) => x.m!.pct < GOOD_PCT).sort((a, b) => a.m!.pct - b.m!.pct)[0];
  return {
    mastered: tags.filter((tag) => mastery.get(tag)?.mastered).length,
    total: tags.length,
    rows,
    sentence: best && weak && best.tag !== weak.tag ? t("progress.sentence.both", { name: state.name, best: title(best.tag, state.lessons), weak: title(weak.tag, state.lessons) }) : null,
  };
}

function weekOf(state: ChildState) {
  const today = dayKey(new Date());
  const start = weekStart(today);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
  const list = sittings(state.logs).filter((s) => days.includes(s.day));
  return { today, start, end: days[6]!, days, list };
}

function whatsapp(): { display: string | null; href: string | null } {
  const raw = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/gu, "");
  if (!raw) return { display: null, href: null };
  const local = raw.startsWith("94") ? `0${raw.slice(2)}` : raw;
  const display = local.length === 10 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : local;
  return { display, href: `https://wa.me/${raw.startsWith("94") ? raw : `94${raw.replace(/^0/u, "")}`}` };
}

export function parentZoneData(state: ChildState, childrenCount: number): ParentZoneData {
  const { start, end, list } = weekOf(state);
  const mastery = masteryByTag(state.progress);
  const tags = [...new Set(state.lessons.flatMap((l) => l.script.concepts.map((c) => c.conceptTag)))].filter((c) => c !== "lessonOpening");
  const wa = whatsapp();
  return {
    childName: state.name,
    grade: state.grade,
    minutesWeek: list.reduce((n, s) => n + s.minutes, 0),
    sessionsWeek: list.length,
    confident: tags.filter((tag) => (mastery.get(tag)?.pct ?? 0) >= MASTERY_PCT).length,
    conceptsTotal: tags.length,
    settings: state.extras.settings,
    pinSet: Boolean(state.extras.parentPinHash),
    childrenCount,
    reportRange: rangeLabel(start, end).replace(" – ", "–"),
    whatsapp: wa.display,
    whatsappHref: wa.href,
    extrasSource: state.extras.source,
  };
}

export function reportData(state: ChildState): ReportData {
  const { start, end, days, list } = weekOf(state);
  const mastery = masteryByTag(state.progress);
  const tags = [...new Set(state.lessons.flatMap((l) => l.script.concepts.map((c) => c.conceptTag)))].filter((c) => c !== "lessonOpening");
  const confident = tags.filter((tag) => (mastery.get(tag)?.pct ?? 0) >= MASTERY_PCT);
  const needsWork = tags.filter((tag) => mastery.has(tag) && mastery.get(tag)!.pct < GOOD_PCT);
  const beats = new Map(state.lessons.flatMap((l) => l.script.beats.map((b) => [b.id, b] as const)));
  const missed = list
    .flatMap((s) => s.rows)
    .filter((r) => r.planner_decision?.understood === false)
    .slice(-6)
    .map((r) => ({ q: r.director_text ?? r.beat_id, a: r.child_transcript ?? "—", c: beats.get(r.beat_id)?.expectedAnswer ?? "—" }));
  const best = confident.sort((a, b) => (mastery.get(b)?.pct ?? 0) - (mastery.get(a)?.pct ?? 0))[0];
  const weak = needsWork.sort((a, b) => (mastery.get(a)?.pct ?? 0) - (mastery.get(b)?.pct ?? 0))[0];
  return {
    range: rangeLabel(start, end),
    childName: state.name,
    sentence: best && weak ? t("report.sentence.both", { name: state.name, best: title(best, state.lessons), weak: title(weak, state.lessons) }) : null,
    bars: days.map((day, i) => ({ d: DAY_LETTERS[i]!, minutes: minutesOn(list, day) })),
    goalMinutes: state.extras.settings.dailyLimitMinutes,
    confident: confident.map((c) => title(c, state.lessons)),
    needsWork: needsWork.map((c) => title(c, state.lessons)),
    missed,
  };
}

/** The children this device's parent looks after: the active child and any sharing its parent contact. */
export async function profilesData(state: ChildState): Promise<ProfilesData> {
  const { data: me } = await supabaseAdmin.from("children").select("parent_contact").eq("id", state.id).maybeSingle();
  let rows: Array<{ id: string; display_name: string; grade: number }> = [{ id: state.id, display_name: state.name, grade: state.grade }];
  if (me?.parent_contact) {
    const { data } = await supabaseAdmin.from("children").select("id, display_name, grade").eq("parent_contact", me.parent_contact).order("created_at");
    if (data?.length) rows = data;
  }
  const children = await Promise.all(rows.map(async (c) => ({ id: c.id, name: c.display_name, grade: c.grade, active: c.id === state.id, pinSet: Boolean((await readChildExtras(c.id)).parentPinHash) })));
  return { children, childrenCount: children.length };
}

/** Minutes this child has sat today — the runtime's daily-limit input (see /api/session-start). */
export async function minutesTodayFor(childId: string): Promise<number> {
  const today = dayKey(new Date());
  const since = new Date(`${today}T00:00:00+05:30`).toISOString();
  const { data } = await supabaseAdmin.from("session_log").select("session_id, started_at, ended_at").eq("child_id", childId).gte("started_at", since).order("started_at", { ascending: true }).limit(4000);
  return minutesOn(sittings((data ?? []).map((r) => ({ ...r, beat_id: "", beat_type: "", concept_tag: null, director_text: null, child_transcript: null, planner_decision: null }))), today);
}

export { getActiveChildId };
