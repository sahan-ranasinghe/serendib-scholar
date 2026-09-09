# Serendib Scholar — Design Brief for Claude Design

You are designing the complete visual layer of **Serendib Scholar**, a Sinhala-medium AI voice tutor for Sri Lankan children preparing for the Grade 5 Scholarship exam. Nothing in this document is optional context — it is the full specification. Read all of it before designing anything.

The output must be a **high-fidelity, multi-screen HTML/CSS prototype with a shared design-token file**, exported as source so an engineering pass can adopt it directly. Static is fine; the runtime already exists. What does not exist is a design worth showing a paying parent.

---

## 1. What this product is

A child, aged 9–10, sits alone with a phone. A teacher named **Zara** talks to them in warm spoken Sinhala, in a real human voice, and teaches from the official Ministry of Education textbook and teacher's guide. A whiteboard on screen moves as she speaks — beads slide onto an abacus as she counts them, numbers write themselves, a chalk hand points at what she's naming. The child answers by speaking, by tapping and dragging things on the board, or by photographing written work. Zara checks, encourages, re-explains differently when they're stuck, and tracks what they've mastered. A parent pays Rs. 1,000 a month and gets a weekly report.

**Scope:** the app covers Grade 5 Maths first (about 35 lessons, each 6–9 sessions), then Sinhala and Environment, and later Grades 3 and 4 — roughly 140 sessions in all. Everything in this brief must therefore be a *system* that scales to lessons about fractions, time, shapes, reading and maps, not a set of screens fitted to one lesson.

It is not a video. It is not a quiz app. It is a one-to-one lesson with a teacher who happens to be on a phone.

**The competitive context:** Sri Lankan children currently learn from one-way YouTube lessons (a teacher at a whiteboard, no interaction) or expensive tuition classes. No app in Sri Lanka does this. It must look like it belongs beside Khan Academy Kids and Duolingo, not beside a school website.

---

## 2. Design principles (evidence-based, for this age)

1. **Direct manipulation.** Children learn by doing the thing. Every bead, digit and blank on the board is touchable. Show affordance — things that can be touched look liftable.
2. **Immediate, physical feedback.** Every touch gets motion and a sound. Correct: a soft chime and a sparkle that settles. Wrong: a gentle wobble and a low tone — never red, never a buzzer, never a face going sad.
3. **One thing at a time.** Attention spans at this age are 8–12 minutes. Screens are uncluttered; the board shows what's being discussed and nothing else.
4. **Big and reachable.** Touch targets ≥ 48 px. Primary actions where a thumb rests in landscape.
5. **Freedom to fail.** Nothing punitive anywhere. Retry is always offered. Progress never goes backwards visibly.
6. **Status is motivating (grades 3–5 love it).** Streaks, stars on a path, badges, a certificate to show a parent.
7. **Zara is the guide everywhere** — not just in the lesson. She greets on home, celebrates on the summary, explains the rewards.
8. **Sri Lankan, specifically.** Not generic "edtech." The examples are school bags and kottu and bus fares; the teacher wears a saree; the palette is warm; the typography is the Sinhala every child has seen on television.

---

## 3. Visual identity

### Palette
One dominant, two supporting, one accent. Warm, not corporate.

| Role | Hex | Use |
|---|---|---|
| Board white | `F7F3EA` | whiteboard surface, session background |
| Ink | `1B1B1B` | primary text |
| Deep teal | `0F4C5C` | app primary — nav, headers, primary buttons |
| Saffron | `E9B44C` | accent — highlights, stars, "your turn" glow, chalk ring |
| Coral | `D9643A` | secondary accent — streak, warmth, Zara's tone |
| Marker blue | `2F5FA6` | Zara's writing on the board |
| Success green | `3C8C5A` | correct answers, ticks (never the only signal) |
| Wood | `8B5E3C` | board frame, abacus base |
| Bead colours | `E05263` `F2A541` `3F8F5F` `4A7BD0` | thousands / hundreds / tens / ones |
| Card tint | `EEF4F5` | cards on light screens |

