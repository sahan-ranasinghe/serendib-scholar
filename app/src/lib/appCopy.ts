import { getLang } from "@/lib/langStore";
/**
 * Every child-facing and parent-facing string of the app shell, in one
 * table — the export's Sinhala verbatim (docs/design/export/handoff, Screens
 * A/B/C, README "Copy"), plus the few lines the runtime already carried.
 *
 * scripts/extract-copy.ts turns this into docs/review/app-copy.md for the
 * sign-off pass: a string that appears in the authored script is
 * `fromScript`; everything else is `drafted`. Strings the app needs but the
 * export has no Sinhala for are listed in MISSING and are NOT rendered —
 * the screen shows nothing there rather than an invented sentence.
 *
 * Templates use {name}-style holes filled by fmt().
 */

export interface CopyEntry {
  screen: string;
  si: string;
  en: string;
}

/**
 * The app's name (decision, docs/qa/session1-triage.md cluster I): the child
 * sees සාරා ටීචර්; "Zara Teacher" only where Latin is allowed (the splash
 * wordmark, the PWA manifest, the parent zone's English toggle). "Serendib
 * Scholar" is the company, and appears only in the parent zone's footer and
 * in infrastructure.
 */
export const APP_NAME_SI = "සාරා ටීචර්";
export const APP_NAME_EN = "Zara Teacher";
export const COMPANY_NAME = "Serendib Scholar";

