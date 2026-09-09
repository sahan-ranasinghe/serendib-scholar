# Storyboard — Maths 5, Lesson 1, Session 1

126 beats. Vocabulary: `docs/design/board-vocabulary.md`. Events are written `primitive.event {args}`; an event with no sentence index prefix lands on the sentence shown above it.

Rods: 0 = දා (දහසස්ථානය), 1 = සි, 2 = ද, 3 = එ.

## lessonOpening

### `opening:0` · LESSON_GOALS · pause RHETORICAL

Board at line start: nothing

1. > ආයුබෝවන් පුතේ!
   - `titleCard.show` `{"title":"සංඛ්‍යා - 1"}`
2. > අද අපි පහ ශ්‍රේණියේ ගණිත පාඩම් පටන් ගන්නවා නේද?
   - _(no event)_

_Sees:_ Title card "සංඛ්‍යා - 1"; title "සංඛ්‍යා - 1".

### `opening:1` · LESSON_GOALS

Board at line start: title card "සංඛ්‍යා - 1"

1. > දැන් ඔයා පහ ශ්‍රේණියේ නේද?
   - _(no event)_
2. > ඒක හරිම වැදගත්, ලස්සන පන්තියක්.
   - `pointer.move_to` `{"target":{"text":"සංඛ්‍යා - 1"}}`

_Sees:_ Title card "සංඛ්‍යා - 1".

### `opening:2` · LESSON_GOALS

Board at line start: title card "සංඛ්‍යා - 1"

1. > බය වෙන්න එපා පුතේ.
   - _(no event)_
2. > ඔයාට පුළුවන්, මම ඔයා එක්කම ඉන්නවා.
   - _(no event)_

_Sees:_ Title card "සංඛ්‍යා - 1".

### `opening:3` · LESSON_GOALS

Board at line start: title card "සංඛ්‍යා - 1"

1. > අපේ පළමු පාඩම තමයි සංඛ්‍යා.
   - `titleCard.show` `{"title":"සංඛ්‍යා - 1"}`
2. > හරි සරලයි, ඒත් හරිම වැදගත්.
   - _(no event)_

_Sees:_ Title card "සංඛ්‍යා - 1"; title "සංඛ්‍යා - 1".

### `opening:4` · LESSON_GOALS

Board at line start: title card "සංඛ්‍යා - 1"

1. > මේ පාඩමෙන් අපි සියක් දහස දක්වා ලොකු සංඛ්‍යා කියවන්න, ලියන්න ඉගෙන ගන්නවා.
   - `textCard.show` `{"text":"100 000"}`
   - `pointer.move_to` `{"target":{"number":100000}}`

_Sees:_ Card "100 000"; card "100 000".

### `opening:5` · LESSON_GOALS

Board at line start: card "100 000"

1. > සංඛ්‍යාවක ඉලක්කම් තියෙන තැන අනුව ඒවායේ අගය හඳුනාගන්නත් අපි ඉගෙන ගන්නවා.
   - `textCard.show` `{"text":"ලොකු සංඛ්‍යා"}`

_Sees:_ Card "ලොකු සංඛ්‍යා"; card "ලොකු සංඛ්‍යා".

### `opening:6` · LESSON_GOALS · pause SOFT_CHECK

Board at line start: card "ලොකු සංඛ්‍යා"

1. > ඔයා ලෑස්තිද පුතේ?
   - _(no event)_
2. > එහෙනම් අපි පටන් ගමු!
   - _(no event)_

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ Card "ලොකු සංඛ්‍යා" — the mic opens briefly.

## readWrite4Digit

### `readWrite4Digit:0` · HOOK · pause SOFT_CHECK

Board at line start: card "ලොකු සංඛ්‍යා"

1. > ක්‍රිකට් මැච් එකක් බලද්දී ලකුණු පුවරුවේ තියෙන ලකුණු ඔයා කියවලා තියෙනවා නේද පුතේ?
   - `titleCard.show` `{"title":"සංඛ්‍යා කියවමු"}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ Title card "සංඛ්‍යා කියවමු"; title "සංඛ්‍යා කියවමු" — the mic opens briefly.

### `readWrite4Digit:1` · EXPLAIN · pause RHETORICAL

Board at line start: title card "සංඛ්‍යා කියවමු"

1. > කලින් පාඩම්වලදී අපි සංඛ්‍යා කියවන්න ඉගෙන ගත්ත දේවල් ඔයාට මතකයි නේද?
   - `numberCards.show` `{"values":[84,101,528,997]}`

_Sees:_ Number cards 84 · 101 · 528 · 997; cards 84 · 101 · 528 · 997 deal in.

### `readWrite4Digit:2` · ASK · pause ASK

Board at line start: number cards 84 · 101 · 528 · 997

1. > මෙන්න මේ පුවරුවේ තියෙන මුල්ම සංඛ්‍යාව මොකක්ද කියලා මට කියන්න බලන්න.
   - `numberCards.highlight_ring` `{"value":84}`

Child: **answer** — voice · expects **අසූ හතර**

_Sees:_ Number cards 84 · 101 · 528 · 997 (ring on 84); a ring around 84 — they answer via voice.

### `readWrite4Digit:3` · EXPLAIN

Board at line start: number cards 84 · 101 · 528 · 997 (ring on 84)

1. > පළමු සංඛ්‍යාව අසූ හතරයි.
   - `numberCards.highlight_ring` `{"value":84}`

_Sees:_ Number cards 84 · 101 · 528 · 997 (ring on 84); a ring around 84.

### `readWrite4Digit:3a` · ASK · pause ASK

Board at line start: number cards 84 · 101 · 528 · 997 (ring on 84)

1. > ඊළඟ සංඛ්‍යාවේ නම කියන්න බලන්න.
   - `numberCards.highlight_ring` `{"value":101}`

Child: **answer** — voice · expects **එකසිය එක**

_Sees:_ Number cards 84 · 101 · 528 · 997 (ring on 101); a ring around 101 — they answer via voice.

### `readWrite4Digit:3b` · EXPLAIN

Board at line start: number cards 84 · 101 · 528 · 997 (ring on 101)

1. > සංඛ්‍යාවක් වචනයෙන් කියන එකට කියන්නේ සංඛ්‍යා නාමය කියලා.
   - `chalkText.write` `{"text":"සංඛ්‍යා නාමය"}`

_Sees:_ Number cards 84 · 101 · 528 · 997 (ring on 101); "සංඛ්‍යා නාමය" is written.

### `readWrite4Digit:4` · EXPLAIN

Board at line start: number cards 84 · 101 · 528 · 997 (ring on 101)

1. > එහි දසස්ථානයේ බිංදුව තියෙන නිසා ඒ කොටස කියවෙන්නේ නැහැ.
   - `pointer.move_to` `{"target":{"card":101,"place":"ද"}}`

_Sees:_ Number cards 84 · 101 · 528 · 997 (ring on 101).

### `readWrite4Digit:5` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: number cards 84 · 101 · 528 · 997 (ring on 101)

1. > එහෙනම් පුතේ, පුවරුවේ තියෙන අන්තිම සංඛ්‍යාවත් මට කියවලා පෙන්නන්න පුළුවන්ද?
   - `numberCards.highlight_ring` `{"value":997}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ Number cards 84 · 101 · 528 · 997 (ring on 997); a ring around 997 — the mic opens briefly.