Dark mode is not required for v1. The session screen has its own fixed palette (the board) regardless of system theme.

### Typography — Sinhala first
All fonts are on Google Fonts, all by the Sri Lankan foundry Mooniak.

| Role | Font | Notes |
|---|---|---|
| Display / headings / board words | **Gemunu Libre** Bold | The Unicode version of FM Gemunu — the strong, friendly Sinhala face on Sri Lankan TV adverts and posters. Children recognise it. |
| Body / longer text | **Abhaya Libre** Regular/Medium | Unicode FM Abhaya, the most used Sinhala text face. Readable at 16 px. |
| Tight labels (table columns, tags) | **Yaldevi** | Condensed; for places where Gemunu is too wide. |
| Numbers on the board | a hand-drawn stroke numeral set (already exists as SVG) | Do not use a font for board numbers. |
| Latin fallback | Inter or system sans | Only for the parent zone's English bits. |

Minimum sizes: 16 px body, 20 px child-facing labels, 28 px+ for anything the child reads during a lesson. Sinhala needs generous line-height (1.5+) because of stacked vowel signs.

### Language — who reads what

This is a **Sinhala-first product**, not an English app with Sinhala lessons. The rule is by reader, not by screen:

**Sinhala only — everything the child ever sees.** Home, lesson map, lesson detail, the session, the summary, practice, quizzes, rewards, badges, certificates, progress, every button, every empty state, every error. The child is 9–10 and studies in Sinhala medium; English navigation to reach a Sinhala lesson is a barrier, and it is what would make this feel like a translated foreign app rather than a Sri Lankan one.

**Bilingual, Sinhala default with an English toggle — the parent zone only.** Onboarding, consent, subscription and billing, the weekly report, settings, support. Parents who pay online often read English comfortably, and terms like *subscription*, *billing* and *data retention* are clumsy in Sinhala. The toggle lives in the parent zone header and affects nothing the child sees.

**Numerals are Western Arabic (0–9) everywhere**, as the textbook prints them. Number *names* are Sinhala words (පන්දහස් හාරසිය විසි එක).

**English words that stay English** because Sri Lankans use them in speech and no natural Sinhala equivalent is in common use: subject names may appear as "Maths" in the parent zone, but for the child use ගණිතය. Avoid transliterated English in child-facing text.

**Typography consequences to design for:**
- Sinhala runs **20–30% wider** than English for the same meaning — size buttons and cards from the Sinhala string, never from an English mock-up.
- Stacked vowel signs need **line-height 1.5 minimum**; 1.6 for anything the child reads during a lesson.
- Never letter-space Sinhala, never all-caps it, never rely on italic for emphasis — use weight or colour.
- Every screen in this brief must be shown with **real Sinhala text**. If a label has no Sinhala yet, ask rather than filling in English.

### Motion
Spring-based, settles cleanly, nothing bounces more than once. ≤ 600 ms for board events, ≤ 300 ms for UI. Respect reduced-motion. Motion always means something — a bead lands because she counted it, a card lifts because it can be picked up.

### Visual motif
**Chalk and wood.** Hand-drawn rings, underlines and arrows; a wooden frame on the board; paper-like cards. Carry a touch of it into the app shell (a chalk-style progress path, hand-drawn stars) so the lesson and the app feel like one product. Do not use accent stripes, colour bars, or gradients.

### Sound (design intent, engineering has it)
Bead click, chalk scratch on write, soft chime, low wobble, page turn on concept change. All under 300 ms. A mute in the board's marker tray.

---

## 4. The characters — Zara the teacher, and Lena the buddy

### 4.1 Zara — the teacher
A **Sri Lankan** school teacher, about 30. Children must recognise her as one of their own teachers, so the cues must be specifically Sri Lankan, not generic South Asian:

