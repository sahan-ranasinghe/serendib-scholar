# Session 1 full-pass triage — 15 Sep 2026

25 issues found in one real pass on a phone, clustered by root cause. Each cluster names the fix and the regression assertion that must exist before the cluster is closed. Batches at the end.

Severity: **P0** blocks a child from completing Session 1 · **P1** wrong but the lesson continues · **P2** cosmetic / decision.

---

## Cluster A — Identity, onboarding, restart (P0)
The app still runs on `DEV_CHILD_ID`. Onboarding routes exist but nothing routes to them; the parent zone assumes a PIN exists; there is no way to restart without a laptop.

| # | Issue | Symptom |
|---|---|---|
| 1 | Parent zone asks for a 4-digit PIN nobody set | gate shown before a PIN exists |
| 2 | No onboarding; can't set up the child | splash → home skips /onboarding because a dev child is always present |
| 3 | Can't restart a finished/skipped session; laptop reset needed every time | no restart action; resume is the only path |
| 4 | Each child/device must be separate; sharing the link with bosses must give each a clean, saved, resumable progress | identity is a single env var |

**Cause:** `getActiveChildId()` falls back to `DEV_CHILD_ID` before checking for a device-bound child. Onboarding and PIN-setup are unreachable branches.

**Fix:**
- Device-bound identity: a signed cookie `child_id` set by onboarding. Splash → no cookie → `/onboarding/1`. "Switch child" chooser on splash when a device has more than one. All reads/writes already key on `child_id`.
- `DEV_CHILD_ID` used only when `DEV_MODE=on`; never in production.
- Parent zone: no PIN set → "create a PIN" screen first; PIN change/reset from that screen.
- Lesson detail: in-progress or complete session shows **ඉතුරු ටික කරමු** (resume) and **මුල ඉඳන් ආයෙත්** (restart, confirm once). Restart clears that session's `session_log` rows for this child; `child_progress` mastery survives.
- Debug overlay (5 taps on title) gains "reset this child" — DEV_MODE only.

**Regression assertions:** fresh device → onboarding; two children on one device get separate resume points; parent zone with no PIN shows create-PIN; restart lands on beat 0 with mastery intact; production build has no code path to `DEV_CHILD_ID`.

---

## Cluster B — Timers, pause, and the inactivity ladder (P0)
Every "it skipped" during an interaction is the 12 s → 25 s ladder or a timer that survived a pause.

| # | Issue | Symptom |
|---|---|---|
| 7 | Pausing a few times makes the session jump to the end | timers keep running under pause; queued continuations fire on resume |
| 16 | Number pad closes while typing if I started late | ladder fires mid-input |
| 17 | 5-number exercise skips after one or two builds | ladder demonstrates while the child is still building |
| 6c | Number list: asks two, skips one, answers the fourth itself | ladder demonstrated; plus a script gap (see C) |
| 14 | Pad only lets me type as many digits as the answer has | max length derived from the expected answer — leaks its length and blocks a wrong-length answer |

**Cause:** the ladder clock is anchored to window-open and is never reset by child activity or frozen by pause; the pad reads `expectedAnswer.length`.

**Fix:**
- Any child interaction (tap, drag, keypress, chip press) resets the ladder clock. A surface with input in it never auto-closes or auto-advances.
- Pause freezes every timer (ladder, soft-check pause, continuation, drain poll); resume re-arms from the remaining time. Nothing queued during pause may fire on resume.
- Pad accepts up to 6 digits regardless of expected length; ⌫ always works.
- Ladder timings stay (12 s nudge, 25 s demonstrate) but only from the last interaction.

**Regression assertions (harness drills):** pause 3× at beats 5, 40, 80 → beat index unchanged and no events fire while paused; type one digit at 11 s, another at 23 s → no auto-close, no demonstrate; pad accepts "10000" on a 4-digit answer and judges it wrong normally.

---

## Cluster C — Content coverage: questions and blanks skipped (P0)
The script asks a *sample* of each exercise. A child, a parent, and the guide expect all of it.

| # | Issue | Symptom |
|---|---|---|
| 6c | Number list 84 · 101 · 528 · 997: only 84 and 101 asked | 528 and 997 never asked |
| 11 | Number ↔ name table: 6 blanks, only 2 done | :18d, :18f only |
| 17 | "Write five 4-digit numbers": stops after one or two | 3 builds scripted, ladder cuts it |
| 22 | Big place-value table (number · digit · place · value): completely skipped | it is in **Session 2** — the packer ends Session 1 mid-concept, and nothing tells the child |
| 25 | "Cover everything, every question, every blank" | coverage is by sample, not by item |

**Cause:** the authoring pass generated one or two ASKs per exercise; the session boundary is invisible; no gate checks item-level coverage.

**Fix:**
- Script additions (no new recording lines needed — reuse existing frame lines "ඊළඟ එක කියන්න බලන්න" / "ඊළඟ හිස්තැන පුරවමු"): ask every number in the list (4 readAloud), every blank in the name table (6, alternating Zara/child per MODE 2 so it stays a conversation), all five builds in the puzzle.
- Session boundary: CLOSE_SESSION says what was finished and what comes next; the summary and lesson detail show "Session 2: ස්ථානීය අගය වගුව…" so the big table is visibly *next*, not missing.
- **Coverage gate** in the dry run: every textbook item and every blank assigned to a session's concepts is either asked, Zara-demonstrated, or explicitly deferred to a named later session. Print the item ledger.