### `readWrite4Digit:5a` · EXPLAIN

Board at line start: number cards 84 · 101 · 528 · 997 (ring on 997)

1. > අන්තිම එක නවසිය අනූ හතයි.
   - `numberCards.highlight_ring` `{"value":997}`

_Sees:_ Number cards 84 · 101 · 528 · 997 (ring on 997); a ring around 997.

### `readWrite4Digit:6` · EXPLAIN · pause RHETORICAL

Board at line start: number cards 84 · 101 · 528 · 997 (ring on 997)

1. > ඔන්න පුතේ, නවයට එකක් එකතු කළාම දහය හැදෙනවා නේද?
   - `chalkText.write` `{"text":"9 + 1 = 10"}`
   - `pointer.move_to` `{"target":{"number":9}}`

_Sees:_ Chalk "9 + 1 = 10"; "9 + 1 = 10" is written.

### `readWrite4Digit:7` · EXPLAIN

Board at line start: chalk "9 + 1 = 10"

1. > ඒ වගේම අනූ නවයට එකක් එකතු කළාම සියය හැදෙනවා.
   - `chalkText.write` `{"text":"99 + 1 = 100"}`
   - `pointer.move_to` `{"target":{"number":99}}`

_Sees:_ Chalk "99 + 1 = 100"; "99 + 1 = 100" is written.

### `readWrite4Digit:8` · ASK · pause ASK

Board at line start: chalk "99 + 1 = 100"

1. > එහෙනම් නවසිය අනූ නවයට එකක් එකතු කළාම කීයද එන්නේ?
   - `chalkText.write` `{"text":"999 + 1 = ?"}`
   - `pointer.move_to` `{"target":{"number":999}}`

Child: **answer** — number pad or voice · expects **1000**

_Sees:_ Chalk "999 + 1 = ?"; "999 + 1 = ?" is written — they answer via number pad or voice.

### `readWrite4Digit:9` · EXPLAIN

Board at line start: chalk "999 + 1 = ?"

1. > නවසිය අනූ නවයට එකක් එකතු වුණාම දහස හැදෙනවා.
   - `chalkText.write` `{"text":"999 + 1 = 1000"}`
   - `pointer.move_to` `{"target":{"number":999}}`

_Sees:_ Chalk "999 + 1 = 1000"; "999 + 1 = 1000" is written.

### `readWrite4Digit:10` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: chalk "999 + 1 = 1000"

1. > මෙතන ඉලක්කම් හතරක් තියෙනවා පේනවා නේද, පුතේ?
   - `textCard.show` `{"text":"1000"}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ Card "1000"; card "1000" — the mic opens briefly.

### `readWrite4Digit:11` · TRANSITION

Board at line start: card "1000"

1. > ඊළඟට අපි කාඩ්පත් පාවිච්චි කරලා අලුත් සංඛ්‍යා හදමු.
   - _(no event)_

_Sees:_ Card "1000".

### `readWrite4Digit:12` · TRANSITION

Board at line start: card "1000"

1. > දැන් අපි කාඩ්පත් එක්ක සෙල්ලමක් කරමු පුතේ.
   - `numberCards.show` `{"values":[0,1,2,3,4,5,6,7,8,9]}`

_Sees:_ Number cards 0 · 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9; cards 0 · 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 deal in.

### `readWrite4Digit:13` · EXPLAIN

Board at line start: number cards 0 · 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9

1. > මෙතනින් අපි වෙනස් කාඩ්පත් හතරක් ගමු.
   - `numberCards.show` `{"values":[3,0,5,8]}`

_Sees:_ Number cards 3 · 0 · 5 · 8; cards 3 · 0 · 5 · 8 deal in.

### `readWrite4Digit:14` · EXPLAIN

Board at line start: number cards 3 · 0 · 5 · 8

1. > ඒ ඉලක්කම් එක ළඟින් තියලා අපි සංඛ්‍යාවක් හදමු.
   - `textCard.show` `{"text":"3058"}`

_Sees:_ Card "3058"; card "3058".

### `readWrite4Digit:15` · ASK · pause ASK

Board at line start: card "3058"

1. > ඔයාට පුළුවන්ද මේ හැදුණු සංඛ්‍යාව කියවලා මට කියන්න?
   - `pointer.move_to` `{"target":{"text":"3058"}}`

Child: **answer** — voice · expects **තුන්දහස් පනස් අට**

_Sees:_ Card "3058" — they answer via voice.

### `readWrite4Digit:16` · EXPLAIN

Board at line start: card "3058"

1. > ඒ සංඛ්‍යාව තුන්දහස් පනස් අටයි.
   - `chalkText.write` `{"text":"3058 - තුන්දහස් පනස් අට","append":"- තුන්දහස් පනස් අට"}`
   - `pointer.move_to` `{"target":{"number":3058}}`

_Sees:_ Chalk "3058 - තුන්දහස් පනස් අට"; "- තුන්දහස් පනස් අට" is written on, making "3058 - තුන්දහස් පනස් අට".

### `readWrite4Digit:17` · EXPLAIN · pause RHETORICAL

Board at line start: chalk "3058 - තුන්දහස් පනස් අට"

1. > මෙතන සියයේ තැනට කිසිම අගයක් කියවෙන්නේ නැහැ, නේද?
   - `pointer.move_to` `{"target":{"text":"3058 - තුන්දහස් පනස් අට","place":"සි"}}`

_Sees:_ Chalk "3058 - තුන්දහස් පනස් අට".

### `readWrite4Digit:18` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: chalk "3058 - තුන්දහස් පනස් අට"

1. > නම කියද්දී නොකියවුණත් ඒ තැනට බිංදුවක් ලියන්න ඕනේ, හරිද?
   - _(no event)_

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ Chalk "3058 - තුන්දහස් පනස් අට" — the mic opens briefly.

### `readWrite4Digit:18c` · SHOW_BOARD

Board at line start: chalk "3058 - තුන්දහස් පනස් අට"

1. > පොතේ මේ වගුවේ එක පැත්තක සංඛ්‍යාව, අනිත් පැත්තේ ඒකේ නම තියෙනවා.
   - `blankTable.show` `{"item":"4c2aa078"}`

_Sees:_ The numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015; the place-value table.

### `readWrite4Digit:18d` · ASK · pause ASK

Board at line start: the numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015

1. > මුල්ම පේළියේ තියෙන සංඛ්‍යාව බලලා ඒකේ නම කියන්න බලන්න.
   - `blankTable.row_activate` `{"row":0,"field":"numberName"}`

Child: **answer** — the number pad into the active cell, or say it · expects **හයදහස් පන්සිය විසි අට**

_Sees:_ The numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015; row 0's numberName cell is outlined — they answer via the number pad into the active cell, or say it.

### `readWrite4Digit:18e` · EXPLAIN

Board at line start: the numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015

1. > හයදහස් පන්සිය විසි අට — ඒ නම අපි වගුවේ ලියමු.
   - `blankTable.cell_fill` `{"row":0,"field":"numberName","value":"හයදහස් පන්සිය විසි අට","by":"tutor"}`
   - `pointer.move_to` `{"target":{"number":6528}}`

_Sees:_ The numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015; හයදහස් පන්සිය විසි අට written into row 0.

### `readWrite4Digit:18f` · ASK · pause ASK

Board at line start: the numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015

1. > දෙවෙනි පේළියේ නම දෙදහස් හාරසිය තිහ.
   - `blankTable.row_activate` `{"row":1,"field":"number"}`
   - `pointer.move_to` `{"target":{"number":2430}}`
2. > ඒ සංඛ්‍යාව ඉලක්කම් වලින් කීයද?
   - _(no event)_

Child: **answer** — the number pad into the active cell, or say it · expects **2430**

_Sees:_ The numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015; row 1's number cell is outlined — they answer via the number pad into the active cell, or say it.

### `readWrite4Digit:18g` · EXPLAIN

Board at line start: the numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015

1. > දෙදහස් හාරසිය තිහ — ඉලක්කම් වලින් ලියන්නේ මෙහෙමයි.
   - `blankTable.cell_fill` `{"row":1,"field":"number","value":"2430","by":"tutor"}`
   - `pointer.move_to` `{"target":{"number":2430}}`

_Sees:_ The numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015; 2430 written into row 1.

### `readWrite4Digit:18b` · TRANSITION

Board at line start: the numeral ↔ number-name table: 6 528 · දෙදහස් හාරසිය තිහ · තුන්දහස් එකසියය · 5 060 · එක්දහස් අට · 9 015

1. > දැන් අපි වෙනත් අභ්‍යාසයක් බලමු.
   - `digitPicker.show` `{"pool":[1,3,6,4]}`

_Sees:_ The digit picker 1 · 3 · 6 · 4; digit tiles 1 · 3 · 6 · 4.

### `readWrite4Digit:19` · SHOW_BOARD · pause RHETORICAL

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > පුතේ, මේ රවුම ඇතුළේ තියෙන ඉලක්කම් ටික පේනවා නේද?
   - `pointer.move_to` `{"target":{"text":"picker"}}`

_Sees:_ The digit picker 1 · 3 · 6 · 4.

### `readWrite4Digit:20` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > මෙතැන තියෙන්නේ එක, තුන, හය, හතර නේද?
   - `pointer.move_to` `{"target":{"number":1}}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ The digit picker 1 · 3 · 6 · 4 — the mic opens briefly.