- **Kandyan osariya saree** — the frilled pleat at the waist and the fitted jacket. This is the formal saree Sinhalese women teachers wear; it is the single strongest "Sri Lankan" cue. Purple or saffron with a thin gold border, to sit with the palette.
- Hair in a neat bun. A thin gold chain and small stud earrings. **No pottu / bindi.**
- Warm brown skin, a kind face, a genuine smile. Not doll-like, not cartoon-big-eyed. A parent should trust her; a child should like her.
- On the home screen she may carry a lanyard with a school ID, or a stack of exercise books.

Reference: the teacher in the recorded whiteboard lesson (frames supplied). Use the supplied photos of real Sri Lankan school teachers for drape, posture and colour.

**States** (a reference sheet, each pose distinct and readable at 64 px):
idle · talking (3 mouth shapes) · listening (leans in) · thinking (hand to chin) · encourage (soft nod, warm half-smile) · celebrate (small bounce, big smile) · pointing-left · pointing-right

**Animation intent** (for the animator who will rig her in Rive — design for it): idle must have **three variants** that rotate (a breath, a glance at the board, a small shift of weight) so she never loops identically; talking gestures vary by sentence type — a question tilts the head, counting taps the hand, a reveal opens the palm toward the board. Transitions ≤ 300 ms. Blink at irregular intervals.

**Sizes:** 64 px corner portrait in the lesson (head and shoulders, outside the board content); half-height on home; full on onboarding and the session summary.

Deliver as layered SVG with named parts (head, eyes, brows, mouth, arm-left, arm-right, body, saree-frill) — the runtime drops a Rive file into the same slot later.

### 4.2 Lena — the buddy (ලේනා, a three-striped palm squirrel)
The child's companion, **not** a teacher. Every Sri Lankan child has watched this squirrel from a classroom window. Small, quick, curious, with an expressive striped tail.

- Sits on the bottom edge of the whiteboard frame, on the right, opposite Zara. About 48 px. Never on the board content.
- **Reacts to the child, not to the lesson:** perks up on "your turn," peeks at the answer, does a little hop on a correct answer, a sympathetic ear-droop-then-nudge on a wrong one, dozes during long explanations and wakes when the child is asked something, holds the streak flame on the home screen.
- This is where the expressive, playful animation lives. Zara stays dignified; Lena carries the fun.
- Lena is also the collectible: outfits and hats earned in Rewards (a school cap, a cricket helmet, a Vesak lantern). Design three.

States: idle (three variants) · alert · peek · hop (celebrate) · droop-then-nudge (encourage) · doze · wake · hold-flame.

Deliver as layered SVG the same way. Design Zara and Lena together so they read as one product — same line weight, same shading logic.

## 5. Information architecture — every screen

Portrait for everything except the session, which is landscape.

### 5.1 Splash & language
Logo, Zara waving, "සිංහල" selected by default (English/Tamil later).

### 5.2 Parent onboarding (the parent does this, once)
1. Phone number → OTP (design the screens; the flow exists later)
2. Create child profile: name (Sinhala keyboard), avatar picker (8 playful avatars — animals, not photos), grade (4 / 5), school name (optional)
3. Consent screen in plain Sinhala: what is recorded (answers are transcribed; audio is never stored), what the parent sees, how to delete. A single clear "එකඟයි" button.
4. Subscription: Rs. 1,000/month, first week free; PayHere card/bank; a "for 2 children" tier. Plain, honest, no dark patterns.

### 5.3 Child home
The screen the child sees every day. Zara greets by name ("ආයුබෝවන් නිමාලි!").
- **Continue card** (dominant): "Maths · පාඩම 1 · Session 2" with a progress ring and a big "පටන් ගමු" button. One tap to the lesson.
- **Daily goal ring** (15 min) and **streak** (🔥 4 days) — small, top right.
- **Today's plan**: three tiles — continue lesson, a 3-minute practice, a review of yesterday's weak spot.
- **Subjects row**: Maths (active), Sinhala, Environment (locked "ළඟදීම" with a friendly padlock).
- **Rewards peek**: latest badge, "certificate ready" when earned.
- Bottom nav: Home · Lessons · Practice · Rewards · (Parent icon, top corner, PIN-gated).

