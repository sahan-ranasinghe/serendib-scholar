/**
 * What the ✋ chat knows — everything the child can see, and how Zara teaches.
 *
 * Minted into the Live session's system prompt (see /api/gemini-session).
 * Since 18 Sep 2026 (the device walk, issues 10 and 11) the chat is given
 * the WHOLE picture, not just the beat:
 *
 *   subject · lesson · session          where in the syllabus this sitting is
 *   concept + objective                 what is being taught right now
 *   boardState                          EVERY primitive on the board, every value, what is glowing,
 *                                       what is ringed / pointed at, what is filled and by whom,
 *                                       the chips, the child's entry, whether their turn is open
 *   recentBeats · nextLine              the last few lines she said, and the next one
 *   recentAnswers                       what the child answered lately, right or not
 *   weakestConcept                      where they have missed most
 *   address · vocabularyAllowed/Later   how she addresses them; which official terms are in play
 *   TEACHING_INSTRUCTIONS               the style card's register, what she may and may not do,
 *                                       the vocabulary rule, never ahead, never an invented number,
 *                                       Sinhala only
 *
 * She does NOT open by narrating where they are. A child on the same screen
 * may ask about many different things: she simply answers the question,
 * using the board (and the pointer / highlight tools) when it helps.
 *
 * No React here — the chat-check harness builds the same context offline.
 */
import type { StageState } from "@/lib/choreography";
import type { Target } from "@/components/board/events";
import { formatNumber } from "@/components/board/tokens";
import { DESIGN_CONCEPTS, VOCABULARY_INTRODUCED_BY } from "@/lib/lessonDesign";

export interface ChatAnswer {
  question: string;
  answer: string;
  correct: boolean;
}

export interface ChatContext {
  subject: string;
  lesson: string;
  /** Which sitting of the lesson this is ("සැසිය 1"). */
  session: string;
  concept: { tag: string; title: string; objective: string };
  /** The last few lines she said, oldest first. */
  recentLines: string[];
  nextLine: string | null;
  /** The board in one Sinhala sentence (kept for logs and the short view). */
  board: string;
  /** The FULL board: one line per thing on it — every primitive, every value, glow, ring, pointer, fills (and whose), chips, entry, turn. */
  boardState: string[];
  /** The thing the lesson itself is on right now (the active cell, the glowing rod). One of many things they may ask about — never her opening line. */
  boardFocus: string | null;
  recentAnswers: ChatAnswer[];
  weakestConcept: string | null;
  /** How she addresses this child (the {address} token, resolved). */
  address: string;
  /** Official terms already introduced — hers to use. */
  vocabularyAllowed: string[];
  /** Official terms the lesson has NOT reached — she does not use or teach them yet. */
  vocabularyLater: string[];
}

/** The fields the chat is given, in the order the prompt prints them — printed by the harnesses as "the chat context field list". */
export const CHAT_CONTEXT_FIELDS = [
  "subject",
  "lesson",
  "session",
  "concept.title",
  "concept.tag",
  "concept.objective",
  "boardState (every primitive · every value · glow · ring · pointer · fills by whom · chips · entry · turn)",
  "boardFocus",
  "recentBeats (last 5 lines)",
  "nextLine",
  "recentAnswers (last 4, right or not)",
  "weakestConcept",
  "address",
  "vocabularyAllowed",
  "vocabularyLater",
  "teachingInstructions (register · may / may not · vocabulary rule · never ahead · never invents numbers · Sinhala only)",
] as const;

/** Which official terms are in play at `conceptTag`: introduced by it or an earlier concept → allowed; by a later one → later. */
export function vocabularyAt(conceptTag: string): { allowed: string[]; later: string[] } {
  const order = DESIGN_CONCEPTS as readonly string[];
  const here = order.indexOf(conceptTag);
  const allowed: string[] = [];
  const later: string[] = [];
  for (const [term, introducedBy] of Object.entries(VOCABULARY_INTRODUCED_BY)) {
    // An unknown tag (the opening, a framing beat) is before everything: nothing has been introduced yet.
    if (here >= 0 && order.indexOf(introducedBy) <= here) allowed.push(term);
    else later.push(term);
  }
  return { allowed, later };
}

