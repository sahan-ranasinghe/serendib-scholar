/**
 * The export's own sample data for each app screen (the renderVals() of
 * Screens A/B/C.dc.html, verbatim), so /admin/design-preview?screen=<label>
 * renders the app's components with exactly what the design frame shows
 * and scripts/design-check.ts can compare the two like for like.
 *
 * Nothing here reaches a route: the routes read src/lib/appData.ts.
 */
import type { CertificateData, HomeData, LessonDetailData, LessonMapData, ParentZoneData, PracticeData, ProfilesData, ProgressData, QuizQuestion, ReportData, RewardsData, SummaryData } from "@/lib/appTypes";

export const FIXTURE_HOME: HomeData = {
  name: "නිමාලි",
  minutesToday: 8,
  dailyGoal: 15,
  streakDays: 4,
  continue: { lessonNumber: 1, lessonTitle: "සංඛ්‍යා - 1", sessionNumber: 2, sessionsDone: 2, sessionsTotal: 7, minutes: 13 },
  weakest: "විහිදුවා ලිවීම",
  badge: { name: "අලියා", conceptTitle: "දහසස්ථානය" },
};

export const FIXTURE_MAP: LessonMapData = {
  lessonsCount: 35,
  stars: 4,
  starsTotal: 105,
  nodes: [
    { num: "1", name: "සංඛ්‍යා - 1", x: 100, y: 160, kind: "done", stars: 3, lessonNumber: 1 },
    { num: "2", name: "සංඛ්‍යා - 2", x: 300, y: 250, kind: "done", stars: 1, lessonNumber: 2 },
    { num: "3", name: "එකතු කිරීම", x: 100, y: 360, kind: "current", stars: 0, lessonNumber: 3 },
    { num: "4", name: "අඩු කිරීම", x: 290, y: 510, kind: "locked", stars: 0, lessonNumber: null },
    { num: "5", name: "ගුණ කිරීම", x: 90, y: 640, kind: "locked", stars: 0, lessonNumber: null },
    { num: "6", name: "භාග", x: 300, y: 720, kind: "locked", stars: 0, lessonNumber: null },
  ],
  zaraAt: { x: 150, y: 312 },
};

export const FIXTURE_DETAIL: LessonDetailData = {
  lessonNumber: 1,
  title: "සංඛ්‍යා - 1",
  sessionsCount: 7,
  minutes: 90,
  stars: 3,
  starsTotal: 21,
  concepts: ["සංඛ්‍යා කියවීම", "ස්ථානීය අගය", "විහිදුවා ලිවීම", "ගණක රාමුව"],
  sessions: [
    { title: "1 වන සැසිය", sub: "සංඛ්‍යා කියවීම · ගණක රාමුව", min: "මිනිත්තු 12", kind: "done", started: true },
    { title: "2 වන සැසිය", sub: "ස්ථානීය අගය · විහිදුවා ලිවීම", min: "මිනිත්තු 13", kind: "current", started: false },
    { title: "3 වන සැසිය", sub: "දස දහස දක්වා", min: "මිනිත්තු 12", kind: "locked", started: false },
  ],
  ctaSession: 2,
  currentStarted: false,
};

export const FIXTURE_SUMMARY: SummaryData = {
  name: "නිමාලි",
  lines: ["සංඛ්‍යා 4ක් හරියට කියෙව්වා", "ගණක රාමුවේ 5 421 හැදුවා", "හොඳම මොහොත: 84 = 80 + 4 වැරැද්ද හොයාගත්තා"],
  stars: 2,
  streakDays: 5,
  plusOne: true,
  hasSession: true,
  moreAllowed: true,
};

export const FIXTURE_PRACTICE: PracticeData = {
  rows: [
    { tag: "placeValue4Digit", title: "ස්ථානීය අගය", sub: "මිනිත්තු 3 · ප්‍රශ්න 6", pct: 78 },
    { tag: "expandedForm4Digit", title: "විහිදුවා ලිවීම", sub: "මිනිත්තු 3 · ප්‍රශ්න 6", pct: 35 },
    { tag: "numberNames", title: "සංඛ්‍යා නාම", sub: "මිනිත්තු 3 · ප්‍රශ්න 5", pct: 20 },
    { tag: "abacusRepresentation", title: "ගණක රාමුව කියවීම", sub: "මිනිත්තු 3 · ප්‍රශ්න 6", pct: 86 },
  ],
};
/** The export's rings carry explicit colour + dash offset per row (green 30, saffron 90, saffron 110, green 20). */
export const FIXTURE_PRACTICE_RINGS: Array<{ c: string; o: number }> = [
  { c: "#3C8C5A", o: 30 },
  { c: "#E9B44C", o: 90 },
  { c: "#E9B44C", o: 110 },
  { c: "#3C8C5A", o: 20 },
];