### `readWrite4Digit:21` · EXPLAIN

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > පිටින් කිසිම අලුත් ඉලක්කමක් නොගෙන, මේවා විතරක් පාවිච්චි කරමු.
   - `pointer.move_to` `{"target":{"text":"picker"}}`

_Sees:_ The digit picker 1 · 3 · 6 · 4.

### `readWrite4Digit:22` · ASK · pause ASK

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > මේ ඉලක්කම් වලින් ඔයා කැමති සංඛ්‍යාවක් හදලා මට කියන්න.
   - `pointer.move_to` `{"target":{"text":"picker"}}`

Child: **answer** — tap digits on the picker, or say the number · expects **any arrangement of 1,3,6,4**

_Sees:_ The digit picker 1 · 3 · 6 · 4 — they answer via tap digits on the picker, or say the number.

### `readWrite4Digit:22a` · EXPLAIN

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > ඒ සංඛ්‍යාවේ නම බෝඩ් එකේ බලන්න.
   - `digitPicker.built_number` `{"digits":"the child's number","name":"sinhalaNumberName(N)"}`

_Sees:_ The digit picker 1 · 3 · 6 · 4; their number and its name appear under the tiles.

### `readWrite4Digit:23` · EXPLAIN

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > උදාහරණයක් විදිහට අපිට එක්දහස් තුන්සිය හැට හතර හදන්නත් පුළුවන්.
   - `digitPicker.built_number` `{"digits":"1364","name":"එක්දහස් තුන්සිය හැට හතර","by":"tutor"}`
   - `pointer.move_to` `{"target":{"number":1364}}`

_Sees:_ The digit picker 1 · 3 · 6 · 4 showing 1 364; Zara's example 1364 and its name appear under the tiles.

### `readWrite4Digit:26` · EXPLAIN · pause SOFT_CHECK

Board at line start: the digit picker 1 · 3 · 6 · 4 showing 1 364

1. > පිටින් කිසිම අලුත් ඉලක්කමක් මෙතනට ගන්න බැහැ.
   - _(no event)_
