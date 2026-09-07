# Session 1 — Zara's original script (for review)

Generated 2026-09-07 00:40 with gemini-flash-latest. 112 beats across readWrite4Digit, placeValue4Digit.

63 of the 112 beats carry `humanEdited: true` — a native-speaker review rewrote them (docs/review/session-1-edits.json, then docs/review/gemini-review-decisions.json). Each is marked **· human-edited** below.

**Status: APPROVED.** These are the words a child hears. Editing the JSON invalidates the cached script automatically; set `"approved": false` to take it back off the air.

Denylist (the recorded teacher's own numbers, never used): 15, 17, 28, 35, 38, 40, 48, 69, 70, 80, 200, 300, 602, 870, 1080, 3007, 4004, 4920, 5322, 6054, 6418, 7256, 8597, 8903, 25000, 28500, 34879, 35147, 40100, 40120, 40125, 40157, 40158, 40175, 40185, 48739, 76109, 79843, 82406, 85000, 85101, 87349, 96805, 98743

## opening


### `authored:opening:0`

**LESSON_GOALS** · pause: RHETORICAL · guide: Lesson opening: welcome the child and preview what this lesson covers. · max-sim J 0.16 · **human-edited**

> ආයුබෝවන් {address}! අද අපි පහ ශ්‍රේණියේ ගණිත පාඩම් පටන් ගන්නවා නේද?

Board: `{"kind":"title","title":"සංඛ්‍යා - 1"}`

### `authored:opening:1`

**LESSON_GOALS** · pause: — · guide: Lesson opening: welcome the child and preview what this lesson covers. · max-sim J 0.22 · **human-edited**

> දැන් ඔයා පහ ශ්‍රේණියේ නේද? ඒක හරිම වැදගත්, ලස්සන පන්තියක්.

Board: `{"kind":"none"}`

### `authored:opening:2`

**LESSON_GOALS** · pause: — · guide: Lesson opening: welcome the child and preview what this lesson covers. · max-sim J 0.13 · **human-edited**

> බය වෙන්න එපා {address}. ඔයාට පුළුවන්, මම ඔයා එක්කම ඉන්නවා.

Board: `{"kind":"none"}`

### `authored:opening:3`

**LESSON_GOALS** · pause: — · guide: Lesson opening: welcome the child and preview what this lesson covers. · max-sim J 0.19 · **human-edited**

> අපේ පළමු පාඩම තමයි සංඛ්‍යා. හරි සරලයි, ඒත් හරිම වැදගත්.

Board: `{"kind":"title","title":"සංඛ්‍යා - 1"}`

### `authored:opening:4`

**LESSON_GOALS** · pause: — · guide: Lesson opening: welcome the child and preview what this lesson covers. · max-sim J 0.12 · **human-edited**

> මේ පාඩමෙන් අපි සියක් දහස දක්වා ලොකු සංඛ්‍යා කියවන්න, ලියන්න ඉගෙන ගන්නවා.

Source: `මේ පාඩමෙන් අපි {number:100000} දක්වා ලොකු සංඛ්‍යා කියවන්න, ලියන්න ඉගෙන ගන්නවා.`

Board: `{"kind":"text","text":"100 000"}`

### `authored:opening:5`

**LESSON_GOALS** · pause: — · guide: Lesson opening: welcome the child and preview what this lesson covers. · max-sim J 0.14 · **human-edited**

> සංඛ්‍යාවක ඉලක්කම් තියෙන තැන අනුව ඒවායේ අගය හඳුනාගන්නත් අපි ඉගෙන ගන්නවා.

Board: `{"kind":"text","text":"ලොකු සංඛ්‍යා"}`

### `authored:opening:6`

**LESSON_GOALS** · pause: SOFT_CHECK · guide: Lesson opening: welcome the child and preview what this lesson covers. · max-sim J 0.17 · **human-edited**

> ඔයා ලෑස්තිද {address}? එහෙනම් අපි පටන් ගමු!

Board: `{"kind":"none"}`

## readWrite4Digit

Analogy domain (what the teaching reasons through): **mangoes in a basket**

Hook candidates (first is in use):

1. ක්‍රිකට් මැච් එකක් බලද්දී ලකුණු පුවරුවේ තියෙන ලකුණු ඔයා කියවලා තියෙනවා නේද {address}?
2. අපි බස් එකේ යද්දී බස් ටිකට් පතේ මුද්‍රණය කරපු අංක ඔයා දැකලා තියෙනවා නේද?
3. අම්මා කඩෙන් බඩු ගෙනාවම බිල්පතේ මිල ගණන් කියවන්න ඔයා උදව් වෙනවා නේද {address}?

### `authored:readWrite4Digit:0`

**HOOK** · pause: SOFT_CHECK · guide: Display a row of numbers with up to 3 digits and have students read each number's name aloud. · max-sim J 0.06 / C 0.70

> ක්‍රිකට් මැච් එකක් බලද්දී ලකුණු පුවරුවේ තියෙන ලකුණු ඔයා කියවලා තියෙනවා නේද {address}?

Board: `{"kind":"title","title":"සංඛ්‍යා කියවමු"}`

### `authored:readWrite4Digit:1`

**EXPLAIN** · pause: RHETORICAL · guide: Display a row of numbers with up to 3 digits and have students read each number's name aloud. · max-sim J 0.21 · **human-edited**

> කලින් පාඩම්වලදී අපි සංඛ්‍යා කියවන්න ඉගෙන ගත්ත දේවල් ඔයාට මතකයි නේද?

Board: `{"kind":"text","text":"84   101   528   997"}`

### `authored:readWrite4Digit:2`

**ASK** · pause: ASK · guide: Display a row of numbers with up to 3 digits and have students read each number's name aloud. · expects **අසූ හතර** · max-sim J 0.14 / C 0.82

> මෙන්න මේ පුවරුවේ තියෙන මුල්ම සංඛ්‍යාව මොකක්ද කියලා මට කියන්න බලන්න.

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:3`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Display a row of numbers with up to 3 digits and have students read each number's name aloud. · expects **එකසිය එක** · max-sim J 0.15 · **human-edited**

> හරියටම හරි, අසූ හතර. දැන් මේ ඊළඟ සංඛ්‍යාවේ සංඛ්‍යා නාමය කියන්නකෝ.

Source: `හරියටම හරි, {number:84}. දැන් මේ ඊළඟ සංඛ්‍යාවේ සංඛ්‍යා නාමය කියන්නකෝ.`

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:4`

**EXPLAIN** · pause: — · guide: Display a row of numbers with up to 3 digits and have students read each number's name aloud. · max-sim J 0.27 / C 0.77

> දසස්ථානයේ බිංදුව තියෙන නිසා ඒ කොටස කියවෙන්නේ නැහැ. හරිම දක්ෂයි!

Source: `දසස්ථානයේ {number:0} තියෙන නිසා ඒ කොටස කියවෙන්නේ නැහැ. හරිම දක්ෂයි!`

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:5`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Display a row of numbers with up to 3 digits and have students read each number's name aloud. · expects **නවසිය අනූ හත** · max-sim J 0.12 / C 0.72 · **human-edited**

> එහෙනම් {address}, පුවරුවේ තියෙන අන්තිම සංඛ්‍යාවත් මට කියවලා පෙන්නන්න පුළුවන්ද?

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:6`

**EXPLAIN** · pause: RHETORICAL · guide: Show what comes after 999 using a build-up: 9+1=10, 99+1=100, 999+1=1000. · max-sim J 0.00 · **human-edited**

> ඔන්න {address}, නවයට එකක් එකතු කළාම දහය හැදෙනවා නේද?

Source: `ඔන්න {address}, {number:9}ට {number:1}ක් එකතු කළාම {number:10} හැදෙනවා නේද?`

Board: `{"kind":"text","text":"9 + 1 = 10"}`

### `authored:readWrite4Digit:7`

**EXPLAIN** · pause: — · guide: Show what comes after 999 using a build-up: 9+1=10, 99+1=100, 999+1=1000. · max-sim J 0.00 · **human-edited**

> ඒ වගේම අනූ නවයට එකක් එකතු කළාම සියය හැදෙනවා.

Source: `ඒ වගේම {number:99}ට {number:1}ක් එකතු කළාම {number:100} හැදෙනවා.`

Board: `{"kind":"text","text":"99 + 1 = 100"}`

### `authored:readWrite4Digit:8`

**ASK** · pause: ASK · guide: Show what comes after 999 using a build-up: 9+1=10, 99+1=100, 999+1=1000. · expects **1000** · max-sim J 0.00 · **human-edited**

> එහෙනම් නවසිය අනූ නවයට එකක් එකතු කළාම කීයද එන්නේ?

Source: `එහෙනම් {number:999}ට {number:1}ක් එකතු කළාම කීයද එන්නේ?`

Board: `{"kind":"text","text":"999 + 1 = ?"}`

### `authored:readWrite4Digit:9`

**EXPLAIN** · pause: — · guide: Show what comes after 999 using a build-up: 9+1=10, 99+1=100, 999+1=1000. · max-sim J 0.00 · **human-edited**

> නියමයි! නවසිය අනූ නවයට එකක් එකතු වුණාම දහස හැදෙනවා.

Source: `නියමයි! {number:999}ට {number:1}ක් එකතු වුණාම {number:1000} හැදෙනවා.`

Board: `{"kind":"text","text":"999 + 1 = 1000"}`

### `authored:readWrite4Digit:10`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Show what comes after 999 using a build-up: 9+1=10, 99+1=100, 999+1=1000. · max-sim J 0.20 / C 0.86

> මෙතන ඉලක්කම් හතරක් තියෙනවා පේනවා නේද, {address}?

Board: `{"kind":"text","text":"1000"}`

### `authored:readWrite4Digit:11`

**TRANSITION** · pause: — · guide: Show what comes after 999 using a build-up: 9+1=10, 99+1=100, 999+1=1000. · max-sim J 0.11 · **human-edited**

> ඊළඟට අපි කාඩ්පත් පාවිච්චි කරලා අලුත් සංඛ්‍යා හදමු.

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:12`

**TRANSITION** · pause: — · guide: Place cards with digits 0-9 on a table; a student picks 4 cards, forms a 4-digit number, and reads/writes it while another confirms. · max-sim J 0.10 / C 0.76

> දැන් අපි කාඩ්පත් එක්ක සෙල්ලමක් කරමු {address}.

Board: `{"kind":"text","text":"කාඩ්පත්: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9"}`

### `authored:readWrite4Digit:13`

**EXPLAIN** · pause: — · guide: guide step 3 of 5: Place cards with digits 0-9 on a table; a student picks 4 cards, forms a 4-digit number, and reads/writes it while another confirms. · max-sim J 0.15 · **human-edited**

> මෙතනින් අපි වෙනස් කාඩ්පත් හතරක් ගමු.

Board: `{"kind":"text","text":"තෝරාගත් ඉලක්කම්: 3, 0, 5, 8"}`

### `authored:readWrite4Digit:14`

**EXPLAIN** · pause: — · guide: guide step 3 of 5: Place cards with digits 0-9 on a table; a student picks 4 cards, forms a 4-digit number, and reads/writes it while another confirms. · max-sim J 0.15 · **human-edited**

> ඒ ඉලක්කම් එක ළඟින් තියලා අපි සංඛ්‍යාවක් හදමු.

Board: `{"kind":"text","text":"3058"}`

### `authored:readWrite4Digit:15`

**ASK** · pause: ASK · guide: guide step 3 of 5: Place cards with digits 0-9 on a table; a student picks 4 cards, forms a 4-digit number, and reads/writes it while another confirms. · expects **තුන්දහස් පනස් අට** · max-sim J 0.19 · **human-edited**

> ඔයාට පුළුවන්ද මේ හැදුණු සංඛ්‍යාව කියවලා මට කියන්න?

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:16`

**EXPLAIN** · pause: — · guide: guide step 3 of 5: Place cards with digits 0-9 on a table; a student picks 4 cards, forms a 4-digit number, and reads/writes it while another confirms. · max-sim J 0.00

> නියමයි, ඒ සංඛ්‍යාව තුන්දහස් පනස් අට.

Source: `නියමයි, ඒ සංඛ්‍යාව {number:3058}.`

Board: `{"kind":"text","text":"3058 - තුන්දහස් පනස් අට"}`

### `authored:readWrite4Digit:17`

**EXPLAIN** · pause: RHETORICAL · guide: guide step 3 of 5: Place cards with digits 0-9 on a table; a student picks 4 cards, forms a 4-digit number, and reads/writes it while another confirms. · max-sim J 0.23 / C 0.85

> මෙතන සියයේ තැනට කිසිම අගයක් කියවෙන්නේ නැහැ, නේද?

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:18`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: guide step 3 of 5: Place cards with digits 0-9 on a table; a student picks 4 cards, forms a 4-digit number, and reads/writes it while another confirms. · max-sim J 0.06 · **human-edited**

> නම කියද්දී නොකියවුණත් ඒ තැනට බිංදුවක් ලියන්න ඕනේ, හරිද?

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:19`

**SHOW_BOARD** · pause: RHETORICAL · guide: Give groups a worksheet with a circle containing digits 1, 3, 6, 4. · max-sim J 0.20 · **human-edited**

> {address}, මේ රවුම ඇතුළේ තියෙන ඉලක්කම් ටික පේනවා නේද?

Board: `{"kind":"text","text":"1,  3,  6,  4"}`

### `authored:readWrite4Digit:20`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Give groups a worksheet with a circle containing digits 1, 3, 6, 4. · max-sim J 0.00 · **human-edited**

> මෙතැන තියෙන්නේ එක, තුන, හය, හතර නේද?

Source: `මෙතැන තියෙන්නේ {number:1}, {number:3}, {number:6}, {number:4} නේද?`

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:21`

**EXPLAIN** · pause: — · guide: Give groups a worksheet with a circle containing digits 1, 3, 6, 4. · max-sim J 0.09 · **human-edited**

> පිටින් කිසිම අලුත් ඉලක්කමක් නොගෙන, මේවා විතරක් පාවිච්චි කරමු.

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:22`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Give groups a worksheet with a circle containing digits 1, 3, 6, 4. · max-sim J 0.17 · **human-edited**

> මේ ඉලක්කම් වලින් ඔයා කැමති සංඛ්‍යාවක් හදලා මට කියන්න.

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:23`

**EXPLAIN** · pause: — · guide: Give groups a worksheet with a circle containing digits 1, 3, 6, 4. · max-sim J 0.00 · **human-edited**

> නියමයි! එක්දහස් තුන්සිය හැට හතර හරිම ලස්සන සංඛ්‍යාවක්.

Source: `නියමයි! {number:1364} හරිම ලස්සන සංඛ්‍යාවක්.`

Board: `{"kind":"text","text":"1364"}`

### `authored:readWrite4Digit:24`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Give groups a worksheet with a circle containing digits 1, 3, 6, 4. · max-sim J 0.13 / C 0.79

> අපි මේ විදියට තව සංඛ්‍යා හදන්න සූදානම් වෙමු, හරි නේද?

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:25`

**SHOW_BOARD** · pause: RHETORICAL · guide: Give groups a worksheet with a circle containing digits 1, 3, 6, 4. · max-sim J 0.10 · **human-edited**

> දැන් අපි අර රවුම ඇතුළේ තිබුණු එක, තුන, හය, හතර ආයෙත් ගමු නේද?

Source: `දැන් අපි අර රවුම ඇතුළේ තිබුණු {number:1}, {number:3}, {number:6}, {number:4} ආයෙත් ගමු නේද?`

Board: `{"kind":"text","text":"1, 3, 6, 4"}`

### `authored:readWrite4Digit:26`

**EXPLAIN** · pause: SOFT_CHECK · guide: Instruct students to form 5 four-digit numbers using the digits in the circle and write the number name of each. · max-sim J 0.11 · **human-edited**

> පිටින් කිසිම අලුත් ඉලක්කමක් මෙතනට ගන්න බැහැ. අපි මේ හතර දෙනාගෙන් විතරක් අලුත් සංඛ්‍යාවක් හදමු.

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:27`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Instruct students to form 5 four-digit numbers using the digits in the circle and write the number name of each. · max-sim J 0.15 · **human-edited**

> ඔයා කැමති පිළිවෙළකට මේ ඉලක්කම් තියලා මට සංඛ්‍යාවක් කියන්න.

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:28`

**EXPLAIN** · pause: RHETORICAL · guide: Instruct students to form 5 four-digit numbers using the digits in the circle and write the number name of each. · max-sim J 0.18 · **human-edited**

> ශෝක්! මේ ඉලක්කම් එකතු වුණාම අපි ඒක කියවන්නේ එක්දහස් තුන්සිය හැට හතර කියලා නේද?

Source: `ශෝක්! මේ ඉලක්කම් එකතු වුණාම අපි ඒක කියවන්නේ {number:1364} කියලා නේද?`

Board: `{"kind":"text","text":"1364"}`

### `authored:readWrite4Digit:29`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Instruct students to form 5 four-digit numbers using the digits in the circle and write the number name of each. · max-sim J 0.06 · **human-edited**

> දැන් ඔය හදපු එක ආයෙත් ගන්නේ නැතුව, තව සංඛ්‍යාවක් හදමුද?

Board: `{"kind":"none"}`

### `authored:readWrite4Digit:30`

**TRANSITION** · pause: — · guide: Instruct students to form 5 four-digit numbers using the digits in the circle and write the number name of each. · max-sim J 0.13 / C 0.85

> හරිම අපූරුයි, තවත් අලුත් සංඛ්‍යා පහක් හදන්න ලෑල්ලට යමු!

Board: `{"kind":"exercise","itemId":"7daf0141-073d-4714-b69e-fb17069e982c"}`

### `authored:readWrite4Digit:31`

**CHECK_MY_WORK** · pause: ASK · guide: peer-check (guide) → find Zara's mistake · expects **අටට බිංදුවක් දාලා නෑ** · max-sim J 0.19 / C 0.80

Planted error: අට ළඟට බිංදුවක් දාලා නෑ.

> ඔන්න {address}, මම අසූ හතර කියන සංඛ්‍යාව වෙන් කරලා ලිව්වා. ඒත් මගේ වැඩේ පොඩි වැරැද්දක් වුණා වගේ. මට උදව්වක් විදිහට ඒ වැරැද්ද හොයලා කියන්න පුළුවන්ද?

Source: `ඔන්න {address}, මම {number:84} කියන සංඛ්‍යාව වෙන් කරලා ලිව්වා. ඒත් මගේ වැඩේ පොඩි වැරැද්දක් වුණා වගේ. මට උදව්වක් විදිහට ඒ වැරැද්ද හොයලා කියන්න පුළුවන්ද?`

Board: `{"kind":"text","text":"84 = 8 + 4"}`

## placeValue4Digit

Analogy domain (what the teaching reasons through): **coins in a till**

Hook opens on: **school bag price**

Hook candidates (first is in use):

1. අලුත් ඉස්කෝලේ බෑග් එකක් ගන්න ගියාම ඒකේ මිල ලොකු ගාණක් නේද {address}?
2. ක්‍රිකට් තරගයක ලකුණු පුවරුව දිහා ඔයා බලාගෙන ඉඳලා තියෙනවා නේද {address}?
3. අම්මා කඩෙන් බඩු ගනිද්දී ලැබෙන බිල්පතේ මුදල කියවන්න උත්සාහ කරලා තියෙනවාද?
4. පාසල් පොත් සාප්පුවෙන් අලුත් පොත් ගන්න ගියාම ලොකු ගණන් පේනවා නේද {address}?

### `authored:placeValue4Digit:32`

**HOOK** · pause: RHETORICAL · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.05 · **human-edited**

> අලුත් ඉස්කෝලේ බෑග් එකක් ගන්න ගියාම ඒකේ මිල ලොකු ගාණක් නේද {address}?

Board: `{"kind":"title","title":"ස්ථානීය අගය"}`

### `authored:placeValue4Digit:33`

**EXPLAIN** · pause: — · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.25 · **human-edited**

> ඒ ගාණේ ඉලක්කම් හතරක් තියෙනවා. ඒ ඉලක්කම් තියෙන තැන දන්නවා නම් අපිට ඒක ලේසියෙන් කියවන්න පුළුවන්.

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:34`

**TRANSITION** · pause: — · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.10 / C 0.86

> අද අපි ගණක රාමුවකින් අලුත් සංඛ්‍යාවක් හදන්නයි ලෑස්ති වෙන්නේ.

Board: `{"kind":"abacus","digits":[0,0,0,0],"startEmpty":true}`

### `authored:placeValue4Digit:35`

**EXPLAIN** · pause: — · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.11 / C 0.79

> ගණක රාමුවේ දකුණු කෙළවරේම තියෙන කූර එකස්ථානය කියලයි අපි කියන්නේ.

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:36`

**EXPLAIN** · pause: — · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.11 / C 0.79

> වමේ පැත්තට යද්දී දහයස්ථානය, සියයස්ථානය වගේම දහසස්ථානය පිහිටනවා.

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:37`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.07 / C 0.73

> එතකොට කූරු හතරේ පිළිවෙළ ඔයාට මතක හිටියා නේද {address}?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:38`

**EXPLAIN** · pause: — · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.13 / C 0.76

> ඔන්න අපි පන්දහස් හාරසිය විසි එක කියන ලස්සන සංඛ්‍යාව මේ රාමුවට දාමු.

Source: `ඔන්න අපි {number:5421} කියන ලස්සන සංඛ්‍යාව මේ රාමුවට දාමු.`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:39`

**SHOW_BOARD** · pause: — · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.06 / C 0.80

> දහසස්ථානයේ කූරට අපි පබළු එක, දෙක, තුන, හතර, පහක් දානවා.

Board: `{"kind":"abacus_add","rod":0,"count":5}`

### `authored:placeValue4Digit:40`

**SHOW_BOARD** · pause: — · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.00

> ඊළඟ සියයස්ථානයට පබළු හතරක් දාමු.

Board: `{"kind":"abacus_add","rod":1,"count":4}`

### `authored:placeValue4Digit:41`

**SHOW_BOARD** · pause: — · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.14 / C 0.79

> දහයස්ථානයට පබළු දෙකකුත්, එකස්ථානයට එක පබළුවකුත් එකතු කරමු.

Board: `{"kind":"abacus","digits":[5,4,2,1],"animate":true}`

### `authored:placeValue4Digit:42`

**EXPLAIN** · pause: — · guide: guide step 1 of 7: Set up an abacus visible to all students; a student comes forward and represents a number on the abacus. · max-sim J 0.11 / C 0.77

> බලන්නකෝ, හැම කූරකම තියෙන පබළු එකතු වෙලා අපේ මුළු සංඛ්‍යාව හැදුණා.

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:43`

**TRANSITION** · pause: — · guide: guide step 2 of 7: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · max-sim J 0.12 / C 0.76

> දකුණු පැත්තේ මුල්ම කූර දිහා බලන්නකෝ {address}.

Board: `{"kind":"abacus","digits":[5,4,2,1]}`

### `authored:placeValue4Digit:44`

**ASK** · pause: ASK · guide: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · expects **එක** · max-sim J 0.00

> එකස්ථානයේ පබළු කීයක් තියෙනවද?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:45`

**EXPLAIN** · pause: — · guide: guide step 2 of 7: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · max-sim J 0.00

> හරිම දක්ෂයි. එතන පබළු එකක් නිසා අගය එකයි.

Source: `හරිම දක්ෂයි. එතන පබළු {number:1} ක් නිසා අගය {number:1} යි.`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:46`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · expects **දෙක** · max-sim J 0.19 / C 0.79 · **human-edited**

> ඊළඟට තියෙන දහයස්ථානයේ පබළු කීයක් පෙනෙනවද?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:47`

**EXPLAIN** · pause: — · guide: guide step 2 of 7: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · max-sim J 0.00 · **human-edited**

> දහයස්ථානයේ පබළු දෙකක් නිසා අගය විස්සයි.

Source: `දහයස්ථානයේ පබළු {number:2}ක් නිසා අගය {number:20}යි.`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:48`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · expects **හතර** · max-sim J 0.00 · **human-edited**

> සියයස්ථානයේ තියෙන පබළු ගණන කියන්න පුළුවන්ද?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:49`

**EXPLAIN** · pause: — · guide: guide step 2 of 7: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · max-sim J 0.00 · **human-edited**

> සියයස්ථානයේ පබළු හතරක් නිසා අගය හාරසියයයි.

Source: `සියයස්ථානයේ පබළු {number:4}ක් නිසා අගය {number:400}යි.`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:50`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · expects **පහ** · max-sim J 0.00 · **human-edited**

> දහසස්ථානයේ පබළු කීයක් තියෙනවද {address}?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:51`

**EXPLAIN** · pause: — · guide: guide step 2 of 7: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · max-sim J 0.00

> දහසස්ථානයේ පබළු පහක් නිසා දැක්වෙන අගය පන්දහසයි.

Source: `දහසස්ථානයේ පබළු {number:5} ක් නිසා දැක්වෙන අගය {number:5000} යි.`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:52`

**SHOW_BOARD** · pause: — · guide: guide step 2 of 7: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · max-sim J 0.17 / C 0.85

> මේ විදිහට හැම ඉලක්කමකටම තමන්ගේම ස්ථානීය අගයක් තියෙනවා.

Board: `{"kind":"exercise","itemId":"7b58e436-334f-452c-bc2a-81f234d03268"}`

### `authored:placeValue4Digit:53`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: guide step 2 of 7: Ask the class about the digit shown by the beads at each place, the place value at each place, and the value represented by the digit at each place. · max-sim J 0.23 / C 0.87

> ස්ථානය අනුව අගය වෙනස් වෙන හැටි පැහැදිලියි නේද {address}?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:54`

**TRANSITION** · pause: — · guide: guide step 3 of 7: Have students say and write the number name of the number on the abacus. · max-sim J 0.13 · **human-edited**

> දැන් අපි ගණක රාමුවේ තියෙන සංඛ්‍යාව වචනයෙන් කියවන්න පුරුදු වෙමු.

Board: `{"kind":"abacus","digits":[5,4,2,1]}`

### `authored:placeValue4Digit:55`

**EXPLAIN** · pause: RHETORICAL · guide: guide step 3 of 7: Have students say and write the number name of the number on the abacus. · max-sim J 0.03

> දහසස්ථානය පෙන්වන කූරේ තියෙන්නේ පබළු පහයි නේද, {address}?

Source: `දහසස්ථානය පෙන්වන කූරේ තියෙන්නේ පබළු {number:5} යි නේද, {address}?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:56`

**EXPLAIN** · pause: — · guide: guide step 3 of 7: Have students say and write the number name of the number on the abacus. · max-sim J 0.13 · **human-edited**

> ඒ පබළු වලින් පෙන්වන්නේ පන්දහසක අගයක්.

Source: `ඒ පබළු වලින් පෙන්වන්නේ {number:5000}ක අගයක්.`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:57`

**EXPLAIN** · pause: — · guide: guide step 3 of 7: Have students say and write the number name of the number on the abacus. · max-sim J 0.10 · **human-edited**

> ඊළඟට සියයස්ථානයෙන් හාරසියයකුත්, දහයස්ථානයෙන් විස්සකුත්, එකස්ථානයෙන් එකකුත් ලැබෙනවා.

Source: `ඊළඟට සියයස්ථානයෙන් {number:400}කුත්, දහයස්ථානයෙන් {number:20}කුත්, එකස්ථානයෙන් {number:1}කුත් ලැබෙනවා.`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:58`

**ASK** · pause: ASK · guide: guide step 3 of 7: Have students say and write the number name of the number on the abacus. · expects **පන්දහස් හාරසිය විසි එක** · max-sim J 0.23 · **human-edited**

> එහෙනම් {address}, මේ සංඛ්‍යාව කියවමු බලන්න.

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:59`

**EXPLAIN** · pause: — · guide: guide step 3 of 7: Have students say and write the number name of the number on the abacus. · max-sim J 0.10 / C 0.75

> හරිම අපූරුයි! ඔයා කිව්වේ හරියටම හරි, ඒක පන්දහස් හාරසිය විසි එක.

Source: `හරිම අපූරුයි! ඔයා කිව්වේ හරියටම හරි, ඒක {number:5421}.`

Board: `{"kind":"text","text":"5 421 - පන්දහස් හාරසිය විසි එක"}`

### `authored:placeValue4Digit:60`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: guide step 3 of 7: Have students say and write the number name of the number on the abacus. · max-sim J 0.08 / C 0.83

> අපි මේ සංඛ්‍යාව අකුරෙන් ලියන්නේ පන්දහස් හාරසිය විසි එක කියලයි.

Source: `අපි මේ සංඛ්‍යාව අකුරෙන් ලියන්නේ {number:5421} කියලයි.`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:61`

**TRANSITION** · pause: — · guide: guide step 3 of 7: Have students say and write the number name of the number on the abacus. · max-sim J 0.17 · **human-edited**

> දැන් අපි තවත් අලුත් සංඛ්‍යාවක් ගණක රාමුවේ බලමුකෝ.

Board: `{"kind":"abacus","digits":[6,8,3,1]}`

### `authored:placeValue4Digit:62`

**ASK** · pause: ASK · guide: guide step 3 of 7: Have students say and write the number name of the number on the abacus. · expects **හයදහස් අටසිය තිස් එක** · max-sim J 0.25

> මෙතන තියෙන සංඛ්‍යාවත් වචනයෙන් කියන්න පුළුවන්ද {address}?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:63`

**EXPLAIN** · pause: — · guide: guide step 3 of 7: Have students say and write the number name of the number on the abacus. · max-sim J 0.16 / C 0.82

> නියමයි, ඒක හයදහස් අටසිය තිස් එක තමයි! ඔයා දැන් සංඛ්‍යා නාම ලියන්නත් දන්නවා.

Source: `නියමයි, ඒක {number:6831} තමයි! ඔයා දැන් සංඛ්‍යා නාම ලියන්නත් දන්නවා.`

Board: `{"kind":"text","text":"6 831 - හයදහස් අටසිය තිස් එක"}`

### `authored:placeValue4Digit:64`

**TRANSITION** · pause: — · guide: Show the number written in expanded form. · max-sim J 0.22 · **human-edited**

> දැන් අපි මේ සංඛ්‍යාව විහිදුවා ලියමු, {address}.

Board: `{"kind":"abacus","digits":[5,4,2,1]}`

### `authored:placeValue4Digit:65`

**EXPLAIN** · pause: RHETORICAL · guide: Show the number written in expanded form. · max-sim J 0.00

> බලන්න, දහසස්ථානයේ පබළු පහක් තියෙනවා නේද?

Source: `බලන්න, දහසස්ථානයේ පබළු {number:5}ක් තියෙනවා නේද?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:66`

**ASK** · pause: ASK · guide: Show the number written in expanded form. · expects **පන්දහස** · max-sim J 0.14 · **human-edited**

> එතකොට ඒ පහෙන් පෙන්වන අගය කීයද {address}?

Source: `එතකොට ඒ {number:5}ෙන් පෙන්වන අගය කීයද {address}?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:67`

**EXPLAIN** · pause: — · guide: Show the number written in expanded form. · max-sim J 0.00

> හරිම දක්ෂයි! ඒක පන්දහසයි.

Source: `හරිම දක්ෂයි! ඒක {number:5000}යි.`

Board: `{"kind":"text","text":"5 421 = 5000 +"}`

### `authored:placeValue4Digit:68`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Show the number written in expanded form. · expects **හාරසියය** · max-sim J 0.00 · **human-edited**

> සියයස්ථානයේ තියෙන්නේ හතරක්. එහි අගය කීයද?

Source: `සියයස්ථානයේ තියෙන්නේ {number:4}ක්. එහි අගය කීයද?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:69`

**EXPLAIN** · pause: — · guide: Show the number written in expanded form. · max-sim J 0.00

> හරි, ඒක හාරසියයයි. අපි ඒකත් එකතු කරමු.

Source: `හරි, ඒක {number:400}යි. අපි ඒකත් එකතු කරමු.`

Board: `{"kind":"text","text":"5 421 = 5000 + 400 +"}`

### `authored:placeValue4Digit:70`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Show the number written in expanded form. · expects **විස්ස** · max-sim J 0.17 · **human-edited**

> ඊළඟට දහයස්ථානයේ තියෙන දෙකෙන් ලැබෙන අගය කීයද?

Source: `ඊළඟට දහයස්ථානයේ තියෙන {number:2}ෙන් ලැබෙන අගය කීයද?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:71`

**EXPLAIN** · pause: — · guide: Show the number written in expanded form. · max-sim J 0.00 · **human-edited**

> ඔව්, දහයස්ථානයේ දෙකේ අගය විස්සයි.

Source: `ඔව්, දහයස්ථානයේ {number:2}ේ අගය {number:20}යි.`

Board: `{"kind":"text","text":"5 421 = 5000 + 400 + 20 +"}`

### `authored:placeValue4Digit:72`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Show the number written in expanded form. · expects **එක** · max-sim J 0.11 · **human-edited**

> අන්තිමට එකස්ථානයේ තියෙන එකෙන් ලැබෙන්නේ කීයද?

Source: `අන්තිමට එකස්ථානයේ තියෙන {number:1}ෙන් ලැබෙන්නේ කීයද?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:73`

**EXPLAIN** · pause: — · guide: Show the number written in expanded form. · max-sim J 0.00 · **human-edited**

> විශිෂ්ටයි! එකස්ථානයේ එකෙන් ලැබෙන්නේ එකමයි.

Source: `විශිෂ්ටයි! එකස්ථානයේ {number:1}ෙන් ලැබෙන්නේ {number:1}මයි.`

Board: `{"kind":"text","text":"5 421 = 5000 + 400 + 20 + 1"}`

### `authored:placeValue4Digit:74`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: Show the number written in expanded form. · max-sim J 0.14 · **human-edited**

> මේ විදියට එකතු කිරීමක් ලෙස ලිවීමට තමයි විහිදුවා ලියනවා කියන්නේ, පැහැදිලියි නේද {address}?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:75`

**TRANSITION** · pause: — · guide: guide step 5 of 7: Repeat by representing several different numbers on the abacus and expanding each. · max-sim J 0.15 · **human-edited**

> අපි දැන් තවත් සංඛ්‍යාවක් ගණක රාමුවෙන් පෙන්වලා බලමු {address}.

Board: `{"kind":"abacus","digits":[7,0,6,2]}`

### `authored:placeValue4Digit:76`

**EXPLAIN** · pause: SOFT_CHECK · guide: guide step 5 of 7: Repeat by representing several different numbers on the abacus and expanding each. · max-sim J 0.13

> මුලින්ම දහසස්ථානය දිහා බලන්න, එතන පබළු හතක් තියෙනවා නේද?

Source: `මුලින්ම දහසස්ථානය දිහා බලන්න, එතන පබළු {number:7} ක් තියෙනවා නේද?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:77`

**EXPLAIN** · pause: — · guide: guide step 5 of 7: Repeat by representing several different numbers on the abacus and expanding each. · max-sim J 0.09 · **human-edited**

> එක් පබළුවකින් දහසක් පෙන්වනවා නම්, පබළු හතක අගය හත්දහසයි.

Source: `එක් පබළුවකින් {number:1000}ක් පෙන්වනවා නම්, පබළු {number:7}ක අගය {number:7000}යි.`

Board: `{"kind":"text","text":"7000"}`

### `authored:placeValue4Digit:78`

**EXPLAIN** · pause: — · guide: guide step 5 of 7: Repeat by representing several different numbers on the abacus and expanding each. · max-sim J 0.17 / C 0.82

> ඊළඟට තියෙන සියයස්ථානයේ කූර දිහා හොඳින් බලන්නකෝ.

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:79`

**ASK** · pause: ASK · guide: guide step 5 of 7: Repeat by representing several different numbers on the abacus and expanding each. · expects **බිංදුව** · max-sim J 0.19 / C 0.76

> එතන පබළු කීයක් දකින්න තියෙනවද?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:80`

**EXPLAIN** · pause: — · guide: guide step 5 of 7: Repeat by representing several different numbers on the abacus and expanding each. · max-sim J 0.13 · **human-edited**

> හරිම පැහැදිලියි, කූරේ කිසිම පබළුවක් නෑ. ඒ නිසා එතන අගය බිංදුවයි.

Board: `{"kind":"text","text":"7000 + 0"}`

### `authored:placeValue4Digit:81`

**EXPLAIN** · pause: — · guide: guide step 5 of 7: Repeat by representing several different numbers on the abacus and expanding each. · max-sim J 0.13 · **human-edited**

> දහයස්ථානයේ කූර දිහා බැලුවොත් අපට පබළු හයක් පේනවා. එකකින් දහයක් පෙන්වන නිසා එතනින් හැටක් හැදෙනවා.

Source: `දහයස්ථානයේ කූර දිහා බැලුවොත් අපට පබළු {number:6}ක් පේනවා. එකකින් {number:10}ක් පෙන්වන නිසා එතනින් {number:60}ක් හැදෙනවා.`

Board: `{"kind":"text","text":"7000 + 0 + 60"}`

### `authored:placeValue4Digit:82`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: guide step 5 of 7: Repeat by representing several different numbers on the abacus and expanding each. · expects **දෙක** · max-sim J 0.23 · **human-edited**

> අවසාන කූරේ, ඒ කියන්නේ එකස්ථානයේ තියෙන්නේ පබළු දෙකයි. එකස්ථානයේ ඒ පබළු දෙකෙන් හැදෙන අගය කීයද {address}?

Source: `අවසාන කූරේ, ඒ කියන්නේ එකස්ථානයේ තියෙන්නේ පබළු {number:2}යි. එකස්ථානයේ ඒ පබළු {number:2}ෙන් හැදෙන අගය කීයද {address}?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:83`

**EXPLAIN** · pause: — · guide: guide step 5 of 7: Repeat by representing several different numbers on the abacus and expanding each. · max-sim J 0.05

> හරියටම හරි, ඒක දෙකම තමයි.

Source: `හරියටම හරි, ඒක {number:2} ම තමයි.`

Board: `{"kind":"text","text":"7062 = 7000 + 0 + 60 + 2"}`

### `authored:placeValue4Digit:84`

**EXPLAIN** · pause: SOFT_CHECK · guide: guide step 5 of 7: Repeat by representing several different numbers on the abacus and expanding each. · max-sim J 0.20

> එහෙනම් මේ මුළු සංඛ්‍යාව හත්දහස් හැට දෙකයි, අපි එය දිගහැරලා ලිව්වා නේද?

Source: `එහෙනම් මේ මුළු සංඛ්‍යාව {number:7062} යි, අපි එය දිගහැරලා ලිව්වා නේද?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:85`

**TRANSITION** · pause: — · guide: Give groups a card with four digits; have them form several numbers using the digits and write each in expanded form. · max-sim J 0.12 · **human-edited**

> ඔන්න {address}, මම ඔයාට ඉලක්කම් කාඩ්පත් හතරක් දෙනවා.

Source: `ඔන්න {address}, මම ඔයාට ඉලක්කම් කාඩ්පත් {number:4}ක් දෙනවා.`

Board: `{"kind":"text","text":"1, 3, 8, 6"}`

### `authored:placeValue4Digit:86`

**EXPLAIN** · pause: RHETORICAL · guide: guide step 6 of 7: Give groups a card with four digits; have them form several numbers using the digits and write each in expanded form. · max-sim J 0.00 · **human-edited**

> මේ කාඩ්පත්වල තියෙන්නේ එක, තුන, අට, හය නේද?

Source: `මේ කාඩ්පත්වල තියෙන්නේ {number:1}, {number:3}, {number:8}, {number:6} නේද?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:87`

**EXPLAIN** · pause: — · guide: guide step 6 of 7: Give groups a card with four digits; have them form several numbers using the digits and write each in expanded form. · max-sim J 0.27 / C 0.81

> අපි මුලින්ම හයදහස් අටසිය තිස් එක කියන සංඛ්‍යාව ලියලා බලමු.

Source: `අපි මුලින්ම {number:6831} කියන සංඛ්‍යාව ලියලා බලමු.`

Board: `{"kind":"text","text":"6 831"}`

### `authored:placeValue4Digit:88`

**ASK** · pause: ASK · guide: guide step 6 of 7: Give groups a card with four digits; have them form several numbers using the digits and write each in expanded form. · expects **6000** · max-sim J 0.12 · **human-edited**

> මේකේ දහසස්ථානයේ තියෙන හයෙන් පෙන්වන අගය කීයද?

Source: `මේකේ දහසස්ථානයේ තියෙන {number:6}ෙන් පෙන්වන අගය කීයද?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:89`

**EXPLAIN** · pause: — · guide: guide step 6 of 7: Give groups a card with four digits; have them form several numbers using the digits and write each in expanded form. · max-sim J 0.00 · **human-edited**

> හරියටම හරි, ඒක හයදහසයි.

Source: `හරියටම හරි, ඒක {number:6000}යි.`

Board: `{"kind":"text","text":"6 831 = 6000 + 800 + 30 + 1"}`

### `authored:placeValue4Digit:90`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: guide step 6 of 7: Give groups a card with four digits; have them form several numbers using the digits and write each in expanded form. · max-sim J 0.12 · **human-edited**

> එතකොට මේක දිගහැරලා ලිව්වාම එන්නේ මේ විදිහට නේද?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:91`

**EXPLAIN** · pause: — · guide: guide step 6 of 7: Give groups a card with four digits; have them form several numbers using the digits and write each in expanded form. · max-sim J 0.08 · **human-edited**

> තව ක්‍රමයකට හැදුවොත් අපිට අටදහස් හයසිය දහතුන ලැබෙනවා.

Source: `තව ක්‍රමයකට හැදුවොත් අපිට {number:8613} ලැබෙනවා.`

Board: `{"kind":"text","text":"8 613"}`

### `authored:placeValue4Digit:92`

**ASK** · pause: ASK · guide: guide step 6 of 7: Give groups a card with four digits; have them form several numbers using the digits and write each in expanded form. · expects **8000** · max-sim J 0.10 / C 0.72

> එහෙනම් අටදහස් හයසිය දහතුන දිගහරිද්දී මුලින්ම ලියවෙන්නේ මොන අගයද?

Source: `එහෙනම් {number:8613} දිගහරිද්දී මුලින්ම ලියවෙන්නේ මොන අගයද?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:93`

**EXPLAIN** · pause: — · guide: guide step 6 of 7: Give groups a card with four digits; have them form several numbers using the digits and write each in expanded form. · max-sim J 0.00 · **human-edited**

> හරියටම හරි, ඒක අටදහසයි, හයසියයයි, දහයයි, තුනයි.

Source: `හරියටම හරි, ඒක {number:8000}යි, {number:600}යි, {number:10}යි, {number:3}යි.`

Board: `{"kind":"text","text":"8 613 = 8000 + 600 + 10 + 3"}`

### `authored:placeValue4Digit:94`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: guide step 6 of 7: Give groups a card with four digits; have them form several numbers using the digits and write each in expanded form. · max-sim J 0.09 / C 0.87

> බිංදුවක් ආවොත් එතැනින් කිසිම අගයක් එකතු වෙන්නේ නෑ නේද {address}?

Board: `{"kind":"text","text":"7 062 = 7000 + 0 + 60 + 2"}`

### `authored:placeValue4Digit:95`

**TRANSITION** · pause: — · guide: guide step 7 of 7: Give students a worksheet of further expansion exercises to do alone. · max-sim J 0.14 / C 0.74

> දැන් {address} තනියම පුහුණු වෙන්න වෙලාව හරි.

Board: `{"kind":"title","title":"තනිව විසඳමු"}`

### `authored:placeValue4Digit:96`

**SHOW_BOARD** · pause: — · guide: guide step 7 of 7: Give students a worksheet of further expansion exercises to do alone. · max-sim J 0.09 / C 0.82

> මෙන්න ඔයාට විශේෂ අභ්‍යාස පත්‍රිකාවක් තිරයේ පෙනෙනවා.

Board: `{"kind":"text","text":"5 421 = 5 000 + 400 + 20 + 1"}`

### `authored:placeValue4Digit:97`

**EXPLAIN** · pause: — · guide: guide step 7 of 7: Give students a worksheet of further expansion exercises to do alone. · max-sim J 0.10 / C 0.77

> පළමුවැනි ගාණ විදිහට පන්දහස් හාරසිය විසි එක සංඛ්‍යාව දිගහැරලා ලියමු.

Source: `පළමුවැනි ගාණ විදිහට {number:5421} සංඛ්‍යාව දිගහැරලා ලියමු.`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:98`

**ASK** · pause: ASK · guide: guide step 7 of 7: Give students a worksheet of further expansion exercises to do alone. · expects **5** · max-sim J 0.00

> මේකෙ දහසස්ථානයේ තියෙන ඉලක්කම මොකක්ද {address}?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:99`

**EXPLAIN** · pause: — · guide: guide step 7 of 7: Give students a worksheet of further expansion exercises to do alone. · max-sim J 0.07 / C 0.78

> හරිම දක්ෂයි, දහසස්ථානයේ ඉන්නේ පහ නේද.

Source: `හරිම දක්ෂයි, දහසස්ථානයේ ඉන්නේ {number:5} නේද.`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:100`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: guide step 7 of 7: Give students a worksheet of further expansion exercises to do alone. · expects **5000** · max-sim J 0.10 / C 0.87 · **human-edited**

> එහෙනම් ඒ පහ නිසා ලැබෙන අගය කීයද?

Source: `එහෙනම් ඒ {number:5} නිසා ලැබෙන අගය කීයද?`

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:101`

**EXPLAIN** · pause: — · guide: guide step 7 of 7: Give students a worksheet of further expansion exercises to do alone. · max-sim J 0.00 · **human-edited**

> හරියටම හරි, ඒක පන්දහසයි.

Source: `හරියටම හරි, ඒක {number:5000}යි.`

Board: `{"kind":"text","text":"5 421 = 5000 + ..."}`

### `authored:placeValue4Digit:102`

**SHOW_BOARD** · pause: — · guide: guide step 7 of 7: Give students a worksheet of further expansion exercises to do alone. · max-sim J 0.12 / C 0.79

> දැන් මේ වගුවේ තියෙන අනිත් කොටස් ඔයාට පුරවන්න පුළුවන්.

Board: `{"kind":"exercise","itemId":"7b58e436-334f-452c-bc2a-81f234d03268"}`

### `authored:placeValue4Digit:103`

**SOFT_CHECK** · pause: SOFT_CHECK · guide: guide step 7 of 7: Give students a worksheet of further expansion exercises to do alone. · max-sim J 0.19 / C 0.87

> එක් එක් ස්ථානයේ අගයන් දැන් හොඳටම මතකයි නේද?

Board: `{"kind":"none"}`

### `authored:placeValue4Digit:104`

**EXPLAIN** · pause: — · guide: guide step 7 of 7: Give students a worksheet of further expansion exercises to do alone. · max-sim J 0.10 / C 0.73

> ඔයා මේ හැම අභ්‍යාසයක්ම හරිම ලස්සනට තනියම කළා, විශිෂ්ටයි!

Board: `{"kind":"none"}`