const ROD_NAMES = ["දහසස්ථානය", "සියයස්ථානය", "දහයස්ථානය", "එකස්ථානය"];

/** The board as a sentence a Sinhala-speaking tutor would say. */
export function serializeStage(stage: StageState): string {
  const base = stage.base;
  const parts: string[] = [];
  if (!base) parts.push("පුවරුව හිස්");
  else {
    switch (base.kind) {
      case "abacus": {
        const shown = base.shown.join("");
        const complete = base.shown.every((n, i) => n >= (base.digits[i] ?? 0));
        parts.push(`ගණක රාමුවේ ${complete ? formatNumber(base.digits.join("")) : `පබළු ${shown} (හදන්නේ ${formatNumber(base.digits.join(""))})`}`);
        if (base.glowRods.length) parts.push(`${base.glowRods.map((r) => ROD_NAMES[r] ?? "කූරක්").join(" සහ ")} දැන් පෙන්වනවා`);
        if (base.expansion) parts.push(`යටින් ${formatNumber(base.expansion.number)} = ${base.expansion.parts.map((p) => (p === null ? "▢" : formatNumber(p))).join(" + ")}`);
        if (base.childAnswer) parts.push(`ළමයාගේ උත්තරය ${base.childAnswer}`);
        break;
      }
      case "numberCards":
        parts.push(`කාඩ්පත් ${base.values.map((v) => formatNumber(v)).join(" · ")}${base.ringed !== null ? ` (${formatNumber(base.ringed)} වටේ රවුමක්)` : ""}`);
        break;
      case "chalk":
        parts.push(`පුවරුවේ ලියලා තියෙනවා: ${base.lines.map((l) => l.text).join(" / ")}`);
        break;
      case "textCard":
        parts.push(`කාඩ් එකක "${base.text}"`);
        break;
      case "titleCard":
        parts.push(`මාතෘකාව "${base.title}"`);
        break;
      case "digitPicker":
        parts.push(`ඉලක්කම් තෝරන රවුමේ ${base.pool.join(", ")}${base.built ? `; හදපු සංඛ්‍යාව ${base.built}${base.builtName ? ` (${base.builtName})` : ""}` : ""}`);
        break;
      case "expansion":
        parts.push(`${formatNumber(base.expansion.number)} = ${base.expansion.parts.map((p) => (p === null ? "▢" : formatNumber(p))).join(" + ")}`);
        break;
      case "blankTable":
        parts.push(
          `වගුවක් (${base.columns.map((c) => c.label).join(" | ")}), පේළි ${base.rows.length}${base.activeBlank ? `; දැන් අහන්නේ ${base.activeBlank.row + 1} වෙනි පේළියේ ${base.columns.find((c) => c.key === base.activeBlank!.field)?.label ?? base.activeBlank.field}` : ""}`,
        );
        break;
      case "placeValueStrip":
        parts.push(`ස්ථානීය අගය තීරුව ${base.digits.map((d) => d ?? "▢").join(" ")}`);
        break;
      case "money":
        parts.push("මුදල් නෝට්ටු සහ කාසි");
        break;
      case "legacy":
        parts.push(`පොතේ පිටුවක් (${base.content.type})`);
        break;
    }
  }
  if (stage.notes.length) parts.push(`පැත්තකින් ලියලා: ${stage.notes.map((n) => n.text).join(", ")}`);
  return parts.join("; ");
}

