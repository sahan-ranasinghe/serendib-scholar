# Handoff: Serendib Scholar — design foundation (Maths 5·1, Session 1)

## Overview
Foundation for a Sinhala-first tutoring app for Grade 5 children in Sri Lanka: a whiteboard "board" the teacher character **Zara (සාරා)** writes on, a squirrel companion **Lena**, a primitive vocabulary the lesson engine drives beat-by-beat, and the portrait app shell (child + parent). Everything here was checked against the 126-beat storyboard `maths-5-1-session-1` — every beat is expressible with the primitives and rules in DESIGN.md.

## About the design files
These files are **design references written in HTML** (Design Components: `*.dc.html` = template + a small logic class, rendered by `support.js`). They show intended look and behaviour; they are not production code. Recreate them in the target codebase (React Native / Flutter / web — whatever the app uses), using its own component and state patterns. Read `DESIGN.md` first; it is the contract.

## Fidelity
**High-fidelity.** Colours, type, sizes, spacing, radii, shadows and states are final. Motion is specified (durations, easing, sequences) but shown as static "captured" frames — the Rive/Lottie rigs for Zara and Lena are to be built from `zara.svg` / `lena.svg` (layered, part ids) and the state sheets.

## Prompt to paste into Claude Code
> Read design_handoff_serendib_scholar/README.md and DESIGN.md fully before writing code. Then, in this repo's stack, implement (1) tokens.css as the theme (CSS variables or the equivalent token module — keep names), (2) the board primitives in components.html as reusable components with every listed state: titleCard, textCard, numberCards, digitPicker, abacus (rods, beads, glow, tray, drag), placeValueStrip, expansion, chalkText (stack of 3, append, cursor, erase), pointer, highlight (ring, underline), blankTable (two skins; filled/active/pointer states coexisting), money, choiceChips (idle/pressed/selected/correct/wrong/disabled), numberPad (2×6, 56 px), wordBank, retryButton, feedback (correct sparkle / wrong wobble / celebrate), plus stretch fractionBar and clock; (3) the session screen shell at 844×390 (28 px strip with concept stops, wood frame, content inset left 94 / right 82 / top 22 / bottom 64 or 124 with chips or 190 with a dock; Zara 64 px bottom-left, Lena 48 px bottom-right, ✋ 56 px), driven by the beat JSON's primitive events; (4) the portrait screens in Screens A/B/C. Judged answers are touch only — the microphone exists only in the ✋ chat sheet. Enforce: one glow (or one glow group) at a time; child-facing Sinhala ≥ 20 px; hit targets ≥ 56 px on child surfaces; never red for wrong; text colours from the *-text tokens on tinted grounds. Fonts: Gemunu Libre, Abhaya Libre, Yaldevi from Google Fonts. Board numerals are stroke glyphs (see StrokeNum), never a font.

## Screens / views (files)
- **Session.dc.html / Session B.dc.html** — session screen, moments M1–M10 of Appendix A plus R1 read-aloud practice, S1 correct, S2 wrong (abacus), S2b wrong (chips), P1 first-time ✋ mic explanation, S3 chat open. 844×390 landscape.
- **Session Gaps.dc.html / Session Gaps B.dc.html** — 14 frames for states the storyboard needs beyond the ten moments (chalk stack, persistent board, ten-card row, card+chalk append, numeral↔name table with word bank, digit-puzzle ledger, two-rod glow, abacus ring, rod-tap, abacus+expansion, card+chalk append, expansion alone, table with filled+active cells, chalk+chips). Each frame's label carries the beat ids.
- **components.html** — every primitive in every state, app controls (buttons, chips, cards, progress ring, concept-stop strip, path nodes, badges, number pad).
- **Characters.dc.html** — Zara face A (chosen) in 8 states + wave and 3 talking mouths, at full size and 64 px; Lena in 8 states at 132 and 48 px. Faces B/C kept for record.
- **Screens A** — splash, child home, lesson map, lesson detail, session summary (390×844).
- **Screens B** — parent onboarding ×4, parent zone ×3, six edge states.
- **Screens C** — practice hub, quiz, rewards, certificate, progress.
- **Helper components** — StrokeNum (hand-stroke numerals), Abacus, Zara, Lena (`.dc.html`): reference implementations of the primitives' geometry and state tables; port their state maps.

## Layout of the session screen
Strip 28 px teal (title 20 px Yaldevi, 8 concept stops, ⏸ ↺ ⏹, සි caption toggle). Board: wood frame 10 px, tray 22 px, board surface #F7F3EA with a 32 px grid at 7 % teal. Content inset: left 94, right 82, top 22, bottom 64 (caption line 20 px Gemunu at bottom 26); with chips at the foot bottom = 124; with a docked pad or word bank bottom = 190 and content top-aligns. Chips/docks span left 94 → right 130 (clear of ✋ at right 12, bottom 76, 56×56). Zara portrait 64 px at left 10 / bottom 6; Lena 48 px at right 14 / bottom 16. Retry button 56 px, top-right of the inset.

## Interactions & behaviour
See DESIGN.md rules 1–9 and a–h. Summary: show → spring in ≤ 600 ms (cubic-bezier(.34,1.3,.64,1)) → glow (2.4 s breathe, siblings veil to 38 %) → touch → ✓ + saffron sparkle 900 ms or wobble ±6 px/±3° 500 ms + low tone, retry button appears. Chips deal in left→right; wrong chip stays. Soft checks: no glow, no mic, Lena perks; a tap counts as engagement. Read-aloud beats: 3 s invitation (saffron step card, dot countdown, Lena alert, nothing recorded) → Zara reads the number → 3 name-chips. ✋: first tap shows P1 (Zara explains; system prompt only after "හරි"); later taps open S3 (board dims 38 %, Zara 160 px, transcript sheet, one return button). Reduced-motion: durations → 0.

## State
Per beat: board primitives present (persistent until replaced), active glow target (single or group), dock (none / chips / pad / wordBank), Zara state (idle/talking/listening/thinking/encourage/celebrate/pointing-left/pointing-right/wave; talking mouth 1–3), Lena state (idle ×3 variants/alert/peek/hop/droop-then-nudge/doze/wake/hold-flame), caption on/off, concept-stop index, answer result (none/correct/wrong). App shell: streak days, stars per lesson, badges earned, subscription state, parent PIN.

## Design tokens
All in `tokens.css` (colours incl. *-text variants and Zara/Lena skin, fonts, sizes, spacing, radii, strokes, shadows, springs, fixed dimensions).

## Assets
zara.svg, lena.svg (layered with ids), Google Fonts (Gemunu Libre 400/700, Abhaya Libre 400/500, Yaldevi 400/600; Inter for parent-zone English only). Badge/avatar art are striped placeholder slots — real illustrations pending. Textbook images were reference only and are not included.

## Copy
All Sinhala lines in session frames are verbatim from the storyboard. Drafted (needs sign-off): chip texts in Session frames where the JSON had none, chat transcript lines in S3, P1 explanation, onboarding bubbles, lesson names beyond lesson 2, avatar names, consent/subscription/report strings. Terms: ගණක රාමුව (not අබකසය); සාරා; සෙරෙන්ඩිබ් ශිෂ්‍ය.
