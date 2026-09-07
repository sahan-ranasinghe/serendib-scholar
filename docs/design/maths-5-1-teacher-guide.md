# Teacher's Guide — Grade 5 Maths, Lesson 1: සංඛ්‍යා - 1 (Numbers - 1)

Source: Sri Lanka Educational Publications Department, Grade 5 Mathematics
Teacher's Instructional Manual, pages 2–6. Transcribed from the official
guide for use as the pedagogical source for Serendib Scholar's Lesson 1.

This file is the **primary** design source for the lesson. The textbook
(already in `lesson1-numbers.ts` / `content_bank`) supplies the exercises;
the recorded video supplies pacing and question rhythm only.

---

## 1. Competency and learning outcomes

**නිපුණතාව (Competency)**
- සංඛ්‍යා හඳුනා ගෙන භාවිත කරයි.
- 100 000 තෙක් සංඛ්‍යා හඳුනාගෙන භාවිත කරයි.

**ඉගෙනුම් ඵල (Learning outcomes)** — five, and these are the objectives the
lesson must actually achieve:

1. 9 999 තෙක් කුමන සංඛ්‍යාවක් වුව ද කියවයි. ඉලක්කමෙන් හා වචනයෙන් ලියයි.
   *(Reads any number up to 9 999; writes it in digits and in words.)*
2. ඉලක්කම් හතරේ සංඛ්‍යාවල ස්ථානීය අගය දක්වයි.
   *(States the place value of digits in 4-digit numbers.)*
3. 100 000 තෙක් සංඛ්‍යා කියයි. ලියයි. සංඛ්‍යා නාමය ලියයි.
   *(Says, writes, and names numbers up to 100 000.)*
4. දස දහසස්ථානය තෙක් සංඛ්‍යාවල එක් එක් ඉලක්කමෙන් නිරූපිත අගය දක්වයි.
   *(States the value represented by each digit up to the ten-thousands place.)*
5. 99 999ට නොවැඩි සංඛ්‍යා ස්ථානීය අගය අනුව විහිදුවා ලියයි.
   *(Writes numbers up to 99 999 in expanded form by place value.)*

**වචන මාලාව (Vocabulary to introduce)** — these are the terms the child must
end the lesson knowing, and they should be introduced in this order as the
activities reach them:

සංඛ්‍යාව · සංඛ්‍යා නාමය · එකස්ථානය · දහයස්ථානය · සියයස්ථානය ·
දහසස්ථානය · දස දහසස්ථානය · දස දහස · සියක් දහස · ස්ථානීය අගය · සංඛ්‍යාංකය

**ඉගෙනුම් සම්පත් (Learning materials the classroom teacher uses)** — each of
these needs a digital equivalent on the board:

| Physical material | Digital equivalent for the app |
|---|---|
| ගණක රාමු (abacus) | Animated abacus primitive — beads added one per place |
| පැවරුම් පත්‍රිකා (worksheets) | Board exercise cards with tap-to-answer |
| සංඛ්‍යා ලියූ කාඩ් පත් (number cards) | Draggable/tappable chalk number cards |
| විශාල ප්‍රමාණයේ කඩදාසි (large paper) | The board itself |
| සංඛ්‍යා පොත (number book) | The place-value strip / table primitive |

---

## 2. The four activities, in order

The guide structures the lesson as **four activities (ක්‍රියාකාරකම)**, each in
numbered steps (පියවර). This ordering *is* the lesson design — it should drive
the concept sequence in the app.

### ක්‍රියාකාරකම 1 — 9 999 තෙක් සංඛ්‍යා කියවීම සහ ලිවීම
*(Reading and writing numbers up to 9 999)*

**පියවර 1**
- Display a row of numbers with up to 3 digits. The guide's examples:
  **84, 101, 528, 997**
- Have students read each number's name aloud.
- Show what comes after 999, using this build-up:
  ```
  9   + 1 =    10    දහය
  99  + 1 =   100    සියය
  999 + 1 =  1000    දහස
  ```
- Place cards with digits 0–9 on a table; a student picks 4 cards and forms a
  4-digit number, then reads its name aloud or writes it.
- Another student confirms the number name.
- Repeat with several students so many numbers are formed and named.

**පියවර 2**
- Give each group a worksheet of this form:
  > A circle containing the digits **1, 3, 6, 4**
  > * Using the digits in the circle, form **5** four-digit numbers.
  > * Write the number name of each.

*App note:* this maps directly to the existing DigitPickerPuzzle component.
The guide's own digit set is **1, 3, 6, 4** — different from the textbook's
digit box, so both can be used as distinct examples.

---

### ක්‍රියාකාරකම 2 — ඉලක්කම් හතරේ සංඛ්‍යාවල ස්ථානීය අගය හඳුනා ගැනීම
*(Recognising place value in 4-digit numbers)*

**පියවර 1**
- Set up an abacus where all students can see it. A student comes forward and
  represents a number on the abacus.