/** A pointer / highlight target, named in Sinhala against the board it sits on. */
function describeTarget(target: Target, base: StageState["base"]): string | null {
  if ("cell" in target && base?.kind === "blankTable") {
    const label = base.columns.find((c) => c.key === target.cell.field)?.label ?? target.cell.field;
    return `වගුවේ ${target.cell.row + 1} වෙනි පේළියේ "${label}" කොටුව`;
  }
  if ("rod" in target) return `ගණක රාමුවේ ${ROD_NAMES[target.rod] ?? "කූරක්"} කූර`;
  if ("card" in target) return `${formatNumber(target.card)} කාඩ්පත`;
  if ("number" in target) return `${formatNumber(target.number)} කියන සංඛ්‍යාව`;
  if ("digit" in target) return `${target.digit} ඉලක්කම`;
  if ("column" in target) return `${ROD_NAMES[target.column] ?? "ස්ථානයක්"}`;
  if ("part" in target) return `විහිදුවා ලිවීමේ ${target.part + 1} වෙනි කොටස`;
  if ("text" in target) return `පුවරුවේ "${target.text}"`;
  return null;
}

/**
 * The ONE concrete thing on the board right now — what a child asking
 * "මොකද්ද මේ?" is pointing at. The active blank comes first (it is the
 * question they are stuck on), then whatever is ringed or pointed at,
 * then the glowing rod, then the thing the board is built around.
 */
export function boardFocus(stage: StageState): string | null {
  const base = stage.base;
  if (!base) return null;

  if (base.kind === "blankTable" && base.activeBlank) {
    const label = base.columns.find((c) => c.key === base.activeBlank!.field)?.label ?? base.activeBlank.field;
    const row = base.rows[base.activeBlank.row];
    const known = row
      ? base.columns
          .filter((c) => c.key !== base.activeBlank!.field && row[c.key] !== null && row[c.key] !== undefined)
          .map((c) => `${c.label} ${typeof row[c.key] === "number" ? formatNumber(row[c.key] as number) : String(row[c.key])}`)
          .join(", ")
      : "";
    return `වගුවේ ${base.activeBlank.row + 1} වෙනි පේළියේ හිස් "${label}" කොටුව${known ? ` (ඒ පේළියේ ${known})` : ""}`;
  }

  if (stage.highlight) {
    const what = describeTarget(stage.highlight.target, base);
    if (what) return `${what} (${stage.highlight.kind === "circle" ? "වටේ රවුමක් ඇඳලා" : "යටින් ඉරක් ඇඳලා"})`;
  }

  if (base.kind === "abacus") {
    const shownNumber = base.shown.every((n, i) => n >= (base.digits[i] ?? 0)) ? formatNumber(base.digits.join("")) : null;
    const glow = base.glowRods.length ? base.glowRods.map((r) => ROD_NAMES[r] ?? "කූරක්").join(" සහ ") : null;
    if (glow) return `ගණක රාමුවේ${shownNumber ? ` ${shownNumber} ` : " "}${glow} කූර (දැන් දිලිසෙනවා)`;
    if (base.childAnswer) return `ගණක රාමුව ළඟ ලියලා තියෙන "${base.childAnswer}"`;
    return shownNumber ? `ගණක රාමුවේ තියෙන ${shownNumber}` : `ගණක රාමුව (හදන්නේ ${formatNumber(base.digits.join(""))})`;
  }

  if (stage.pointer && !stage.parked) {
    const what = describeTarget(stage.pointer, base);
    if (what) return what;
  }

  switch (base.kind) {
    case "numberCards":
      return base.ringed !== null ? `රවුම් කරලා තියෙන ${formatNumber(base.ringed)} කාඩ්පත` : `කාඩ්පත් ${base.values.map((v) => formatNumber(v)).join(" · ")}`;
    case "digitPicker":
      return base.built
        ? `ඉලක්කම් වලින් හදපු ${formatNumber(base.built)}`
        : `ඉලක්කම් තෝරන රවුමේ ${base.pool.join(", ")} (ඒවායින් සංඛ්‍යාවක් හදන්න)`;
    case "expansion": {
      const blank = base.expansion.parts.findIndex((part) => part === null);
      return blank >= 0
        ? `${formatNumber(base.expansion.number)} විහිදුවා ලිවීමේ ${blank + 1} වෙනි හිස් තැන`
        : `${formatNumber(base.expansion.number)} = ${base.expansion.parts.map((p) => (p === null ? "▢" : formatNumber(p))).join(" + ")}`;
    }
    case "placeValueStrip": {
      const blank = base.digits.findIndex((d) => d === null);
      return blank >= 0 ? `ස්ථානීය අගය තීරුවේ ${blank + 1} වෙනි හිස් කොටුව` : `ස්ථානීය අගය තීරුවේ ${base.digits.map((d) => d ?? "▢").join(" ")}`;
    }
    case "blankTable":
      return `වගුව (${base.columns.map((c) => c.label).join(" | ")}), පේළි ${base.rows.length}`;
    case "chalk":
      return base.lines.length ? `පුවරුවේ ලියලා තියෙන "${base.lines[base.lines.length - 1]!.text}"` : null;
    case "textCard":
      return `කාඩ් එකේ "${base.text}"`;
    case "titleCard":
      return `මාතෘකාව "${base.title}"`;
    case "money":
      return "මුදල් නෝට්ටු සහ කාසි";
    case "legacy":
      return `පොතේ පිටුව (${base.content.type})`;
    default:
      return null;
  }
}

