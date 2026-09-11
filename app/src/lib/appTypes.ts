/**
 * What each app screen renders — produced by src/lib/appData.ts from the
 * database for the routes, and by src/lib/appFixtures.ts (the export's own
 * sample data) for the design preview the fidelity check photographs.
 */
import type { ChildSettings } from "@/lib/childStore";

export type { ChildSettings };

export interface HomeData {
  name: string;
  minutesToday: number;
  dailyGoal: number;
  streakDays: number;
  continue: { lessonNumber: number; lessonTitle: string; sessionNumber: number; sessionsDone: number; sessionsTotal: number; minutes: number } | null;
  /** Yesterday's weakest concept (title), if any answer went wrong yesterday. */
  weakest: string | null;
  badge: { name: string; conceptTitle: string } | null;
}

export type NodeKind = "done" | "current" | "locked";

export interface MapNode {
  num: string;
  name: string;
  x: number;
  y: number;
  kind: NodeKind;
  stars: number;
  /** Null for a slot with no script yet. */
  lessonNumber: number | null;
}

export interface LessonMapData {
  lessonsCount: number;
  stars: number;
  starsTotal: number;
  nodes: MapNode[];
  /** Zara stands beside the current node. */
  zaraAt: { x: number; y: number } | null;
}

export interface LessonDetailData {
  lessonNumber: number;
  title: string;
  sessionsCount: number;
  minutes: number;
  stars: number;
  starsTotal: number;
  concepts: string[];
  sessions: Array<{ title: string; sub: string; min: string; kind: NodeKind }>;
  /** The session the CTA starts (1-based), or null when the lesson is finished. */
  ctaSession: number | null;
}

export interface SummaryData {
  name: string;
  lines: string[];
  stars: number;
  streakDays: number;
  plusOne: boolean;
  /** No session has been recorded yet — the card says so instead of inventing lines. */
  hasSession: boolean;
  /** "තව පොඩ්ඩක්" is offered only while the daily limit allows another sitting. */
  moreAllowed: boolean;
}

export interface PracticeRow {
  tag: string;
  title: string;
  sub: string;
  /** Mastery 0–100, or null when nothing has been answered. */
  pct: number | null;
}

export interface PracticeData {
  rows: PracticeRow[];
}

export interface QuizQuestion {
  /** The recap ASK's own words (from the authored script). */
  prompt: string;
  /** The item shown as stroke numerals ("6 572"), or an expansion line. */
  figure: string;
  /** What is asked of the figure — a table column header from the design, or empty for an expansion. */
  asking: string;
  options: string[];
  correctIndex: number;
  conceptTag: string;
  itemId: string;
}

export interface RewardsData {
  earned: number;
  total: number;
  certificates: number;
  stickers: Array<{ name: string; earned: boolean; conceptTitle: string | null }>;
  outfits: Array<{ name: string; owned: boolean; hat: string }>;
  /** The latest mastered concept, whose certificate is ready. */
  certificate: { conceptTitle: string } | null;
}

export interface CertificateData {
  name: string;
  conceptTitle: string | null;
  date: string;
  grade: number;
}

export interface ProgressData {
  mastered: number;
  total: number;
  rows: Array<{ title: string; pct: number; status: string }>;
  sentence: string | null;
}

export interface ParentZoneData {
  childName: string;
  grade: number;
  minutesWeek: number;
  sessionsWeek: number;
  confident: number;
  conceptsTotal: number;
  settings: ChildSettings;
  pinSet: boolean;
  childrenCount: number;
  reportRange: string;
  /** WhatsApp help number, formatted for display; null when not configured. */
  whatsapp: string | null;
  whatsappHref: string | null;
  extrasSource: "columns" | "bucket" | "defaults";
}

export interface ReportData {
  range: string;
  childName: string;
  sentence: string | null;
  bars: Array<{ d: string; minutes: number }>;
  goalMinutes: number;
  confident: string[];
  needsWork: string[];
  missed: Array<{ q: string; a: string; c: string }>;
}

export interface ProfilesData {
  children: Array<{ id: string; name: string; grade: number; active: boolean; pinSet: boolean }>;
  childrenCount: number;
}

export type EdgeKind = "loading" | "offline" | "paused" | "rotate" | "mic" | "error";
