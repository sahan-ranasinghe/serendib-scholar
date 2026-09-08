# Script notes — Maths 5, Lesson 1, Session 1

Where the spoken line and the visual plan do not fit, in beat order. The script is unchanged; each note carries the current line, the problem, and a suggested line for review. Suggestions are authored in `script-note-suggestions.json`.

0 script notes; 8 board notes in the appendix (the words are fine, the board plan is not).

---

## Appendix — board notes (not wording)

The line is right; what the board does under it is not. These need a board-intent change, not a rewrite, and are listed separately so they are not mistaken for script edits.

### B1. `placeValue4Digit:68`, `placeValue4Digit:70`, `placeValue4Digit:71`, `placeValue4Digit:72` — board-abacus-gone

- `placeValue4Digit:68`: names rod සි but the abacus (5 421) was replaced by chalk "5 421 = 5000 +"
  > සියයස්ථානයේ තියෙන්නේ හතරක්, ඒ නිසා අගය හාරසියයයි.
- `placeValue4Digit:70`: names rod ද but the abacus (5 421) was replaced by chalk "5 421 = 5000 +"
  > ඊළඟට දහයස්ථානයේ තියෙන දෙකෙන් ලැබෙන අගය කීයද?
- `placeValue4Digit:71`: names rod ද but the abacus (5 421) was replaced by chalk "5 421 = 5000 + 400 + 20 +"
  > දහයස්ථානයේ දෙකේ අගය විස්සයි.
- `placeValue4Digit:72`: names rod එ but the abacus (5 421) was replaced by chalk "5 421 = 5000 + 400 + 20 +"
  > අන්තිමට එකස්ථානයේ තියෙන්නේ එකක්, ඒ නිසා ලැබෙන්නේ එකමයි.

**Board fix:** Keep the abacus. Stage the expansion BENEATH it (expansion.show at :67), and let each value fly from its rod into its slot as she names it: :67 දා→5000, :68 සි→400, :71 ද→20, :72 එ→1 (expansion.part_fly + part_reveal). The chalk cards at :67 and :71 should become expansion reveals, not text cards that replace the board.

_Runtime gap: the `expansion` intent replaces the board like every base board; it needs to overlay an abacus, and `part_fly` does not exist yet (see board-vocabulary.md). Until then the abacus vanishes at :67 and :68/:70/:72 talk about rods the child can no longer see._

### B2. `placeValue4Digit:78`, `placeValue4Digit:81`, `placeValue4Digit:82` — board-abacus-gone

- `placeValue4Digit:78`: names rod සි but the abacus (7 062) was replaced by card "7000"
  > ඊළඟට තියෙන සියයස්ථානයේ කූර දිහා හොඳින් බලන්නකෝ.
- `placeValue4Digit:81`: names rod ද but the abacus (7 062) was replaced by chalk "7000 + 0 + 60"
  > දහයස්ථානයේ කූර දිහා බැලුවොත් අපට පබළු හයක් පේනවා.
- `placeValue4Digit:82`: names rod එ but the abacus (7 062) was replaced by chalk "7000 + 0 + 60"
  > අවසාන කූරේ, ඒ කියන්නේ එකස්ථානයේ තියෙන්නේ පබළු දෙකයි.
- `placeValue4Digit:82`: names rod එ but the abacus (7 062) was replaced by chalk "7000 + 0 + 60"
  > එකස්ථානයේ ඒ පබළු දෙකෙන් හැදෙන අගය කීයද පුතේ?

**Board fix:** Same as 5 421: keep the 7 062 abacus from :75 and stage the expansion beneath it. :77 දා→7000, :80 සි→0 (the empty rod — the whole point of this run), :81 ද→60, :83 එ→2. The text cards '7000', '7000 + 0', '7000 + 0 + 60' and the final line become expansion reveals over the abacus.

_This is the run where the zero rod is taught; :78 says 'look at the hundreds rod' and :79 'how many beads there?' while the board shows a card reading '7000'. The abacus has to stay for those lines to make sense._