2. > අපි මේ හතර දෙනාගෙන් විතරක් අලුත් සංඛ්‍යාවක් හදමු.
   - `pointer.move_to` `{"target":{"text":"the built number"}}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ The digit picker 1 · 3 · 6 · 4 showing 1 364 — the mic opens briefly.

### `readWrite4Digit:30` · EXPLAIN

Board at line start: the digit picker 1 · 3 · 6 · 4 showing 1 364

1. > තවත් අලුත් සංඛ්‍යා පහක් හදන්න ලෑල්ලට යමු.
   - `digitPicker.show` `{"pool":"as printed","item":"7daf0141"}`

_Sees:_ The textbook's digit-card puzzle (make five four-digit numbers from the printed digits); the textbook's digit tiles.

### `readWrite4Digit:30a` · ASK · pause ASK

Board at line start: the textbook's digit-card puzzle (make five four-digit numbers from the printed digits)

1. > මේ ඉලක්කම් හතරෙන් සංඛ්‍යාවක් හදලා මට කියන්න.
   - `digitPicker.show` `{"pool":[1,3,6,4]}`

Child: **answer** — tap digits on the picker, or say the number · expects **any arrangement of 1,3,6,4**

_Sees:_ The digit picker 1 · 3 · 6 · 4; digit tiles 1 · 3 · 6 · 4 — they answer via tap digits on the picker, or say the number.

### `readWrite4Digit:30b` · EXPLAIN

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > ඒ සංඛ්‍යාවේ නම බෝඩ් එකේ බලන්න.
   - `digitPicker.built_number` `{"digits":"the child's number","name":"sinhalaNumberName(N)"}`

_Sees:_ The digit picker 1 · 3 · 6 · 4; their number and its name appear under the tiles.

### `readWrite4Digit:30c` · ASK · pause ASK

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > දැන් ඒකට වඩා වෙනස් සංඛ්‍යාවක් හදන්න පුළුවන්ද?
   - `digitPicker.show` `{"pool":[1,3,6,4]}`

Child: **answer** — tap digits on the picker, or say the number · expects **any arrangement of 1,3,6,4**

_Sees:_ The digit picker 1 · 3 · 6 · 4; digit tiles 1 · 3 · 6 · 4 — they answer via tap digits on the picker, or say the number.

### `readWrite4Digit:30d` · EXPLAIN

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > ඒ සංඛ්‍යාවේ නම බෝඩ් එකේ බලන්න.
   - `digitPicker.built_number` `{"digits":"the child's number","name":"sinhalaNumberName(N)"}`

_Sees:_ The digit picker 1 · 3 · 6 · 4; their number and its name appear under the tiles.

### `readWrite4Digit:30e` · ASK · pause ASK

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > අන්තිම වතාවට තව අලුත් සංඛ්‍යාවක් හදමු.
   - `digitPicker.show` `{"pool":[1,3,6,4]}`

Child: **answer** — tap digits on the picker, or say the number · expects **any arrangement of 1,3,6,4**

_Sees:_ The digit picker 1 · 3 · 6 · 4; digit tiles 1 · 3 · 6 · 4 — they answer via tap digits on the picker, or say the number.

### `readWrite4Digit:30f` · EXPLAIN

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > ඒ සංඛ්‍යාවේ නම බෝඩ් එකේ බලන්න.
   - `digitPicker.built_number` `{"digits":"the child's number","name":"sinhalaNumberName(N)"}`

_Sees:_ The digit picker 1 · 3 · 6 · 4; their number and its name appear under the tiles.

### `readWrite4Digit:31` · CHECK_MY_WORK · pause ASK

Board at line start: the digit picker 1 · 3 · 6 · 4

1. > ඔන්න පුතේ, මම අසූ හතර කියන සංඛ්‍යාව වෙන් කරලා ලිව්වා.
   - `chalkText.write` `{"text":"84 = 8 + 4"}`
   - `pointer.move_to` `{"target":{"number":84}}`
2. > ඒත් මගේ වැඩේ පොඩි වැරැද්දක් වුණා වගේ.
   - _(no event)_
3. > මට උදව්වක් විදිහට ඒ වැරැද්ද හොයලා කියන්න පුළුවන්ද?
   - _(no event)_

Child: **find the mistake** — voice · expects **අටට බිංදුවක් දාලා නෑ**

_Sees:_ Chalk "84 = 8 + 4"; "84 = 8 + 4" is written — they answer via voice.

### `readWrite4Digit:31a` · RESOLVE

Board at line start: chalk "84 = 8 + 4"

1. > වැරැද්ද තමයි අටට බිංදුවක් නොදැමීම.
   - `chalkText.write` `{"text":"84 = 80 + 4"}`
2. > ඒක අසූව විය යුතුයි — අසූ හතර කියන්නේ අසූවයි හතරයි.
   - `pointer.move_to` `{"target":{"number":80}}`

_Sees:_ Chalk "84 = 80 + 4"; "84 = 80 + 4" is written.

### `readWrite4Digit:31b` · TRANSITION

Board at line start: chalk "84 = 80 + 4"

1. > දැන් අපි ලොකු සංඛ්‍යා ගැන බලමු.
   - `titleCard.show` `{"title":"ස්ථානීය අගය"}`

_Sees:_ Title card "ස්ථානීය අගය"; title "ස්ථානීය අගය".

## placeValue4Digit

### `placeValue4Digit:32` · HOOK · pause RHETORICAL

Board at line start: title card "ස්ථානීය අගය"

1. > අලුත් ඉස්කෝලේ බෑග් එකක් ගන්න ගියාම ඒකේ මිල ලොකු ගාණක් නේද පුතේ?
   - _(no event)_

_Sees:_ Title card "ස්ථානීය අගය".

### `placeValue4Digit:33` · EXPLAIN

Board at line start: title card "ස්ථානීය අගය"

1. > ඒ ගාණේ ඉලක්කම් හතරක් තියෙනවා.
   - _(no event)_
2. > ඒ ඉලක්කම් තියෙන තැන දන්නවා නම් අපිට ඒක ලේසියෙන් කියවන්න පුළුවන්.
   - `pointer.move_to` `{"target":{"text":"ස්ථානීය අගය"}}`

_Sees:_ Title card "ස්ථානීය අගය".

### `placeValue4Digit:34` · TRANSITION

Board at line start: title card "ස්ථානීය අගය"

1. > අද අපි ගණක රාමුවකින් අලුත් සංඛ්‍යාවක් හදන්නයි ලෑස්ති වෙන්නේ.
   - `abacus.show` `{"digits":[5,4,2,1],"startEmpty":true,"animate":false}`
   - `chalkText.write` `{"text":"ගණක රාමුව"}`

_Sees:_ The abacus, rods bare; bare rods appear; "ගණක රාමුව" is written.

### `placeValue4Digit:35` · EXPLAIN

Board at line start: the abacus, rods bare

1. > ගණක රාමුවේ දකුණු කෙළවරේම තියෙන කූර එකස්ථානය කියලයි අපි කියන්නේ.
   - `abacus.rod_glow` `{"rod":3}`
   - `pointer.move_to` `{"target":{"text":"ගණක රාමුව"}}`

_Sees:_ The abacus, rods bare; the එ rod glows.

### `placeValue4Digit:36` · EXPLAIN

Board at line start: the abacus, rods bare

1. > වමේ පැත්තට යද්දී දහයස්ථානය, සියයස්ථානය පිහිටනවා.
   - `abacus.rod_glow` `{"rod":1}`
   - `abacus.rod_glow` `{"rod":2}`
2. > ඊට වම් පැත්තෙන්ම දහසස්ථානය තියෙනවා.
   - `abacus.rod_glow` `{"rod":0}`

_Sees:_ The abacus, rods bare; the සි rod glows; the ද rod glows; the දා rod glows.

### `placeValue4Digit:37` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: the abacus, rods bare

1. > එතකොට කූරු හතරේ පිළිවෙළ ඔයාට මතක හිටියා නේද පුතේ?
   - _(no event)_

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ The abacus, rods bare — the mic opens briefly.

### `placeValue4Digit:38` · EXPLAIN

Board at line start: the abacus, rods bare

1. > ඔන්න අපි පන්දහස් හාරසිය විසි එක කියන ලස්සන සංඛ්‍යාව මේ රාමුවට දාමු.
   - `pointer.move_to` `{"target":{"number":5421}}`

_Sees:_ The abacus, rods bare.

### `placeValue4Digit:39` · SHOW_BOARD

Board at line start: the abacus, rods bare

1. > දහසස්ථානයේ කූරට අපි පබළු එක, දෙක, තුන, හතර, පහක් දානවා.
   - `abacus.bead_add` `{"rod":0,"count":5}`
   - `abacus.rod_glow` `{"rod":0}`

_Sees:_ The abacus, දා 5; 5 bead(s) drop onto the දා rod; the දා rod glows.

### `placeValue4Digit:40` · SHOW_BOARD

Board at line start: the abacus, දා 5

1. > ඊළඟ සියයස්ථානයට පබළු හතරක් දාමු.
   - `abacus.bead_add` `{"rod":1,"count":4}`
   - `abacus.rod_glow` `{"rod":1}`

_Sees:_ The abacus, දා 5, සි 4; 4 bead(s) drop onto the සි rod; the සි rod glows.

### `placeValue4Digit:41` · SHOW_BOARD

Board at line start: the abacus, දා 5, සි 4

1. > දහයස්ථානයට පබළු දෙකකුත්, එකස්ථානයට එක පබළුවකුත් එකතු කරමු.
   - `abacus.bead_add` `{"rod":2,"count":2}`
   - `abacus.bead_add` `{"rod":3,"count":1}`
   - `abacus.rod_glow` `{"rod":2}`
   - `abacus.rod_glow` `{"rod":3}`

_Sees:_ The abacus showing 5 421; 2 bead(s) drop onto the ද rod; 1 bead(s) drop onto the එ rod; the ද rod glows; the එ rod glows.

### `placeValue4Digit:42` · EXPLAIN

Board at line start: the abacus showing 5 421

1. > බලන්නකෝ, හැම කූරකම තියෙන පබළු එකතු වෙලා අපේ මුළු සංඛ්‍යාව හැදුණා.
   - `highlight.circle` `{"target":{"number":5421}}`

_Sees:_ The abacus showing 5 421; a chalk ring around 5 421.

### `placeValue4Digit:43` · TRANSITION

Board at line start: the abacus showing 5 421

1. > දකුණු පැත්තේ මුල්ම කූර දිහා බලන්නකෝ පුතේ.
   - `abacus.rod_glow` `{"rod":3}`

_Sees:_ The abacus showing 5 421; the එ rod glows.

### `placeValue4Digit:44` · ASK · pause ASK

Board at line start: the abacus showing 5 421

1. > එකස්ථානයේ පබළු කීයක් තියෙනවද?
   - `abacus.rod_glow` `{"rod":3}`

Child: **answer** — voice · expects **එක**

_Sees:_ The abacus showing 5 421; the එ rod glows — they answer via voice.

### `placeValue4Digit:45` · EXPLAIN

Board at line start: the abacus showing 5 421

1. > එතන පබළු එකක් නිසා අගය එකයි.
   - `abacus.rod_glow` `{"rod":3}`

_Sees:_ The abacus showing 5 421; the එ rod glows.

### `placeValue4Digit:46` · EXPLAIN

Board at line start: the abacus showing 5 421

1. > දහයස්ථානයේ පබළු දෙකයි, ඒ නිසා අගය විස්සයි.
   - `abacus.rod_glow` `{"rod":2}`
   - `pointer.move_to` `{"target":{"rod":2}}`

_Sees:_ The abacus showing 5 421; the ද rod glows.

### `placeValue4Digit:48` · ASK · pause ASK

Board at line start: the abacus showing 5 421

1. > සියයස්ථානයේ තියෙන පබළු ගණන කියන්න පුළුවන්ද?
   - `abacus.rod_glow` `{"rod":1}`

Child: **answer** — voice · expects **හතර**

_Sees:_ The abacus showing 5 421; the සි rod glows — they answer via voice.

### `placeValue4Digit:49` · EXPLAIN

Board at line start: the abacus showing 5 421

1. > සියයස්ථානයේ පබළු හතරක් නිසා අගය හාරසියයයි.
   - `abacus.rod_glow` `{"rod":1}`
   - `pointer.move_to` `{"target":{"rod":1}}`

_Sees:_ The abacus showing 5 421; the සි rod glows.

### `placeValue4Digit:50` · EXPLAIN

Board at line start: the abacus showing 5 421

1. > දහසස්ථානයේ පබළු පහයි, ඒ නිසා අගය පන්දහසයි.
   - `abacus.rod_glow` `{"rod":0}`
   - `pointer.move_to` `{"target":{"rod":0}}`

_Sees:_ The abacus showing 5 421; the දා rod glows.

### `placeValue4Digit:52` · SHOW_BOARD

Board at line start: the abacus showing 5 421

1. > මේ විදිහට හැම ඉලක්කමකටම තමන්ගේම ස්ථානීය අගයක් තියෙනවා.
   - `blankTable.show` `{"item":"7b58e436"}`
   - `chalkText.write` `{"text":"ස්ථානීය අගය"}`

_Sees:_ The place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003; the place-value table; "ස්ථානීය අගය" is written.

### `placeValue4Digit:53` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: the place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003

1. > ස්ථානය අනුව අගය වෙනස් වෙන හැටි පැහැදිලියි නේද පුතේ?
   - _(no event)_

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ The place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003 — the mic opens briefly.

### `placeValue4Digit:54` · TRANSITION

Board at line start: the place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003

1. > දැන් අපි ගණක රාමුවේ තියෙන සංඛ්‍යාව වචනයෙන් කියවන්න පුරුදු වෙමු.
   - `abacus.show` `{"digits":[5,4,2,1],"startEmpty":false,"animate":false}`
   - `pointer.move_to` `{"target":{"text":"ගණක රාමුව"}}`

_Sees:_ The abacus showing 5 421; the abacus shows 5 421.

### `placeValue4Digit:55` · EXPLAIN · pause RHETORICAL

Board at line start: the abacus showing 5 421

1. > දහසස්ථානය පෙන්වන කූරේ තියෙන්නේ පබළු පහයි නේද, පුතේ?
   - `abacus.rod_glow` `{"rod":0}`
   - `pointer.move_to` `{"target":{"rod":0}}`

_Sees:_ The abacus showing 5 421; the දා rod glows.

### `placeValue4Digit:56` · EXPLAIN

Board at line start: the abacus showing 5 421

1. > ඒ පබළු වලින් පෙන්වන්නේ පන්දහසක අගයක්.
   - `abacus.rod_glow` `{"rod":0}`

_Sees:_ The abacus showing 5 421; the දා rod glows.

### `placeValue4Digit:57` · EXPLAIN

Board at line start: the abacus showing 5 421

1. > ඊළඟට සියයස්ථානයෙන් හාරසියයකුත් ලැබෙනවා.
   - `abacus.rod_glow` `{"rod":1}`
2. > දහයස්ථානයෙන් විස්සකුත්, එකස්ථානයෙන් එකකුත් ලැබෙනවා.
   - `abacus.rod_glow` `{"rod":2}`
   - `abacus.rod_glow` `{"rod":3}`

_Sees:_ The abacus showing 5 421; the සි rod glows; the ද rod glows; the එ rod glows.

### `placeValue4Digit:58` · ASK · pause ASK

Board at line start: the abacus showing 5 421

1. > එහෙනම් පුතේ, මේ සංඛ්‍යාව කියවමු බලන්න.
   - `highlight.circle` `{"target":{"number":5421}}`
   - `pointer.move_to` `{"target":{"text":"abacus"}}`

Child: **answer** — voice · expects **පන්දහස් හාරසිය විසි එක**

_Sees:_ The abacus showing 5 421; a chalk ring around 5 421 — they answer via voice.

### `placeValue4Digit:59` · EXPLAIN

Board at line start: the abacus showing 5 421

1. > ඒ සංඛ්‍යාව පන්දහස් හාරසිය විසි එකයි.
   - `chalkText.write` `{"text":"5 421 - පන්දහස් හාරසිය විසි එක"}`
   - `pointer.move_to` `{"target":{"number":5421}}`

_Sees:_ Chalk "5 421 - පන්දහස් හාරසිය විසි එක"; "5 421 - පන්දහස් හාරසිය විසි එක" is written.

### `placeValue4Digit:60` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: chalk "5 421 - පන්දහස් හාරසිය විසි එක"

1. > අපි මේ සංඛ්‍යාව අකුරෙන් ලියන්නේ පන්දහස් හාරසිය විසි එක කියලයි.
   - `pointer.move_to` `{"target":{"number":5421}}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ Chalk "5 421 - පන්දහස් හාරසිය විසි එක" — the mic opens briefly.

