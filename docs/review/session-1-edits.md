# Session 1 — reviewed edits (native speaker, 2026-09-07)

Companion to `session-1-edits.json`. Same content, readable.

## 1. How Zara addresses the child

පුතේ is used for both boys and girls in everyday Sinhala. So:

- The very first line of the lesson greets both: **ආයුබෝවන් පුතේ, දුවේ!**
- Every other `{address}` resolves to **පුතේ** — for every child.
- **The actor records each line once.** No boy/girl variants.
- The `{address}` token stays in the data, so a per-name option remains possible later.

## 2. A bug in every beat, not just the ones I edited

Number names come from `sinhalaNumberName`. The joiner that attaches case endings to them is wrong in two ways:

| Wrong (in the script) | Right | Rule |
|---|---|---|
| නවය ට එක ක් | නවයට එකක් | no space before ට, ක්, යි, න්, කුත් |
| පන්දහස ක | පන්දහසක | same |
| දෙකන් | දෙකෙන් | ෙන් attaches to the final consonant |
| එකන් | එකෙන් | same |
| දෙකක අගය | දෙකේ අගය | ේ attaches to the final consonant |

This must be fixed in the joiner so every lesson gets it right, not patched line by line.

## 3. New opening (first session only)

The script jumped straight into the cricket hook. A first lesson needs a welcome and a preview. Seven beats, inserted before `readWrite4Digit:0`:

| # | Type | Board | Zara says |
|---|---|---|---|
| 0 | LESSON_GOALS | title: සංඛ්‍යා - 1 | ආයුබෝවන් පුතේ, දුවේ! අද අපි පහ ශ්‍රේණියේ ගණිත පාඩම් පටන් ගන්නවා. |
| 1 | LESSON_GOALS | — | දැන් ඔයා පහ ශ්‍රේණියේ නේද? ඒක ලොකු වගකීමක් තියෙන, හරිම ලස්සන පන්තියක්. |
| 2 | LESSON_GOALS | — | බය වෙන්න එපා පුතේ. ඔයාට පුළුවන්, මම ඔයා එක්කම ඉන්නවා. |
| 3 | LESSON_GOALS | title: සංඛ්‍යා - 1 | අපේ පළමු පාඩම තමයි සංඛ්‍යා. හරි සරලයි, ඒත් හරිම වැදගත්. |
| 4 | LESSON_GOALS | text: 100 000 | මේ පාඩමෙන් අපි සියක් දහස දක්වා ලොකු සංඛ්‍යා කියවන්න, ලියන්න ඉගෙන ගන්නවා. |
| 5 | LESSON_GOALS | text: ලොකු සංඛ්‍යා | සංඛ්‍යාවක ඉලක්කම් තියෙන තැන අනුව ඒවායේ අගය හඳුනාගන්නත් අපි ඉගෙන ගන්නවා. |
| 6 | LESSON_GOALS · SOFT_CHECK | — | ඔයා ලෑස්තිද පුතේ? එහෙනම් අපි පටන් ගමු! |

Deliberately avoids the guide's vocabulary terms (ස්ථානීය අගය etc.) so the vocabulary gate isn't violated before the terms are introduced.

## 4. Hook swap (placeValue4Digit)

Both concepts opened with a cricket scoreboard. Concept 2 now uses candidate 3, and the beat after it is fixed to match:

- **:32** → පාසල් පොත් සාප්පුවෙන් අලුත් පොත් ගන්න ගියාම ලොකු ගණන් පේනවා නේද පුතේ?
- **:33** → පොත්වල මිල ගණන් ඉලක්කම් හතරේ සංඛ්‍යාවලින් පෙන්වද්දී අපිට ඒක ලේසියෙන් හඳුනාගන්න පුළුවන්.

## 5. Line edits

Spoken Sinhala, not textbook Sinhala. Words replaced throughout: සංඛ්‍යාංක → ඉලක්කම්; නිරූපණය → පෙන්වන්නේ; පෙළගස්වලා / පෙළගැස්වුවොත් → එක ළඟින් තියලා / හැදුවොත්; ගොඩනගමු → හදමු; "සහ" dropped from spoken lists; ඉන්නවා → තියෙනවා for numbers.