/**
 * THE FULL BOARD, one line per thing on it (issue 10): every primitive, every value, what is glowing, what is ringed or
 * pointed at, what is filled and BY WHOM, the chips on offer, what the child has just entered, and whether their turn is
 * open. Target keys (rod:1, cell:2/place, number:5421 …) are given so she can aim point_at / highlight_board at anything.
 */
export function fullBoardState(stage: StageState): string[] {
  const out: string[] = [];
  const base = stage.base;
  const expansionLine = (e: { number: number; parts: Array<string | null>; answered?: Array<string | null> }) =>
    `විහිදුවා ලිවීම [number:${e.number}]: ${formatNumber(e.number)} = ${e.parts.map((part, i) => (part === null ? `▢ (හිස් — part:${i})` : `${formatNumber(part)} (part:${i})`)).join(" + ")}`;
  if (!base) out.push("පුවරුව හිස් — මුකුත් ඇඳලා නෑ.");
  else {
    switch (base.kind) {
      case "abacus": {
        const complete = base.shown.every((n, i) => n >= (base.digits[i] ?? 0));
        out.push(`ගණක රාමුව [text:abacus${complete ? ` · number:${Number(base.digits.join(""))}` : ""}] — ${complete ? `පෙන්වන සංඛ්‍යාව ${formatNumber(base.digits.join(""))}` : `තවම හදනවා: ${formatNumber(base.digits.join(""))} හදන්නයි යන්නේ`}.`);
        base.digits.forEach((digit, rod) => {
          const place = ROD_NAMES[ROD_NAMES.length - base.digits.length + rod] ?? "කූර";
          const value = (base.shown[rod] ?? 0) * 10 ** (base.digits.length - 1 - rod);
          out.push(`  · ${place} කූර [rod:${rod}]: පබළු ${base.shown[rod] ?? 0}${(base.shown[rod] ?? 0) < digit ? ` (${digit}ක් වෙනකම් දානවා)` : ""} — අගය ${formatNumber(value)}${base.glowRods.includes(rod) ? " — දැන් දිලිසෙනවා" : ""}${base.answerRod === rod && base.childAnswer ? ` — යටින් ළමයා දුන්න උත්තරය ${base.childAnswer}` : ""}`);
        });
        if (base.childAnswer && (base.answerRod === null || base.answerRod === undefined)) out.push(`  · ගණක රාමුව යටින් ළමයා ලියපු උත්තරය: ${base.childAnswer}`);
        if (base.expansion) out.push(`  · යටින් ${expansionLine(base.expansion)}`);
        break;
      }
      case "numberCards":
        out.push(`සංඛ්‍යා කාඩ්පත් පේළියක්: ${base.values.map((v) => `${formatNumber(v)} [card:${v}]`).join(" · ")}.`);
        if (base.ringed !== null) out.push(`  · ${formatNumber(base.ringed)} කාඩ්පත වටේ රවුමක් ඇඳලා.`);
        if (base.drawn?.length) out.push(`  · පේළියෙන් ඇදලා ගත්ත කාඩ්පත්: ${base.drawn.join(", ")}${base.made ? ` → හැදුණ සංඛ්‍යාව ${formatNumber(base.made)}` : ""}.`);
        break;
      case "chalk":
        base.lines.forEach((line, i) => out.push(`${i === 0 ? "පුවරුවේ හුණුවෙන් ලියලා" : "  ·"} [text:${line.text}]: ${line.text}`));
        break;
      case "textCard":
        out.push(`කාඩ් එකක ලියලා [text:${base.text}]: ${base.text}`);
        break;
      case "titleCard":
        out.push(`මාතෘකා කාඩ් එක: ${base.title}${base.cards?.length ? ` — පැත්තකින් කාඩ්: ${base.cards.join(" / ")}` : ""}`);
        break;
      case "digitPicker":
        out.push(`ඉලක්කම් කාඩ්පත් [text:picker]: ${base.pool.map((d) => `${d} [digit:${d}]`).join(", ")} — මේවායින් සංඛ්‍යාවක් හදනවා.`);
        if (base.built) out.push(`  · හදලා තියෙන සංඛ්‍යාව: ${formatNumber(base.built)}${base.builtName ? ` (${base.builtName})` : ""} — හැදුවේ ${base.builtBy === "child" ? "ළමයා" : "සාරා"}.`);
        if (base.puzzle || base.ledger.length) out.push(`  · ළමයා මෙතෙක් හදපු සංඛ්‍යා: ${base.ledger.length ? base.ledger.map((n) => formatNumber(n)).join(", ") : "තවම නෑ"} (පහක් හදන්න ඕනේ).`);
        break;
      case "expansion":
        out.push(expansionLine(base.expansion));
        break;
      case "blankTable": {
        out.push(`පොතේ වගුව [text:table] — තීරු: ${base.columns.map((c) => c.label).join(" | ")}.`);
        base.rows.forEach((row, r) => {
          const cells = base.columns.map((column) => {
            const fill = base.filled.find((f) => f.row === r && f.field === column.key);
            const printed = row[column.key];
            const active = base.activeBlank?.row === r && base.activeBlank.field === column.key;
            const text = fill ? `${fill.value} (${fill.by === "child" ? "ළමයා පිරෙව්වා ✓" : "සාරා ලිව්වා"})` : printed !== null && printed !== undefined ? `${printed} (පොතේ මුද්‍රිතයි)` : active ? "▢ හිස් — දැන් අහන්නේ මේ කොටුව" : "▢ හිස්";
            return `${column.label}: ${text} [cell:${r}/${column.key}]`;
          });
          out.push(`  · ${r + 1} වෙනි පේළිය — ${cells.join("; ")}`);
        });
        break;
      }
      case "placeValueStrip":
        out.push(`ස්ථානීය අගය තීරුව: ${base.digits.map((d, i) => `${d ?? "▢"} [column:${i}]`).join(" ")}${base.glowColumn !== null ? ` — ${base.glowColumn + 1} වෙනි තීරුව දිලිසෙනවා` : ""}.`);
        break;
      case "money":
        out.push(`මුදල්: ${base.items.map((item) => `රු. ${item.denomination} × ${item.count}`).join(", ")} — ගණන් කරලා තියෙන්නේ ${base.counted}.`);
        break;
      case "legacy":
        out.push(`පොතේ පිටුවක් (${base.content.type}).`);
        break;
    }
  }
  for (const note of stage.notes) out.push(`පැත්තකින් හුණුවෙන් ලියලා [text:${note.text}]: ${note.text}`);
  if (stage.highlight) out.push(`${stage.highlight.kind === "circle" ? "වටේ රවුමක් ඇඳලා තියෙන්නේ" : "යටින් ඉරක් ඇඳලා තියෙන්නේ"}: ${describeTarget(stage.highlight.target, base) ?? "—"}.`);
  if (stage.pointer) out.push(`සාරාගේ අත පෙන්නන්නේ: ${describeTarget(stage.pointer, base) ?? "—"}.`);
  if (stage.chips) out.push(`තෝරන්න දීලා තියෙන උත්තර තුන: ${stage.chips.options.join(" | ")}. (හරි එක ළමයාට කියන්න එපා.)`);
  if (stage.entry) out.push(`ළමයා දැන් දුන්න උත්තරය: ${stage.entry.value} — ${stage.entry.verdict === "correct" ? "හරි" : stage.entry.verdict === "wrong" ? "වැරදියි" : "තවම බැලුවේ නෑ"}.`);
  out.push(stage.turn ? `දැන් ළමයාගේ වාරය — ප්‍රශ්නයකට උත්තර දෙන්න ඉන්නේ (${stage.turn.answerMode}).` : stage.retry ? "ළමයා වැරදි උත්තරයක් දුන්නා; ආයෙත් උත්සාහ කරන්න බොත්තම තියෙනවා." : "දැන් සාරා උගන්වන වෙලාව (ප්‍රශ්නයක් අහලා නෑ).");
  return out;
}