### `placeValue4Digit:61` · TRANSITION

Board at line start: chalk "5 421 - පන්දහස් හාරසිය විසි එක"

1. > දැන් අපි තවත් අලුත් සංඛ්‍යාවක් ගණක රාමුවේ බලමුකෝ.
   - `abacus.show` `{"digits":[6,8,3,1],"startEmpty":false,"animate":false}`
   - `pointer.move_to` `{"target":{"text":"ගණක රාමුව"}}`

_Sees:_ The abacus showing 6 831; the abacus shows 6 831.

### `placeValue4Digit:62` · ASK · pause ASK

Board at line start: the abacus showing 6 831

1. > මෙතන තියෙන සංඛ්‍යාවත් වචනයෙන් කියන්න පුළුවන්ද පුතේ?
   - `pointer.move_to` `{"target":{"text":"abacus"}}`

Child: **answer** — voice · expects **හයදහස් අටසිය තිස් එක**

_Sees:_ The abacus showing 6 831 — they answer via voice.

### `placeValue4Digit:63` · EXPLAIN

Board at line start: the abacus showing 6 831

1. > ඒක හයදහස් අටසිය තිස් එක තමයි!
   - `chalkText.write` `{"text":"6 831 - හයදහස් අටසිය තිස් එක"}`
   - `pointer.move_to` `{"target":{"number":6831}}`