**Regression assertions:** item ledger shows 0 "not covered"; harness completes all four numbers, all six blanks, all five builds.

---

## Cluster D — Read-aloud surface: answer shown, question hidden (P0)
| # | Issue | Symptom |
|---|---|---|
| 6a | The answering screen replaces the number list, so the child can't see the question | R1 step cards replace the board instead of docking beneath it |
| 6b | Middle step card shows the correct answer before the child chooses | Zara's read-back text is rendered at step 1, and read-back precedes judging |

**Cause:** R1 was designed as "invite → Zara reads → chips." Reading the answer before the judged step gives it away; and the step cards were staged as a replacement board.

**Fix (order change):** invite (🎤 3 s, nothing recorded) → **chips (judged)** → Zara reads the number back (confirmation, composed audio). Read-back text appears only when it plays. The step cards dock beneath the persisting board (the number row stays visible with its ring). Same for every readAloud beat.

**Regression assertions:** at R1 the number row is on screen; no expected answer text is visible before judging; order invite → chips → readBack in the beat trace.

---

## Cluster E — Same-sentence events fire together (P1)
| # | Issue | Symptom |
|---|---|---|
| 15 | දහයස්ථානය and සියයස්ථානය glow at the same time | glow group |
| 21 | 5421: beads land on tens and ones together | two abacus_add on one sentence |
| 9 | "ලොකු සංඛ්‍යා" is not brought forward or highlighted when she says it | no event generated for a text-card phrase |

**Cause:** rule f (glow groups) and multi-event sentences fire simultaneously; the choreography generator only creates events for numbers/places/vocabulary, not for a text card's own words.

**Fix:** events on the same sentence fire **in order, spaced by estimated word position** (never simultaneously); a glow holds until the next begins. Update DESIGN.md rule f: "rods named in one sentence glow in sequence." Generator rule: when the sentence contains the current text card's text, highlight and pointer it.

**Regression assertions:** no two rod_glow/bead_add events with the same timestamp; opening:5 has a highlight event on "ලොකු සංඛ්‍යා".

---

## Cluster F — Rendering (P1)
| # | Issue | Symptom |
|---|---|---|
| 10 | Yellow ring is a half circle everywhere | stroke-draw regression (pathLength / scaling) |
| 23 | Green "???????" strip on a correct answer for 5421 / 6831 | tofu — a glyph rendered in a font without it (the feedback line in the StrokeNum/hand face, or ✓/◆ missing) |
| 5 | Lips don't sync; mouth only opens, no shapes | amplitude not fed from cached-clip playback; mouth is binary |

**Fix:** ring draws to full length (assert path completion); feedback text uses the Sinhala face stack, badges use glyphs the font has (assert no U+FFFD / missing-glyph via `document.fonts.check`); mouth driven by an AnalyserNode on the clip's output with three shapes, closed on silence.

**Regression assertions:** board:check measures ring completion = 100 %; harness scans every caption/feedback for tofu; lip-sync test feeds a known clip and asserts ≥ 3 distinct mouth states.

---

## Cluster G — Internal text leaked to the child (P0)
| # | Issue | Symptom |
|---|---|---|
| 12 | "kind permutation of digits 1, 3, 6, 4 … #####" spoken/shown | the give-up reveal stringified a predicate `expectedAnswer` |

**Fix:** for predicate answers the reveal composes a concrete example (first valid permutation), never the predicate. Assert no `{`, `kind`, `permutation` in any spoken or caption text (extend the existing leak validator).

---

## Cluster H — Navigation, chat, rewards (P1)
| # | Issue | Symptom |
|---|---|---|
| 8 | ~2 s latency on every tab | server round-trip per navigation |
| 24 | Two pages get stuck; the next opens inside the current | sheet/route layers not unmounting |
| 13 | ✋ doesn't connect to Live; needs several taps; must know where it is | P1 sheet on first tap (expected once), then a connect failure — diagnose on device |
| 19 | Lena outfit boxes: three identical, nothing opens | placeholders with no detail |

**Fix:** client-side navigation with prefetch, child data in a client store, skeletons, target < 200 ms; route/sheet stack fixed and a crawler added; ✋: one tap after P1, connect errors surfaced in the debug panel, a real-device chat verified with context; outfit tap opens a detail sheet ("earn by …", distinct labels).

**Regression assertions:** dead-control crawler visits every route and clicks every control — every one navigates or changes state; tab navigation median < 200 ms; chat opens on tap 1 after P1 and the reply references the current board.

---

## Cluster I — Naming and labels (P2, decisions)
| # | Issue |
|---|---|
| 18 | "නිවස" for the home tab reads oddly |
| 20 | "සෙරෙන්ඩිබ් ශිෂ්‍ය" must go from the app; Serendib stays only in infra |

**Decisions needed (see below).** Then: `APP_NAME_SI` token used everywhere; tab labels from one copy file.

---

## Batches

| Batch | Clusters | Issues | Why this order |
|---|---|---|---|
| 1 | A, G | 1 2 3 4 12 | can't test anything reliably without identity + restart; the leak is a child-facing embarrassment |
| 2 | B, D | 7 16 17 14 6a 6b | every "skip" during interaction; the answer-reveal flaw |
| 3 | C, E | 6c 11 22 25 15 21 9 | coverage + sequencing — changes the script and storyboard, so after B is stable |
| 4 | F, H, I | 10 23 5 8 24 13 19 18 20 | rendering, navigation, chat, names, plus the crawler and coverage gates that stop this recurring |