/**
 * HOW ZARA TEACHES — the chat's standing instructions (issue 10). The register is the style card's
 * (docs/design/style-card.md — descriptive only, no line of the recorded teacher's); the rest are the lesson's own rules.
 */
export const TEACHING_INSTRUCTIONS = `HOW YOU TEACH (these rules override anything earlier in this prompt)
- REGISTER (the style card): warm, unhurried SPOKEN Sinhala — one adult beside one ten-year-old. Colloquial verb endings and connectors (ඉතින්, ඔන්න, දැන්, එහෙනම්); never written-register prose. Short sentences, one idea each. Soft tag questions (…නේද?). Address the child in the singular with the address form given below, and ඔයා — never a classroom plural.
- SINHALA ONLY. Not one English word, no Singlish, no Latin letters — numerals and symbols are the only exception. If the child speaks English, answer in Sinhala.
- NUMBERS: say a number as its full Sinhala name in the textbook's convention, never digit by digit. NEVER invent a number. Every number you say must already be on the board, in the lines above, or in the child's own question — if you need an example, use one from the board.
- VOCABULARY RULE: use the official terms listed under "may use" exactly as written. Do not use, explain or hint at the terms listed under "not yet" — the lesson introduces them later.
- NEVER TEACH AHEAD and never start a new topic. If they ask about something the lesson has not reached, say warmly that the lesson will get there, and come back to what is on the board.
- YOU MAY: answer a question about ANYTHING currently on the board — any rod, any cell, any card, any chalk line, the chips, the pointer, the ring, what they or you filled in — not only the thing the lesson is on right now. Re-explain it a different way. Point at it (point_at) or ring it (highlight_board) while you explain; the target keys are in the board list. Reassure.
- YOU MAY NOT: give away the answer to a question that is still open (their turn, an empty cell that is being asked, the chips) — help them think instead. Change the board's content. Judge or grade them. Talk about anything unsuitable for a ten-year-old.
- DO NOT NARRATE WHERE THEY ARE. Do not open by describing the board or the lesson ("දැන් අපි … බලනවා නේද"). Greet them in a few words if you speak first, then simply ANSWER what they ask. They may ask about several different things in one chat — take each question as it comes.
- One or two short sentences per turn. The child can close the chat whenever they like; do not keep asking whether to go back to the lesson.`;

