/**
 * What the ✋ chat knows about where the child is.
 *
 * Minted into the Live session's system prompt (see /api/gemini-session):
 * the subject and lesson, the concept and its objective, the last three
 * lines she said and the next one, the board in plain Sinhala, the child's
 * last two answers, and their weakest concept. So the chat opens by
 * acknowledging where they are, answers about THIS content, refers to the
 * board, never teaches ahead, and offers to return to the lesson.
 *
 * No React here — the chat-check harness builds the same context offline.
 */
import type { StageState } from "@/lib/choreography";
import type { Target } from "@/components/board/events";
import { formatNumber } from "@/components/board/tokens";

export interface ChatAnswer {
  question: string;
  answer: string;
  correct: boolean;
}

export interface ChatContext {
  subject: string;
  lesson: string;
  concept: { tag: string; title: string; objective: string };
  /** The last three lines she said, oldest first. */
  recentLines: string[];
  nextLine: string | null;
  /** The board, in plain Sinhala. */
  board: string;
  /**
   * The ONE thing on the board the child is most likely pointing at when
   * they raise their hand — the active cell, the glowing rod, the ringed
   * card, the number that is up — named the way Zara would name it. Her
   * first line has to say this, not just the topic.
   */
  boardFocus: string | null;
  recentAnswers: ChatAnswer[];
  weakestConcept: string | null;
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

/** The block appended to the chat's system prompt. */
export function chatContextPrompt(context: ChatContext): string {
  const lines = context.recentLines.map((line, i) => `  ${i + 1}. ${line}`).join("\n");
  const answers =
    context.recentAnswers.length === 0
      ? "  (none yet)"
      : context.recentAnswers.map((a) => `  - asked "${a.question.slice(0, 80)}" → child said "${a.answer.slice(0, 40)}" (${a.correct ? "correct" : "not correct"})`).join("\n");
  return `
WHERE THE CHILD IS RIGHT NOW (the lesson is paused; they raised their hand to ask something)
- Subject: ${context.subject}. Lesson: ${context.lesson}.
- Concept: ${context.concept.title} (${context.concept.tag}). Objective: ${context.concept.objective}
- The last lines Zara said, oldest first:
${lines || "  (the lesson has just started)"}
- The next line she will say when the lesson resumes: ${context.nextLine ? `"${context.nextLine}"` : "(none)"}
- THE BOARD (in Sinhala, as the child sees it): ${context.board}
- WHAT THEY ARE POINTING AT (the one thing their "මොකද්ද මේ?" is about): ${context.boardFocus ?? "(nothing specific is up — the board is empty or between activities)"}
- The child's recent answers:
${answers}
- Their weakest concept so far: ${context.weakestConcept ?? "(no misses yet)"}

HOW TO BEHAVE IN THIS CHAT
- YOUR FIRST LINE: one short Sinhala sentence that names WHAT THEY ARE POINTING AT above — the exact thing, with its number or its cell, not just the topic — and then asks what their doubt is. A child who raises their hand is pointing at something specific, so "ගණක රාමුව ගැනද?" is too vague; "දැන් අපි ගණක රාමුවේ තියෙන 5421 ගැන බලනවා නේද? මොකක්ද ප්‍රශ්නය?" is right. Take the number, the rod's name or the cell from the line above exactly as it is written — never invent a different one, and never say a number that is not on the board.
- Say it as a teacher speaks, not as a description read aloud: no quotation marks around the thing, no English words at all (say "පෙන්නන්නේ", never "pointing"), no brackets, no labels from the lines above.
- If the line above says nothing specific is up, name the concept instead and ask what their doubt is.
- Answer about THIS content only. Refer to what is on the board — say "පුවරුවේ" / "ගණක රාමුවේ" / "වගුවේ" and name the exact thing.
- Use the point_at and highlight_board tools to show what you mean on the board (they are read-only: they move the pointer or draw a ring; they change nothing).
- Never teach ahead of the lesson and never start a new topic. If they ask about something later or elsewhere, say the lesson will get there and bring them back to the board.
- Keep every turn to one or two short sentences a Grade-5 child can follow.
- When the doubt is settled, offer to return: "අපි ආයෙත් පාඩමට යමුද?"
`;
}

/** The ceilings the token route enforces on a client-supplied context. */
export const CHAT_CONTEXT_LIMITS = { line: 240, board: 400, focus: 200, lines: 3, answers: 2 } as const;

/** A context the server accepts: the client's, trimmed to the limits; nothing else passes. */
export function sanitizeChatContext(raw: unknown): ChatContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
  const concept = (r.concept ?? {}) as Record<string, unknown>;
  const recentLines = Array.isArray(r.recentLines) ? r.recentLines.slice(-CHAT_CONTEXT_LIMITS.lines).map((l) => str(l, CHAT_CONTEXT_LIMITS.line)) : [];
  const recentAnswers = Array.isArray(r.recentAnswers)
    ? r.recentAnswers.slice(-CHAT_CONTEXT_LIMITS.answers).map((a) => {
        const entry = (a ?? {}) as Record<string, unknown>;
        return { question: str(entry.question, CHAT_CONTEXT_LIMITS.line), answer: str(entry.answer, 80), correct: entry.correct === true };
      })
    : [];
  return {
    subject: str(r.subject, 40) || "maths",
    lesson: str(r.lesson, 80) || "lesson 1",
    concept: { tag: str(concept.tag, 40), title: str(concept.title, 80), objective: str(concept.objective, CHAT_CONTEXT_LIMITS.line) },
    recentLines,
    nextLine: typeof r.nextLine === "string" ? r.nextLine.slice(0, CHAT_CONTEXT_LIMITS.line) : null,
    board: str(r.board, CHAT_CONTEXT_LIMITS.board) || "පුවරුව හිස්",
    boardFocus: typeof r.boardFocus === "string" && r.boardFocus.trim() ? r.boardFocus.slice(0, CHAT_CONTEXT_LIMITS.focus) : null,
    recentAnswers,
    weakestConcept: typeof r.weakestConcept === "string" ? r.weakestConcept.slice(0, 80) : null,
  };
}