2. > දැන් ඔයා සංඛ්‍යා නාම කියවන්න හොඳටම දන්නවා.
   - _(no event)_

_Sees:_ Chalk "6 831 - හයදහස් අටසිය තිස් එක"; "6 831 - හයදහස් අටසිය තිස් එක" is written.

### `placeValue4Digit:64` · TRANSITION

Board at line start: chalk "6 831 - හයදහස් අටසිය තිස් එක"

1. > දැන් අපි කලින් ගත්තු පන්දහස් හාරසිය විසි එක විහිදුවා ලියමු, පුතේ.
   - `abacus.show` `{"digits":[5,4,2,1],"startEmpty":false,"animate":false}`
   - `chalkText.write` `{"text":"විහිදුවා"}`

_Sees:_ The abacus showing 5 421; the abacus shows 5 421; "විහිදුවා" is written.

### `placeValue4Digit:65` · EXPLAIN · pause RHETORICAL

Board at line start: the abacus showing 5 421

1. > බලන්න, දහසස්ථානයේ පබළු පහක් තියෙනවා නේද?
   - `abacus.rod_glow` `{"rod":0}`
   - `pointer.move_to` `{"target":{"rod":0}}`

_Sees:_ The abacus showing 5 421; the දා rod glows.

### `placeValue4Digit:66` · ASK · pause ASK

Board at line start: the abacus showing 5 421

1. > එතකොට ඒ පහෙන් පෙන්වන අගය කීයද පුතේ?
   - `pointer.move_to` `{"target":{"rod":0}}`

Child: **answer** — voice · expects **පන්දහස**

_Sees:_ The abacus showing 5 421 — they answer via voice.

### `placeValue4Digit:67` · EXPLAIN

Board at line start: the abacus showing 5 421

1. > ඒක පන්දහසයි.
   - `chalkText.write` `{"text":"5 421 = 5000 +"}`
   - `pointer.move_to` `{"target":{"number":5000}}`

_Sees:_ Chalk "5 421 = 5000 +"; "5 421 = 5000 +" is written.

### `placeValue4Digit:68` · EXPLAIN

Board at line start: chalk "5 421 = 5000 +"

1. > සියයස්ථානයේ තියෙන්නේ හතරක්, ඒ නිසා අගය හාරසියයයි.
   - `pointer.move_to` `{"target":{"text":"5 421 = 5000 +"}}`

_Sees:_ Chalk "5 421 = 5000 +".

### `placeValue4Digit:70` · ASK · pause ASK

Board at line start: chalk "5 421 = 5000 +"

1. > ඊළඟට දහයස්ථානයේ තියෙන දෙකෙන් ලැබෙන අගය කීයද?
   - _(no event)_

Child: **answer** — voice · expects **විස්ස**

_Sees:_ Chalk "5 421 = 5000 +" — they answer via voice.

### `placeValue4Digit:71` · EXPLAIN

Board at line start: chalk "5 421 = 5000 +"

1. > දහයස්ථානයේ දෙකේ අගය විස්සයි.
   - `chalkText.write` `{"text":"5 421 = 5000 + 400 + 20 +","append":"400 + 20 +"}`
   - `pointer.move_to` `{"target":{"number":20}}`

_Sees:_ Chalk "5 421 = 5000 + 400 + 20 +"; "400 + 20 +" is written on, making "5 421 = 5000 + 400 + 20 +".

### `placeValue4Digit:72` · EXPLAIN

Board at line start: chalk "5 421 = 5000 + 400 + 20 +"

1. > අන්තිමට එකස්ථානයේ තියෙන්නේ එකක්, ඒ නිසා ලැබෙන්නේ එකමයි.
   - _(no event)_

_Sees:_ Chalk "5 421 = 5000 + 400 + 20 +".

### `placeValue4Digit:74` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: chalk "5 421 = 5000 + 400 + 20 +"

1. > මේ විදියට එකතු කිරීමක් ලෙස ලිවීමට තමයි විහිදුවා ලියනවා කියන්නේ, පැහැදිලියි නේද පුතේ?
   - `pointer.move_to` `{"target":{"text":"විහිදුවා"}}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ Chalk "5 421 = 5000 + 400 + 20 +" — the mic opens briefly.

### `placeValue4Digit:75` · TRANSITION

Board at line start: chalk "5 421 = 5000 + 400 + 20 +"

1. > අපි දැන් තවත් සංඛ්‍යාවක් ගණක රාමුවෙන් පෙන්වලා බලමු පුතේ.
   - `abacus.show` `{"digits":[7,0,6,2],"startEmpty":false,"animate":false}`
   - `pointer.move_to` `{"target":{"text":"ගණක රාමුව"}}`

_Sees:_ The abacus showing 7 062; the abacus shows 7 062.

### `placeValue4Digit:76` · EXPLAIN · pause SOFT_CHECK

Board at line start: the abacus showing 7 062

1. > මුලින්ම දහසස්ථානය දිහා බලන්න, එතන පබළු හතක් තියෙනවා නේද?
   - `abacus.rod_glow` `{"rod":0}`
   - `pointer.move_to` `{"target":{"rod":0}}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ The abacus showing 7 062; the දා rod glows — the mic opens briefly.

### `placeValue4Digit:77` · EXPLAIN

Board at line start: the abacus showing 7 062

1. > එක් පබළුවකින් දහසක් පෙන්වනවා නම්, පබළු හතක අගය හත්දහසයි.
   - `textCard.show` `{"text":"7000"}`
   - `pointer.move_to` `{"target":{"number":7000}}`

_Sees:_ Card "7000"; card "7000".

### `placeValue4Digit:78` · EXPLAIN

Board at line start: card "7000"

1. > ඊළඟට තියෙන සියයස්ථානයේ කූර දිහා හොඳින් බලන්නකෝ.
   - _(no event)_

_Sees:_ Card "7000".