/** The block appended to the chat's system prompt. */
export function chatContextPrompt(context: ChatContext): string {
  const lines = context.recentLines.map((line, i) => `  ${i + 1}. ${line}`).join("\n");
  const answers =
    context.recentAnswers.length === 0
      ? "  (none yet)"
      : context.recentAnswers.map((a) => `  - asked "${a.question.slice(0, 80)}" → the child answered "${a.answer.slice(0, 40)}" (${a.correct ? "right" : "not right"})`).join("\n");
  return `
THE LESSON THE CHILD IS IN (it is paused; they opened the chat to ask you something — the board stays in front of them)
- Subject: ${context.subject}. Lesson: ${context.lesson}. Session: ${context.session}.
- Concept being taught: ${context.concept.title} (${context.concept.tag}). Its objective: ${context.concept.objective || "(not stated)"}
- EVERYTHING ON THE BOARD RIGHT NOW (Sinhala, as the child sees it; [keys] are targets for point_at / highlight_board):
${context.boardState.map((line) => `  ${line}`).join("\n") || "  (the board is empty)"}
- What the lesson itself is on at this moment (ONE of the things they might ask about — do not assume it is their question): ${context.boardFocus ?? "(nothing in particular)"}
- The last lines you said in the lesson, oldest first:
${lines || "  (the lesson has just started)"}
- The next line you will say when the lesson resumes (do not say it now, do not teach past it): ${context.nextLine ? `"${context.nextLine}"` : "(none)"}
- The child's recent answers:
${answers}
- Their weakest concept so far: ${context.weakestConcept ?? "(no misses yet)"}
- Address the child as: ${context.address}
- Official terms you may use: ${context.vocabularyAllowed.join(", ") || "(none introduced yet)"}
- Official terms NOT YET introduced (do not use or teach): ${context.vocabularyLater.join(", ") || "(none)"}

${TEACHING_INSTRUCTIONS}
`;
}

