# Serendib Scholar — DESIGN.md (foundation pass)

## Motif
Chalk and wood. The board is a warm off-white (#F7F3EA) with a faint teal grid inside a wooden frame; everything on it is either **paper** (things the child can pick up), **wood** (structure: abacus base, tray, frame), or **chalk / marker** (Zara's writing, rings, arrows). The app shell borrows a touch of it: paper cards, a chalk path, hand-drawn stars. No gradients, no accent stripes, no colour bars.

## Palette (tokens.css)
Board #F7F3EA · Ink #1B1B1B · Teal #0F4C5C · Saffron #E9B44C · Coral #D9643A · Marker blue #2F5FA6 · Success green #3C8C5A · Wood #8B5E3C · Card #EEF4F5 · Beads #E05263 / #F2A541 / #3F8F5F / #4A7BD0.
Derived only by tinting these (paper #FFFDF8, saffron-soft #FBEFD3, success-soft #DFF0E4, wood-dark #6B4528, ink at 70/40/18/10 %).
Zara skin: base #D29A6A, shade #B27A4E, highlight #EDC094, blush #E0805A. Lit from the upper left.

## Type
Gemunu Libre 700 for headings, board words, buttons, captions (≥ 20 px, ≥ 28 px for board words). Abhaya Libre for body (≥ 16 px). Yaldevi 600 for labels under primitives and table columns (20 px). Line-height 1.5 minimum, 1.6 for anything read during a lesson. Never letter-space, never all-caps, never italic Sinhala. **Board numerals are stroke glyphs (StrokeNum), never a font.**

## Spacing
4-base: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Radii 6 (wood) · 12 (paper, buttons) · 20 (cards) · pill.

## The rules a new primitive must follow (so #40 looks like #1)
1. **Frame** — a primitive is paper on the board: #FFFDF8, radius 12, 2 px border at ink-18 %, shadow `0 2px 0 #D8D1C2, 0 6px 14px rgba(27,27,27,.08)`. Structure (bases, rims, rods) is wood (#8B5E3C) with a wood-dark underside; hands, rods and sticks are wood-dark strokes.
2. **Stroke weight** — chalk strokes are 3 px (rings/underlines 3.5 px), round caps and joins, a slight wobble in the path. Numerals 3.2 px. Dashed slots 3 px at ink-40 %.
3. **Who wrote it** — Zara's marks are marker blue with a ✎ badge; the child's are success green with a ✓ badge. Ink for neutral content the child reads. Nothing is ever red.
4. **Labels** — Yaldevi 600 20 px at ink-70 %, always *beneath* the primitive, never inside it. Sinhala words on the board are Gemunu Libre ≥ 28 px.
5. **Glow (your turn)** — judged answers are TOUCH ONLY (tap a chip, tap the pad, drag). The mic never opens in a lesson; it exists only inside the ✋ chat, by the child’s choice. The one element to touch gets `0 0 0 4px saffron, 0 0 24px 6px saffron-glow` breathing over 2.4 s and a saffron-soft fill; every sibling is veiled to 38 % opacity. Only one glow on screen. Zara switches to encourage; soft (unjudged) checks have no glow — Lena perks up instead.
6. **Touch affordance** — anything liftable is paper with a 2 px hard shadow; a lifted item translates up 6–12 px, rotates 3–5°, and gets `0 14px 20px rgba(27,27,27,.22)`. Hit areas ≥ 56 px on child surfaces (48 px floor elsewhere) even when the drawn thing is smaller (beads are 36×14 with a 48 px hit ring; the clock hand has a 48 px grip ring).
7. **Motion grammar** — show → animate in ≤ 600 ms with one overshoot (cubic-bezier(.34,1.3,.64,1)) → glow when it is the child's turn → accept a touch → confirm with a green ✓ + sparkle (saffron diamonds, 900 ms) or a gentle wobble (±6 px, ±3°, 500 ms) + low tone. UI motion ≤ 300 ms. Respect reduced-motion.
8. **Choice chips** — 2–4 paper pills, 56 px tall, 24 px Gemunu, centred along the foot of the board; appear from the start on why / find-my-mistake / name questions. Wrong chip wobbles and stays; a ↺ ආයෙත් උත්සාහ කරන්න button (56 px, top-right of the board) appears in every wrong state.
9. **Placement** — content lives inside the board inset (left 94, right 82, top 22, bottom 64 with captions); Zara (64 px, bottom-left) and Lena (48 px, bottom-right) sit on the frame and never over content.

## Never
Red for wrong · sad faces · buzzers · more than one glow · text under 20 px on a child surface · English on a child surface · fonts for board numerals · labels inside primitives · gradients · anything covering the board during a lesson · sizing from an English string.

## Characters
Names: Zara = සාරා. Wordmark stays Latin “Serendib Scholar”; Sinhala rendering where needed: සෙරෙන්ඩිබ් ශිෂ්‍ය (neutral — the scholar is the child).
Zara: original Sri Lankan teacher, Kandyan osariya (saffron jacket, purple drape with gold border, waist frill), bun, gold studs and chain, no pottu. Flat fills with one warm shade and three highlights; features in 3–4.5-unit strokes; face must read at 64 px from silhouette + brows + mouth. Layered SVG parts: bun, body, saree-skirt, saree-frill, arm-left, arm-right, head, face, face-shade, hair, brows, eyes, mouth. Talking = saffron ring on the portrait.
Lena: three-striped palm squirrel, same fill logic, faces the board from the bottom-right. Carries the playful motion; Zara stays dignified.

## Files
tokens.css · Components.dc.html · Characters.dc.html · Session.dc.html (M1–M7) · Session B.dc.html (M8–M10, R1 read-aloud, S1 correct, S2 wrong, S2b wrong-on-chips, P1 first ✋, S3 chat) · Session Gaps.dc.html + Session Gaps B.dc.html (14 gap frames from the 126-beat walk) · Screens A.dc.html (splash, home, lesson map, lesson detail, summary) · Screens B.dc.html (onboarding ×4, parent zone ×3, edge states ×6) · Screens C.dc.html (practice, quiz, rewards, certificate, progress) · zara.svg · lena.svg (layered, ids = rig parts) · helper DCs: StrokeNum, Abacus, Zara, Lena

Engineering note: ⏸ ↺ ⏹ in the 28 px strip need a 56 px hit area extended into the board frame.

## App shell rules (portrait, 390×844)
Child screens: board-white ground, Gemunu display, paper cards (r16–20, 2 px ink-10 border), teal primary button 56–60 px with a 3 px teal-dark shadow edge, bottom nav 84 px with four Sinhala labels, Zara 64 px portrait top-right or greeting top-left, Lena holds the streak flame. Parent screens: paper-white ground, teal headings, Abhaya body at 16–18 px, the සිං | EN toggle in the header, coral only for destructive actions.

## Board rules added after the 126-beat walk (Session Gaps.dc.html)
a. **Chalk stack** — up to three chalk lines stack top-down; newest at 100 %, older at 60 %; a fourth pushes the oldest off with a felt sweep.
b. **Persistent board** — cards, the abacus and the title card stay while chalk is written beside or beneath them; only a show event of the same primitive replaces them. Non-focus items dim to 60 %.
c. **Rod-tap** — surface "rod": each rod is a 48 px-wide hit column (invisible) and the same three chips are offered at the foot; either answers.
d. **Ten-card row** — numberCards with 10 values uses 56 px cards in one row; the four drawn cards lift out at 72 px and the row veils to 50 %.
e0. **Number pad** — two rows of six 56×56 keys (1–5 ⌫ / 6–0 ✓), docked at the foot; content inset bottom becomes 190 px while docked.
e1. **Word bank** — name cells are answered from a per-row bank of 4 correct words + 2 distractors (56 px tiles, tapped in order, used tiles veil). Sinhala number names are fused forms (හයදහස්, පහළොව, එකසියය), so no morpheme pad can compose them.
e. **Table skins** — the place-value table (5 columns) and the numeral ↔ name table (2 columns) share one skin. A name cell docks the word bank (e1) instead of the digit pad; while any dock is present the table shows 3–4 rows and scrolls the active row into view. Filled (✓/✎), active (glow + caret) and pointer states may coexist in one table.
f. **Glow group (confirmed)** — rods named in the same sentence glow together as one gesture; never two unrelated things.
g. **Ring an abacus** — highlight.circle on a number the abacus shows rings the whole frame.
h. **Expansion alone** — on the worksheet card the expansion stands without the abacus; slots are 80×56, the next blank glows.

## Text-colour rule
Saffron, coral and success green are never used as text colour on tinted grounds; use --color-saffron-text / --color-coral-text / --color-success-text (≥ 4.5:1). The bright versions are for fills, dots, rings and ✓ badges only.

## Product resolutions (recorded 2026-09-11, Integration A/B)
- **M7 keeps rule c.** A rod question (surface "rod") is answered by a rod tap or one of the three chips at the foot; no number pad docks under the rod. The M7 frame's docked pad is superseded by rule c.
- **Chips inset is 124.** With chips at the foot the content inset's bottom is 124 px as the README says. The exported session frames were rendered with 190 (their frame data sets `contentBottom` twice and the later 190 wins) — a data quirk, not the rule.
- **M8 / M9: the expansion is the expansion primitive beneath the persisting abacus.** An expansion event (show, part_fly, part_reveal) produces the slot primitive under the abacus and each value flies from its rod into its slot; a bare rod's 0 is written with the rod glowing. Rule b (persistent board) governs chalk events only.

