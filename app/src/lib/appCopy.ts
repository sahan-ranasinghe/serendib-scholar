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

export const COPY = {
  // --- wordmark and terms ---------------------------------------------------
  "brand.wordmarkSi": { screen: "Splash", si: "සෙරෙන්ඩිබ් ශිෂ්‍ය", en: "Serendib Scholar (Sinhala wordmark)" },
  "brand.zara": { screen: "all", si: "සාරා", en: "Zara" },
  "brand.zaraTeacher": { screen: "Certificate", si: "සාරා ගුරුතුමිය", en: "Teacher Zara" },
  "brand.abacus": { screen: "all", si: "ගණක රාමුව", en: "abacus (never අබකසය)" },
  "brand.maths": { screen: "all", si: "ගණිතය", en: "Maths" },
  "common.soon": { screen: "all", si: "ළඟදීම", en: "Coming soon" },
  "common.minutesN": { screen: "all", si: "මිනිත්තු {n}", en: "{n} minutes" },
  "common.starsN": { screen: "all", si: "තරු {n}", en: "{n} stars" },
  "common.daysN": { screen: "all", si: "දින {n}", en: "{n} days (streak)" },
  "common.gradeN": { screen: "all", si: "{n} ශ්‍රේණිය", en: "Grade {n}" },
  "common.lessonN": { screen: "all", si: "පාඩම {n}", en: "Lesson {n}" },
  "common.sessionNth": { screen: "all", si: "{n} වන සැසිය", en: "Session {n}" },
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
  "home.continueKicker": { screen: "Home", si: "ගණිතය · පාඩම {lesson} · {session} වන සැසිය", en: "Maths · Lesson {lesson} · Session {session}" },
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
  "nav.home": { screen: "nav", si: "නිවස", en: "Home" },
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
  "detail.cta": { screen: "Lesson detail", si: "{n} වන සැසිය පටන් ගමු", en: "Start session {n}" },
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
  "practice.subtitle": { screen: "Practice hub", si: "මිනිත්තු 3ක් — එක් සංකල්පයක්", en: "3 minutes — one concept" },
  "practice.rowSub": { screen: "Practice hub", si: "මිනිත්තු 3 · ප්‍රශ්න {n}", en: "3 minutes · {n} questions" },
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
  "cert.month.9": { screen: "Certificate", si: "සැප්තැම්බර්", en: "September" },
  "cert.dateFormat": { screen: "Certificate", si: "{year} {month} {day}", en: "date: year month day" },

  // --- progress ----------------------------------------------------------------------------------
  "progress.title": { screen: "Progress", si: "මගේ ප්‍රගතිය", en: "My progress" },
  "progress.subtitle": { screen: "Progress", si: "ගණිතය · සංකල්ප {mastered} / {total}", en: "Maths · Concepts {mastered} / {total}" },
  "progress.status.best": { screen: "Progress", si: "හොඳටම", en: "Excellent" },
  "progress.status.good": { screen: "Progress", si: "හොඳයි", en: "Good" },
  "progress.status.practise": { screen: "Progress", si: "පුරුදු වෙමු", en: "Let's practise" },
  "progress.sentence.both": { screen: "Progress", si: "{name}, {best} හොඳට තේරුම් ගත්තා. {weak} තව පොඩ්ඩක් පුරුදු වෙමු!", en: "{name}, you understood {best} well. Let's practise {weak} a little more!" },
  "progress.concept.1": { screen: "Progress", si: "සංඛ්‍යා කියවීම", en: "Reading numbers" },
  "progress.concept.2": { screen: "Progress", si: "දහසස්ථානය", en: "The thousands place" },
  "progress.concept.3": { screen: "Progress", si: "බිංදුව ඇති ස්ථාන", en: "Places with a zero" },
  "progress.concept.4": { screen: "Progress", si: "දස දහස", en: "Ten thousand" },
  "progress.concept.5": { screen: "Progress", si: "ගණක රාමුව කියවීම", en: "Reading the abacus" },
  "progress.concept.6": { screen: "Progress", si: "සංඛ්‍යා නාම", en: "Number names" },
  "progress.concept.7": { screen: "Progress", si: "විහිදුවා ලිවීම", en: "Expanded form" },
  "progress.concept.8": { screen: "Progress", si: "ස්ථානීය අගය", en: "Place value" },
  "progress.concept.9": { screen: "Progress", si: "සංඛ්‍යා කියවීම · ගණක රාමුව", en: "Reading numbers · abacus (session subtitle)" },
  "progress.concept.10": { screen: "Progress", si: "ස්ථානීය අගය · විහිදුවා ලිවීම", en: "Place value · expanded form (session subtitle)" },
  "progress.concept.11": { screen: "Progress", si: "දස දහස දක්වා", en: "Up to ten thousand (session subtitle)" },

  // --- onboarding -------------------------------------------------------------------------------------
  "onb.stepOf": { screen: "Onboarding", si: "පියවර {n} / 4", en: "Step {n} / 4" },
  "onb.toggleSi": { screen: "Onboarding", si: "සිං", en: "SI (language toggle)" },
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
  "avatar.1": { screen: "Onboarding 2", si: "අලියා", en: "Elephant" },
  "avatar.2": { screen: "Onboarding 2", si: "මොනරා", en: "Peacock" },
  "avatar.3": { screen: "Onboarding 2", si: "ලේනා", en: "Squirrel" },
  "avatar.4": { screen: "Onboarding 2", si: "කැස්බෑවා", en: "Turtle" },
  "avatar.5": { screen: "Onboarding 2", si: "ගිරවා", en: "Parrot" },
  "avatar.6": { screen: "Onboarding 2", si: "කොටියා", en: "Leopard" },
  "avatar.7": { screen: "Onboarding 2", si: "මුවා", en: "Deer" },
  "avatar.8": { screen: "Onboarding 2", si: "මාළුවා", en: "Fish" },
  "onb.3.bubble": { screen: "Onboarding 3", si: "ඔබ දැනගත යුතු දේවල් තුනක් — සරලව.", en: "Three things you should know — simply." },
  "onb.3.title": { screen: "Onboarding 3", si: "අපි කරන දේ, නොකරන දේ", en: "What we do, what we don't" },
  "onb.3.c1.t": { screen: "Onboarding 3", si: "දරුවා කියන දේ අකුරු වලට හැරෙනවා", en: "What your child says becomes text" },
  "onb.3.c1.d": { screen: "Onboarding 3", si: "පිළිතුරු ලියවෙනවා. හඬ පටිගත කර තබා නොගනියි — කවදාවත්.", en: "Answers are written down. The voice is never kept — ever." },
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
  "parent.minWeek": { screen: "Parent zone", si: "මිනිත්තු / සතියේ", en: "Minutes / week" },
  "parent.sessions": { screen: "Parent zone", si: "සැසි", en: "Sessions" },
  "parent.confident": { screen: "Parent zone", si: "සංකල්ප විශ්වාසයි", en: "Concepts confident" },
  "parent.row.report": { screen: "Parent zone", si: "සතිපතා වාර්තාව", en: "Weekly report" },
  "parent.row.billing": { screen: "Parent zone", si: "දායකත්වය සහ බිල්පත්", en: "Subscription and billing" },
  "parent.row.limit": { screen: "Parent zone", si: "දිනපතා කාල සීමාව", en: "Daily time limit" },
  "parent.row.limitSub": { screen: "Parent zone", si: "15 · 20 · 30", en: "15 · 20 · 30 (minutes)" },
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
  "parent.pinWrong": { screen: "Parent zone", si: "කේතය වැරදියි. ආයෙ බලලා ලියන්න.", en: "Wrong code. Check and type it again." },
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
  "report.month.9": { screen: "Weekly report", si: "සැප්.", en: "Sep." },
  "report.month.10": { screen: "Weekly report", si: "ඔක්.", en: "Oct." },
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
  "edge.offline.body": { screen: "Edge", si: "Wi-Fi එක හරි දත්ත හරි බලලා ආයෙත් උත්සාහ කරමු. ඔයාගේ ප්‍රගතිය සුරක්ෂිතයි.", en: "Check Wi-Fi or data and let's try again. Your progress is safe." },
  "edge.paused.title": { screen: "Edge", si: "පාඩම නවත්වලා", en: "Lesson paused" },
  "edge.paused.body": { screen: "Edge", si: "ලෑස්ති වුණාම දිගටම යමු.", en: "When you're ready, let's continue." },
  "edge.paused.resume": { screen: "Edge", si: "▶ දිගටම", en: "▶ Continue" },
  "edge.paused.stop": { screen: "Edge", si: "නවත්වන්න", en: "Stop" },
  "edge.rotate.title": { screen: "Edge", si: "ෆෝන් එක හරහට කරන්න", en: "Turn your phone sideways" },
  "edge.rotate.body": { screen: "Edge", si: "පුවරුව හොඳට පේන්න පාඩම හරහට තියෙන්නේ.", en: "The lesson is landscape so the board shows well." },
  "edge.mic.title": { screen: "Edge", si: "මයික් එකට අවසර දෙන්න", en: "Allow the microphone" },
  "edge.mic.body": { screen: "Edge", si: "ඔයා කියන පිළිතුරු මට අහන්න ඕනේ. හඬ තබා ගන්නේ නෑ — වචන විතරයි.", en: "I need to hear your answers. The voice isn't kept — only the words." },
  "edge.mic.allow": { screen: "Edge", si: "අවසර දෙන්න", en: "Allow" },
  "edge.mic.type": { screen: "Edge", si: "ටයිප් කරන්නම්", en: "I'll type" },
  "edge.error.title": { screen: "Edge", si: "අපොයි, මගේ අතින් වැරැද්දක්", en: "Oops, my mistake" },
  "edge.error.body": { screen: "Edge", si: "මට පොඩි ප්‍රශ්නයක් ආවා. ආයෙත් උත්සාහ කරමුද?", en: "I hit a small problem. Shall we try again?" },
  "edge.error.home": { screen: "Edge", si: "නිවසට", en: "To home" },

  // --- lesson runtime lines the shell reuses (already in the codebase) ------------------------------
  "gate.title": { screen: "Session", si: "ප්‍රවේශ කේතය ඇතුළත් කරන්න", en: "Enter the access code" },
  "gate.sub": { screen: "Session", si: "(දෙමාපියන් සඳහා — මේ උපකරණයේ එක වතාවක් පමණයි)", en: "(for parents — once on this device)" },
  "gate.enter": { screen: "Session", si: "ඇතුල් වෙන්න", en: "Enter" },
  "session.connectFail": { screen: "Session", si: "සම්බන්ධ වෙන්න බැරි වුණා. ආයෙ උත්සාහ කරන්න.", en: "Couldn't connect. Try again." },
  "session.leaveAsk": { screen: "Session", si: "නවත්වමුද?", en: "Shall we stop? (⏹ asks once — from the device triage)" },
  "session.leaveBody": { screen: "Session", si: "ඉතුරු ටික පස්සේ කරන්න පුළුවන්.", en: "You can do the rest later." },
  "session.restartAsk": { screen: "Session", si: "මුල ඉඳන්ම ආයෙත් පටන් ගමුද?", en: "Shall we start again from the very beginning? (↺ asks once)" },
} as const satisfies Record<string, CopyEntry>;