### `placeValue4Digit:79` · ASK · pause ASK

Board at line start: card "7000"

1. > එතන පබළු කීයක් දකින්න තියෙනවද?
   - `pointer.move_to` `{"target":{"text":"7000"}}`

Child: **answer** — voice · expects **බිංදුව**

_Sees:_ Card "7000" — they answer via voice.

### `placeValue4Digit:80` · EXPLAIN

Board at line start: card "7000"

1. > කූරේ කිසිම පබළුවක් නෑ.
   - `chalkText.write` `{"text":"7000 + 0","append":"+ 0"}`
2. > ඒ නිසා එතන අගය බිංදුවයි.
   - `pointer.move_to` `{"target":{"number":0}}`

_Sees:_ Chalk "7000 + 0"; "+ 0" is written on, making "7000 + 0".

### `placeValue4Digit:81` · EXPLAIN

Board at line start: chalk "7000 + 0"

1. > දහයස්ථානයේ කූර දිහා බැලුවොත් අපට පබළු හයක් පේනවා.
   - `chalkText.write` `{"text":"7000 + 0 + 60","append":"+ 60"}`
2. > එකකින් දහයක් පෙන්වන නිසා එතනින් හැටක් හැදෙනවා.
   - `pointer.move_to` `{"target":{"number":60}}`

_Sees:_ Chalk "7000 + 0 + 60"; "+ 60" is written on, making "7000 + 0 + 60".

### `placeValue4Digit:82` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: chalk "7000 + 0 + 60"

1. > අවසාන කූරේ, ඒ කියන්නේ එකස්ථානයේ තියෙන්නේ පබළු දෙකයි.
   - _(no event)_
2. > එකස්ථානයේ ඒ පබළු දෙකෙන් හැදෙන අගය කීයද පුතේ?
   - _(no event)_

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ Chalk "7000 + 0 + 60" — the mic opens briefly.

### `placeValue4Digit:83` · EXPLAIN

Board at line start: chalk "7000 + 0 + 60"

1. > ඒක දෙකයි.
   - `chalkText.write` `{"text":"7062 = 7000 + 0 + 60 + 2"}`
   - `pointer.move_to` `{"target":{"number":2}}`

_Sees:_ Chalk "7062 = 7000 + 0 + 60 + 2"; "7062 = 7000 + 0 + 60 + 2" is written.

### `placeValue4Digit:84` · EXPLAIN · pause SOFT_CHECK

Board at line start: chalk "7062 = 7000 + 0 + 60 + 2"

1. > එහෙනම් මේ මුළු සංඛ්‍යාව හත්දහස් හැට දෙකයි, අපි එය දිගහැරලා ලිව්වා නේද?
   - `pointer.move_to` `{"target":{"number":7062}}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ Chalk "7062 = 7000 + 0 + 60 + 2" — the mic opens briefly.

### `placeValue4Digit:85` · TRANSITION

Board at line start: chalk "7062 = 7000 + 0 + 60 + 2"

1. > ඔන්න පුතේ, මම ඔයාට ඉලක්කම් කාඩ්පත් හතරක් දෙනවා — එක, තුන, අට, හය.
   - `numberCards.show` `{"values":[1,3,8,6]}`

_Sees:_ Number cards 1 · 3 · 8 · 6; cards 1 · 3 · 8 · 6 deal in.

### `placeValue4Digit:86` · EXPLAIN · pause RHETORICAL

Board at line start: number cards 1 · 3 · 8 · 6

1. > මේ කාඩ්පත් හතර පේනවා නේද?
   - `pointer.move_to` `{"target":{"card":1}}`

_Sees:_ Number cards 1 · 3 · 8 · 6.

### `placeValue4Digit:87` · EXPLAIN

Board at line start: number cards 1 · 3 · 8 · 6

1. > අපි මුලින්ම හයදහස් අටසිය තිස් එක කියන සංඛ්‍යාව ලියලා බලමු.
   - `textCard.show` `{"text":"6 831"}`
   - `pointer.move_to` `{"target":{"number":6831}}`

_Sees:_ Card "6 831"; card "6 831".

### `placeValue4Digit:88` · ASK · pause ASK

Board at line start: card "6 831"

1. > මේකේ දහසස්ථානයේ තියෙන හයෙන් පෙන්වන අගය කීයද?
   - `pointer.move_to` `{"target":{"text":"6 831","place":"දා"}}`

Child: **answer** — number pad or voice · expects **6000**

_Sees:_ Card "6 831" — they answer via number pad or voice.

### `placeValue4Digit:89` · EXPLAIN

Board at line start: card "6 831"

1. > ඒක හයදහසයි.
   - `chalkText.write` `{"text":"6 831 = 6000 + 800 + 30 + 1","append":"= 6000 + 800 + 30 + 1"}`
   - `pointer.move_to` `{"target":{"number":6000}}`

_Sees:_ Chalk "6 831 = 6000 + 800 + 30 + 1"; "= 6000 + 800 + 30 + 1" is written on, making "6 831 = 6000 + 800 + 30 + 1".

### `placeValue4Digit:90` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: chalk "6 831 = 6000 + 800 + 30 + 1"

1. > එතකොට මේක දිගහැරලා ලිව්වාම එන්නේ මේ විදිහට නේද?
   - `pointer.move_to` `{"target":{"text":"6 831 = 6000 + 800 + 30 + 1"}}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ Chalk "6 831 = 6000 + 800 + 30 + 1" — the mic opens briefly.

### `placeValue4Digit:91` · EXPLAIN

Board at line start: chalk "6 831 = 6000 + 800 + 30 + 1"

1. > තව ක්‍රමයකට හැදුවොත් අපිට අටදහස් හයසිය දහතුන ලැබෙනවා.
   - `textCard.show` `{"text":"8 613"}`
   - `pointer.move_to` `{"target":{"number":8613}}`

_Sees:_ Card "8 613"; card "8 613".

### `placeValue4Digit:92` · ASK · pause ASK

Board at line start: card "8 613"

1. > එහෙනම් අටදහස් හයසිය දහතුන දිගහරිද්දී මුලින්ම ලියවෙන්නේ මොන අගයද?
   - `pointer.move_to` `{"target":{"number":8613}}`

Child: **answer** — number pad or voice · expects **8000**

_Sees:_ Card "8 613" — they answer via number pad or voice.

### `placeValue4Digit:93` · EXPLAIN

Board at line start: card "8 613"

1. > මුලින්ම ලියවෙන්නේ අටදහසයි.
   - `chalkText.write` `{"text":"8 613 = 8000 + 600 + 10 + 3","append":"= 8000 + 600 + 10 + 3"}`
   - `pointer.move_to` `{"target":{"number":8000}}`
2. > ඊටපස්සේ හයසියයයි, දහයයි, තුනයි එකතු වෙනවා.
   - `pointer.move_to` `{"target":{"number":600}}`

_Sees:_ Chalk "8 613 = 8000 + 600 + 10 + 3"; "= 8000 + 600 + 10 + 3" is written on, making "8 613 = 8000 + 600 + 10 + 3".

### `placeValue4Digit:94` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: chalk "8 613 = 8000 + 600 + 10 + 3"