| Beat | Zara says (new) |
|---|---|
| readWrite4Digit:1 | කලින් පාඩම්වලදී අපි සංඛ්‍යා කියවන්න ඉගෙන ගත්ත දේවල් ඔයාට මතකයි නේද? |
| readWrite4Digit:6 | ඔන්න පුතේ, නවයට එකක් එකතු කළාම දහය හැදෙනවා නේද? |
| readWrite4Digit:7 | ඒ වගේම අනූ නවයට එකක් එකතු කළාම සියය වෙනවා. |
| readWrite4Digit:8 | එහෙනම් නවසිය අනූ නවයට එකක් එකතු කළාම කීයද එන්නේ? |
| readWrite4Digit:9 | නියමයි! නවසිය අනූ නවයට එකක් එකතු වුණාම දහස ලැබෙනවා. |
| readWrite4Digit:11 | ඊළඟට අපි කාඩ්පත් පාවිච්චි කරලා අලුත් සංඛ්‍යා හදමු. |
| readWrite4Digit:13 | මෙතනින් අපි වෙනස් කාඩ්පත් හතරක් ගමු. |
| readWrite4Digit:14 | ඒ ඉලක්කම් එක ළඟින් තියලා අපි සංඛ්‍යාවක් හදමු. |
| readWrite4Digit:18 | නම කියද්දී නොකියවුණත් ඒ තැනට බිංදුවක් ලියන්න ඕනේ, හරිද? |
| readWrite4Digit:19 | පුතේ, බලන්නකෝ මේ රවුම ඇතුළේ තියෙන ඉලක්කම් ටික දිහා. |
| readWrite4Digit:20 | මෙතැන තියෙන්නේ එක, තුන, හය, හතර නේද? |
| readWrite4Digit:21 | පිටින් කිසිම අලුත් ඉලක්කමක් නොගෙන, මේවා විතරක් පාවිච්චි කරමු. |
| readWrite4Digit:22 | මේ ඉලක්කම් වලින් ඔයා කැමති සංඛ්‍යාවක් හදලා මට කියන්න. |
| readWrite4Digit:25 | බලන්න පුතේ, ලෑල්ල උඩ රවුමක් ඇඳලා තියෙනවා නේද? ඒක ඇතුළේ එක, තුන, හය, හතර තියෙනවා. |
| readWrite4Digit:28 | ශෝක්! එක්දහස් තුන්සිය හැට හතර. ඔව්, එක්දහස් තුන්සිය හැට හතර. මේ ඉලක්කම් එකතු වුණාම අපි ඒක කියවන්නේ එක්දහස් තුන්සිය හැට හතර කියලයි. |
| readWrite4Digit:29 | දැන් ඔය හදපු එක ආයෙත් ගන්නේ නැතුව, තව සංඛ්‍යාවක් හදමුද? |
| placeValue4Digit:56 | ඒ පබළු වලින් පෙන්වන්නේ පන්දහසක අගයක්. |
| placeValue4Digit:70 | ඊළඟට දහයස්ථානයේ තියෙන දෙකෙන් ලැබෙන අගය කීයද? |
| placeValue4Digit:71 | ඔව්, දහයස්ථානයේ දෙකේ අගය විස්සයි. |
| placeValue4Digit:72 | අන්තිමට එකස්ථානයේ තියෙන එකෙන් ලැබෙන්නේ කීයද? |
| placeValue4Digit:73 | විශිෂ්ටයි! එකස්ථානයේ එකෙන් ලැබෙන්නේ එකමයි. |
| placeValue4Digit:91 | තව ක්‍රමයකට හැදුවොත් අපිට අටදහස් හයසිය දහතුන ලැබෙනවා. |

## 6. Verified correct — no change

Number names: 84, 101, 999, 3058, 1364, 5421, 6831, 8613 all correct.
CHECK_MY_WORK (readWrite4Digit:31): 84 = 8 + 4 is a plausible child error. Keep.