- **Diagram in the guide (page 3):** a four-rod abacus on a stand, rods
  labelled left to right **දා · සි · ද · එ** (thousands, hundreds, tens, ones),
  with grey beads stacked on each rod. The illustrated example shows a
  descending bead pattern — 5 beads on the thousands rod, 4 on hundreds,
  2 on tens, 1 on ones.
- Ask the class, about the number shown:
  * ගණක රාමුවේ ඒ ඒ ස්ථානයේ කුරුළු ගණකවලින් නිරූපණය වන ඉලක්කම
    *(the digit shown by the beads at each place)*
  * ගණක රාමුවේ ඒ ඒ ස්ථානයේ ස්ථානීය අගය *(the place value at each place)*
  * එකස්ථානයේ ඉලක්කමෙන් නිරූපණය වන අගය
  * දහයස්ථානයේ ඉලක්කමෙන් නිරූපණය වන අගය
  * සියයස්ථානයේ ඉලක්කමෙන් නිරූපණය වන අගය
  * දහසස්ථානයේ ඉලක්කමෙන් නිරූපණය වන අගය
- Have students say and write the number name of the number on the abacus.
- Then show it written in expanded form:
  ```
  5 421  →  5 000 + 400 + 20 + 1
  ```
- Repeat: represent several different numbers on the abacus and expand each.

**පියවර 2**
- Give groups a card with four digits on it. The guide's examples:
  ```
  ┌─────┐   ┌─────┐   ┌─────┐
  │ 1 3 │   │ 7 0 │   │ 0 8 │
  │ 8 6 │   │ 6 2 │   │ 6 3 │
  └─────┘   └─────┘   └─────┘
  ```
- Using each card's digits, form several numbers and write each in expanded
  form. The guide's worked examples:
  ```
  6 831  →  6 000 + 800 + 30 + 1
  8 613  →  8 000 + 600 + 10 + 3
  ```

**පියවර 3**
- Give students a worksheet of further expansion exercises to do alone.

---

### ක්‍රියාකාරකම 3 — 100 000 තෙක් සංඛ්‍යා කියවීම; ලිවීම
*(Reading and writing numbers up to 100 000)*

**පියවර 1** — this step contains the lesson's conceptual core.

- Write several numbers close to 9 999 in ascending order and have students
  say each number name.
- Establish the key fact explicitly:
  ```
  9 999 + 1 = 10 000   (දස දහස)
  ```
- Build the ten-thousands sequence *with* the students, saying each name:
  ```
  10 000  -  දස දහස
  20 000  -  විසි දහස
  30 000  -  තිස් දහස
     ...
  100 000 -  සියක් දහස
  ```
- Introduce **99 999 + 1 = 100 000 (සියක් දහස)**.
- **Explicit teaching point:** when writing large numbers, leave a space
  starting from the ones place, in groups of three digits, to make them
  easier to read. *(විශාල සංඛ්‍යා ලිවීමේ දී හඳුනා ගැනීමේ පහසුව සඳහා එකස්ථානයේ
  සිට වම් පැත්තට ඉලක්කම් තුනෙන් තුනට වෙන් වන බව හඳුන්වා දෙන්න.)*
- Write any number between 10 000 and 20 000 on the board and have students
  say its name together.
- Enter that number into a place-value table so students recognise place
  value — reminding them of එකස්ථානය, දහයස්ථානය, සියයස්ථානය, දහසස්ථානය.
- **Introduce දස දහසස්ථානය (the ten-thousands place).**
- Worked example given in the guide:
  > උදා : 26 147 — විසි හයදහස් එකසිය හතළිස් හත

  | දස දහසේ ඒවා | දහසේ ඒවා | සියයේ ඒවා | දහයේ ඒවා | එකේ ඒවා |
  |---|---|---|---|---|
  | 2 | 6 | 1 | 4 | 7 |

- Continue this activity with several numbers from 90 000 up to 100 000.

**පියවර 2**
- Give groups cards with numbers written on them between 10 000 and 100 000,
  plus a large sheet of paper. The guide's card examples:
  ```
  10 100    25 602    38 017    53 900    75 501
  ```
- Have students draw a place-value table on the large sheet.
- Instruct each student in the group to take one card.
- Each writes their number into the table and writes its number name in the
  number book.
- Give every student in the group a turn at taking a card and completing the
  activity.
- At the end, arrange the group's numbers in order, smallest first.

**පියවර 3**
- Give students the relevant textbook exercises to do.

---

### ක්‍රියාකාරකම 4 — 99 999ට නොවැඩි සංඛ්‍යා විහිදුවා ලිවීම
*(Writing numbers up to 99 999 in expanded form)*