1. > අපි කලින් ගත්තු හත්දහස් හැට දෙක දිහා ආයෙත් බලමු.
   - `abacus.show` `{"digits":[7,0,6,2],"startEmpty":false,"animate":false}`
   - `pointer.move_to` `{"target":{"number":7062}}`
2. > බිංදුවක් ආවොත් එතැනින් කිසිම අගයක් එකතු වෙන්නේ නෑ නේද පුතේ?
   - _(no event)_

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ The abacus showing 7 062; the abacus shows 7 062 — the mic opens briefly.

### `placeValue4Digit:95` · TRANSITION

Board at line start: the abacus showing 7 062

1. > දැන් පුතේ තනියම පුහුණු වෙන්න වෙලාව හරි.
   - `titleCard.show` `{"title":"තනිව විසඳමු"}`

_Sees:_ Title card "තනිව විසඳමු"; title "තනිව විසඳමු".

### `placeValue4Digit:96` · SHOW_BOARD

Board at line start: title card "තනිව විසඳමු"

1. > මෙන්න ඔයාට විශේෂ අභ්‍යාස පත්‍රිකාවක් තිරයේ පෙනෙනවා.
   - `expansion.show` `{"number":5421,"parts":[null,null,null,null]}`

_Sees:_ 5 421 = ▢ + ▢ + ▢ + ▢; 5 421 = ▢ + ▢ + ▢ + ▢.

### `placeValue4Digit:97` · EXPLAIN

Board at line start: 5 421 = ▢ + ▢ + ▢ + ▢

1. > පළමුවැනි ගාණ විදිහට පන්දහස් හාරසිය විසි එක සංඛ්‍යාව දිගහැරලා ලියමු.
   - `pointer.move_to` `{"target":{"number":5421}}`

_Sees:_ 5 421 = ▢ + ▢ + ▢ + ▢.

### `placeValue4Digit:98` · ASK · pause ASK

Board at line start: 5 421 = ▢ + ▢ + ▢ + ▢

1. > මේකෙ දහසස්ථානයේ තියෙන ඉලක්කම මොකක්ද පුතේ?
   - `pointer.move_to` `{"target":{"part":0}}`

Child: **answer** — number pad or voice · expects **5**

_Sees:_ 5 421 = ▢ + ▢ + ▢ + ▢ — they answer via number pad or voice.

### `placeValue4Digit:99` · EXPLAIN

Board at line start: 5 421 = ▢ + ▢ + ▢ + ▢

1. > දහසස්ථානයේ ඉන්නේ පහ නේද.
   - `pointer.move_to` `{"target":{"part":-1}}`

_Sees:_ 5 421 = ▢ + ▢ + ▢ + ▢.

### `placeValue4Digit:100` · SOFT_CHECK · pause SOFT_CHECK

Board at line start: 5 421 = ▢ + ▢ + ▢ + ▢

1. > එහෙනම් ඒ පහ නිසා ලැබෙන අගය කීයද?
   - `pointer.move_to` `{"target":{"part":-1}}`

Child: **soft check** — mic open 5s; any reply acknowledged after 1.2s of quiet; silence flows on

_Sees:_ 5 421 = ▢ + ▢ + ▢ + ▢ — the mic opens briefly.

### `placeValue4Digit:101` · EXPLAIN

Board at line start: 5 421 = ▢ + ▢ + ▢ + ▢

1. > ඒක පන්දහසයි.
   - `expansion.part_reveal` `{"index":0,"value":"5000"}`
   - `pointer.move_to` `{"target":{"part":0}}`

_Sees:_ 5 421 = 5000 + ▢ + ▢ + ▢; 5000 is written into slot 0.

### `placeValue4Digit:102` · SHOW_BOARD

Board at line start: 5 421 = 5000 + ▢ + ▢ + ▢

1. > දැන් මේ වගුවේ තියෙන කොටස් අපි එකට පුරවමු.
   - `blankTable.show` `{"item":"7b58e436"}`

_Sees:_ The place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003; the place-value table.

### `placeValue4Digit:103` · ASK · pause ASK

Board at line start: the place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003

1. > හයදහස් පන්සිය හැත්තෑ දෙක කියන සංඛ්‍යාවේ හයෙන් පෙන්වන අගය කීයද?
   - `blankTable.row_activate` `{"row":1,"field":"valueRepresented"}`
   - `pointer.move_to` `{"target":{"number":6572}}`

Child: **answer** — the number pad into the active cell, or say it · expects **6000**

_Sees:_ The place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003; row 1's valueRepresented cell is outlined — they answer via the number pad into the active cell, or say it.

### `placeValue4Digit:104` · EXPLAIN

Board at line start: the place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003

1. > ඒක හයදහසයි.
   - `pointer.move_to` `{"target":{"number":6000}}`
2. > ඒ හය තියෙන්නේ දහසස්ථානයේ.
   - `pointer.move_to` `{"target":{"number":6}}`

_Sees:_ The place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003.

### `placeValue4Digit:105` · ASK · pause ASK

Board at line start: the place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003

1. > එහෙනම් පන්දහස් විසි හතර කියන සංඛ්‍යාවේ හතරෙන් පෙන්වන අගය කීයද?
   - `blankTable.row_activate` `{"row":2,"field":"valueRepresented"}`
   - `pointer.move_to` `{"target":{"number":5024}}`

Child: **answer** — the number pad into the active cell, or say it · expects **4**

_Sees:_ The place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003; row 2's valueRepresented cell is outlined — they answer via the number pad into the active cell, or say it.

### `placeValue4Digit:106` · EXPLAIN

Board at line start: the place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003

1. > ඒක හතරයි.
   - `pointer.move_to` `{"target":{"number":4}}`
2. > හතර තියෙන්නේ එකස්ථානයේ.
   - `pointer.move_to` `{"target":{"number":4}}`

_Sees:_ The place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003.

### `placeValue4Digit:107` · ASK · pause ASK

Board at line start: the place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003

1. > අටදහස් හත්සියය කියන සංඛ්‍යාවේ හත්සියය අගය දෙන්නේ මොන ඉලක්කමද?
   - `blankTable.row_activate` `{"row":3,"field":"digit"}`
   - `pointer.move_to` `{"target":{"number":8700}}`

Child: **answer** — the number pad into the active cell, or say it · expects **7**

_Sees:_ The place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003; row 3's digit cell is outlined — they answer via the number pad into the active cell, or say it.

### `placeValue4Digit:108` · EXPLAIN

Board at line start: the place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003

1. > ඒක හතයි.
   - `pointer.move_to` `{"target":{"number":7}}`
2. > හත තියෙන්නේ සියයස්ථානයේ.
   - `pointer.move_to` `{"target":{"number":7}}`

_Sees:_ The place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003.

### `placeValue4Digit:109` · EXPLAIN

Board at line start: the place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003

1. > අද ඔයා හොඳට වැඩ කළා.
   - _(no event)_
2. > ස්ථානීය අගය මොකක්ද කියලා දැන් ඔයා දන්නවා.
   - `pointer.move_to` `{"target":{"text":"ස්ථානීය අගය"}}`

_Sees:_ The place-value table: 2 348 (worked) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003.