export const COPY = {
  // --- wordmark and terms ---------------------------------------------------
  "brand.wordmarkSi": { screen: "Splash", si: APP_NAME_SI, en: `${APP_NAME_EN} (Sinhala wordmark)` },
  "brand.zaraTeacher": { screen: "Certificate", si: "සාරා ගුරුතුමිය", en: "Teacher Zara" },
  "brand.maths": { screen: "all", si: "ගණිතය", en: "Maths" },
  "common.soon": { screen: "all", si: "ළඟදීම", en: "Coming soon" },
  "common.minutesN": { screen: "all", si: "මිනිත්තු {n}", en: "{n} minutes" },
  "common.starsN": { screen: "all", si: "තරු {n}", en: "{n} stars" },
  "common.daysN": { screen: "all", si: "දින {n}", en: "{n} days (streak)" },
  "common.gradeN": { screen: "all", si: "{n} ශ්‍රේණිය", en: "Grade {n}" },
  "common.lessonN": { screen: "all", si: "පාඩම {n}", en: "Lesson {n}" },
  "common.sessionNth": { screen: "all", si: "{n} වෙනි සැසිය", en: "Session {n}" },
  "common.start": { screen: "all", si: "පටන් ගමු", en: "Let's start" },
  "common.back": { screen: "all", si: "‹", en: "back (glyph)" },
  "common.retry": { screen: "Edge", si: "ආයෙත් උත්සාහ කරන්න", en: "Try again" },
  "common.notYet": { screen: "Progress", si: "තාම නෑ", en: "Not yet" },
  "app.updateReady": { screen: "all", si: "අලුත් අනුවාදයක් — යාවත්කාලීන කරන්න", en: "A new version — update (the update banner; wording from the device report)" },

  // --- splash -------------------------------------------------------------------
  "splash.tagline": { screen: "Splash", si: "ඔයාගේම ගුරුතුමිය, ඔයාගේ ෆෝන් එකේ", en: "Your own teacher, on your phone" },
  "splash.language": { screen: "Splash", si: "භාෂාව", en: "Language" },
  "splash.sinhala": { screen: "Splash", si: "සිංහල", en: "Sinhala" },
  "splash.tamilSoon": { screen: "Splash", si: "தமிழ் · ළඟදීම", en: "Tamil · coming soon" },

  // --- home -----------------------------------------------------------------------
  "home.greeting": { screen: "Home", si: "ආයුබෝවන් {name}!", en: "Hello {name}!" },
  "home.startToday": { screen: "Home", si: "අද පාඩම පටන් ගමුද?", en: "Shall we start today's lesson?" },
  "home.continueKicker": { screen: "Home", si: "ගණිතය · පාඩම {lesson} · {session} වෙනි සැසිය", en: "Maths · Lesson {lesson} · Session {session}" },
  "home.today": { screen: "Home", si: "අද කරන්න", en: "To do today" },
  "home.continueLesson": { screen: "Home", si: "පාඩම දිගටම", en: "Continue the lesson" },
  "home.practice": { screen: "Home", si: "පුහුණුව", en: "Practice" },
  "home.yesterdayAgain": { screen: "Home", si: "ඊයේ නැවත", en: "Yesterday, again" },
  "home.subjects": { screen: "Home", si: "විෂයයන්", en: "Subjects" },
  "home.subjectSinhala": { screen: "Home", si: "සිංහල", en: "Sinhala (subject)" },
  "home.newBadge": { screen: "Home", si: "අලුත් ලාංඡනය — {name}", en: "New badge — {name}" },
  "home.badgeReason": { screen: "Home", si: "{concept} ඉගෙන ගත්තා", en: "Learned {concept}" },
  "home.badgesCount": { screen: "Home", si: "ලාංඡන {earned} / {total}", en: "Badges {earned} / {total}" },
  "home.parent": { screen: "Home", si: "දෙමාපිය", en: "Parent (lock button title)" },
  // --- the app shell (cluster H): quiet indicators, skeleton lines, optimistic writes -------
  "app.updating": { screen: "shell", si: "යාවත්කාලීන වෙමින්…", en: "Updating…" },
  "app.offlineCached": { screen: "shell", si: "අන්තර්ජාලය නෑ — පරණ තොරතුරු පෙන්වනවා", en: "No connection — showing the last copy" },
  "app.noData": { screen: "shell", si: "තොරතුරු ගන්න බැහැ — අන්තර්ජාලය බලලා ආයෙත් උත්සාහ කරන්න", en: "Could not load — check the connection and try again" },
  "app.saveFailed": { screen: "shell", si: "සුරකින්න බැරි වුණා — ආයෙත් උත්සාහ කරන්න", en: "Could not save — try again" },
  "app.resetting": { screen: "shell", si: "යළි පටන් ගන්නවා…", en: "Resetting…" },
  "app.checking": { screen: "shell", si: "බලනවා…", en: "Checking…" },
  "rewards.outfitSheet.owned": { screen: "Rewards", si: "ලේනා දැන් මේක අඳිනවා!", en: "Lena wears this now!" },
  "rewards.outfitSheet.locked": { screen: "Rewards", si: "තවම අගුළු දාලා", en: "Still locked" },
  "rewards.outfitSheet.earn": { screen: "Rewards", si: "කොටස් {n}ක් ඉගෙන ගත්තම ලේනාට මේ ඇඳුම ලැබෙනවා", en: "Master {n} concepts and Lena earns this outfit" },
  "rewards.outfitSheet.left": { screen: "Rewards", si: "තව කොටස් {n}යි", en: "{n} more to go" },
  "rewards.outfitSheet.art": { screen: "Rewards", si: "චිත්‍රය ළඟදීම", en: "Art coming soon" },
  "rewards.outfitSheet.close": { screen: "Rewards", si: "වහන්න", en: "Close" },
  "nav.home": { screen: "nav", si: "මුල් පිටුව", en: "Home" },
  "nav.lessons": { screen: "nav", si: "පාඩම්", en: "Lessons" },
  "nav.practice": { screen: "nav", si: "පුහුණුව", en: "Practice" },
  "nav.rewards": { screen: "nav", si: "තෑගි", en: "Rewards" },

  // --- lesson map / detail ---------------------------------------------------------
  "map.subtitle": { screen: "Lesson map", si: "පාඩම් {lessons} · තරු {stars} / {total}", en: "Lessons {lessons} · Stars {stars} / {total}" },
  "lesson.1": { screen: "Lesson map", si: "සංඛ්‍යා - 1", en: "Numbers - 1" },
  "lesson.2": { screen: "Lesson map", si: "සංඛ්‍යා - 2", en: "Numbers - 2" },
  "lesson.3": { screen: "Lesson map", si: "එකතු කිරීම", en: "Addition" },
  "lesson.4": { screen: "Lesson map", si: "අඩු කිරීම", en: "Subtraction" },
  "lesson.5": { screen: "Lesson map", si: "ගුණ කිරීම", en: "Multiplication" },
  "lesson.6": { screen: "Lesson map", si: "භාග", en: "Fractions" },
  "detail.kicker": { screen: "Lesson detail", si: "ගණිතය · පාඩම {lesson}", en: "Maths · Lesson {lesson}" },
  "detail.subtitle": { screen: "Lesson detail", si: "සැසි {sessions} · මිනිත්තු {minutes} · තරු {stars} / {total}", en: "Sessions {sessions} · Minutes {minutes} · Stars {stars} / {total}" },
  "detail.cta": { screen: "Lesson detail", si: "{n} වෙනි සැසිය පටන් ගමු", en: "Start session {n}" },
  "detail.resume": { screen: "Lesson detail", si: "ඉතුරු ටික කරමු", en: "Let's do the rest (resume) — from docs/qa/session1-triage.md" },
  "detail.restart": { screen: "Lesson detail", si: "මුල ඉඳන් ආයෙත්", en: "Again from the start (restart, confirm once) — from docs/qa/session1-triage.md" },

  // --- session summary ---------------------------------------------------------------
  "summary.title": { screen: "Session summary", si: "නියමයි {name}!", en: "Great, {name}!" },
  "summary.today": { screen: "Session summary", si: "අද ඔයා…", en: "Today you…" },
  "summary.tomorrow": { screen: "Session summary", si: "හෙට ආයෙත් එන්න", en: "Come back tomorrow" },
  "summary.more": { screen: "Session summary", si: "තව පොඩ්ඩක්", en: "A little more" },
  "summary.questions": { screen: "Session summary", si: "ප්‍රශ්න {asked} කින් {correct} ක් හරි", en: "{correct} of {asked} questions right" },
  "summary.minutes": { screen: "Session summary", si: "මිනිත්තු {n} ක්", en: "{n} minutes" },
  "summary.looked": { screen: "Session summary", si: "බැලුවා", en: "looked at (a concept seen, nothing asked)" },
  "summary.plusOne": { screen: "Session summary", si: "+1", en: "+1 (streak)" },

  // --- practice / quiz ---------------------------------------------------------------------
  "practice.title": { screen: "Practice hub", si: "පුහුණුව", en: "Practice" },
  "practice.subtitle": { screen: "Practice hub", si: "මිනිත්තු {n}ක් — එක් සංකල්පයක්", en: "{n} minutes — one concept" },
  "practice.rowSub": { screen: "Practice hub", si: "මිනිත්තු {minutes} · ප්‍රශ්න {n}", en: "{minutes} minutes · {n} questions" },
  "practice.pastPapers": { screen: "Practice hub", si: "🔒 පසුගිය ප්‍රශ්න", en: "Past papers (locked)" },
  "practice.challenge": { screen: "Practice hub", si: "⏱ අභියෝගය", en: "Challenge" },
  "practice.challengeSub": { screen: "Practice hub", si: "මිනිත්තු 5 · ප්‍රශ්න 10", en: "5 minutes · 10 questions" },
  "quiz.check": { screen: "Quiz", si: "පරීක්ෂා කරන්න", en: "Check" },
  "quiz.recapAsk": { screen: "Quiz", si: "මේකේ උත්තරේ මොකක්ද කියන්න බලන්න.", en: "See if you can say the answer to this one." },
  "quiz.colDigit": { screen: "Quiz", si: "ඉලක්කම", en: "digit (table column)" },
  "quiz.colPlace": { screen: "Quiz", si: "ඉලක්කම පිහිටි ස්ථානය", en: "the place the digit is in (table column)" },
  "quiz.colPlaceValue": { screen: "Quiz", si: "ස්ථානීය අගය", en: "place value (table column)" },
  "quiz.colValue": { screen: "Quiz", si: "ඉලක්කමෙන් නිරූපිත අගය", en: "value the digit represents (table column)" },
  "quiz.colName": { screen: "Quiz", si: "සංඛ්‍යා නාමය", en: "number name (table column)" },
  "quiz.done": { screen: "Quiz", si: "ප්‍රශ්න {asked} කින් {correct} ක් හරි", en: "{correct} of {asked} questions right" },

  // --- rewards / certificate ------------------------------------------------------------------
  "rewards.title": { screen: "Rewards", si: "තෑගි", en: "Rewards" },
  "rewards.subtitle": { screen: "Rewards", si: "ලාංඡන {earned} / {total} · සහතික {certs}", en: "Badges {earned} / {total} · Certificates {certs}" },
  "rewards.stickerBook": { screen: "Rewards", si: "ස්ටිකර් පොත", en: "Sticker book" },
  "rewards.sticker.1": { screen: "Rewards", si: "අලියා", en: "Elephant" },
  "rewards.sticker.2": { screen: "Rewards", si: "මොනරා", en: "Peacock" },
  "rewards.sticker.3": { screen: "Rewards", si: "නෙළුම", en: "Lotus" },
  "rewards.sticker.4": { screen: "Rewards", si: "කොත්තු", en: "Kottu" },
  "rewards.sticker.5": { screen: "Rewards", si: "ත්රීවීලර්", en: "Three-wheeler" },
  "rewards.sticker.6": { screen: "Rewards", si: "කිරිබත්", en: "Kiribath" },
  "rewards.sticker.7": { screen: "Rewards", si: "වෙසක් කූඩුව", en: "Vesak lantern" },
  "rewards.sticker.8": { screen: "Rewards", si: "ක්‍රිකට්", en: "Cricket" },
  "rewards.outfits": { screen: "Rewards", si: "ලේනාගේ ඇඳුම්", en: "Lena's outfits" },
  "rewards.outfit.1": { screen: "Rewards", si: "තොප්පිය", en: "Cap (Screens C; Screens B's data names it පාසල් තොප්පිය, school cap)" },
  "rewards.outfit.2": { screen: "Rewards", si: "හෙල්මට්", en: "Helmet (Screens C; Screens B: ක්‍රිකට් හෙල්මට්, cricket helmet)" },
  "rewards.outfit.3": { screen: "Rewards", si: "කූඩුව", en: "Lantern (Screens C; Screens B: වෙසක් කූඩුව, Vesak lantern)" },
  "rewards.certReady": { screen: "Rewards", si: "සහතිකය ලෑස්ති!", en: "Certificate ready!" },
  "rewards.certShow": { screen: "Rewards", si: "{concept} — අම්මාට පෙන්වන්න", en: "{concept} — show your mum" },
  "cert.title": { screen: "Certificate", si: "සහතිකය", en: "Certificate" },
  "cert.heading": { screen: "Certificate", si: "දක්ෂතා සහතිකය", en: "Certificate of achievement" },
  "cert.certifies": { screen: "Certificate", si: "මෙයින් සහතික කරනුයේ", en: "This certifies that" },
  "cert.body": { screen: "Certificate", si: "{grade} ශ්‍රේණියේ ගණිතය — {concept} සංකල්පය මනාව ප්‍රගුණ කළ බවයි.", en: "has mastered the concept {concept} in Grade {grade} maths." },
  "cert.share": { screen: "Certificate", si: "බෙදාගන්න", en: "Share" },
  "cert.print": { screen: "Certificate", si: "මුද්‍රණය (A4)", en: "Print (A4)" },
  "cert.printing": { screen: "Certificate", si: "මුද්‍රණයට යවනවා…", en: "Sending to print…" },
  "cert.copied": { screen: "Certificate", si: "ලින්ක් එක පිටපත් කළා", en: "Link copied" },
  "cert.sharing": { screen: "Certificate", si: "බෙදාගන්නවා…", en: "Sharing…" },
  "cert.month.9": { screen: "Certificate", si: "සැප්තැම්බර්", en: "September" },
  "cert.dateFormat": { screen: "Certificate", si: "{year} {month} {day}", en: "date: year month day" },

  // --- progress ----------------------------------------------------------------------------------
  "progress.title": { screen: "Progress", si: "මගේ ප්‍රගතිය", en: "My progress" },
  "progress.subtitle": { screen: "Progress", si: "ගණිතය · සංකල්ප {mastered} / {total}", en: "Maths · Concepts {mastered} / {total}" },
  "progress.status.best": { screen: "Progress", si: "හොඳටම", en: "Excellent" },
  "progress.status.good": { screen: "Progress", si: "හොඳයි", en: "Good" },
  "progress.status.practise": { screen: "Progress", si: "පුරුදු වෙමු", en: "Let's practise" },
  "progress.sentence.both": { screen: "Progress", si: "{name}, {best} හොඳට තේරුම් ගත්තා. {weak} තව පොඩ්ඩක් පුරුදු වෙමු!", en: "{name}, you understood {best} well. Let's practise {weak} a little more!" },

  // --- onboarding -------------------------------------------------------------------------------------
  "onb.stepOf": { screen: "Onboarding", si: "පියවර {n} / 4", en: "Step {n} / 4" },
  "onb.toggleSi": { screen: "Onboarding", si: "සිං", en: "සිං" },
  "onb.1.bubble": { screen: "Onboarding 1", si: "ආයුබෝවන්! මම සාරා. දරුවාගේ ගිණුම හදන්න මිනිත්තු දෙකක් විතර යනවා.", en: "Hello! I'm Zara. Setting up your child's account takes about two minutes." },
  "onb.1.title": { screen: "Onboarding 1", si: "දුරකථන අංකය තහවුරු කරමු", en: "Let's confirm your phone number" },
  "onb.1.phone": { screen: "Onboarding 1", si: "දුරකථන අංකය", en: "Phone number" },
  "onb.1.code": { screen: "Onboarding 1", si: "SMS මගින් ලැබුණු කේතය", en: "The code you got by SMS" },
  "onb.1.resend": { screen: "Onboarding 1", si: "කේතය ලැබුණේ නැද්ද? ආයෙත් එවන්න ({t})", en: "Didn't get the code? Send again ({t}) — counts down once from 0:30, never loops" },
  "onb.1.resendNow": { screen: "Onboarding 1", si: "ආයෙත් එවන්න", en: "Send again (the one resend, after 30 s) — the export's own words" },
  "onb.1.send": { screen: "Onboarding 1", si: "කේතය එවන්න", en: "Send the code (composed from the export's කේතය … එවන්න)" },
  "onb.1.devNotice": { screen: "Onboarding 1", si: "SMS තහවුරු කිරීම තවම සක්‍රීය නැහැ", en: "SMS verification is not active yet (dev notice, wording from docs/qa)" },
  "onb.1.devNoticeEn": { screen: "Onboarding 1", si: "dev: any 4-digit code works", en: "English half of the dev notice (a parent surface)" },
  "onb.next": { screen: "Onboarding", si: "ඉදිරියට", en: "Next" },
  "onb.2.bubble": { screen: "Onboarding 2", si: "දරුවාට මම කතා කරන්නේ මේ නමින්.", en: "This is the name I'll call your child by." },
  "onb.2.title": { screen: "Onboarding 2", si: "දරුවා ගැන කියන්න", en: "Tell me about your child" },
  "onb.2.name": { screen: "Onboarding 2", si: "දරුවාගේ නම", en: "Child's name" },
  "onb.2.avatar": { screen: "Onboarding 2", si: "අවතාරය", en: "Avatar" },
  "onb.2.grade": { screen: "Onboarding 2", si: "ශ්‍රේණිය", en: "Grade" },
  "onb.2.school": { screen: "Onboarding 2", si: "පාසල (අත්‍යවශ්‍ය නොවේ)", en: "School (optional)" },
  "onb.2.schoolPlaceholder": { screen: "Onboarding 2", si: "පාසලේ නම", en: "School name" },
  "avatar.elephant": { screen: "Onboarding 2", si: "අලියා", en: "Elephant" },
  "avatar.peacock": { screen: "Onboarding 2", si: "මොනරා", en: "Peacock" },
  "avatar.squirrel": { screen: "Onboarding 2", si: "ලේනා", en: "Squirrel" },
  "avatar.turtle": { screen: "Onboarding 2", si: "කැස්බෑවා", en: "Turtle" },
  "avatar.parrot": { screen: "Onboarding 2", si: "ගිරවා", en: "Parrot" },
  "avatar.leopard": { screen: "Onboarding 2", si: "කොටියා", en: "Leopard" },
  "avatar.deer": { screen: "Onboarding 2", si: "මුවා", en: "Deer" },
  "avatar.fish": { screen: "Onboarding 2", si: "මාළුවා", en: "Fish" },
  "onb.3.bubble": { screen: "Onboarding 3", si: "ඔබ දැනගත යුතු දේවල් තුනක් — සරලව.", en: "Three things you should know — simply." },
  "onb.3.title": { screen: "Onboarding 3", si: "අපි කරන දේ, නොකරන දේ", en: "What we do, what we don't" },
  "onb.3.c1.t": { screen: "Onboarding 3", si: "දරුවා කියන දේ අකුරු වලට හැරෙනවා", en: "What your child says becomes text" },
  "onb.3.c1.d": { screen: "Onboarding 3", si: "පිළිතුරු ලියවෙනවා. හඬ රෙකෝඩ් කරන්නේ නෑ — කවදාවත්ම නෑ.", en: "Answers are written down. The voice is never kept — ever." },
  "onb.3.c2.t": { screen: "Onboarding 3", si: "ඔබට පෙනෙන්නේ", en: "What you see" },
  "onb.3.c2.d": { screen: "Onboarding 3", si: "මිනිත්තු, සැසි, ඉගෙන ගත් සංකල්ප සහ වැරදුණු ප්‍රශ්න — සතිපතා වාර්තාවේ.", en: "Minutes, sessions, concepts learned and missed questions — in the weekly report." },
  "onb.3.c3.t": { screen: "Onboarding 3", si: "මකන්න ඕනෑම වෙලාවක", en: "Delete any time" },
  "onb.3.c3.d": { screen: "Onboarding 3", si: "දෙමාපිය කලාපයෙන් එක තැනකින් ගිණුම සහ සියලු දත්ත මකා දමන්න පුළුවන්.", en: "From one place in the parent zone you can delete the account and all its data." },
  "onb.3.privacy": { screen: "Onboarding 3", si: "සම්පූර්ණ රහස්‍යතා ප්‍රතිපත්තිය", en: "Full privacy policy" },
  "onb.3.cta": { screen: "Onboarding 3", si: "එකඟයි", en: "I agree" },
  "onb.4.bubble": { screen: "Onboarding 4", si: "පළමු සතිය නොමිලේ. කැමති නැත්නම් නවත්වන්න පුළුවන්.", en: "The first week is free. If you don't like it you can stop." },
  "onb.4.title": { screen: "Onboarding 4", si: "සැලැස්ම තෝරන්න", en: "Choose a plan" },
  "onb.4.freeWeek": { screen: "Onboarding 4", si: "පළමු සතිය නොමිලේ", en: "First week free" },
  "onb.4.oneChild": { screen: "Onboarding 4", si: "දරුවෙක්", en: "One child" },
  "onb.4.twoChildren": { screen: "Onboarding 4", si: "දරුවන් 2ක්", en: "Two children" },
  "onb.4.perMonth": { screen: "Onboarding 4", si: " / මාසයකට", en: " / per month" },
  "onb.4.price1": { screen: "Onboarding 4", si: "රු. 1,000", en: "Rs. 1,000" },
  "onb.4.price2": { screen: "Onboarding 4", si: "රු. 1,600", en: "Rs. 1,600" },
  "onb.4.includes": { screen: "Onboarding 4", si: "සියලු පාඩම් · සතිපතා වාර්තාව · ඕනෑම වෙලාවක නවත්වන්න", en: "All lessons · weekly report · cancel any time" },
  "onb.4.payment": { screen: "Onboarding 4", si: "ගෙවීම — PayHere", en: "Payment — PayHere" },
  "onb.4.card": { screen: "Onboarding 4", si: "කාඩ්පත", en: "Card" },
  "onb.4.bank": { screen: "Onboarding 4", si: "බැංකුව", en: "Bank" },
  "onb.4.sms": { screen: "Onboarding 4", si: "නොමිලේ සතිය අවසන් වීමට දින 2කට පෙර අපි ඔබට SMS එකක් එවනවා. අද ගෙවීමක් නෑ.", en: "We'll SMS you two days before the free week ends. No payment today." },
  "onb.4.cta": { screen: "Onboarding 4", si: "නොමිලේ සතිය පටන් ගන්න", en: "Start the free week" },
  "onb.4.skip": { screen: "Onboarding 4", si: "පසුව තීරණය කරන්නම්", en: "I'll decide later" },

  // --- parent zone ------------------------------------------------------------------------------------
  "parent.title": { screen: "Parent zone", si: "දෙමාපිය කලාපය", en: "Parent zone" },
  "parent.childLine": { screen: "Parent zone", si: "{name} · {grade} ශ්‍රේණිය", en: "{name} · Grade {grade}" },
  "parent.minWeek": { screen: "Parent zone", si: "සතියකට මිනිත්තු", en: "Minutes / week" },
  "parent.sessions": { screen: "Parent zone", si: "සැසි", en: "Sessions" },
  "parent.confident": { screen: "Parent zone", si: "සංකල්ප විශ්වාසයි", en: "Concepts confident" },
  "parent.row.report": { screen: "Parent zone", si: "සතිපතා වාර්තාව", en: "Weekly report" },
  "parent.row.billing": { screen: "Parent zone", si: "දායකත්වය සහ බිල්පත්", en: "Subscription and billing" },
  "parent.row.limit": { screen: "Parent zone", si: "දිනපතා කාල සීමාව", en: "Daily time limit" },
  "parent.row.chatLimit": { screen: "Parent zone", si: "සාරා එක්ක කතා කරන කාලය (දිනකට)", en: "Time to talk with Zara (per day)" },
  "parent.row.sound": { screen: "Parent zone", si: "ශබ්දය සහ උපසිරැසි", en: "Sound and captions" },
  "parent.row.soundOn": { screen: "Parent zone", si: "ශබ්දය ✓", en: "Sound ✓" },
  "parent.row.captionsOn": { screen: "Parent zone", si: "උපසිරැසි ✓", en: "Captions ✓" },
  "parent.row.profiles": { screen: "Parent zone", si: "දරුවන්ගේ පැතිකඩ", en: "Children's profiles" },
  "parent.row.profilesSub": { screen: "Parent zone", si: "දෙවැනි දරුවා එක් කරන්න", en: "Add a second child" },
  "parent.row.pin": { screen: "Parent zone", si: "PIN වෙනස් කරන්න", en: "Change PIN" },
  "parent.row.help": { screen: "Parent zone", si: "උදව්", en: "Help" },
  "parent.row.delete": { screen: "Parent zone", si: "ගිණුම සහ දත්ත මකන්න", en: "Delete account and data" },
  "parent.whatsapp": { screen: "Parent zone", si: "WhatsApp උදව් — {number}", en: "WhatsApp help — {number}" },
  "parent.pinSet": { screen: "Parent zone", si: "PIN සකසා ඇත", en: "PIN is set" },
  "pin.label": { screen: "Parent zone", si: "PIN එක", en: "The PIN (field label)" },
  "pin.again": { screen: "Parent zone", si: "ආයෙත් ටයිප් කරන්න", en: "Type it again (second field when setting a PIN)" },
  "pin.current": { screen: "Parent zone", si: "දැන් තියෙන PIN එක", en: "The current PIN (change-PIN screen)" },
  "pin.new": { screen: "Parent zone", si: "අලුත් PIN එක", en: "The new PIN (change-PIN screen)" },
  "pin.mismatch": { screen: "Parent zone", si: "PIN දෙක ගැළපෙන්නේ නෑ. ආයෙත් ටයිප් කරන්න.", en: "The two PINs do not match. Type it again." },
  "pin.show": { screen: "Parent zone", si: "PIN එක පෙන්වන්න", en: "Show the PIN (eye button)" },
  "pin.hide": { screen: "Parent zone", si: "PIN එක හංගන්න", en: "Hide the PIN (eye button)" },
  "home.switchChild": { screen: "Home", si: "දරුවා මාරු කරන්න", en: "Switch child (header avatar, sheet title)" },
  "home.addChild": { screen: "Home", si: "+ දරුවෙක් එක් කරන්න", en: "+ Add a child" },
  "common.close": { screen: "all", si: "වහන්න", en: "Close" },
  "parent.pinWrong": { screen: "Parent zone", si: "කේතය වැරදියි. ආයෙත් බලලා ලියන්න.", en: "Wrong code. Check and type it again." },
  "parent.active": { screen: "Subscription", si: "සක්‍රීයයි", en: "Active" },
  "report.title": { screen: "Weekly report", si: "සතිපතා වාර්තාව", en: "Weekly report" },
  "report.rangeChild": { screen: "Weekly report", si: "{range} · {name}", en: "{range} · {name}" },
  "report.sentence.both": { screen: "Weekly report", si: "{name} {best} හොඳට තේරුම් ගත්තා; {weak} තව පුරුදු වෙන්න ඕනේ.", en: "{name} understood {best} well; {weak} needs more practice." },
  "report.dailyMinutes": { screen: "Weekly report", si: "දිනපතා මිනිත්තු", en: "Daily minutes" },
  "report.day.1": { screen: "Weekly report", si: "ස", en: "Mon" },
  "report.day.2": { screen: "Weekly report", si: "අ", en: "Tue" },
  "report.day.3": { screen: "Weekly report", si: "බ", en: "Wed" },
  "report.day.4": { screen: "Weekly report", si: "බ්‍ර", en: "Thu" },
  "report.day.5": { screen: "Weekly report", si: "සි", en: "Fri" },
  "report.day.6": { screen: "Weekly report", si: "සෙ", en: "Sat" },
  "report.day.7": { screen: "Weekly report", si: "ඉ", en: "Sun" },
  "report.confident": { screen: "Weekly report", si: "විශ්වාසයි", en: "Confident" },
  "report.needsWork": { screen: "Weekly report", si: "තව පුරුදු වෙන්න", en: "Needs more practice" },
  "report.missed": { screen: "Weekly report", si: "වැරදුණු ප්‍රශ්න", en: "Missed questions" },
  "report.gave": { screen: "Weekly report", si: "දුන්නේ: {a}", en: "Gave: {a}" },
  "report.correct": { screen: "Weekly report", si: "නිවැරදි: {c}", en: "Correct: {c}" },
  "report.sharePdf": { screen: "Weekly report", si: "PDF ලෙස බෙදාගන්න", en: "Share as PDF" },
  "sub.title": { screen: "Subscription", si: "දායකත්වය සහ බිල්පත්", en: "Subscription and billing" },
  "sub.plan": { screen: "Subscription", si: "දරුවෙක් · මාසිකව", en: "One child · monthly" },
  "sub.nextPayment": { screen: "Subscription", si: "ඊළඟ ගෙවීම {date} · {method}", en: "Next payment {date} · {method}" },
  "sub.switchTwo": { screen: "Subscription", si: "දරුවන් 2කට මාරු වෙන්න", en: "Switch to two children" },
  "sub.changeMethod": { screen: "Subscription", si: "ගෙවීම් ක්‍රමය වෙනස් කරන්න", en: "Change payment method" },
  "sub.history": { screen: "Subscription", si: "බිල්පත් ඉතිහාසය", en: "Billing history" },
  "sub.addChild": { screen: "Subscription", si: "+ දෙවැනි දරුවා එක් කරන්න", en: "+ Add a second child" },
  "sub.cancel": { screen: "Subscription", si: "දායකත්වය නවත්වන්න", en: "Cancel the subscription" },
  "profiles.gradeLine": { screen: "Subscription", si: "{grade} ශ්‍රේණිය · PIN සකසා ඇත", en: "Grade {grade} · PIN is set" },

  // --- edge states ----------------------------------------------------------------------------------
  "edge.loading.title": { screen: "Edge", si: "පාඩම ලෑස්ති වෙනවා…", en: "The lesson is getting ready…" },
  "edge.loading.body": { screen: "Edge", si: "සාරා ගුරුතුමිය පුවරුව හදාගන්නවා.", en: "Teacher Zara is setting up the board." },
  "edge.offline.title": { screen: "Edge", si: "අන්තර්ජාලය නෑ වගේ", en: "Looks like there's no internet" },
  "edge.offline.body": { screen: "Edge", si: "Wi-Fi හරි ඩේටා හරි බලලා ආයෙත් උත්සාහ කරමු. ඔයා කරපු දේවල් සුරැකිලා තියෙනවා.", en: "Check Wi-Fi or data and let's try again. Your progress is safe." },
  "edge.paused.title": { screen: "Edge", si: "පාඩම නවත්වලා", en: "Lesson paused" },
  "edge.paused.body": { screen: "Edge", si: "ලෑස්ති වුණාම දිගටම යමු.", en: "When you're ready, let's continue." },
  "edge.paused.resume": { screen: "Edge", si: "▶ දිගටම", en: "▶ Continue" },
  "edge.paused.stop": { screen: "Edge", si: "නවත්වන්න", en: "Stop" },
  // The ✋ chat shows the child's turn as this neutral bubble, never as the Live API's input transcription (23 Sep 2026: the
  // transcription channel misdetects the language independently of the model's understanding — the words shown were wrong).
  // The playback panel (23 Sep 2026): the position in words, and the one button that plays while paused.
  "nav.stepN": { screen: "Session", si: "{n} වෙනි පියවර", en: "Step {n} (the playback panel's position, after the concept's name)" },
  "nav.listen": { screen: "Session", si: "🔊 ආයෙත් අහන්න", en: "🔊 Hear it again (plays the selected step's line once)" },
  "chat.childSpoke": { screen: "Session", si: "ඔයා කතා කළා", en: "You spoke (the child's turn in the chat, in place of a transcript)" },
  // The ✋ chat never fails silently (28 Sep 2026): Zara says what happened on the panel, which stays until the child closes it.
  "chat.outOfTime": { screen: "Session", si: "අද කතා කරන්න පුළුවන් වෙලාව ඉවරයි, හෙට ආයෙත් කතා කරමු", en: "Today's chat time is used up — let's talk again tomorrow (the daily chat budget is spent)" },
  "chat.failNetwork": { screen: "Session", si: "අන්තර්ජාලය නෑ වගේ. ටිකකින් ආයෙත් කතා කරමු.", en: "Looks like there's no internet. Let's talk again in a little while (the chat could not reach the server)" },
  "chat.failStart": { screen: "Session", si: "සම්බන්ධ වෙන්න බැරි වුණා. ආයෙත් උත්සාහ කරන්න.", en: "Couldn't connect. Try again (the chat session could not be started)" },
  "chat.failDropped": { screen: "Session", si: "කතාව මැදින් නැවතුණා. ආයෙත් ✋ ඔබන්න.", en: "The chat stopped part-way. Tap ✋ again (the live connection closed)" },
  "edge.rotate.title": { screen: "Edge", si: "ෆෝන් එක හරහට කරන්න", en: "Turn your phone sideways" },
  "edge.rotate.body": { screen: "Edge", si: "පුවරුව හොඳට පේන්න පාඩම හරහට තියෙන්නේ.", en: "The lesson is landscape so the board shows well." },
  "edge.mic.title": { screen: "Edge", si: "මයික් එකට අවසර දෙන්න", en: "Allow the microphone" },
  "edge.mic.body": { screen: "Edge", si: "ඔයා දෙන උත්තර මට අහන්න ඕනේ. කටහඬ රෙකෝඩ් කරන්නේ නෑ — වචන විතරයි.", en: "I need to hear your answers. The voice isn't kept — only the words." },
  "edge.mic.allow": { screen: "Edge", si: "අවසර දෙන්න", en: "Allow" },
  "edge.mic.type": { screen: "Edge", si: "ටයිප් කරන්නම්", en: "I'll type" },
  "edge.error.title": { screen: "Edge", si: "අපොයි, මගේ අතින් වැරැද්දක්", en: "Oops, my mistake" },
  "edge.error.body": { screen: "Edge", si: "මට පොඩි ප්‍රශ්නයක් ආවා. ආයෙත් උත්සාහ කරමුද?", en: "I hit a small problem. Shall we try again?" },
  "edge.error.home": { screen: "Edge", si: "මුල් පිටුවට", en: "To home" },

  // --- lesson runtime lines the shell reuses (already in the codebase) ------------------------------
  "gate.title": { screen: "Session", si: "ප්‍රවේශ කේතය ඇතුළත් කරන්න", en: "Enter the access code" },
  "gate.sub": { screen: "Session", si: "(දෙමාපියන් සඳහා — මේ උපකරණයේ එක වතාවක් පමණයි)", en: "(for parents — once on this device)" },
  "gate.enter": { screen: "Session", si: "ඇතුල් වෙන්න", en: "Enter" },
  "session.connectFail": { screen: "Session", si: "සම්බන්ධ වෙන්න බැරි වුණා. ආයෙත් උත්සාහ කරන්න.", en: "Couldn't connect. Try again." },
  "session.leaveAsk": { screen: "Session", si: "නවත්වමුද?", en: "Shall we stop? (⏹ asks once — from the device triage)" },
  "session.leaveBody": { screen: "Session", si: "ඉතුරු ටික පස්සේ කරන්න පුළුවන්.", en: "You can do the rest later." },
  "session.restartAsk": { screen: "Session", si: "මුල ඉඳන්ම ආයෙත් පටන් ගමුද?", en: "Shall we start again from the very beginning? (↺ asks once)" },
  // --- added in the native review round (29 Sep 2026, docs/review/app-copy-corrections.json) ---
  "install.explain": { screen: "Session summary", si: "බෝඩ් එක මුළු තිරයේම පේන්න, මාව ඔයාගේ ෆෝන් එකේ මුල් පිටුවට දාගන්න.", en: "Put me on your phone's home screen so the board fills the whole screen (the install prompt, Zara's bubble)" },
  "install.accept": { screen: "Session summary", si: "මුල් පිටුවට දාගන්න", en: "Add to home screen (the install prompt's button)" },
  "pin.create": { screen: "Parent zone", si: "දෙමාපිය කලාපයට PIN එකක් හදන්න", en: "Create a PIN for the parent zone" },
  "pin.enter": { screen: "Parent zone", si: "PIN එක ඇතුළත් කරන්න", en: "Enter your PIN" },
  "pin.saved": { screen: "Parent zone", si: "PIN එක සුරැකුණා", en: "PIN saved" },
  "limit.reached": { screen: "Session summary", si: "අදට වෙලාව ඉවරයි — හෙට ආයෙත් හම්බවෙමු", en: "Today's time is up — see you tomorrow (the summary after the daily limit ended a sitting)" },
  "delete.confirm": { screen: "Parent zone", si: "මෙයින් දරුවාගේ ගිණුම සහ දත්ත සම්පූර්ණයෙන්ම මැකෙනවා. මෙය ආපසු හැරවිය නොහැක.", en: "This deletes the child's account and all their data. It cannot be undone." },
  "delete.done": { screen: "Parent zone", si: "මකා දැමුවා", en: "Deleted" },
  "profiles.title": { screen: "Parent zone", si: "දරුවන්ගේ පැතිකඩ", en: "Children's profiles" },
  "settings.title": { screen: "Parent zone", si: "කාල සීමාව / ශබ්දය සහ උපසිරැසි", en: "Time limit / sound & captions" },
  "summary.none": { screen: "Session summary", si: "තාම පාඩම් කරලා නෑ", en: "No session recorded yet" },
  "month.names": { screen: "Weekly report / Certificate", si: "ජන., පෙබ., මාර්තු, අප්‍රේල්, මැයි, ජූනි, ජූලි, අගෝ., සැප්., ඔක්., නොවැ., දෙසැ.", en: "Jan., Feb., Mar., Apr., May, Jun., Jul., Aug., Sep., Oct., Nov., Dec." },
  "practice.empty": { screen: "Practice hub", si: "තාම පුරුදු වෙන්න දේවල් නෑ — මුලින්ම පාඩමක් කරලා එමු", en: "Nothing to practise yet — finish a session first" },
  "onboarding.devStub": { screen: "Onboarding", si: "DEV ONLY — OTP සහ ගෙවීම් පරීක්ෂණ සඳහා පමණයි", en: "DEV ONLY — OTP and payment are for testing only" },
  "quiz.expansionAsk": { screen: "Quiz", si: "මෙතන තියෙන්න ඕනේ අගය මොකක්ද?", en: "What value should go here? (an expansion item)" },
  "nav.back": { screen: "Session", si: "පෙර පියවර", en: "Back a step (⏮ on the playback panel — its accessible name)" },
  "nav.forward": { screen: "Session", si: "ඊළඟ පියවර", en: "Forward a step (⏭ on the playback panel — its accessible name)" },
  "nav.panel": { screen: "Session", si: "මේ පාඩමේ පියවර", en: "The steps of this lesson (the playback panel's name: its position, step strip, ⏮ ⏭)" },
  // --- accessible names of the child's controls (29 Sep 2026, follow-up): a screen reader speaks Sinhala to a Sinhala child ---
  "a11y.backspace": { screen: "all", si: "මකන්න", en: "Backspace (⌫ on the number pad and the word bank)" },
  "a11y.done": { screen: "all", si: "හරි", en: "Done (✓ on the number pad and the word bank)" },
  "a11y.close": { screen: "all", si: "වහන්න", en: "Close (the quiz's ✕, the page view's ✕)" },
  "a11y.back": { screen: "all", si: "ආපහු", en: "Back (the ‹ in a screen's header)" },
  // Drafted (29 Sep 2026, second follow-up) in the lesson's own words — කූරට … පබළු … දානවා, හිස්තැන — for sign-off.
  "a11y.beadDrag": { screen: "all", si: "පබළුවක් කූරකට දාන්න", en: "Put a bead on a rod (the abacus tray's bead, dragged onto a rod)" },
  // Drafted (1 Oct 2026) from two reviewed strings — board.beads (පබළු) and board.tapHint (ඔබන්න) — for sign-off.
  "a11y.rodTap": { screen: "all", si: "{rod}: පබළු {n} — ඔබන්න", en: "{rod}: {n} beads — tap (a rod of the abacus the child may tap; {rod} is the rod's own label)" },
  "a11y.blank": { screen: "all", si: "හිස්තැන", en: "Blank (an empty box in the older lesson view)" },
  "a11y.pageLoading": { screen: "all", si: "පොතේ පිටුව එනවා", en: "The book's page is loading (the page view's spinner)" },
  // --- moved from the code into the sheet (29 Sep 2026, docs/cms/content-inventory.md §16): wording unchanged ---
  "session.handAsk": { screen: "Session", si: "සාරාගෙන් අහන්න", en: "Ask Zara (the ✋ door's name while the chat is closed)" },
  "session.handClose": { screen: "Session", si: "කතාව වහන්න", en: "Close the chat (the ✋ door's name while the chat is open)" },
  "session.pause": { screen: "Session", si: "විරාමය", en: "Pause (⏸ in the strip)" },
  "session.captions": { screen: "Session", si: "උපසිරැසි", en: "Captions (the strip's captions control)" },
  "session.captionsGlyph": { screen: "Session", si: "සි", en: "The captions control's glyph (සි for සිංහල)" },
  "chat.panelName": { screen: "Session", si: "සාරා එක්ක කතාව", en: "Talking with Zara (the chat panel's name)" },
  "chat.listening": { screen: "Session", si: "අහගෙන ඉන්නවා", en: "Listening (the chat panel's pill)" },
  "chat.connecting": { screen: "Session", si: "සම්බන්ධ වෙනවා…", en: "Connecting… (the chat panel's pill)" },
  "chat.closeToLesson": { screen: "Session", si: "කතාව වහලා පාඩමට යන්න", en: "Close the chat and go back to the lesson (✕)" },
  "edge.mic.whenAsked": { screen: "Edge", si: "ඔයා ✋ ඔබලා මගෙන් ප්‍රශ්නයක් අහද්දී විතරයි මම අහන්නේ.", en: "I only listen when you press ✋ and ask me something (the mic sheet's first point)" },
  "edge.mic.orType": { screen: "Edge", si: "කැමති නැත්නම් ටයිප් කරලාත් අහන්න පුළුවන්.", en: "If you'd rather not, you can type your question instead (the mic sheet's third point)" },
  "session.minutesToday": { screen: "Session", si: "අද විනාඩි {n}ක්", en: "{n} minutes today (the daily-limit close card)" },
  "session.micDeclined": { screen: "Session", si: "හරි, පාඩම දිගටම යමු", en: "OK, let's carry on with the lesson (after 'I'll type' on the mic sheet)" },
  "session.micRefused": { screen: "Session", si: "කටහඬ නැතුව කතා කරන්න බෑ — පාඩම දිගටම යමු", en: "Can't talk without the microphone — let's carry on (the browser refused it)" },
  "session.rotateHint": { screen: "Session", si: "දුරකථනය හරවන්න — පාඩම නවත්තලා", en: "Turn the phone — the lesson is paused" },
  "session.backgroundHint": { screen: "Session", si: "ආයෙත් ආවම අපි දිගටම යමු", en: "We'll carry on when you come back (the tab was hidden)" },
  "session.talkingHint": { screen: "Session", si: "සාරා කතා කරනවා — ටිකක් ඉන්න, ඊළඟට ඔයාගේ වාරයයි", en: "Zara is talking — wait a moment, your turn is next (a tap while she talks)" },
  "progress.lessonParts": { screen: "Session", si: "පාඩමේ කොටස්", en: "The lesson's parts (the strip's concept stops)" },
  "progress.masteredStar": { screen: "Session", si: "ප්‍රවීණයි", en: "Mastered (a stop's star)" },
  "board.numberPad": { screen: "Session", si: "අංක පුවරුව", en: "Number pad (the 🔢 button's name)" },
  "board.tapHint": { screen: "Session", si: "👆 ඔබන්න", en: "👆 Tap (the hint on a touch turn)" },
  "board.beads": { screen: "Session", si: "පබළු", en: "Beads (the abacus's bead tray)" },
  "board.bookDigits": { screen: "Session", si: "පොතේ ඉලක්කම්", en: "The book's digits (the digit puzzle's cards)" },
  "board.builtNumbers": { screen: "Session", si: "හදපු සංඛ්‍යා {n}", en: "Numbers made {n} (the digit puzzle's ledger)" },
  "board.total": { screen: "Session", si: "එකතුව", en: "Total (under the money)" },
  "board.rupees": { screen: "Session", si: "රු.", en: "Rs. (on a note)" },
  "board.place.tenThousands": { screen: "Session", si: "දස දහසේ ඒවා", en: "Ten-thousands (the place-value strip's column)" },
  "board.place.thousands": { screen: "Session", si: "දහසේ ඒවා", en: "Thousands" },
  "board.place.hundreds": { screen: "Session", si: "සියයේ ඒවා", en: "Hundreds" },
  "board.place.tens": { screen: "Session", si: "දහයේ ඒවා", en: "Tens" },
  "board.place.ones": { screen: "Session", si: "එකේ ඒවා", en: "Ones" },
  "board.rod.tenThousands": { screen: "Session", si: "දසදා", en: "Ten-thousands (the label under the abacus rod)" },
  "board.rod.thousands": { screen: "Session", si: "දා", en: "Thousands (rod label)" },
  "board.rod.hundreds": { screen: "Session", si: "සි", en: "Hundreds (rod label)" },
  "board.rod.tens": { screen: "Session", si: "ද", en: "Tens (rod label)" },
  "board.rod.ones": { screen: "Session", si: "එ", en: "Ones (rod label)" },
  "legacy.rod.lakhs": { screen: "Session", si: "ලක්", en: "Hundred-thousands (the older abacus's rod label)" },
  "legacy.rod.tenThousands": { screen: "Session", si: "දද", en: "Ten-thousands (the older abacus's rod label)" },
  "legacy.childAnswer": { screen: "Session", si: "ඔයාගේ උත්තරය: {answer}", en: "Your answer: {answer} (under the older abacus)" },
  "legacy.thisOne": { screen: "Session", si: "දැන් මේක", en: "This one now (the older table's active blank)" },
  "legacy.typeAnswer": { screen: "Session", si: "ඔබේ පිළිතුර ටයිප් කරන්න", en: "Type your answer (the older table's input)" },
  "legacy.sendAnswer": { screen: "Session", si: "පිළිතුර යවන්න", en: "Send the answer" },
  "legacy.example": { screen: "Session", si: "උදාහරණයක්:", en: "For example:" },
  "legacy.col.name": { screen: "Session", si: "නම", en: "Name" },
  "legacy.col.value": { screen: "Session", si: "නිරූපිත අගය", en: "Value represented" },
  "legacy.col.before": { screen: "Session", si: "පෙර සංඛ්‍යාව", en: "The number before" },
  "legacy.col.after": { screen: "Session", si: "පසු සංඛ්‍යාව", en: "The number after" },
  "app.rateLimited": { screen: "shell", si: "පොඩ්ඩක් ඉන්න — ටිකකින් ආයෙත් උත්සාහ කරන්න.", en: "Wait a moment — try again shortly (too many requests)" },
  "app.workLimit": { screen: "shell", si: "අද වැඩ ගොඩක් කළා! පොඩ්ඩක් ඉන්න, පස්සේ ආයෙත් උත්සාහ කරන්න.", en: "You've done a lot today! Wait a little, then try again (a daily budget reached)" },
  // --- the lesson's names on the board and the cards: concept titles, exercise titles, table columns, the close card ---
  "concept.lessonOpening": { screen: "Session", si: "පාඩම පටන් ගමු", en: "Let's start the lesson" },
  "concept.readWrite4Digit": { screen: "Session", si: "සංඛ්‍යා කියවමු, ලියමු", en: "Reading and writing numbers" },
  "concept.placeValue4Digit": { screen: "Session", si: "ස්ථානීය අගය", en: "Place value" },
  "concept.abacusRepresentation": { screen: "Session", si: "ගණක රාමුව", en: "The abacus" },
  "concept.expandedForm": { screen: "Session", si: "විහිදුවා ලිවීම", en: "Expanded form" },
  "concept.compareNumbers": { screen: "Session", si: "සංඛ්‍යා සසඳමු", en: "Comparing numbers" },
  "concept.orderNumbers": { screen: "Session", si: "පිළිවෙළට තබමු", en: "Putting numbers in order" },
  "concept.numberNames": { screen: "Session", si: "සංඛ්‍යා නාම", en: "Number names" },
  "concept.fiveDigit": { screen: "Session", si: "ඉලක්කම් පහේ සංඛ්‍යා", en: "Five-digit numbers" },
  "concept.expandedForm4Digit": { screen: "Session", si: "විහිදුවා ලිවීම", en: "Expanded form" },
  "concept.beyond9999": { screen: "Session", si: "9 999ට එහා", en: "Beyond 9 999" },
  "concept.digitGroupingRule": { screen: "Session", si: "ඉලක්කම් කණ්ඩායම්", en: "Grouping the digits" },
  "concept.tenThousandsPlace": { screen: "Session", si: "දසදහසස්ථානය", en: "The ten-thousands place" },
  "concept.placeValueTable5Digit": { screen: "Session", si: "ස්ථානීය අගය · ඉලක්කම් පහ", en: "Place value \u00b7 five digits" },
  "concept.expandedForm5Digit": { screen: "Session", si: "විහිදුවා ලිවීම · ඉලක්කම් පහ", en: "Expanded form \u00b7 five digits" },
  "item.7b58e436": { screen: "Session", si: "ස්ථානීය අගය වගුව", en: "The place-value table" },
  "item.4c2aa078": { screen: "Session", si: "සංඛ්‍යා නාම වගුව", en: "The number-name table" },
  "item.7daf0141": { screen: "Session", si: "ඉලක්කම් කාඩ්පත් ප්‍රහේලිකාව", en: "The digit-card puzzle" },
  "board.col.number": { screen: "Session", si: "සංඛ්‍යාව", en: "Number (a board table's column)" },
  "board.col.digit": { screen: "Session", si: "ඉලක්කම", en: "Digit" },
  "board.col.place": { screen: "Session", si: "ස්ථානය", en: "Place" },
  "board.col.placeValue": { screen: "Session", si: "ස්ථානීය අගය", en: "Place value" },
  "board.col.value": { screen: "Session", si: "අගය", en: "Value (the value the digit represents)" },
  "board.col.numberName": { screen: "Session", si: "සංඛ්‍යා නාමය", en: "Number name" },
  "session.closeToday": { screen: "Session", si: "අද ✓ {concepts}", en: "Today \u2713 {concepts} (the close card)" },
  "session.closeNext": { screen: "Session", si: "ඊළඟ පාර: {concepts}", en: "Next time: {concepts}" },
  "session.lessonDone": { screen: "Session", si: "පාඩම ඉවරයි 🌟", en: "Lesson finished \ud83c\udf1f" },
} as const satisfies Record<string, CopyEntry>;