**පියවර 1**
- Give students a number below 100 000. The guide's example: **68 507**
- Show it in a place-value table exactly as in the previous activity:

  | දස දහසේ ඒවා | දහසේ ඒවා | සියයේ ඒවා | දහයේ ඒවා | එකේ ඒවා |
  |---|---|---|---|---|
  | 6 | 8 | 5 | 0 | 7 |

- Explain which place each digit sits in:
  ```
  උදා :  7  →  එකස්ථානය
         6  →  දස දහසස්ථානය
  ```
- Remind them of the place value of each place:
  ```
  එකස්ථානයේ ස්ථානීය අගය   →  1
  දහයස්ථානයේ ස්ථානීය අගය  →  10
  ```
- Then make clear the value represented by the digit at each place, using
  this full table for **68 507**:

  | ඉලක්කම | ස්ථානය | ස්ථානීය අගය | ඉලක්කමෙන් නිරූපණය වන අගය |
  |---|---|---|---|
  | 6 | දස දහසස්ථානය | 10 000 | 60 000 |
  | 8 | දහසස්ථානය | 1 000 | 8 000 |
  | 5 | සියයස්ථානය | 100 | 500 |
  | 0 | දහයස්ථානය | 10 | **0** |
  | 7 | එකස්ථානය | 1 | 7 |

- Point out that this is what writing a number in expanded form means:
  ```
  උදා : 68 507  →  60 000 + 8 000 + 500 + 0 + 7
  ```
- **Key teaching point:** make clear that a number can be written in expanded
  form by *adding together the values represented by the digits at each place*
  — not by any other rule.
- Use further numbers as examples to confirm understanding.

**පියවර 2**
- Give groups a worksheet of this form:
  > **35 421 සංඛ්‍යාව පෙතක නිරූපණය කරන්න.**
  > * 4 ඉලක්කම ඇති ස්ථානය · · · · · · · · ·
  > * එහි ස්ථානීය අගය · · · · · · · · ·
  > * 4 ඉලක්කමෙන් නිරූපිත අගය · · · · · · · · ·
- Have groups swap worksheets and check each other's work.
- Then have students answer the exercises in the workbook.

---

## 3. තක්සේරු කිරීම (Assessment)

The guide gives three assessment instructions:

1. Confirm through observation during group activities whether students have
   achieved the relevant learning outcomes.
2. Provide worksheets with suitable exercises for students to do individually.
3. Use the relevant exercises in the student's textbook.

*App note:* (1) becomes the mastery model — observing correct unaided answers
across a concept. (2) and (3) are the practice items already in `content_bank`.

---

## 4. Translating the classroom to the app

Every physical activity in this guide has a board equivalent. Nothing needs to
be dropped; what changes is who performs the action.

| Guide activity | In the classroom | In the app |
|---|---|---|
| Student comes forward and sets a number on the abacus | One child at the front, class watches | Zara sets it on the animated abacus while narrating; then the child sets one themselves by tapping beads |
| Picking 4 digit cards from a table | Physical cards | DigitPickerPuzzle — tap 4 digits from a pool |
| Group worksheet: form 5 numbers from digits 1,3,6,4 | Group discussion | Board card + tap-to-answer, one number at a time |
| Drawing a place-value table on large paper | Group draws it | The place-value strip primitive draws itself as Zara names each column |
| Each student takes a number card and fills the table | Turn-taking within a group | Successive board cards; the child fills the row |
| Arranging the group's numbers smallest first | Physical cards on a desk | Drag-to-order, or tap-in-sequence on the board |
| Groups swapping worksheets to check each other | Peer marking | Zara checks and explains; the child is asked to spot the error in a deliberately wrong worked example |
| Observation during group work | Teacher walks around | Mastery model over logged answers |

The one thing that genuinely cannot be reproduced is peer interaction. The
closest substitute is the "check my working" pattern — Zara does a problem,
makes a mistake, and asks the child to find it. That is a real teaching
technique and it recovers most of what the group check-work step is for.

---

## 5. What this changes for the app's lesson design

Comparing the guide's four activities to the eight concepts currently in
`content_bank` (derived from the video):

- The guide's ordering is **activity 1 → 2 → 3 → 4**: read/write 4-digit
  numbers → place value in 4-digit numbers → extend to 100 000 → expanded
  form. This should be the concept order.
- The guide introduces **දස දහසස්ථානය** as a distinct, explicitly-taught
  moment inside activity 3. That deserves its own concept.
- The guide teaches **digit grouping in threes** as an explicit rule
  (spacing for readability). This is missing from the current concept list
  and should be added.
- The guide's worked examples are **84, 101, 528, 997, 1 3 6 4, 5 421,
  6 831, 8 613, 26 147, 68 507, 35 421** and the card numbers
  **10 100, 25 602, 38 017, 53 900, 75 501**. These are official examples
  from the government guide and are legitimate to use directly — unlike a
  recorded teacher's own invented examples.
- The **zero at a place represents 0** point (the 68 507 table makes it
  explicit) is a known misconception stop and should be taught deliberately.