### 5.4 Lesson map (per subject)
Not a list — a **path**. Nodes for each lesson winding down the screen, each with 0–3 stars; the current node larger and glowing saffron; locked nodes ahead in chalk outline. Tapping a node opens Lesson detail. Zara sits at the current node.

### 5.5 Lesson detail
Lesson name (සංඛ්‍යා - 1), concepts it covers as chips, estimated total time, and the **sessions list**: Session 1 ✓ (12 min), Session 2 ▶ (13 min), Session 3 🔒 … Each session shows its concepts. Big "පටන් ගමු" on the current one.

### 5.6 THE SESSION SCREEN — landscape, the heart of the product

This is the screen that must be extraordinary. Phone held sideways, 844×390 as the base.

**Layout**
- The **whiteboard fills the screen** — full width, full height under a 28 px strip. Wooden frame, faint grid, marker tray along the bottom edge with a mute icon.
- **Zara** is a 64 px round portrait anchored bottom-left, *outside* the board's content area (in the frame corner), with her state visible. When she's talking, a soft ring pulses around her. She never covers board content.
- **Top strip** (28 px): lesson name left; **concept stops** right — eight small dots for the session's concepts, the current one filled saffron, done ones green with a tiny star when mastered; a mic dot; ⏸ ↺ ⏹ controls; caption toggle.
- **"Your turn" state**: the primitive the child must touch gets a slow breathing saffron glow; the mic dot pulses; Zara switches to listening. Nothing else on screen changes — the child's eye goes to the glow.
- **Answer aids** (only when needed): a docked number pad slides up from the bottom edge for numeric answers; three tappable choice chips for name/phrase answers; a camera button for "photograph your work." All in the same chalk/paper language.
- **Captions** (optional, off by default): one line at the board's bottom edge in Gemunu Libre 20 px.
- **✋ button** bottom-right: "Zara එක්කම කතා කරන්න." Tapping it dims the board slightly, Zara grows to a larger portrait, and a "talking" sheet shows the live transcript. Ending it returns everything.

**The board primitives.** Below are the primitives Maths Lesson 1 needs. **They are the first set of many, not the full set** — the whole Grade 5 curriculum, and then Sinhala and Environment, will need roughly thirty more. Design them as *instances of a system*, so a primitive that does not exist yet can be added later and look native. See section 5.6b for the ones coming next; design the system to hold them.

| Primitive | What it is | States / events to design |
|---|---|---|
| **Abacus** | Four rods on a wooden base, labelled 1000 · 100 · 10 · 1 beneath. Four bead colours (one per rod). A bead tray to the side. | rods bare; beads landing one at a time; one rod glowing (others dim); child's number written beneath in a second colour; a bead mid-drag with a lift shadow; the number forming under the rods as they fill |
| **Place-value strip** | Five labelled columns — දස දහසේ ඒවා · දහසේ ඒවා · සියයේ ඒවා · දහයේ ඒවා · එකේ ඒවා — one digit slot each. | empty; a digit dropping into a column; a column glowing; a digit pad docked under a tapped column |
| **Expansion** | `5 421 = ▢ + ▢ + ▢ + ▢`, drawn **beneath** the abacus, never replacing it. | blanks; a value flying from its rod into its slot; a part written in marker blue with a ✎; a tapped blank awaiting the pad |
| **Digit picker** | A chalk circle holding digit tiles; a slot row above it. | pool; a tile lifting into the slot row; the built number with its Sinhala name beneath (child's in green, Zara's example in blue); tiles mid-reorder |
| **Number cards** | A row of paper cards (84 · 101 · 528 · 997), dealt in left to right. | dealing; one card ringed in chalk saffron; a card lifted on tap; cards mid-reorder by drag |
| **Chalk text** | Marker writing — a sum, a term. Numbers as hand strokes, Sinhala words wiping on. | mid-write; complete; erased by a felt sweep |
| **Pointer** | Zara's chalk hand. | resting at a target; pulsing; hidden |
| **Highlight** | A chalk ring or underline on any target. | ring; underline |
| **Money** | Rs. 1000 and Rs. 100 notes, Rs. 10 and Rs. 1 coins — stylised, not photoreal, recognisably Sri Lankan. | a stack; one item sliding aside as it's counted; running total beneath |
| **Title card** | One big heading and one emoji, chalk-drawn frame. | — |
| **Blank table** | The textbook's place-value table with blanks. | a row's cell outlined as active; a cell filled with a green ✓ (child) or blue ✎ (Zara) |
| **Feedback** | correct: chime + sparkle at the answer; wrong: gentle wobble + low tone; celebrate: one confetti burst per concept | show each |