export type CopyKey = keyof typeof COPY;

/** The Sinhala for a key, with {holes} filled. */
/** The screens whose English column the සිං|EN toggle may show (cluster I): the parent zone and onboarding. The child's screens never switch. */
export const LATIN_ALLOWED_SCREENS = new Set(["Parent zone", "Weekly report", "Subscription", "Onboarding", "Onboarding 1", "Onboarding 2", "Onboarding 3", "Onboarding 4", "Weekly report / Certificate"]);

export function t(key: CopyKey, holes?: Record<string, string | number>): string {
  const entry = COPY[key];
  let text: string = getLang() === "en" && LATIN_ALLOWED_SCREENS.has(entry.screen) && entry.en ? entry.en : entry.si;
  if (holes) for (const [k, v] of Object.entries(holes)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

/**
 * Strings the app needs and the export has no Sinhala for. Nothing here is
 * rendered — the screen leaves that spot empty or uses an export string
 * that honestly covers it — until the review pass supplies the line.
 * Empty since the native review round of 29 Sep 2026 (all eighteen added above).
 */
export const MISSING: Array<{ key: string; screen: string; en: string; where: string }> = [];

export const LESSON_NAMES: Record<number, string> = { 1: t("lesson.1"), 2: t("lesson.2"), 3: t("lesson.3"), 4: t("lesson.4"), 5: t("lesson.5"), 6: t("lesson.6") };
export const STICKERS: string[] = [t("rewards.sticker.1"), t("rewards.sticker.2"), t("rewards.sticker.3"), t("rewards.sticker.4"), t("rewards.sticker.5"), t("rewards.sticker.6"), t("rewards.sticker.7"), t("rewards.sticker.8")];
export const OUTFITS: Array<{ name: string; hat: string }> = [
  { name: t("rewards.outfit.1"), hat: "#0F4C5C" },
  { name: t("rewards.outfit.2"), hat: "#4A7BD0" },
  { name: t("rewards.outfit.3"), hat: "#D9643A" },
];
export const DAY_LETTERS: string[] = [t("report.day.1"), t("report.day.2"), t("report.day.3"), t("report.day.4"), t("report.day.5"), t("report.day.6"), t("report.day.7")];
