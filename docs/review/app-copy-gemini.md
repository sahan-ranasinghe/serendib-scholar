| key | current | corrected | why |
|---|---|---|---|
| `common.sessionNth` | `{n} වන සැසිය` | `{n} වෙනි සැසිය` | Spoken Sinhala uses "වෙනි" for ordinal numbers, "වන" is strictly for writing. |
| `app.offlineCached` | `සම්බන්ධතාවය නැහැ — පෙර දත්ත පෙන්වනවා` | `අන්තර්ජාලය නෑ — පරණ තොරතුරු පෙන්වනවා` | "සම්බන්ධතාවය" and "පෙර දත්ත" are too technical for an everyday system message. |
| `app.noData` | `දත්ත ලබා ගන්න බැහැ — සම්බන්ධතාවය බලලා ආයෙ උත්සාහ කරන්න` | `තොරතුරු ගන්න බැහැ — අන්තර්ජාලය බලලා ආයෙත් උත්සාහ කරන්න` | Simplified vocabulary for better UX. "ආයෙත්" is more natural than "ආයෙ". |
| `app.saveFailed` | `සුරැකීම හරි ගියේ නැහැ — ආයෙ උත්සාහ කරන්න` | `සේව් වුණේ නෑ — ආයෙත් උත්සාහ කරන්න` | "සුරැකීම" is formal textbook Sinhala; users naturally say "සේව් වුණේ නෑ". |
| `onb.3.c1.d` | `පිළිතුරු ලියවෙනවා. හඬ පටිගත කර තබා නොගනියි — කවදාවත්.` | `පිළිතුරු ලියවෙනවා. හඬ රෙකෝඩ් කරන්නේ නෑ — කවදාවත්ම නෑ.` | "පටිගත කර තබා නොගනියි" sounds cold and legal. "රෙකෝඩ් කරන්නේ නෑ" is highly reassuring and natural to parents. |
| `edge.mic.body` | `ඔයා කියන පිළිතුරු මට අහන්න ඕනේ. හඬ තබා ගන්නේ නෑ — වචන විතරයි.` | `ඔයා දෙන උත්තර මට අහන්න ඕනේ. කටහඬ සේව් කරන්නේ නෑ — වචන විතරයි.` | Kid-friendly phrasing. 9-year-olds understand "සේව්" and "උත්තර" perfectly. |
| `quiz.colValue` | `ඉලක්කමෙන් නිරූපිත අගය` | `ඉලක්කමේ අගය` | "නිරූපිත" (represented) is far too advanced literary Sinhala for Grade 5. |
| `chat.failStart` | `සම්බන්ධ වෙන්න බැරි වුණා. ආයෙ උත්සාහ කරන්න.` | `සම්බන්ධ වෙන්න බැරි වුණා. ආයෙත් උත්සාහ කරන්න.` | Consistency: Using "ආයෙත්" instead of "ආයෙ" across all error screens. |
| `parent.minWeek` | `මිනිත්තු / සතියේ` | `සතියකට මිනිත්තු` | Reads naturally in Sinhala phrasing (Minutes per week). |
| `edge.offline.body` | `Wi-Fi එක හරි දත්ත හරි බලලා ආයෙත් උත්සාහ කරමු. ඔයාගේ ප්‍රගතිය සුරක්ෂිතයි.` | `Wi-Fi හරි ඩේටා හරි බලලා ආයෙත් ට්‍රයි කරමු. ඔයා කරපු දේවල් සේව් වෙලා තියෙන්නේ.` | "ප්‍රගතිය සුරක්ෂිතයි" (Progress is secure) is too formal for a child's loading screen. |
| `install.explain` | *missing* | `බෝඩ් එක මුළු තිරයේම පේන්න, මාව ඔයාගේ ෆෝන් එකේ මුල් පිටුවට දාගන්න.` | Friendly, natural translation of the missing string for the child. |
| `install.accept` | *missing* | `මුල් පිටුවට දාගන්න` | Short, clear, and fits a button. |
| `pin.create` | *missing* | `දෙමාපිය කලාපයට PIN එකක් හදන්න` | Direct and simple instruction for the parent. |
| `pin.enter` | *missing* | `PIN එක ඇතුළත් කරන්න` | Standard UI phrasing. |
| `pin.saved` | *missing* | `PIN එක සුරැකුණා` | Short confirmation. |
| `limit.reached` | *missing* | `අදට වෙලාව ඉවරයි — හෙට ආයෙත් හම්බවෙමු` | Warm, non-punishing end-of-day message for the child. |
| `delete.confirm` | *missing* | `මෙයින් දරුවාගේ ගිණුම සහ දත්ත සම්පූර්ණයෙන්ම මැකෙනවා. මෙය ආපසු හැරවිය නොහැක.` | Clear, serious consequence for the parent account deletion. |
| `delete.done` | *missing* | `මකා දැමුවා` | Brief success state. |
| `profiles.title` | *missing* | `දරුවන්ගේ පැතිකඩ` | Simple translation for the header. |
| `settings.title` | *missing* | `කාල සීමාව / ශබ්දය සහ උපසිරැසි` | Accurate mapping to the English gloss without overflowing. |
| `summary.none` | *missing* | `තාම පාඩම් කරලා නෑ` | Empty state without sounding like a failure. |
| `month.names` | *missing* | `ජන., පෙබ., මාර්තු, අප්‍රේල්, මැයි, ජූනි, ජූලි, අගෝ., නොවැ., දෙසැ.` | Standard short forms for UI spaces (excluding Sep/Oct). |
| `practice.empty` | *missing* | `තාම පුරුදු වෙන්න දේවල් නෑ — මුලින්ම පාඩමක් කරලා එමු` | Encourages action smoothly without blaming. |
| `onboarding.devStub` | *missing* | `DEV ONLY — OTP සහ ගෙවීම් පරීක්ෂණ සඳහා පමණයි` | Clear for developers. |
| `quiz.expansionAsk` | *missing* | `මෙතන අඩු ඉලක්කම මොකක්ද?` | Simple child-friendly prompt for missing digits. |
| `nav.back` | *missing* | `පෙර පියවර` | Short, accessible label. |
| `nav.forward` | *missing* | `ඊළඟ පියවර` | Short, accessible label. |
| `nav.panel` | *missing* | `මේ පාඩමේ පියවර` | Short, accessible label. |