/** The ceilings the token route enforces on a client-supplied context. */
export const CHAT_CONTEXT_LIMITS = { line: 240, board: 400, focus: 200, lines: 5, answers: 4, boardLines: 40, boardLine: 420, terms: 16 } as const;

/** A context the server accepts: the client's, trimmed to the limits; nothing else passes. */
export function sanitizeChatContext(raw: unknown): ChatContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
  const list = (value: unknown, maxItems: number, maxLength: number) => (Array.isArray(value) ? value.slice(0, maxItems).map((item) => str(item, maxLength)).filter(Boolean) : []);
  const concept = (r.concept ?? {}) as Record<string, unknown>;
  const recentLines = Array.isArray(r.recentLines) ? r.recentLines.slice(-CHAT_CONTEXT_LIMITS.lines).map((l) => str(l, CHAT_CONTEXT_LIMITS.line)) : [];
  const recentAnswers = Array.isArray(r.recentAnswers)
    ? r.recentAnswers.slice(-CHAT_CONTEXT_LIMITS.answers).map((a) => {
        const entry = (a ?? {}) as Record<string, unknown>;
        return { question: str(entry.question, CHAT_CONTEXT_LIMITS.line), answer: str(entry.answer, 80), correct: entry.correct === true };
      })
    : [];
  const board = str(r.board, CHAT_CONTEXT_LIMITS.board) || "පුවරුව හිස්";
  const boardState = list(r.boardState, CHAT_CONTEXT_LIMITS.boardLines, CHAT_CONTEXT_LIMITS.boardLine);
  return {
    subject: str(r.subject, 40) || "maths",
    lesson: str(r.lesson, 80) || "lesson 1",
    session: str(r.session, 40) || "සැසිය 1",
    concept: { tag: str(concept.tag, 40), title: str(concept.title, 80), objective: str(concept.objective, CHAT_CONTEXT_LIMITS.line) },
    recentLines,
    nextLine: typeof r.nextLine === "string" ? r.nextLine.slice(0, CHAT_CONTEXT_LIMITS.line) : null,
    board,
    boardState: boardState.length ? boardState : [board],
    boardFocus: typeof r.boardFocus === "string" && r.boardFocus.trim() ? r.boardFocus.slice(0, CHAT_CONTEXT_LIMITS.focus) : null,
    recentAnswers,
    weakestConcept: typeof r.weakestConcept === "string" ? r.weakestConcept.slice(0, 80) : null,
    address: str(r.address, 20) || "පුතේ",
    vocabularyAllowed: list(r.vocabularyAllowed, CHAT_CONTEXT_LIMITS.terms, 40),
    vocabularyLater: list(r.vocabularyLater, CHAT_CONTEXT_LIMITS.terms, 40),
  };
}