### 5.6b The primitives still to come — design the system to hold them

Session 1 uses eleven primitives. The product needs roughly forty across the curriculum. You are not designing these now, but the **system must accommodate them without a redesign**: same board, same chalk-and-wood language, same interaction grammar (show → animate in ≤600 ms → glow when it is the child's turn → accept a touch → confirm with a tick or a wobble).

**Rest of Grade 5 Maths:** fraction bar and pie (shade parts, split, compare) · number line (jump, mark, zoom) · clock with movable hands · calendar grid · ruler and measuring tape · weighing scale and balance · money change (already have notes/coins; add "give change") · 2D shape set (drag, rotate, count sides) · 3D solids (rotate, count faces) · grid/area squares · bar chart and pictograph the child builds · Venn/sorting rings · long-division and column-arithmetic frames (carry and borrow marks) · angle and protractor · symmetry mirror · time-table grid.

**Sinhala:** syllable/letter cards (ක ා කා) · word-building tiles · a reading passage with a follow-along highlight · sentence-order strips · picture-to-word matching · handwriting stroke guide.

**Environment:** picture cards · a labelled diagram with drag-on labels · a map of Sri Lanka with tappable regions · a sorting board (living / non-living) · a simple sequence/lifecycle wheel.

**Design two of these now as proof the system stretches:** a **fraction bar** (whole, split into parts, some shaded, a part being dragged) and a **clock** (hands at a time, one hand being dragged). If they sit naturally beside the abacus with no new visual rules, the system works. Note in DESIGN.md the rules a new primitive must follow — frame, shadow, stroke weight, label style, glow state, touch affordance — so the fortieth primitive looks like the first.

**Real content to design with** (from the actual approved script — use these, not lorem ipsum):

Opening line: *ආයුබෝවන් පුතේ! අද අපි පහ ශ්‍රේණියේ ගණිත පාඩම් පටන් ගන්නවා නේද?*
Hook: *ක්‍රිකට් මැච් එකක් බලද්දී ලකුණු පුවරුවේ තියෙන අංක ඔයා කියවලා තියෙනවා නේද පුතේ?*
A question: *එතකොට ඒ පහෙන් පෙන්වන අගය කීයද පුතේ?*
A confirmation: *ඒ සංඛ්‍යාව පන්දහස් හාරසිය විසි එකයි.*
"Find my mistake": *මම අසූ හතර කියන සංඛ්‍යාව වෙන් කරලා ලිව්වා. හැබැයි මට එක තැනක පොඩි වැරැද්දක් වුණා.* (board shows `84 = 8 + 4`)
Praise: *නියමයි! ඔයා හරියටම කිව්වා!*
Miss: *හ්ම්, ඒක නෙමෙයි. ආයෙ පොඩ්ඩක් හිතලා බලන්න.*
Numbers that appear: 84, 101, 528, 997, 1 364, 5 421, 6 831, 8 613, 7 062, 26 147, 68 507.

### 5.7 Session summary
Zara full-size, celebrating. "අද ඔයා…" — what the child did in three chalk lines (concepts touched, questions answered, best moment). Stars earned drawn onto the path. Streak +1 animation. A single "හෙට ආයෙත් එන්න" close, and a smaller "තව පොඩ්ඩක්" if they want to continue.

### 5.8 Practice / Quiz hub
Cards per concept: "ස්ථානීය අගය — 3 min", each with a mastery ring. A "past paper" mode (locked, coming). A timed "challenge" mode with a friendly clock. Quiz screen: one question, the same board primitives, a progress bar of 5 dots, no time pressure by default.

### 5.9 Rewards
A **sticker book** (grid of earned badges, greyed outlines for unearned — Sri Lankan themes: elephant, peacock, lotus, kottu, tuk-tuk), **certificates** (a printable A4 preview with the child's name in Gemunu Libre, "for mastering ස්ථානීය අගය," Zara's signature), and an optional **class leaderboard** ranked on sessions completed, not scores, joinable by a code.

### 5.10 Progress (child) / Report (parent)
Child: a simple mastery map — concept names with a filled ring each, in plain Sinhala. Parent: weekly summary — minutes, sessions, concepts confident / needs work, the exact questions missed, and one Zara sentence in Sinhala ("නිමාලි දහසස්ථානය හොඳට තේරුම් ගත්තා; විහිදුවා ලිවීම තව පුරුදු වෙන්න ඕනේ").

### 5.11 Parent zone (PIN-gated, portrait, calmer palette)
Subscription & billing, weekly report, daily time limit (15/20/30 min), sound & captions, child profiles (add a second child), delete account & data, help / WhatsApp support. Sinhala by default with an English toggle in the header — the only place in the product where English is offered.

### 5.12 States & edge cases to design
Loading (Zara idle with a chalk spinner), offline ("no internet" in Sinhala with retry), session paused, "turn your phone sideways" (rotating phone illustration), permission requests (mic, camera) explained in Sinhala with Zara, error (never a stack trace; Zara apologises and offers retry).

---

## 6. Deliverables

1. **`tokens.css`** — every colour, font, size, radius, shadow, spring as a CSS variable. Engineering will import this directly.
2. **`components.html`** — every board primitive in every state listed above, **plus the two stretch primitives from 5.6b (fraction bar, clock)** as proof the system extends; buttons (primary / secondary / chip / icon), cards, the progress ring, the concept-stop strip, the path node, badges, the number pad, the choice chips, Zara in all seven states. Each labelled.
3. **Screens** as separate HTML files, all using `tokens.css`: splash, onboarding (4), home, lesson-map, lesson-detail, **session (landscape, at least 6 variants: explaining with abacus; your-turn with glow; number pad docked; correct feedback; wrong feedback; ✋ chat open)**, session-summary, practice-hub, quiz, rewards, certificate, progress, parent-zone (3), plus the edge-case states.
4. **`zara.svg`** and **`lena.svg`** — layered, named parts, plus a sheet showing every state of each.
5. **A one-page `DESIGN.md`** explaining the system: motif, spacing scale, how a new primitive should be styled, what to never do.

Portrait screens at 390×844. The session at 844×390 (and check it at 800×360, the smallest common Android).

## 7. What to avoid
Generic edtech blue; gradients; stock illustrations; anything that looks like a school website; dark mode for v1; English-first layouts; any English in child-facing screens; layouts sized from English strings; small text; anything that overlaps the board during a lesson; sad faces or red for wrong answers; more than one thing glowing at a time.

---

## Appendix A — Ten real moments to design (from the approved storyboard)

_These ten frames come from **Session 1 of Lesson 1 of Maths** — one of roughly 140 sessions across four subjects. They are here because they are real and specific, so nothing is designed against placeholder content. Treat them as worked examples of the system, not as the product's full scope: the same board will later hold fraction bars, clocks, maps and reading passages (section 5.6b)._

Each is an actual beat in Session 1. "Board" is what is on screen when the line starts; "then" is what happens during it. Design every one of these as a full session-screen frame at 844×390. Together they cover every primitive in a real state, and they are how the lesson looks second by second — the engineering runtime fires these events on the sentence boundaries of the recorded voice.

| # | Beat | Zara says | Board at start | Then | Child does |
|---|---|---|---|---|---|
| 1 | Opening | ආයුබෝවන් පුතේ! අද අපි පහ ශ්‍රේණියේ ගණිත පාඩම් පටන් ගන්නවා නේද? | empty board | title card "සංඛ්‍යා - 1" appears; Zara waves | — |
| 2 | Hook | ක්‍රිකට් මැච් එකක් බලද්දී ලකුණු පුවරුවේ තියෙන ලකුණු ඔයා කියවලා තියෙනවා නේද පුතේ? | title "සංඛ්‍යා කියවමු" | the mic opens briefly (soft check — a gentle listening cue, no glow) | may reply |
| 3 | Reading cards | මෙන්න මේ පුවරුවේ තියෙන මුල්ම සංඛ්‍යාව මොකක්ද කියලා මට කියන්න බලන්න. | four paper cards 84 · 101 · 528 · 997 dealt in a row | chalk ring draws around 84; pointer rests on it; "your turn" — mic dot pulses, Zara listens | says "අසූ හතර" |
| 4 | Building a number | මේ ඉලක්කම් වලින් ඔයා කැමති සංඛ්‍යාවක් හදලා මට කියන්න. | digit picker: chalk circle with tiles 1 · 3 · 6 · 4, empty slot row above | picker glows "your turn"; pointer parks | taps tiles into the slots; the built number and its Sinhala name write beneath in green; a ✓ to confirm |
| 5 | Find my mistake | ඔන්න පුතේ, මම අසූ හතර කියන සංඛ්‍යාව වෙන් කරලා ලිව්වා. ඒත් මගේ වැඩේ පොඩි වැරැද්දක් වුණා වගේ. මට උදව්වක් විදිහට ඒ වැරැද්ද හොයලා කියන්න පුළුවන්ද? | picker still up | chalk writes "84 = 8 + 4" in marker blue; pointer moves to 84; Zara looks thoughtful | says what's wrong — or after one miss, three tappable choice chips appear |
| 6 | Beads landing | දහසස්ථානයේ කූරට අපි පබළු එක, දෙක, තුන, හතර, පහක් දානවා. | abacus, all four rods bare, tray of beads beside | five red beads drop onto the 1000 rod one at a time as she counts; the digit 5 forms beneath the rod | watches |
| 7 | A question on the abacus | එකස්ථානයේ පබළු කීයක් තියෙනවද? | abacus showing 5 421 | the 1 rod glows, the others dim; "your turn" | says "එකක්" or drags/taps |
| 8 | Expansion beneath the abacus | ඒක පන්දහසයි. | abacus 5 421 with `5 421 = ▢ + ▢ + ▢ + ▢` drawn beneath it | the value 5000 flies from the 1000 rod down into the first slot and is written in blue with a ✎ | watches |
| 9 | The empty rod | කූරේ කිසිම පබළුවක් නෑ. ඒ නිසා එතන අගය බිංදුවයි. | abacus 7 062 — the 100 rod has no beads — expansion `7000 + ▢ + ▢ + ▢` beneath | the empty 100 rod glows; "+ 0" writes into the slot; pointer on the 0 | watches |
| 10 | The table | හයදහස් පන්සිය හැත්තෑ දෙක කියන සංඛ්‍යාවේ හයෙන් පෙන්වන අගය කීයද? | the textbook place-value table: 2 348 (worked, filled) · 6 572 · 5 024 · 8 700 · 9 605 · 7 003 | row 6 572's "value" cell outlines; the number pad docks below; pointer on 6572 | taps 6000 on the pad; cell fills with a green ✓ |

Also design these three **runtime states** on top of any of the frames above:
- **Correct** — sparkle at the answered element, soft chime, Zara celebrates (brief bounce), the praise caption line.
- **Wrong** — the element wobbles gently, low tone, Zara's encourage state (soft nod), the miss caption line. Nothing red. The retry is obvious.
- **✋ chat open** — board dims slightly, Zara enlarges to a portrait, a chat sheet with the live transcript and a "පාඩමට ආයෙත්" button.

## Appendix B — Reference images to upload alongside this brief
1. The five Grade 5 textbook pages (the visual language children already know).
2. Two or three frames from the recorded whiteboard lesson (the layout children already know).
3. The current board gallery screenshots (what exists — to improve on, not to copy).