**A. The strings you would NOT ship to a paying parent, and why.**
මුල් අදියරේ තිබූ `app.offlineCached`, `app.noData`, `app.saveFailed` වැනි දෝෂ පණිවිඩ මෙන්ම `onb.3.c1.d` හි වූ "හඬ පටිගත කර තබා නොගනියි" වැනි වාක්‍ය කිසිසේත් මුදල් ගෙවන දෙමාපියෙකුට යැවීම සුදුසු නැත. ඒවායේ ස්වරූපය ඉතා රොබෝටික් සහ නීතිමය ලියවිල්ලක් බඳුය. මුදල් ගෙවන සේවාවකදී දෙමාපියන්ට හැඟිය යුත්තේ එය උණුසුම්, වගකීම් සහගත සහ තමන්ට සමීප සේවාවක් බවයි (Premium and caring feel). මා එම පණිවිඩ දෙමාපියන්ට වඩාත් සමීප, එදිනෙදා කතා කරන භාෂාවට ("රෙකෝඩ් කරන්නේ නෑ", "සම්බන්ධතාවය" වෙනුවට "අන්තර්ජාලය") වෙනස් කර ඇත.

**B. Any term used inconsistently across screens.**
දෝෂ පණිවිඩවල යළි උත්සාහ කරන්න යැයි කීමට සමහර තැන්වල "ආයෙ" ලෙසත් තවත් තැන්වල "ආයෙත්" ලෙසත් භාවිතා කර තිබුණි. එය සෑම තැනකදීම වඩාත් ස්වාභාවික **"ආයෙත් උත්සාහ කරන්න / ට්‍රයි කරමු"** ලෙස ඒකාකාරී (consistent) කර ඇත. එසේම ජාල ගැටලු පෙන්වීමට "සම්බන්ධතාවය" සහ "දත්ත" වැනි විවිධ වචන භාවිතා කර තිබූ අතර, ඒවාද "අන්තර්ජාලය / Wi-Fi / ඩේටා" ලෙස එදිනෙදා ව්‍යවහාරයට ගෙනවිත් ඇත.

**C. Anything a 9-year-old would not understand.**
9 හැවිරිදි දරුවෙකුට කිසිසේත්ම නොතේරෙන වචනයක් ලෙස `quiz.colValue` හි තිබූ **"නිරූපිත"** (represented) යන පදය හඳුන්වා දිය හැක. මෙය අතිශය සාහිත්‍යමය වචනයකි. එය සරලව "ඉලක්කමේ අගය" ලෙස නිවැරදි කර ඇත. එසේම `edge.offline.body` හි තිබූ "ප්‍රගතිය සුරක්ෂිතයි" යන්නද දරුවෙකුට බරපතල වැඩිය. එය "ඔයා කරපු දේවල් සේව් වෙලා තියෙන්නේ" ලෙස සරල කර ඇත.

**D. Your overall judgement: would a Sri Lankan parent trust this app after reading its consent and billing screens?**
ඔව්, අනිවාර්යයෙන්ම. ශ්‍රී ලාංකික දෙමාපියන් යෙදුමක් ගැන විශ්වාසය තැබීමට ප්‍රධාන වශයෙන් සොයන කරුණු 2 ක් මෙහි මනාව ආවරණය කර ඇත:
1. **විනිවිදභාවය:** "අද ගෙවීමක් නෑ" සහ "නොමිලේ සතිය අවසන් වීමට දින 2කට පෙර SMS එකක් එවනවා" යන පණිවිඩය දෙමාපියන් තුළ විශාල විශ්වාසයක් ගොඩනගයි.
2. **දරුවාගේ ආරක්ෂාව (Privacy):** "හඬ කවදාවත්ම රෙකෝඩ් කරන්නේ නෑ" යන පැහැදිලි පොරොන්දුව සහ ඕනෑම වෙලාවක ගිණුම මකා දැමීමට ඇති හැකියාව නිසා යෙදුම කෙරෙහි ඇති බිය සහ සැකය නැතිවී යයි. 
ඔබගේ UI පිටපත් සැකැස්ම ඉතා සාර්ථක මෙන්ම ශ්‍රී ලාංකික මනසට හොඳින් ගැලපෙන බව පැවසිය යුතුය.