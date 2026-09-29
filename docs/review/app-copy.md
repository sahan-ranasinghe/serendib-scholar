# App copy — review sheet

Every child-facing and parent-facing string outside the session, extracted from `src/lib/appCopy.ts` by `scripts/extract-copy.ts`.

Last review round: **app-copy native review, 29 Sep 2026 (+ two follow-ups)** — every ruling and its reason in `docs/review/app-copy-corrections.json`.

- **accepted**: the reviewer's correction, applied as given.
- **adjusted**: the reviewer's correction, adjusted by the owner (loanwords with a natural Sinhala equivalent replaced).
- **kept**: the reviewer's correction rejected by the owner; the string stays.
- **consistency**: changed only by the consistency pass (ආයෙ → ආයෙත්).
- **added**: a string the sheet was missing, added from the review.
- **reviewed**: in the reviewed table with no correction.
- **fromScript**: verbatim in the authored lesson script.
- **drafted**: drafted by the developer at the owner's request, in the lesson's own words — needs sign-off.
- **missing**: the app needs the line and has no Sinhala for it; the screen leaves the spot empty or reuses another string, and the English gloss says what is needed.

Counts: accepted 7 · adjusted 3 · kept 1 · consistency 4 · added 21 · reviewed 236 · fromScript 21 · drafted 3 · missing 0