export const FIXTURE_QUIZ: { question: QuizQuestion; index: number; results: Array<boolean | null>; selected: number | null } = {
  question: { prompt: "6 572 කියන සංඛ්‍යාවේ හයෙන් පෙන්වන අගය කීයද?", figure: "6 572", asking: "", options: ["600", "6000", "60"], correctIndex: 1, conceptTag: "placeValue4Digit", itemId: "fixture" },
  index: 2,
  results: [true, true, null, null, null],
  selected: 1,
};

export const FIXTURE_REWARDS: RewardsData = {
  earned: 3,
  total: 12,
  certificates: 1,
  stickers: [
    { name: "අලියා", earned: true, conceptTitle: null },
    { name: "මොනරා", earned: true, conceptTitle: null },
    { name: "නෙළුම", earned: true, conceptTitle: null },
    { name: "කොත්තු", earned: false, conceptTitle: null },
    { name: "ත්රීවීලර්", earned: false, conceptTitle: null },
    { name: "කිරිබත්", earned: false, conceptTitle: null },
    { name: "වෙසක් කූඩුව", earned: false, conceptTitle: null },
    { name: "ක්‍රිකට්", earned: false, conceptTitle: null },
  ],
  outfits: [
    { name: "තොප්පිය", owned: true, hat: "#0F4C5C" },
    { name: "හෙල්මට්", owned: false, hat: "#4A7BD0" },
    { name: "කූඩුව", owned: false, hat: "#D9643A" },
  ],
  certificate: { conceptTitle: "ස්ථානීය අගය" },
};

export const FIXTURE_CERTIFICATE: CertificateData = { name: "නිමාලි පෙරේරා", conceptTitle: "ස්ථානීය අගය", date: "2026 සැප්තැම්බර් 9", grade: 5 };

export const FIXTURE_PROGRESS: ProgressData = {
  mastered: 6,
  total: 18,
  rows: [
    { title: "සංඛ්‍යා කියවීම", pct: 100, status: "හොඳටම" },
    { title: "දහසස්ථානය", pct: 100, status: "හොඳටම" },
    { title: "ගණක රාමුව", pct: 85, status: "හොඳයි" },
    { title: "ස්ථානීය අගය", pct: 70, status: "හොඳයි" },
    { title: "විහිදුවා ලිවීම", pct: 40, status: "පුරුදු වෙමු" },
    { title: "බිංදුව ඇති ස්ථාන", pct: 25, status: "පුරුදු වෙමු" },
    { title: "දස දහස", pct: 0, status: "තාම නෑ" },
  ],
  sentence: "නිමාලි, දහසස්ථානය හොඳට තේරුම් ගත්තා. විහිදුවා ලිවීම තව පොඩ්ඩක් පුරුදු වෙමු!",
};

export const FIXTURE_PARENT: ParentZoneData = {
  childName: "නිමාලි",
  grade: 5,
  minutesWeek: 64,
  sessionsWeek: 5,
  confident: 4,
  conceptsTotal: 6,
  // The export's settings rows read 'ශබ්දය ✓' and an empty PIN value.
  settings: { captions: false, sound: true, dailyLimitMinutes: 15 },
  pinSet: false,
  childrenCount: 1,
  reportRange: "සැප්. 2–8",
  whatsapp: "077 000 0000",
  whatsappHref: "https://wa.me/94770000000",
  extrasSource: "columns",
};

export const FIXTURE_REPORT: ReportData = {
  range: "සැප්. 2 – 8",
  childName: "නිමාලි",
  sentence: "නිමාලි දහසස්ථානය හොඳට තේරුම් ගත්තා; විහිදුවා ලිවීම තව පුරුදු වෙන්න ඕනේ.",
  bars: [
    { d: "ස", minutes: 12 },
    { d: "අ", minutes: 15 },
    { d: "බ", minutes: 0 },
    { d: "බ්‍ර", minutes: 14 },
    { d: "සි", minutes: 9 },
    { d: "සෙ", minutes: 14 },
    { d: "ඉ", minutes: 0 },
  ],
  goalMinutes: 15,
  confident: ["සංඛ්‍යා කියවීම", "දහසස්ථානය", "ගණක රාමුව"],
  needsWork: ["විහිදුවා ලිවීම", "බිංදුව ඇති ස්ථාන"],
  missed: [
    { q: "6 572 — හයෙන් පෙන්වන අගය කීයද?", a: "600", c: "6000" },
    { q: "7 062 = 7000 + ▢ + 60 + 2", a: "6", c: "0" },
  ],
};

export const FIXTURE_PROFILES: ProfilesData = { children: [{ id: "fixture", name: "නිමාලි", grade: 5, active: true, pinSet: true }], childrenCount: 1 };

export const FIXTURE_ONBOARDING = {
  phone: "77 123 4567",
  otp: ["4", "8", "2", ""],
  otpActive: 3,
  name: "නිමාලි",
  avatarIndex: 2,
  grade: 5 as 4 | 5,
  resendSeconds: 42,
};
