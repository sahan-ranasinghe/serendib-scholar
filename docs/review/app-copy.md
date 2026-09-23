# App copy — review sheet

Every child-facing and parent-facing string outside the session, extracted from `src/lib/appCopy.ts` by `scripts/extract-copy.ts`.

- **fromScript**: the Sinhala appears verbatim in the authored lesson script (`src/data/lessons/authored/maths-5-1.json`) or the storyboard.
- **drafted**: from the design export (Screens A/B/C) or the runtime — needs sign-off (README "Copy").
- **missing**: the app needs the line and the export has no Sinhala for it; the screen leaves the spot empty or reuses an export string, and the English gloss says what is needed.

Counts: fromScript 21 · drafted 244 · missing 18

Terms: ගණක රාමුව (never අබකසය) · සාරා · සාරා ටීචර් (Latin "Zara Teacher" only on the splash wordmark, the manifest and the parent zone's English; "Serendib Scholar" is the company, parent-zone footer only). `{name}`-style holes are filled at runtime.

| screen | key | Sinhala | English gloss | status |
|---|---|---|---|---|
| Splash | `brand.wordmarkSi` | සාරා ටීචර් | Zara Teacher (Sinhala wordmark) | drafted |
| all | `brand.zara` | සාරා | Zara | drafted |
| Certificate | `brand.zaraTeacher` | සාරා ගුරුතුමිය | Teacher Zara | drafted |
| all | `brand.abacus` | ගණක රාමුව | abacus (never අබකසය) | fromScript |
| all | `brand.maths` | ගණිතය | Maths | drafted |
| all | `common.soon` | ළඟදීම | Coming soon | drafted |
| all | `common.minutesN` | මිනිත්තු {n} | {n} minutes | drafted |
| all | `common.starsN` | තරු {n} | {n} stars | drafted |
| all | `common.daysN` | දින {n} | {n} days (streak) | drafted |
| all | `common.gradeN` | {n} ශ්‍රේණිය | Grade {n} | fromScript |
| all | `common.lessonN` | පාඩම {n} | Lesson {n} | fromScript |
| all | `common.sessionNth` | {n} වන සැසිය | Session {n} | drafted |
| all | `common.start` | පටන් ගමු | Let's start | fromScript |
| all | `common.back` | ‹ | back (glyph) | drafted |
| Edge | `common.retry` | ආයෙත් උත්සාහ කරන්න | Try again | drafted |
| Progress | `common.notYet` | තාම නෑ | Not yet | drafted |
| all | `app.updateReady` | අලුත් අනුවාදයක් — යාවත්කාලීන කරන්න | A new version — update (the update banner; wording from the device report) | drafted |
| Splash | `splash.tagline` | ඔයාගේම ගුරුතුමිය, ඔයාගේ ෆෝන් එකේ | Your own teacher, on your phone | drafted |
| Splash | `splash.language` | භාෂාව | Language | drafted |
| Splash | `splash.sinhala` | සිංහල | Sinhala | drafted |
| Splash | `splash.tamilSoon` | தமிழ் · ළඟදීම | Tamil · coming soon | drafted |
| Home | `home.greeting` | ආයුබෝවන් {name}! | Hello {name}! | drafted |
| Home | `home.startToday` | අද පාඩම පටන් ගමුද? | Shall we start today's lesson? | drafted |
| Home | `home.continueKicker` | ගණිතය · පාඩම {lesson} · {session} වන සැසිය | Maths · Lesson {lesson} · Session {session} | drafted |
| Home | `home.today` | අද කරන්න | To do today | drafted |
| Home | `home.continueLesson` | පාඩම දිගටම | Continue the lesson | drafted |
| Home | `home.practice` | පුහුණුව | Practice | drafted |
| Home | `home.yesterdayAgain` | ඊයේ නැවත | Yesterday, again | drafted |
| Home | `home.subjects` | විෂයයන් | Subjects | drafted |
| Home | `home.subjectSinhala` | සිංහල | Sinhala (subject) | drafted |
| Home | `home.newBadge` | අලුත් ලාංඡනය — {name} | New badge — {name} | drafted |
| Home | `home.badgeReason` | {concept} ඉගෙන ගත්තා | Learned {concept} | fromScript |
| Home | `home.badgesCount` | ලාංඡන {earned} / {total} | Badges {earned} / {total} | drafted |
| Home | `home.parent` | දෙමාපිය | Parent (lock button title) | drafted |
| shell | `app.updating` | යාවත්කාලීන වෙමින්… | Updating… | drafted |
| shell | `app.offlineCached` | සම්බන්ධතාවය නැහැ — පෙර දත්ත පෙන්වනවා | No connection — showing the last copy | drafted |
| shell | `app.noData` | දත්ත ලබා ගන්න බැහැ — සම්බන්ධතාවය බලලා ආයෙ උත්සාහ කරන්න | Could not load — check the connection and try again | drafted |
| shell | `app.saveFailed` | සුරැකීම හරි ගියේ නැහැ — ආයෙ උත්සාහ කරන්න | Could not save — try again | drafted |
| shell | `app.resetting` | යළි පටන් ගන්නවා… | Resetting… | drafted |
| shell | `app.checking` | බලනවා… | Checking… | drafted |
| Rewards | `rewards.outfitSheet.owned` | ලේනා දැන් මේක අඳිනවා! | Lena wears this now! | drafted |
| Rewards | `rewards.outfitSheet.locked` | තවම අගුළු දාලා | Still locked | drafted |
| Rewards | `rewards.outfitSheet.earn` | කොටස් {n}ක් ඉගෙන ගත්තම ලේනාට මේ ඇඳුම ලැබෙනවා | Master {n} concepts and Lena earns this outfit | drafted |
| Rewards | `rewards.outfitSheet.left` | තව කොටස් {n}යි | {n} more to go | drafted |
| Rewards | `rewards.outfitSheet.art` | චිත්‍රය ළඟදීම | Art coming soon | drafted |
| Rewards | `rewards.outfitSheet.close` | වහන්න | Close | drafted |
| nav | `nav.home` | මුල් පිටුව | Home | drafted |
| nav | `nav.lessons` | පාඩම් | Lessons | fromScript |
| nav | `nav.practice` | පුහුණුව | Practice | drafted |
| nav | `nav.rewards` | තෑගි | Rewards | drafted |
| Lesson map | `map.subtitle` | පාඩම් {lessons} · තරු {stars} / {total} | Lessons {lessons} · Stars {stars} / {total} | drafted |
| Lesson map | `lesson.1` | සංඛ්‍යා - 1 | Numbers - 1 | fromScript |
| Lesson map | `lesson.2` | සංඛ්‍යා - 2 | Numbers - 2 | drafted |
| Lesson map | `lesson.3` | එකතු කිරීම | Addition | fromScript |
| Lesson map | `lesson.4` | අඩු කිරීම | Subtraction | drafted |
| Lesson map | `lesson.5` | ගුණ කිරීම | Multiplication | drafted |
| Lesson map | `lesson.6` | භාග | Fractions | drafted |
| Lesson detail | `detail.kicker` | ගණිතය · පාඩම {lesson} | Maths · Lesson {lesson} | drafted |
| Lesson detail | `detail.subtitle` | සැසි {sessions} · මිනිත්තු {minutes} · තරු {stars} / {total} | Sessions {sessions} · Minutes {minutes} · Stars {stars} / {total} | drafted |
| Lesson detail | `detail.cta` | {n} වන සැසිය පටන් ගමු | Start session {n} | drafted |
| Lesson detail | `detail.resume` | ඉතුරු ටික කරමු | Let's do the rest (resume) — from docs/qa/session1-triage.md | drafted |
| Lesson detail | `detail.restart` | මුල ඉඳන් ආයෙත් | Again from the start (restart, confirm once) — from docs/qa/session1-triage.md | drafted |
| Session summary | `summary.title` | නියමයි {name}! | Great, {name}! | drafted |
| Session summary | `summary.today` | අද ඔයා… | Today you… | drafted |
| Session summary | `summary.tomorrow` | හෙට ආයෙත් එන්න | Come back tomorrow | drafted |
| Session summary | `summary.more` | තව පොඩ්ඩක් | A little more | drafted |
| Session summary | `summary.questions` | ප්‍රශ්න {asked} කින් {correct} ක් හරි | {correct} of {asked} questions right | drafted |
| Session summary | `summary.minutes` | මිනිත්තු {n} ක් | {n} minutes | drafted |
| Session summary | `summary.looked` | බැලුවා | looked at (a concept seen, nothing asked) | drafted |
| Session summary | `summary.plusOne` | +1 | +1 (streak) | drafted |
| Practice hub | `practice.title` | පුහුණුව | Practice | drafted |
| Practice hub | `practice.subtitle` | මිනිත්තු 3ක් — එක් සංකල්පයක් | 3 minutes — one concept | drafted |
| Practice hub | `practice.rowSub` | මිනිත්තු 3 · ප්‍රශ්න {n} | 3 minutes · {n} questions | drafted |
| Practice hub | `practice.pastPapers` | 🔒 පසුගිය ප්‍රශ්න | Past papers (locked) | drafted |
| Practice hub | `practice.challenge` | ⏱ අභියෝගය | Challenge | drafted |
| Practice hub | `practice.challengeSub` | මිනිත්තු 5 · ප්‍රශ්න 10 | 5 minutes · 10 questions | drafted |
| Quiz | `quiz.check` | පරීක්ෂා කරන්න | Check | drafted |
| Quiz | `quiz.recapAsk` | මේකේ උත්තරේ මොකක්ද කියන්න බලන්න. | See if you can say the answer to this one. | drafted |
| Quiz | `quiz.colDigit` | ඉලක්කම | digit (table column) | fromScript |
| Quiz | `quiz.colPlace` | ඉලක්කම පිහිටි ස්ථානය | the place the digit is in (table column) | drafted |
| Quiz | `quiz.colPlaceValue` | ස්ථානීය අගය | place value (table column) | fromScript |
| Quiz | `quiz.colValue` | ඉලක්කමෙන් නිරූපිත අගය | value the digit represents (table column) | drafted |
| Quiz | `quiz.colName` | සංඛ්‍යා නාමය | number name (table column) | fromScript |
| Quiz | `quiz.done` | ප්‍රශ්න {asked} කින් {correct} ක් හරි | {correct} of {asked} questions right | drafted |
| Rewards | `rewards.title` | තෑගි | Rewards | drafted |
| Rewards | `rewards.subtitle` | ලාංඡන {earned} / {total} · සහතික {certs} | Badges {earned} / {total} · Certificates {certs} | drafted |
| Rewards | `rewards.stickerBook` | ස්ටිකර් පොත | Sticker book | drafted |
| Rewards | `rewards.sticker.1` | අලියා | Elephant | drafted |
| Rewards | `rewards.sticker.2` | මොනරා | Peacock | drafted |
| Rewards | `rewards.sticker.3` | නෙළුම | Lotus | drafted |
| Rewards | `rewards.sticker.4` | කොත්තු | Kottu | drafted |
| Rewards | `rewards.sticker.5` | ත්රීවීලර් | Three-wheeler | drafted |
| Rewards | `rewards.sticker.6` | කිරිබත් | Kiribath | drafted |
| Rewards | `rewards.sticker.7` | වෙසක් කූඩුව | Vesak lantern | drafted |
| Rewards | `rewards.sticker.8` | ක්‍රිකට් | Cricket | fromScript |
| Rewards | `rewards.outfits` | ලේනාගේ ඇඳුම් | Lena's outfits | drafted |
| Rewards | `rewards.outfit.1` | තොප්පිය | Cap (Screens C; Screens B's data names it පාසල් තොප්පිය, school cap) | drafted |
| Rewards | `rewards.outfit.2` | හෙල්මට් | Helmet (Screens C; Screens B: ක්‍රිකට් හෙල්මට්, cricket helmet) | drafted |
| Rewards | `rewards.outfit.3` | කූඩුව | Lantern (Screens C; Screens B: වෙසක් කූඩුව, Vesak lantern) | drafted |
| Rewards | `rewards.certReady` | සහතිකය ලෑස්ති! | Certificate ready! | drafted |
| Rewards | `rewards.certShow` | {concept} — අම්මාට පෙන්වන්න | {concept} — show your mum | drafted |
| Certificate | `cert.title` | සහතිකය | Certificate | drafted |
| Certificate | `cert.heading` | දක්ෂතා සහතිකය | Certificate of achievement | drafted |
| Certificate | `cert.certifies` | මෙයින් සහතික කරනුයේ | This certifies that | drafted |
| Certificate | `cert.body` | {grade} ශ්‍රේණියේ ගණිතය — {concept} සංකල්පය මනාව ප්‍රගුණ කළ බවයි. | has mastered the concept {concept} in Grade {grade} maths. | drafted |
| Certificate | `cert.share` | බෙදාගන්න | Share | drafted |
| Certificate | `cert.print` | මුද්‍රණය (A4) | Print (A4) | drafted |
| Certificate | `cert.printing` | මුද්‍රණයට යවනවා… | Sending to print… | drafted |
| Certificate | `cert.copied` | ලින්ක් එක පිටපත් කළා | Link copied | drafted |
| Certificate | `cert.sharing` | බෙදාගන්නවා… | Sharing… | drafted |
| Certificate | `cert.month.9` | සැප්තැම්බර් | September | drafted |
| Certificate | `cert.dateFormat` | {year} {month} {day} | date: year month day | drafted |
| Progress | `progress.title` | මගේ ප්‍රගතිය | My progress | drafted |
| Progress | `progress.subtitle` | ගණිතය · සංකල්ප {mastered} / {total} | Maths · Concepts {mastered} / {total} | drafted |
| Progress | `progress.status.best` | හොඳටම | Excellent | fromScript |
| Progress | `progress.status.good` | හොඳයි | Good | drafted |
| Progress | `progress.status.practise` | පුරුදු වෙමු | Let's practise | fromScript |
| Progress | `progress.sentence.both` | {name}, {best} හොඳට තේරුම් ගත්තා. {weak} තව පොඩ්ඩක් පුරුදු වෙමු! | {name}, you understood {best} well. Let's practise {weak} a little more! | drafted |
| Progress | `progress.concept.1` | සංඛ්‍යා කියවීම | Reading numbers | drafted |
| Progress | `progress.concept.2` | දහසස්ථානය | The thousands place | fromScript |
| Progress | `progress.concept.3` | බිංදුව ඇති ස්ථාන | Places with a zero | drafted |
| Progress | `progress.concept.4` | දස දහස | Ten thousand | fromScript |
| Progress | `progress.concept.5` | ගණක රාමුව කියවීම | Reading the abacus | drafted |
| Progress | `progress.concept.6` | සංඛ්‍යා නාම | Number names | fromScript |
| Progress | `progress.concept.7` | විහිදුවා ලිවීම | Expanded form | drafted |
| Progress | `progress.concept.8` | ස්ථානීය අගය | Place value | fromScript |
| Progress | `progress.concept.9` | සංඛ්‍යා කියවීම · ගණක රාමුව | Reading numbers · abacus (session subtitle) | drafted |
| Progress | `progress.concept.10` | ස්ථානීය අගය · විහිදුවා ලිවීම | Place value · expanded form (session subtitle) | drafted |
| Progress | `progress.concept.11` | දස දහස දක්වා | Up to ten thousand (session subtitle) | drafted |
| Onboarding | `onb.stepOf` | පියවර {n} / 4 | Step {n} / 4 | drafted |
| Onboarding | `onb.toggleSi` | සිං | SI (language toggle) | drafted |
| Onboarding 1 | `onb.1.bubble` | ආයුබෝවන්! මම සාරා. දරුවාගේ ගිණුම හදන්න මිනිත්තු දෙකක් විතර යනවා. | Hello! I'm Zara. Setting up your child's account takes about two minutes. | drafted |
| Onboarding 1 | `onb.1.title` | දුරකථන අංකය තහවුරු කරමු | Let's confirm your phone number | drafted |
| Onboarding 1 | `onb.1.phone` | දුරකථන අංකය | Phone number | drafted |
| Onboarding 1 | `onb.1.code` | SMS මගින් ලැබුණු කේතය | The code you got by SMS | drafted |
| Onboarding 1 | `onb.1.resend` | කේතය ලැබුණේ නැද්ද? ආයෙත් එවන්න ({t}) | Didn't get the code? Send again ({t}) — counts down once from 0:30, never loops | drafted |
| Onboarding 1 | `onb.1.resendNow` | ආයෙත් එවන්න | Send again (the one resend, after 30 s) — the export's own words | drafted |
| Onboarding 1 | `onb.1.send` | කේතය එවන්න | Send the code (composed from the export's කේතය … එවන්න) | drafted |
| Onboarding 1 | `onb.1.devNotice` | SMS තහවුරු කිරීම තවම සක්‍රීය නැහැ | SMS verification is not active yet (dev notice, wording from docs/qa) | drafted |
| Onboarding 1 | `onb.1.devNoticeEn` | dev: any 4-digit code works | English half of the dev notice (a parent surface) | drafted |
| Onboarding | `onb.next` | ඉදිරියට | Next | drafted |
| Onboarding 2 | `onb.2.bubble` | දරුවාට මම කතා කරන්නේ මේ නමින්. | This is the name I'll call your child by. | drafted |
| Onboarding 2 | `onb.2.title` | දරුවා ගැන කියන්න | Tell me about your child | drafted |
| Onboarding 2 | `onb.2.name` | දරුවාගේ නම | Child's name | drafted |
| Onboarding 2 | `onb.2.avatar` | අවතාරය | Avatar | drafted |
| Onboarding 2 | `onb.2.grade` | ශ්‍රේණිය | Grade | fromScript |
| Onboarding 2 | `onb.2.school` | පාසල (අත්‍යවශ්‍ය නොවේ) | School (optional) | drafted |
| Onboarding 2 | `onb.2.schoolPlaceholder` | පාසලේ නම | School name | drafted |
| Onboarding 2 | `avatar.1` | අලියා | Elephant | drafted |
| Onboarding 2 | `avatar.2` | මොනරා | Peacock | drafted |
| Onboarding 2 | `avatar.3` | ලේනා | Squirrel | drafted |
| Onboarding 2 | `avatar.4` | කැස්බෑවා | Turtle | drafted |
| Onboarding 2 | `avatar.5` | ගිරවා | Parrot | drafted |
| Onboarding 2 | `avatar.6` | කොටියා | Leopard | drafted |
| Onboarding 2 | `avatar.7` | මුවා | Deer | drafted |
| Onboarding 2 | `avatar.8` | මාළුවා | Fish | drafted |
| Onboarding 3 | `onb.3.bubble` | ඔබ දැනගත යුතු දේවල් තුනක් — සරලව. | Three things you should know — simply. | drafted |
| Onboarding 3 | `onb.3.title` | අපි කරන දේ, නොකරන දේ | What we do, what we don't | drafted |
| Onboarding 3 | `onb.3.c1.t` | දරුවා කියන දේ අකුරු වලට හැරෙනවා | What your child says becomes text | drafted |
| Onboarding 3 | `onb.3.c1.d` | පිළිතුරු ලියවෙනවා. හඬ පටිගත කර තබා නොගනියි — කවදාවත්. | Answers are written down. The voice is never kept — ever. | drafted |
| Onboarding 3 | `onb.3.c2.t` | ඔබට පෙනෙන්නේ | What you see | drafted |
| Onboarding 3 | `onb.3.c2.d` | මිනිත්තු, සැසි, ඉගෙන ගත් සංකල්ප සහ වැරදුණු ප්‍රශ්න — සතිපතා වාර්තාවේ. | Minutes, sessions, concepts learned and missed questions — in the weekly report. | drafted |
| Onboarding 3 | `onb.3.c3.t` | මකන්න ඕනෑම වෙලාවක | Delete any time | drafted |
| Onboarding 3 | `onb.3.c3.d` | දෙමාපිය කලාපයෙන් එක තැනකින් ගිණුම සහ සියලු දත්ත මකා දමන්න පුළුවන්. | From one place in the parent zone you can delete the account and all its data. | drafted |
| Onboarding 3 | `onb.3.privacy` | සම්පූර්ණ රහස්‍යතා ප්‍රතිපත්තිය | Full privacy policy | drafted |
| Onboarding 3 | `onb.3.cta` | එකඟයි | I agree | drafted |
| Onboarding 4 | `onb.4.bubble` | පළමු සතිය නොමිලේ. කැමති නැත්නම් නවත්වන්න පුළුවන්. | The first week is free. If you don't like it you can stop. | drafted |
| Onboarding 4 | `onb.4.title` | සැලැස්ම තෝරන්න | Choose a plan | drafted |
| Onboarding 4 | `onb.4.freeWeek` | පළමු සතිය නොමිලේ | First week free | drafted |
| Onboarding 4 | `onb.4.oneChild` | දරුවෙක් | One child | drafted |
| Onboarding 4 | `onb.4.twoChildren` | දරුවන් 2ක් | Two children | drafted |
| Onboarding 4 | `onb.4.perMonth` |  / මාසයකට |  / per month | drafted |
| Onboarding 4 | `onb.4.price1` | රු. 1,000 | Rs. 1,000 | drafted |
| Onboarding 4 | `onb.4.price2` | රු. 1,600 | Rs. 1,600 | drafted |
| Onboarding 4 | `onb.4.includes` | සියලු පාඩම් · සතිපතා වාර්තාව · ඕනෑම වෙලාවක නවත්වන්න | All lessons · weekly report · cancel any time | drafted |
| Onboarding 4 | `onb.4.payment` | ගෙවීම — PayHere | Payment — PayHere | drafted |
| Onboarding 4 | `onb.4.card` | කාඩ්පත | Card | fromScript |
| Onboarding 4 | `onb.4.bank` | බැංකුව | Bank | drafted |
| Onboarding 4 | `onb.4.sms` | නොමිලේ සතිය අවසන් වීමට දින 2කට පෙර අපි ඔබට SMS එකක් එවනවා. අද ගෙවීමක් නෑ. | We'll SMS you two days before the free week ends. No payment today. | drafted |
| Onboarding 4 | `onb.4.cta` | නොමිලේ සතිය පටන් ගන්න | Start the free week | drafted |
| Onboarding 4 | `onb.4.skip` | පසුව තීරණය කරන්නම් | I'll decide later | drafted |
| Parent zone | `parent.title` | දෙමාපිය කලාපය | Parent zone | drafted |
| Parent zone | `parent.childLine` | {name} · {grade} ශ්‍රේණිය | {name} · Grade {grade} | drafted |
| Parent zone | `parent.minWeek` | මිනිත්තු / සතියේ | Minutes / week | drafted |
| Parent zone | `parent.sessions` | සැසි | Sessions | drafted |
| Parent zone | `parent.confident` | සංකල්ප විශ්වාසයි | Concepts confident | drafted |
| Parent zone | `parent.row.report` | සතිපතා වාර්තාව | Weekly report | drafted |
| Parent zone | `parent.row.billing` | දායකත්වය සහ බිල්පත් | Subscription and billing | drafted |
| Parent zone | `parent.row.limit` | දිනපතා කාල සීමාව | Daily time limit | drafted |
| Parent zone | `parent.row.limitSub` | 15 · 20 · 30 | 15 · 20 · 30 (minutes) | drafted |
| Parent zone | `parent.row.sound` | ශබ්දය සහ උපසිරැසි | Sound and captions | drafted |
| Parent zone | `parent.row.soundOn` | ශබ්දය ✓ | Sound ✓ | drafted |
| Parent zone | `parent.row.captionsOn` | උපසිරැසි ✓ | Captions ✓ | drafted |
| Parent zone | `parent.row.profiles` | දරුවන්ගේ පැතිකඩ | Children's profiles | drafted |
| Parent zone | `parent.row.profilesSub` | දෙවැනි දරුවා එක් කරන්න | Add a second child | drafted |
| Parent zone | `parent.row.pin` | PIN වෙනස් කරන්න | Change PIN | drafted |
| Parent zone | `parent.row.help` | උදව් | Help | fromScript |
| Parent zone | `parent.row.delete` | ගිණුම සහ දත්ත මකන්න | Delete account and data | drafted |
| Parent zone | `parent.whatsapp` | WhatsApp උදව් — {number} | WhatsApp help — {number} | drafted |
| Parent zone | `parent.pinSet` | PIN සකසා ඇත | PIN is set | drafted |
| Parent zone | `pin.label` | PIN එක | The PIN (field label) | drafted |
| Parent zone | `pin.again` | ආයෙත් ටයිප් කරන්න | Type it again (second field when setting a PIN) | drafted |
| Parent zone | `pin.current` | දැන් තියෙන PIN එක | The current PIN (change-PIN screen) | drafted |
| Parent zone | `pin.new` | අලුත් PIN එක | The new PIN (change-PIN screen) | drafted |
| Parent zone | `pin.mismatch` | PIN දෙක ගැළපෙන්නේ නෑ. ආයෙත් ටයිප් කරන්න. | The two PINs do not match. Type it again. | drafted |
| Parent zone | `pin.show` | PIN එක පෙන්වන්න | Show the PIN (eye button) | drafted |
| Parent zone | `pin.hide` | PIN එක හංගන්න | Hide the PIN (eye button) | drafted |
| Home | `home.switchChild` | දරුවා මාරු කරන්න | Switch child (header avatar, sheet title) | drafted |
| Home | `home.addChild` | + දරුවෙක් එක් කරන්න | + Add a child | drafted |
| all | `common.close` | වහන්න | Close | drafted |
| Parent zone | `parent.pinWrong` | කේතය වැරදියි. ආයෙ බලලා ලියන්න. | Wrong code. Check and type it again. | drafted |
| Subscription | `parent.active` | සක්‍රීයයි | Active | drafted |
| Weekly report | `report.title` | සතිපතා වාර්තාව | Weekly report | drafted |
| Weekly report | `report.rangeChild` | {range} · {name} | {range} · {name} | drafted |
| Weekly report | `report.sentence.both` | {name} {best} හොඳට තේරුම් ගත්තා; {weak} තව පුරුදු වෙන්න ඕනේ. | {name} understood {best} well; {weak} needs more practice. | drafted |
| Weekly report | `report.dailyMinutes` | දිනපතා මිනිත්තු | Daily minutes | drafted |
| Weekly report | `report.day.1` | ස | Mon | drafted |
| Weekly report | `report.day.2` | අ | Tue | drafted |
| Weekly report | `report.day.3` | බ | Wed | drafted |
| Weekly report | `report.day.4` | බ්‍ර | Thu | drafted |
| Weekly report | `report.day.5` | සි | Fri | drafted |
| Weekly report | `report.day.6` | සෙ | Sat | drafted |
| Weekly report | `report.day.7` | ඉ | Sun | drafted |
| Weekly report | `report.confident` | විශ්වාසයි | Confident | drafted |
| Weekly report | `report.needsWork` | තව පුරුදු වෙන්න | Needs more practice | drafted |
| Weekly report | `report.missed` | වැරදුණු ප්‍රශ්න | Missed questions | drafted |
| Weekly report | `report.gave` | දුන්නේ: {a} | Gave: {a} | drafted |
| Weekly report | `report.correct` | නිවැරදි: {c} | Correct: {c} | drafted |
| Weekly report | `report.sharePdf` | PDF ලෙස බෙදාගන්න | Share as PDF | drafted |
| Weekly report | `report.month.9` | සැප්. | Sep. | drafted |
| Weekly report | `report.month.10` | ඔක්. | Oct. | drafted |
| Subscription | `sub.title` | දායකත්වය සහ බිල්පත් | Subscription and billing | drafted |
| Subscription | `sub.plan` | දරුවෙක් · මාසිකව | One child · monthly | drafted |
| Subscription | `sub.nextPayment` | ඊළඟ ගෙවීම {date} · {method} | Next payment {date} · {method} | drafted |
| Subscription | `sub.switchTwo` | දරුවන් 2කට මාරු වෙන්න | Switch to two children | drafted |
| Subscription | `sub.changeMethod` | ගෙවීම් ක්‍රමය වෙනස් කරන්න | Change payment method | drafted |
| Subscription | `sub.history` | බිල්පත් ඉතිහාසය | Billing history | drafted |
| Subscription | `sub.addChild` | + දෙවැනි දරුවා එක් කරන්න | + Add a second child | drafted |
| Subscription | `sub.cancel` | දායකත්වය නවත්වන්න | Cancel the subscription | drafted |
| Subscription | `profiles.gradeLine` | {grade} ශ්‍රේණිය · PIN සකසා ඇත | Grade {grade} · PIN is set | drafted |
| Edge | `edge.loading.title` | පාඩම ලෑස්ති වෙනවා… | The lesson is getting ready… | drafted |
| Edge | `edge.loading.body` | සාරා ගුරුතුමිය පුවරුව හදාගන්නවා. | Teacher Zara is setting up the board. | drafted |
| Edge | `edge.offline.title` | අන්තර්ජාලය නෑ වගේ | Looks like there's no internet | drafted |
| Edge | `edge.offline.body` | Wi-Fi එක හරි දත්ත හරි බලලා ආයෙත් උත්සාහ කරමු. ඔයාගේ ප්‍රගතිය සුරක්ෂිතයි. | Check Wi-Fi or data and let's try again. Your progress is safe. | drafted |
| Edge | `edge.paused.title` | පාඩම නවත්වලා | Lesson paused | drafted |
| Edge | `edge.paused.body` | ලෑස්ති වුණාම දිගටම යමු. | When you're ready, let's continue. | drafted |
| Edge | `edge.paused.resume` | ▶ දිගටම | ▶ Continue | drafted |
| Edge | `edge.paused.stop` | නවත්වන්න | Stop | drafted |
| Session | `chat.childSpoke` | ඔයා කතා කළා | You spoke (the child's turn in the chat, in place of a transcript) | drafted |
| Edge | `edge.rotate.title` | ෆෝන් එක හරහට කරන්න | Turn your phone sideways | drafted |
| Edge | `edge.rotate.body` | පුවරුව හොඳට පේන්න පාඩම හරහට තියෙන්නේ. | The lesson is landscape so the board shows well. | drafted |
| Edge | `edge.mic.title` | මයික් එකට අවසර දෙන්න | Allow the microphone | drafted |
| Edge | `edge.mic.body` | ඔයා කියන පිළිතුරු මට අහන්න ඕනේ. හඬ තබා ගන්නේ නෑ — වචන විතරයි. | I need to hear your answers. The voice isn't kept — only the words. | drafted |
| Edge | `edge.mic.allow` | අවසර දෙන්න | Allow | drafted |
| Edge | `edge.mic.type` | ටයිප් කරන්නම් | I'll type | drafted |
| Edge | `edge.error.title` | අපොයි, මගේ අතින් වැරැද්දක් | Oops, my mistake | drafted |
| Edge | `edge.error.body` | මට පොඩි ප්‍රශ්නයක් ආවා. ආයෙත් උත්සාහ කරමුද? | I hit a small problem. Shall we try again? | drafted |
| Edge | `edge.error.home` | මුල් පිටුවට | To home | drafted |
| Session | `gate.title` | ප්‍රවේශ කේතය ඇතුළත් කරන්න | Enter the access code | drafted |
| Session | `gate.sub` | (දෙමාපියන් සඳහා — මේ උපකරණයේ එක වතාවක් පමණයි) | (for parents — once on this device) | drafted |
| Session | `gate.enter` | ඇතුල් වෙන්න | Enter | drafted |
| Session | `session.connectFail` | සම්බන්ධ වෙන්න බැරි වුණා. ආයෙ උත්සාහ කරන්න. | Couldn't connect. Try again. | drafted |
| Session | `session.leaveAsk` | නවත්වමුද? | Shall we stop? (⏹ asks once — from the device triage) | drafted |
| Session | `session.leaveBody` | ඉතුරු ටික පස්සේ කරන්න පුළුවන්. | You can do the rest later. | drafted |
| Session | `session.restartAsk` | මුල ඉඳන්ම ආයෙත් පටන් ගමුද? | Shall we start again from the very beginning? (↺ asks once) | drafted |

## Missing — no Sinhala in the export (not rendered)

| screen | key | needed (English) | where |
|---|---|---|---|
| Session summary | `install.explain` | Zara explains adding the app to the home screen ("Put me on your phone's home screen so the board fills the whole screen.") | the install prompt after a completed session; the tagline ඔයාගේම ගුරුතුමිය, ඔයාගේ ෆෝන් එකේ stands in |
| Session summary | `install.accept` | Add to home screen (button) | the install prompt — එකඟයි (from consent) stands in |
| Parent zone | `pin.create` | Create a 4-digit PIN for the parent zone | the PIN gate on first use — shows only the label PIN |
| Parent zone | `pin.enter` | Enter your PIN | the PIN gate — shows only the label PIN |
| Parent zone | `pin.saved` | PIN saved | the change-PIN screen — PIN සකසා ඇත stands in |
| Session summary | `limit.reached` | Today's time is up — see you tomorrow | the summary when the daily limit ends a sitting — හෙට ආයෙත් එන්න stands in |
| Parent zone | `delete.confirm` | This deletes the child's account and every record. It cannot be undone. | the delete screen — the consent card's මකන්න ඕනෑම වෙලාවක text stands in |
| Parent zone | `delete.done` | Deleted | after a delete the app returns to the splash |
| Parent zone | `profiles.title` | Children's profiles (screen title) | reuses the settings row label දරුවන්ගේ පැතිකඩ |
| Parent zone | `settings.title` | Daily limit / sound & captions (screen title) | reuses the settings row labels |
| Session summary | `summary.none` | No session recorded yet | the summary with no sitting behind it — the card lists nothing and තාම නෑ stands in |
| Weekly report / Certificate | `month.names` | Month names other than September (සැප්., සැප්තැම්බර්) and October (ඔක්.) | the report's range and the certificate's date fall back to numerals |
| Practice hub | `practice.empty` | Nothing to practise yet — finish a session first | the hub with no concept worked on — the list is empty and තාම නෑ stands in |
| Onboarding | `onboarding.devStub` | DEV ONLY — OTP and payment are stubs (English, parent surface) | the dev-only label under the stubbed steps (English on a parent surface) |
| Quiz | `quiz.expansionAsk` | Which number is missing? (for an expansion item) | the quiz shows the expansion line with ▢ and the recap ask line |
| Session | `nav.back` | Back a step (⏮ on the paused card's playback panel) | the control is the ⏮ glyph alone; its accessible name is English |
| Session | `nav.forward` | Forward a step (⏭ on the paused card's playback panel) | the control is the ⏭ glyph alone; its accessible name is English |
| Session | `nav.steps` | The steps of this session (the row of step marks on the playback panel) | the strip has no visible label; its accessible name is English |