export type CopyKey = keyof typeof COPY;

/** The Sinhala for a key, with {holes} filled. */
export function t(key: CopyKey, holes?: Record<string, string | number>): string {
  let text: string = COPY[key].si;
  if (holes) for (const [k, v] of Object.entries(holes)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

/**
 * Strings the app needs and the export has no Sinhala for. Nothing here is
 * rendered — the screen leaves that spot empty or uses an export string
 * that honestly covers it — until the review pass supplies the line.
 */
export const MISSING: Array<{ key: string; screen: string; en: string; where: string }> = [
  { key: "install.explain", screen: "Session summary", en: "Zara explains adding the app to the home screen (\"Put me on your phone's home screen so the board fills the whole screen.\")", where: "the install prompt after a completed session; the tagline ඔයාගේම ගුරුතුමිය, ඔයාගේ ෆෝන් එකේ stands in" },
  { key: "install.accept", screen: "Session summary", en: "Add to home screen (button)", where: "the install prompt — එකඟයි (from consent) stands in" },
  { key: "pin.create", screen: "Parent zone", en: "Create a 4-digit PIN for the parent zone", where: "the PIN gate on first use — shows only the label PIN" },
  { key: "pin.enter", screen: "Parent zone", en: "Enter your PIN", where: "the PIN gate — shows only the label PIN" },
  { key: "pin.confirm", screen: "Parent zone", en: "Type the PIN again", where: "the change-PIN screen" },
  { key: "pin.saved", screen: "Parent zone", en: "PIN saved", where: "the change-PIN screen — PIN සකසා ඇත stands in" },
  { key: "limit.reached", screen: "Session summary", en: "Today's time is up — see you tomorrow", where: "the summary when the daily limit ends a sitting — හෙට ආයෙත් එන්න stands in" },
  { key: "delete.confirm", screen: "Parent zone", en: "This deletes the child's account and every record. It cannot be undone.", where: "the delete screen — the consent card's මකන්න ඕනෑම වෙලාවක text stands in" },
  { key: "delete.done", screen: "Parent zone", en: "Deleted", where: "after a delete the app returns to the splash" },
  { key: "profiles.title", screen: "Parent zone", en: "Children's profiles (screen title)", where: "reuses the settings row label දරුවන්ගේ පැතිකඩ" },
  { key: "settings.title", screen: "Parent zone", en: "Daily limit / sound & captions (screen title)", where: "reuses the settings row labels" },
  { key: "summary.none", screen: "Session summary", en: "No session recorded yet", where: "the summary with no sitting behind it — the card lists nothing and තාම නෑ stands in" },
  { key: "month.names", screen: "Weekly report / Certificate", en: "Month names other than September (සැප්., සැප්තැම්බර්) and October (ඔක්.)", where: "the report's range and the certificate's date fall back to numerals" },
  { key: "practice.empty", screen: "Practice hub", en: "Nothing to practise yet — finish a session first", where: "the hub with no concept worked on — the list is empty and තාම නෑ stands in" },
  { key: "onboarding.devStub", screen: "Onboarding", en: "DEV ONLY — OTP and payment are stubs (English, parent surface)", where: "the dev-only label under the stubbed steps (English on a parent surface)" },
  { key: "quiz.expansionAsk", screen: "Quiz", en: "Which number is missing? (for an expansion item)", where: "the quiz shows the expansion line with ▢ and the recap ask line" },
];

export const LESSON_NAMES: Record<number, string> = { 1: t("lesson.1"), 2: t("lesson.2"), 3: t("lesson.3"), 4: t("lesson.4"), 5: t("lesson.5"), 6: t("lesson.6") };
export const AVATARS: string[] = [t("avatar.1"), t("avatar.2"), t("avatar.3"), t("avatar.4"), t("avatar.5"), t("avatar.6"), t("avatar.7"), t("avatar.8")];
export const STICKERS: string[] = [t("rewards.sticker.1"), t("rewards.sticker.2"), t("rewards.sticker.3"), t("rewards.sticker.4"), t("rewards.sticker.5"), t("rewards.sticker.6"), t("rewards.sticker.7"), t("rewards.sticker.8")];
export const OUTFITS: Array<{ name: string; hat: string }> = [
  { name: t("rewards.outfit.1"), hat: "#0F4C5C" },
  { name: t("rewards.outfit.2"), hat: "#4A7BD0" },
  { name: t("rewards.outfit.3"), hat: "#D9643A" },
];
export const STICKER_SLOTS = 12;
export const DAY_LETTERS: string[] = [t("report.day.1"), t("report.day.2"), t("report.day.3"), t("report.day.4"), t("report.day.5"), t("report.day.6"), t("report.day.7")];