Terms: ගණක රාමුව (never අබකසය) · සාරා · සාරා ටීචර් (Latin "Zara Teacher" only on the splash wordmark, the manifest and the parent zone's English; "Serendib Scholar" is the company, parent-zone footer only). `{name}`-style holes are filled at runtime.

| screen | key | Sinhala | English gloss | status |
|---|---|---|---|---|
| Splash | `brand.wordmarkSi` | සාරා ටීචර් | Zara Teacher (Sinhala wordmark) | reviewed |
| all | `brand.zara` | සාරා | Zara | reviewed |
| Certificate | `brand.zaraTeacher` | සාරා ගුරුතුමිය | Teacher Zara | reviewed |
| all | `brand.abacus` | ගණක රාමුව | abacus (never අබකසය) | fromScript |
| all | `brand.maths` | ගණිතය | Maths | reviewed |
| all | `common.soon` | ළඟදීම | Coming soon | reviewed |
| all | `common.minutesN` | මිනිත්තු {n} | {n} minutes | reviewed |
| all | `common.starsN` | තරු {n} | {n} stars | reviewed |
| all | `common.daysN` | දින {n} | {n} days (streak) | reviewed |
| all | `common.gradeN` | {n} ශ්‍රේණිය | Grade {n} | fromScript |
| all | `common.lessonN` | පාඩම {n} | Lesson {n} | fromScript |
| all | `common.sessionNth` | {n} වෙනි සැසිය | Session {n} | accepted |
| all | `common.start` | පටන් ගමු | Let's start | fromScript |
| all | `common.back` | ‹ | back (glyph) | reviewed |
| Edge | `common.retry` | ආයෙත් උත්සාහ කරන්න | Try again | reviewed |
| Progress | `common.notYet` | තාම නෑ | Not yet | reviewed |
| all | `app.updateReady` | අලුත් අනුවාදයක් — යාවත්කාලීන කරන්න | A new version — update (the update banner; wording from the device report) | reviewed |
| Splash | `splash.tagline` | ඔයාගේම ගුරුතුමිය, ඔයාගේ ෆෝන් එකේ | Your own teacher, on your phone | reviewed |
| Splash | `splash.language` | භාෂාව | Language | reviewed |
| Splash | `splash.sinhala` | සිංහල | Sinhala | reviewed |
| Splash | `splash.tamilSoon` | தமிழ் · ළඟදීම | Tamil · coming soon | reviewed |
| Home | `home.greeting` | ආයුබෝවන් {name}! | Hello {name}! | reviewed |
| Home | `home.startToday` | අද පාඩම පටන් ගමුද? | Shall we start today's lesson? | reviewed |
| Home | `home.continueKicker` | ගණිතය · පාඩම {lesson} · {session} වෙනි සැසිය | Maths · Lesson {lesson} · Session {session} | consistency |
| Home | `home.today` | අද කරන්න | To do today | reviewed |
| Home | `home.continueLesson` | පාඩම දිගටම | Continue the lesson | reviewed |
| Home | `home.practice` | පුහුණුව | Practice | reviewed |
| Home | `home.yesterdayAgain` | ඊයේ නැවත | Yesterday, again | reviewed |
| Home | `home.subjects` | විෂයයන් | Subjects | reviewed |
| Home | `home.subjectSinhala` | සිංහල | Sinhala (subject) | reviewed |
| Home | `home.newBadge` | අලුත් ලාංඡනය — {name} | New badge — {name} | reviewed |
| Home | `home.badgeReason` | {concept} ඉගෙන ගත්තා | Learned {concept} | fromScript |
| Home | `home.badgesCount` | ලාංඡන {earned} / {total} | Badges {earned} / {total} | reviewed |
| Home | `home.parent` | දෙමාපිය | Parent (lock button title) | reviewed |
| shell | `app.updating` | යාවත්කාලීන වෙමින්… | Updating… | reviewed |
| shell | `app.offlineCached` | අන්තර්ජාලය නෑ — පරණ තොරතුරු පෙන්වනවා | No connection — showing the last copy | accepted |
| shell | `app.noData` | තොරතුරු ගන්න බැහැ — අන්තර්ජාලය බලලා ආයෙත් උත්සාහ කරන්න | Could not load — check the connection and try again | accepted |
| shell | `app.saveFailed` | සුරකින්න බැරි වුණා — ආයෙත් උත්සාහ කරන්න | Could not save — try again | adjusted |
| shell | `app.resetting` | යළි පටන් ගන්නවා… | Resetting… | reviewed |
| shell | `app.checking` | බලනවා… | Checking… | reviewed |
| Rewards | `rewards.outfitSheet.owned` | ලේනා දැන් මේක අඳිනවා! | Lena wears this now! | reviewed |
| Rewards | `rewards.outfitSheet.locked` | තවම අගුළු දාලා | Still locked | reviewed |
| Rewards | `rewards.outfitSheet.earn` | කොටස් {n}ක් ඉගෙන ගත්තම ලේනාට මේ ඇඳුම ලැබෙනවා | Master {n} concepts and Lena earns this outfit | reviewed |
| Rewards | `rewards.outfitSheet.left` | තව කොටස් {n}යි | {n} more to go | reviewed |
| Rewards | `rewards.outfitSheet.art` | චිත්‍රය ළඟදීම | Art coming soon | reviewed |
| Rewards | `rewards.outfitSheet.close` | වහන්න | Close | reviewed |
| nav | `nav.home` | මුල් පිටුව | Home | reviewed |
| nav | `nav.lessons` | පාඩම් | Lessons | fromScript |
| nav | `nav.practice` | පුහුණුව | Practice | reviewed |
| nav | `nav.rewards` | තෑගි | Rewards | reviewed |
| Lesson map | `map.subtitle` | පාඩම් {lessons} · තරු {stars} / {total} | Lessons {lessons} · Stars {stars} / {total} | reviewed |
| Lesson map | `lesson.1` | සංඛ්‍යා - 1 | Numbers - 1 | fromScript |
| Lesson map | `lesson.2` | සංඛ්‍යා - 2 | Numbers - 2 | reviewed |
| Lesson map | `lesson.3` | එකතු කිරීම | Addition | fromScript |
| Lesson map | `lesson.4` | අඩු කිරීම | Subtraction | reviewed |
| Lesson map | `lesson.5` | ගුණ කිරීම | Multiplication | reviewed |
| Lesson map | `lesson.6` | භාග | Fractions | reviewed |
| Lesson detail | `detail.kicker` | ගණිතය · පාඩම {lesson} | Maths · Lesson {lesson} | reviewed |
| Lesson detail | `detail.subtitle` | සැසි {sessions} · මිනිත්තු {minutes} · තරු {stars} / {total} | Sessions {sessions} · Minutes {minutes} · Stars {stars} / {total} | reviewed |
| Lesson detail | `detail.cta` | {n} වෙනි සැසිය පටන් ගමු | Start session {n} | consistency |
| Lesson detail | `detail.resume` | ඉතුරු ටික කරමු | Let's do the rest (resume) — from docs/qa/session1-triage.md | reviewed |
| Lesson detail | `detail.restart` | මුල ඉඳන් ආයෙත් | Again from the start (restart, confirm once) — from docs/qa/session1-triage.md | reviewed |
| Session summary | `summary.title` | නියමයි {name}! | Great, {name}! | reviewed |
| Session summary | `summary.today` | අද ඔයා… | Today you… | reviewed |
| Session summary | `summary.tomorrow` | හෙට ආයෙත් එන්න | Come back tomorrow | reviewed |
| Session summary | `summary.more` | තව පොඩ්ඩක් | A little more | reviewed |
| Session summary | `summary.questions` | ප්‍රශ්න {asked} කින් {correct} ක් හරි | {correct} of {asked} questions right | reviewed |
| Session summary | `summary.minutes` | මිනිත්තු {n} ක් | {n} minutes | reviewed |
| Session summary | `summary.looked` | බැලුවා | looked at (a concept seen, nothing asked) | reviewed |
| Session summary | `summary.plusOne` | +1 | +1 (streak) | reviewed |
| Practice hub | `practice.title` | පුහුණුව | Practice | reviewed |
| Practice hub | `practice.subtitle` | මිනිත්තු 3ක් — එක් සංකල්පයක් | 3 minutes — one concept | reviewed |
| Practice hub | `practice.rowSub` | මිනිත්තු 3 · ප්‍රශ්න {n} | 3 minutes · {n} questions | reviewed |
| Practice hub | `practice.pastPapers` | 🔒 පසුගිය ප්‍රශ්න | Past papers (locked) | reviewed |
| Practice hub | `practice.challenge` | ⏱ අභියෝගය | Challenge | reviewed |
| Practice hub | `practice.challengeSub` | මිනිත්තු 5 · ප්‍රශ්න 10 | 5 minutes · 10 questions | reviewed |
| Quiz | `quiz.check` | පරීක්ෂා කරන්න | Check | reviewed |
| Quiz | `quiz.recapAsk` | මේකේ උත්තරේ මොකක්ද කියන්න බලන්න. | See if you can say the answer to this one. | reviewed |
| Quiz | `quiz.colDigit` | ඉලක්කම | digit (table column) | fromScript |
| Quiz | `quiz.colPlace` | ඉලක්කම පිහිටි ස්ථානය | the place the digit is in (table column) | reviewed |
| Quiz | `quiz.colPlaceValue` | ස්ථානීය අගය | place value (table column) | fromScript |
| Quiz | `quiz.colValue` | ඉලක්කමෙන් නිරූපිත අගය | value the digit represents (table column) | kept |
| Quiz | `quiz.colName` | සංඛ්‍යා නාමය | number name (table column) | fromScript |
| Quiz | `quiz.done` | ප්‍රශ්න {asked} කින් {correct} ක් හරි | {correct} of {asked} questions right | reviewed |
| Rewards | `rewards.title` | තෑගි | Rewards | reviewed |
| Rewards | `rewards.subtitle` | ලාංඡන {earned} / {total} · සහතික {certs} | Badges {earned} / {total} · Certificates {certs} | reviewed |
| Rewards | `rewards.stickerBook` | ස්ටිකර් පොත | Sticker book | reviewed |
| Rewards | `rewards.sticker.1` | අලියා | Elephant | reviewed |
| Rewards | `rewards.sticker.2` | මොනරා | Peacock | reviewed |
| Rewards | `rewards.sticker.3` | නෙළුම | Lotus | reviewed |
| Rewards | `rewards.sticker.4` | කොත්තු | Kottu | reviewed |
| Rewards | `rewards.sticker.5` | ත්රීවීලර් | Three-wheeler | reviewed |
| Rewards | `rewards.sticker.6` | කිරිබත් | Kiribath | reviewed |
| Rewards | `rewards.sticker.7` | වෙසක් කූඩුව | Vesak lantern | reviewed |
| Rewards | `rewards.sticker.8` | ක්‍රිකට් | Cricket | fromScript |
| Rewards | `rewards.outfits` | ලේනාගේ ඇඳුම් | Lena's outfits | reviewed |
| Rewards | `rewards.outfit.1` | තොප්පිය | Cap (Screens C; Screens B's data names it පාසල් තොප්පිය, school cap) | reviewed |
| Rewards | `rewards.outfit.2` | හෙල්මට් | Helmet (Screens C; Screens B: ක්‍රිකට් හෙල්මට්, cricket helmet) | reviewed |
| Rewards | `rewards.outfit.3` | කූඩුව | Lantern (Screens C; Screens B: වෙසක් කූඩුව, Vesak lantern) | reviewed |
| Rewards | `rewards.certReady` | සහතිකය ලෑස්ති! | Certificate ready! | reviewed |
| Rewards | `rewards.certShow` | {concept} — අම්මාට පෙන්වන්න | {concept} — show your mum | reviewed |
| Certificate | `cert.title` | සහතිකය | Certificate | reviewed |
| Certificate | `cert.heading` | දක්ෂතා සහතිකය | Certificate of achievement | reviewed |
| Certificate | `cert.certifies` | මෙයින් සහතික කරනුයේ | This certifies that | reviewed |
| Certificate | `cert.body` | {grade} ශ්‍රේණියේ ගණිතය — {concept} සංකල්පය මනාව ප්‍රගුණ කළ බවයි. | has mastered the concept {concept} in Grade {grade} maths. | reviewed |
| Certificate | `cert.share` | බෙදාගන්න | Share | reviewed |
| Certificate | `cert.print` | මුද්‍රණය (A4) | Print (A4) | reviewed |
| Certificate | `cert.printing` | මුද්‍රණයට යවනවා… | Sending to print… | reviewed |
| Certificate | `cert.copied` | ලින්ක් එක පිටපත් කළා | Link copied | reviewed |
| Certificate | `cert.sharing` | බෙදාගන්නවා… | Sharing… | reviewed |
| Certificate | `cert.month.9` | සැප්තැම්බර් | September | reviewed |
| Certificate | `cert.dateFormat` | {year} {month} {day} | date: year month day | reviewed |
| Progress | `progress.title` | මගේ ප්‍රගතිය | My progress | reviewed |
| Progress | `progress.subtitle` | ගණිතය · සංකල්ප {mastered} / {total} | Maths · Concepts {mastered} / {total} | reviewed |
| Progress | `progress.status.best` | හොඳටම | Excellent | fromScript |
| Progress | `progress.status.good` | හොඳයි | Good | reviewed |
| Progress | `progress.status.practise` | පුරුදු වෙමු | Let's practise | fromScript |
| Progress | `progress.sentence.both` | {name}, {best} හොඳට තේරුම් ගත්තා. {weak} තව පොඩ්ඩක් පුරුදු වෙමු! | {name}, you understood {best} well. Let's practise {weak} a little more! | reviewed |
| Progress | `progress.concept.1` | සංඛ්‍යා කියවීම | Reading numbers | reviewed |
| Progress | `progress.concept.2` | දහසස්ථානය | The thousands place | fromScript |
| Progress | `progress.concept.3` | බිංදුව ඇති ස්ථාන | Places with a zero | reviewed |
| Progress | `progress.concept.4` | දස දහස | Ten thousand | fromScript |
| Progress | `progress.concept.5` | ගණක රාමුව කියවීම | Reading the abacus | reviewed |
| Progress | `progress.concept.6` | සංඛ්‍යා නාම | Number names | fromScript |
| Progress | `progress.concept.7` | විහිදුවා ලිවීම | Expanded form | reviewed |
| Progress | `progress.concept.8` | ස්ථානීය අගය | Place value | fromScript |
| Progress | `progress.concept.9` | සංඛ්‍යා කියවීම · ගණක රාමුව | Reading numbers · abacus (session subtitle) | reviewed |
| Progress | `progress.concept.10` | ස්ථානීය අගය · විහිදුවා ලිවීම | Place value · expanded form (session subtitle) | reviewed |
| Progress | `progress.concept.11` | දස දහස දක්වා | Up to ten thousand (session subtitle) | reviewed |
| Onboarding | `onb.stepOf` | පියවර {n} / 4 | Step {n} / 4 | reviewed |
| Onboarding | `onb.toggleSi` | සිං | සිං | reviewed |
| Onboarding 1 | `onb.1.bubble` | ආයුබෝවන්! මම සාරා. දරුවාගේ ගිණුම හදන්න මිනිත්තු දෙකක් විතර යනවා. | Hello! I'm Zara. Setting up your child's account takes about two minutes. | reviewed |
| Onboarding 1 | `onb.1.title` | දුරකථන අංකය තහවුරු කරමු | Let's confirm your phone number | reviewed |
| Onboarding 1 | `onb.1.phone` | දුරකථන අංකය | Phone number | reviewed |
| Onboarding 1 | `onb.1.code` | SMS මගින් ලැබුණු කේතය | The code you got by SMS | reviewed |
| Onboarding 1 | `onb.1.resend` | කේතය ලැබුණේ නැද්ද? ආයෙත් එවන්න ({t}) | Didn't get the code? Send again ({t}) — counts down once from 0:30, never loops | reviewed |
| Onboarding 1 | `onb.1.resendNow` | ආයෙත් එවන්න | Send again (the one resend, after 30 s) — the export's own words | reviewed |
| Onboarding 1 | `onb.1.send` | කේතය එවන්න | Send the code (composed from the export's කේතය … එවන්න) | reviewed |
| Onboarding 1 | `onb.1.devNotice` | SMS තහවුරු කිරීම තවම සක්‍රීය නැහැ | SMS verification is not active yet (dev notice, wording from docs/qa) | reviewed |
| Onboarding 1 | `onb.1.devNoticeEn` | dev: any 4-digit code works | English half of the dev notice (a parent surface) | reviewed |
| Onboarding | `onb.next` | ඉදිරියට | Next | reviewed |
| Onboarding 2 | `onb.2.bubble` | දරුවාට මම කතා කරන්නේ මේ නමින්. | This is the name I'll call your child by. | reviewed |
| Onboarding 2 | `onb.2.title` | දරුවා ගැන කියන්න | Tell me about your child | reviewed |
| Onboarding 2 | `onb.2.name` | දරුවාගේ නම | Child's name | reviewed |
| Onboarding 2 | `onb.2.avatar` | අවතාරය | Avatar | reviewed |
| Onboarding 2 | `onb.2.grade` | ශ්‍රේණිය | Grade | fromScript |
| Onboarding 2 | `onb.2.school` | පාසල (අත්‍යවශ්‍ය නොවේ) | School (optional) | reviewed |
| Onboarding 2 | `onb.2.schoolPlaceholder` | පාසලේ නම | School name | reviewed |
| Onboarding 2 | `avatar.1` | අලියා | Elephant | reviewed |
| Onboarding 2 | `avatar.2` | මොනරා | Peacock | reviewed |
| Onboarding 2 | `avatar.3` | ලේනා | Squirrel | reviewed |
| Onboarding 2 | `avatar.4` | කැස්බෑවා | Turtle | reviewed |
| Onboarding 2 | `avatar.5` | ගිරවා | Parrot | reviewed |
| Onboarding 2 | `avatar.6` | කොටියා | Leopard | reviewed |
| Onboarding 2 | `avatar.7` | මුවා | Deer | reviewed |
| Onboarding 2 | `avatar.8` | මාළුවා | Fish | reviewed |
| Onboarding 3 | `onb.3.bubble` | ඔබ දැනගත යුතු දේවල් තුනක් — සරලව. | Three things you should know — simply. | reviewed |
| Onboarding 3 | `onb.3.title` | අපි කරන දේ, නොකරන දේ | What we do, what we don't | reviewed |
| Onboarding 3 | `onb.3.c1.t` | දරුවා කියන දේ අකුරු වලට හැරෙනවා | What your child says becomes text | reviewed |
| Onboarding 3 | `onb.3.c1.d` | පිළිතුරු ලියවෙනවා. හඬ රෙකෝඩ් කරන්නේ නෑ — කවදාවත්ම නෑ. | Answers are written down. The voice is never kept — ever. | accepted |
| Onboarding 3 | `onb.3.c2.t` | ඔබට පෙනෙන්නේ | What you see | reviewed |
| Onboarding 3 | `onb.3.c2.d` | මිනිත්තු, සැසි, ඉගෙන ගත් සංකල්ප සහ වැරදුණු ප්‍රශ්න — සතිපතා වාර්තාවේ. | Minutes, sessions, concepts learned and missed questions — in the weekly report. | reviewed |
| Onboarding 3 | `onb.3.c3.t` | මකන්න ඕනෑම වෙලාවක | Delete any time | reviewed |
| Onboarding 3 | `onb.3.c3.d` | දෙමාපිය කලාපයෙන් එක තැනකින් ගිණුම සහ සියලු දත්ත මකා දමන්න පුළුවන්. | From one place in the parent zone you can delete the account and all its data. | reviewed |
| Onboarding 3 | `onb.3.privacy` | සම්පූර්ණ රහස්‍යතා ප්‍රතිපත්තිය | Full privacy policy | reviewed |
| Onboarding 3 | `onb.3.cta` | එකඟයි | I agree | reviewed |
| Onboarding 4 | `onb.4.bubble` | පළමු සතිය නොමිලේ. කැමති නැත්නම් නවත්වන්න පුළුවන්. | The first week is free. If you don't like it you can stop. | reviewed |
| Onboarding 4 | `onb.4.title` | සැලැස්ම තෝරන්න | Choose a plan | reviewed |
| Onboarding 4 | `onb.4.freeWeek` | පළමු සතිය නොමිලේ | First week free | reviewed |
| Onboarding 4 | `onb.4.oneChild` | දරුවෙක් | One child | reviewed |
| Onboarding 4 | `onb.4.twoChildren` | දරුවන් 2ක් | Two children | reviewed |
| Onboarding 4 | `onb.4.perMonth` |  / මාසයකට |  / per month | reviewed |
| Onboarding 4 | `onb.4.price1` | රු. 1,000 | Rs. 1,000 | reviewed |
| Onboarding 4 | `onb.4.price2` | රු. 1,600 | Rs. 1,600 | reviewed |
| Onboarding 4 | `onb.4.includes` | සියලු පාඩම් · සතිපතා වාර්තාව · ඕනෑම වෙලාවක නවත්වන්න | All lessons · weekly report · cancel any time | reviewed |
| Onboarding 4 | `onb.4.payment` | ගෙවීම — PayHere | Payment — PayHere | reviewed |
| Onboarding 4 | `onb.4.card` | කාඩ්පත | Card | fromScript |
| Onboarding 4 | `onb.4.bank` | බැංකුව | Bank | reviewed |
| Onboarding 4 | `onb.4.sms` | නොමිලේ සතිය අවසන් වීමට දින 2කට පෙර අපි ඔබට SMS එකක් එවනවා. අද ගෙවීමක් නෑ. | We'll SMS you two days before the free week ends. No payment today. | reviewed |
| Onboarding 4 | `onb.4.cta` | නොමිලේ සතිය පටන් ගන්න | Start the free week | reviewed |
| Onboarding 4 | `onb.4.skip` | පසුව තීරණය කරන්නම් | I'll decide later | reviewed |
| Parent zone | `parent.title` | දෙමාපිය කලාපය | Parent zone | reviewed |
| Parent zone | `parent.childLine` | {name} · {grade} ශ්‍රේණිය | {name} · Grade {grade} | reviewed |
| Parent zone | `parent.minWeek` | සතියකට මිනිත්තු | Minutes / week | accepted |
| Parent zone | `parent.sessions` | සැසි | Sessions | reviewed |
| Parent zone | `parent.confident` | සංකල්ප විශ්වාසයි | Concepts confident | reviewed |
| Parent zone | `parent.row.report` | සතිපතා වාර්තාව | Weekly report | reviewed |
| Parent zone | `parent.row.billing` | දායකත්වය සහ බිල්පත් | Subscription and billing | reviewed |
| Parent zone | `parent.row.limit` | දිනපතා කාල සීමාව | Daily time limit | reviewed |
| Parent zone | `parent.row.limitSub` | 15 · 20 · 30 | 15 · 20 · 30 (minutes) | reviewed |
| Parent zone | `parent.row.chatLimit` | සාරා එක්ක කතා කරන කාලය (දිනකට) | Time to talk with Zara (per day) | reviewed |
| Parent zone | `parent.row.chatLimitSub` | 15 · 30 · 60 | 15 · 30 · 60 (minutes of ✋ chat a day) | reviewed |
| Parent zone | `parent.row.sound` | ශබ්දය සහ උපසිරැසි | Sound and captions | reviewed |
| Parent zone | `parent.row.soundOn` | ශබ්දය ✓ | Sound ✓ | reviewed |
| Parent zone | `parent.row.captionsOn` | උපසිරැසි ✓ | Captions ✓ | reviewed |
| Parent zone | `parent.row.profiles` | දරුවන්ගේ පැතිකඩ | Children's profiles | reviewed |
| Parent zone | `parent.row.profilesSub` | දෙවැනි දරුවා එක් කරන්න | Add a second child | reviewed |
| Parent zone | `parent.row.pin` | PIN වෙනස් කරන්න | Change PIN | reviewed |
| Parent zone | `parent.row.help` | උදව් | Help | fromScript |
| Parent zone | `parent.row.delete` | ගිණුම සහ දත්ත මකන්න | Delete account and data | reviewed |
| Parent zone | `parent.whatsapp` | WhatsApp උදව් — {number} | WhatsApp help — {number} | reviewed |
| Parent zone | `parent.pinSet` | PIN සකසා ඇත | PIN is set | reviewed |
| Parent zone | `pin.label` | PIN එක | The PIN (field label) | reviewed |
| Parent zone | `pin.again` | ආයෙත් ටයිප් කරන්න | Type it again (second field when setting a PIN) | reviewed |
| Parent zone | `pin.current` | දැන් තියෙන PIN එක | The current PIN (change-PIN screen) | reviewed |
| Parent zone | `pin.new` | අලුත් PIN එක | The new PIN (change-PIN screen) | reviewed |
| Parent zone | `pin.mismatch` | PIN දෙක ගැළපෙන්නේ නෑ. ආයෙත් ටයිප් කරන්න. | The two PINs do not match. Type it again. | reviewed |
| Parent zone | `pin.show` | PIN එක පෙන්වන්න | Show the PIN (eye button) | reviewed |
| Parent zone | `pin.hide` | PIN එක හංගන්න | Hide the PIN (eye button) | reviewed |
| Home | `home.switchChild` | දරුවා මාරු කරන්න | Switch child (header avatar, sheet title) | reviewed |
| Home | `home.addChild` | + දරුවෙක් එක් කරන්න | + Add a child | reviewed |
| all | `common.close` | වහන්න | Close | reviewed |
| Parent zone | `parent.pinWrong` | කේතය වැරදියි. ආයෙත් බලලා ලියන්න. | Wrong code. Check and type it again. | consistency |
| Subscription | `parent.active` | සක්‍රීයයි | Active | reviewed |
| Weekly report | `report.title` | සතිපතා වාර්තාව | Weekly report | reviewed |
| Weekly report | `report.rangeChild` | {range} · {name} | {range} · {name} | reviewed |
| Weekly report | `report.sentence.both` | {name} {best} හොඳට තේරුම් ගත්තා; {weak} තව පුරුදු වෙන්න ඕනේ. | {name} understood {best} well; {weak} needs more practice. | reviewed |
| Weekly report | `report.dailyMinutes` | දිනපතා මිනිත්තු | Daily minutes | reviewed |
| Weekly report | `report.day.1` | ස | Mon | reviewed |
| Weekly report | `report.day.2` | අ | Tue | reviewed |
| Weekly report | `report.day.3` | බ | Wed | reviewed |
| Weekly report | `report.day.4` | බ්‍ර | Thu | reviewed |
| Weekly report | `report.day.5` | සි | Fri | reviewed |
| Weekly report | `report.day.6` | සෙ | Sat | reviewed |
| Weekly report | `report.day.7` | ඉ | Sun | reviewed |
| Weekly report | `report.confident` | විශ්වාසයි | Confident | reviewed |
| Weekly report | `report.needsWork` | තව පුරුදු වෙන්න | Needs more practice | reviewed |
| Weekly report | `report.missed` | වැරදුණු ප්‍රශ්න | Missed questions | reviewed |
| Weekly report | `report.gave` | දුන්නේ: {a} | Gave: {a} | reviewed |
| Weekly report | `report.correct` | නිවැරදි: {c} | Correct: {c} | reviewed |
| Weekly report | `report.sharePdf` | PDF ලෙස බෙදාගන්න | Share as PDF | reviewed |
| Subscription | `sub.title` | දායකත්වය සහ බිල්පත් | Subscription and billing | reviewed |
| Subscription | `sub.plan` | දරුවෙක් · මාසිකව | One child · monthly | reviewed |
| Subscription | `sub.nextPayment` | ඊළඟ ගෙවීම {date} · {method} | Next payment {date} · {method} | reviewed |
| Subscription | `sub.switchTwo` | දරුවන් 2කට මාරු වෙන්න | Switch to two children | reviewed |
| Subscription | `sub.changeMethod` | ගෙවීම් ක්‍රමය වෙනස් කරන්න | Change payment method | reviewed |
| Subscription | `sub.history` | බිල්පත් ඉතිහාසය | Billing history | reviewed |
| Subscription | `sub.addChild` | + දෙවැනි දරුවා එක් කරන්න | + Add a second child | reviewed |
| Subscription | `sub.cancel` | දායකත්වය නවත්වන්න | Cancel the subscription | reviewed |
| Subscription | `profiles.gradeLine` | {grade} ශ්‍රේණිය · PIN සකසා ඇත | Grade {grade} · PIN is set | reviewed |
| Edge | `edge.loading.title` | පාඩම ලෑස්ති වෙනවා… | The lesson is getting ready… | reviewed |
| Edge | `edge.loading.body` | සාරා ගුරුතුමිය පුවරුව හදාගන්නවා. | Teacher Zara is setting up the board. | reviewed |
| Edge | `edge.offline.title` | අන්තර්ජාලය නෑ වගේ | Looks like there's no internet | reviewed |
| Edge | `edge.offline.body` | Wi-Fi හරි ඩේටා හරි බලලා ආයෙත් උත්සාහ කරමු. ඔයා කරපු දේවල් සුරැකිලා තියෙනවා. | Check Wi-Fi or data and let's try again. Your progress is safe. | adjusted |
| Edge | `edge.paused.title` | පාඩම නවත්වලා | Lesson paused | reviewed |
| Edge | `edge.paused.body` | ලෑස්ති වුණාම දිගටම යමු. | When you're ready, let's continue. | reviewed |
| Edge | `edge.paused.resume` | ▶ දිගටම | ▶ Continue | reviewed |
| Edge | `edge.paused.stop` | නවත්වන්න | Stop | reviewed |
| Session | `nav.stepN` | {n} වෙනි පියවර | Step {n} (the playback panel's position, after the concept's name) | reviewed |
| Session | `nav.listen` | 🔊 ආයෙත් අහන්න | 🔊 Hear it again (plays the selected step's line once) | reviewed |
| Session | `chat.childSpoke` | ඔයා කතා කළා | You spoke (the child's turn in the chat, in place of a transcript) | reviewed |
| Session | `chat.outOfTime` | අද කතා කරන්න පුළුවන් වෙලාව ඉවරයි, හෙට ආයෙත් කතා කරමු | Today's chat time is used up — let's talk again tomorrow (the daily chat budget is spent) | reviewed |
| Session | `chat.failNetwork` | අන්තර්ජාලය නෑ වගේ. ටිකකින් ආයෙත් කතා කරමු. | Looks like there's no internet. Let's talk again in a little while (the chat could not reach the server) | reviewed |
| Session | `chat.failStart` | සම්බන්ධ වෙන්න බැරි වුණා. ආයෙත් උත්සාහ කරන්න. | Couldn't connect. Try again (the chat session could not be started) | accepted |
| Session | `chat.failDropped` | කතාව මැදින් නැවතුණා. ආයෙත් ✋ ඔබන්න. | The chat stopped part-way. Tap ✋ again (the live connection closed) | reviewed |
| Edge | `edge.rotate.title` | ෆෝන් එක හරහට කරන්න | Turn your phone sideways | reviewed |
| Edge | `edge.rotate.body` | පුවරුව හොඳට පේන්න පාඩම හරහට තියෙන්නේ. | The lesson is landscape so the board shows well. | reviewed |
| Edge | `edge.mic.title` | මයික් එකට අවසර දෙන්න | Allow the microphone | reviewed |
| Edge | `edge.mic.body` | ඔයා දෙන උත්තර මට අහන්න ඕනේ. කටහඬ රෙකෝඩ් කරන්නේ නෑ — වචන විතරයි. | I need to hear your answers. The voice isn't kept — only the words. | accepted |
| Edge | `edge.mic.allow` | අවසර දෙන්න | Allow | reviewed |
| Edge | `edge.mic.type` | ටයිප් කරන්නම් | I'll type | reviewed |
| Edge | `edge.error.title` | අපොයි, මගේ අතින් වැරැද්දක් | Oops, my mistake | reviewed |
| Edge | `edge.error.body` | මට පොඩි ප්‍රශ්නයක් ආවා. ආයෙත් උත්සාහ කරමුද? | I hit a small problem. Shall we try again? | reviewed |
| Edge | `edge.error.home` | මුල් පිටුවට | To home | reviewed |
| Session | `gate.title` | ප්‍රවේශ කේතය ඇතුළත් කරන්න | Enter the access code | reviewed |
| Session | `gate.sub` | (දෙමාපියන් සඳහා — මේ උපකරණයේ එක වතාවක් පමණයි) | (for parents — once on this device) | reviewed |
| Session | `gate.enter` | ඇතුල් වෙන්න | Enter | reviewed |
| Session | `session.connectFail` | සම්බන්ධ වෙන්න බැරි වුණා. ආයෙත් උත්සාහ කරන්න. | Couldn't connect. Try again. | consistency |
| Session | `session.leaveAsk` | නවත්වමුද? | Shall we stop? (⏹ asks once — from the device triage) | reviewed |
| Session | `session.leaveBody` | ඉතුරු ටික පස්සේ කරන්න පුළුවන්. | You can do the rest later. | reviewed |
| Session | `session.restartAsk` | මුල ඉඳන්ම ආයෙත් පටන් ගමුද? | Shall we start again from the very beginning? (↺ asks once) | reviewed |
| Session summary | `install.explain` | බෝඩ් එක මුළු තිරයේම පේන්න, මාව ඔයාගේ ෆෝන් එකේ මුල් පිටුවට දාගන්න. | Put me on your phone's home screen so the board fills the whole screen (the install prompt, Zara's bubble) | added |
| Session summary | `install.accept` | මුල් පිටුවට දාගන්න | Add to home screen (the install prompt's button) | added |
| Parent zone | `pin.create` | දෙමාපිය කලාපයට PIN එකක් හදන්න | Create a PIN for the parent zone | added |
| Parent zone | `pin.enter` | PIN එක ඇතුළත් කරන්න | Enter your PIN | added |
| Parent zone | `pin.saved` | PIN එක සුරැකුණා | PIN saved | added |
| Session summary | `limit.reached` | අදට වෙලාව ඉවරයි — හෙට ආයෙත් හම්බවෙමු | Today's time is up — see you tomorrow (the summary after the daily limit ended a sitting) | added |
| Parent zone | `delete.confirm` | මෙයින් දරුවාගේ ගිණුම සහ දත්ත සම්පූර්ණයෙන්ම මැකෙනවා. මෙය ආපසු හැරවිය නොහැක. | This deletes the child's account and all their data. It cannot be undone. | added |
| Parent zone | `delete.done` | මකා දැමුවා | Deleted | added |
| Parent zone | `profiles.title` | දරුවන්ගේ පැතිකඩ | Children's profiles | added |
| Parent zone | `settings.title` | කාල සීමාව / ශබ්දය සහ උපසිරැසි | Time limit / sound & captions | added |
| Session summary | `summary.none` | තාම පාඩම් කරලා නෑ | No session recorded yet | added |
| Weekly report / Certificate | `month.names` | ජන., පෙබ., මාර්තු, අප්‍රේල්, මැයි, ජූනි, ජූලි, අගෝ., සැප්., ඔක්., නොවැ., දෙසැ. | Jan., Feb., Mar., Apr., May, Jun., Jul., Aug., Sep., Oct., Nov., Dec. | added |
| Practice hub | `practice.empty` | තාම පුරුදු වෙන්න දේවල් නෑ — මුලින්ම පාඩමක් කරලා එමු | Nothing to practise yet — finish a session first | added |
| Onboarding | `onboarding.devStub` | DEV ONLY — OTP සහ ගෙවීම් පරීක්ෂණ සඳහා පමණයි | DEV ONLY — OTP and payment are for testing only | added |
| Quiz | `quiz.expansionAsk` | මෙතන තියෙන්න ඕනේ අගය මොකක්ද? | What value should go here? (an expansion item) | adjusted |
| Session | `nav.back` | පෙර පියවර | Back a step (⏮ on the playback panel — its accessible name) | added |
| Session | `nav.forward` | ඊළඟ පියවර | Forward a step (⏭ on the playback panel — its accessible name) | added |
| Session | `nav.panel` | මේ පාඩමේ පියවර | The steps of this lesson (the playback panel's name: its position, step strip, ⏮ ⏭) | added |
| all | `a11y.backspace` | මකන්න | Backspace (⌫ on the number pad and the word bank) | added |
| all | `a11y.done` | හරි | Done (✓ on the number pad and the word bank) | added |
| all | `a11y.close` | වහන්න | Close (the quiz's ✕, the page view's ✕) | added |
| all | `a11y.back` | ආපහු | Back (the ‹ in a screen's header) | added |
| all | `a11y.beadDrag` | පබළුවක් කූරකට දාන්න | Put a bead on a rod (the abacus tray's bead, dragged onto a rod) | drafted |
| all | `a11y.blank` | හිස්තැන | Blank (an empty box in the older lesson view) | drafted |
| all | `a11y.pageLoading` | පොතේ පිටුව එනවා | The book's page is loading (the page view's spinner) | drafted |

## Missing — no Sinhala in the export (not rendered)

None.

## Spoken lines drafted by the developer — need sign-off before recording

Zara says these (src/lib/authoredLines.ts); they are in the render batch and read on the board until recorded.

| key | Sinhala | English gloss | status |
|---|---|---|---|
| `lessonTimeSoon` | අපි තව පොඩ්ඩක් වැඩ කරමු, ඊට පස්සේ අද පාඩම ඉවරයි. | Let's work a little more, then today's lesson is over. (5 minutes before the daily lesson limit) | drafted |
| `lessonTimeLast` | දැන් අන්තිම ටික කරලා, අද පාඩම ඉවර කරමු. | Now let's do the last bit and finish today's lesson. (1 minute before the daily lesson limit) | drafted |
| `authored:placeValue4Digit:102t` | ඉලක්කමකින් පෙන්වන අගයට පොතේ කියන්නේ ඉලක්කමෙන් නිරූපිත අගය කියලා. | The value a digit shows is what the book calls 'the value represented by the digit'. (The first time the place-value table is up — names the textbook's column heading.) | drafted |
