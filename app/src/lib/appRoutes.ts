/**
 * The app's routes and where each screen's data comes from — printed by
 * scripts/design-check.ts so the "real vs placeholder" table is the code's
 * own account, not a hand-written one.
 */
export interface RouteNote {
  route: string;
  screen: string;
  real: string;
  placeholder: string;
}

export const APP_ROUTES: RouteNote[] = [
  { route: "/", screen: "Splash", real: "wordmark, tagline, language card (Sinhala ✓)", placeholder: "Tamil locked ළඟදීම" },
  { route: "/home", screen: "Home", real: "child's name (children), continue card from the resume point (session_log CLOSE_SESSION → next packed session), minutes today / daily goal, streak (Lena's flame), today's plan minutes, yesterday's weakest concept (wrong answers in session_log), rewards peek (mastery from child_progress)", placeholder: "සිංහල and පරිසරය subjects locked ළඟදීම; badge art is a striped slot" },
  { route: "/lessons", screen: "Lesson map", real: "nodes from lesson_scripts (one script today), done/current from the resume point, stars from child_progress mastery, Zara at the current node", placeholder: "slots 2–6 locked (no script), drafted names" },
  { route: "/lessons/[id]", screen: "Lesson detail", real: "packed sessions with estimated minutes, concept chips, done/current/locked rows, CTA to the current session", placeholder: "—" },
  { route: "/session", screen: "Session", real: "the lesson runtime (unchanged); captions default on per child; daily limit enforced", placeholder: "—" },
  { route: "/session/summary", screen: "Session summary", real: "lines per concept from the last sitting's judged answers, minutes, stars = concepts mastered in that sitting, streak +1 on today's first sitting, install card", placeholder: "with no sitting: an empty card (තාම නෑ)" },
  { route: "/practice", screen: "Practice hub", real: "concepts worked on (session_log) with verified bank items, ring = mastery", placeholder: "past papers and the timed challenge locked ළඟදීම" },
  { route: "/practice/quiz", screen: "Quiz", real: "up to five MCQs from /api/recap (verified bank + distractors), judged against the item's answer, logged to child_progress; 5 dots, no timer", placeholder: "—" },
  { route: "/rewards", screen: "Rewards", real: "stickers = concepts mastered in order, certificate for the latest mastered concept, outfit per three stickers", placeholder: "all art is a striped slot; slots 9–12 unnamed (ළඟදීම)" },
  { route: "/rewards/certificate", screen: "Certificate", real: "child's name, grade, mastered concept, date mastered; printable (A4 print CSS)", placeholder: "signature/seal art; with nothing mastered the sheet says තාම නෑ" },
  { route: "/progress", screen: "Progress", real: "every concept of the scripts with mastery % from child_progress and the four statuses; Zara's sentence when there is a best and a weak concept", placeholder: "—" },
  { route: "/parent", screen: "Parent zone", real: "PIN gate (set on first use), minutes/sessions this week, confident concepts, settings values, children count, WhatsApp from NEXT_PUBLIC_WHATSAPP_NUMBER", placeholder: "billing value ළඟදීම; WhatsApp ළඟදීම when the number is not configured" },
  { route: "/parent/report", screen: "Weekly report", real: "minutes per day Mon–Sun, confident / needs-work from child_progress, the exact missed questions (director line, the child's answer, the expected answer), one Zara sentence composed from the data", placeholder: "month abbreviations exist only for Sep/Oct (numerals otherwise)" },
  { route: "/parent/subscription", screen: "Subscription", real: "children's profiles from the children table (same parent_contact), add a second child", placeholder: "plan card, next payment, billing history, cancel — all ළඟදීම until PayHere; no invoice or card number is shown" },
  { route: "/parent/settings", screen: "Parent zone", real: "daily limit 15/20/30, sound, captions — saved to the child (columns or the fallback store)", placeholder: "—" },
  { route: "/parent/pin", screen: "Parent zone", real: "set / change the PIN (PBKDF2 hash per child)", placeholder: "—" },
  { route: "/parent/profiles", screen: "Subscription", real: "switch the active child; add a child", placeholder: "avatar art" },
  { route: "/parent/delete", screen: "Parent zone", real: "deletes session_log, child_progress, child_weaknesses, child_profile, teacher_review_flags, debug_reports, the extras object and the children row; clears the device's cookies", placeholder: "—" },
  { route: "/onboarding/1", screen: "Onboarding 1 · phone + OTP", real: "phone kept for parent_contact", placeholder: "OTP is a stub behind DEV_ONBOARDING=stub (labelled dev-only); otherwise ළඟදීම" },
  { route: "/onboarding/2", screen: "Onboarding 2 · child profile", real: "writes children (name, grade, parent_contact) + avatar; sets the device's child cookie", placeholder: "avatar art" },
  { route: "/onboarding/3", screen: "Onboarding 3 · consent", real: "stamps children.consent_given_at", placeholder: "privacy policy link (#)" },
  { route: "/onboarding/4", screen: "Onboarding 4 · subscription", real: "—", placeholder: "PayHere stub behind DEV_ONBOARDING=stub (labelled); prices from the export" },
  { route: "/offline", screen: "Offline", real: "served by the service worker when a navigation fails", placeholder: "—" },
  { route: "(session)", screen: "Loading / Paused / Rotate phone / Mic permission / Error", real: "wired to the runtime: preparing, ⏸, portrait, first ✋ (P1), status error", placeholder: "—" },
];
