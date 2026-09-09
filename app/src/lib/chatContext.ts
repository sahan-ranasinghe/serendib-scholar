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
import { formatNumber } from "@/components/board/theme";

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
        if (base.glowRod !== null) parts.push(`${ROD_NAMES[base.glowRod] ?? "කූරක්"} දැන් පෙන්වනවා`);
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
- The child's recent answers:
${answers}
- Their weakest concept so far: ${context.weakestConcept ?? "(no misses yet)"}

HOW TO BEHAVE IN THIS CHAT
- Open by acknowledging where they are in ONE short Sinhala sentence (name the thing on the board), then ask what their doubt is.
- Answer about THIS content only. Refer to what is on the board — say "පුවරුවේ" / "ගණක රාමුවේ" and name the exact thing.
- Use the point_at and highlight_board tools to show what you mean on the board (they are read-only: they move the pointer or draw a ring; they change nothing).
- Never teach ahead of the lesson and never start a new topic. If they ask about something later or elsewhere, say the lesson will get there and bring them back to the board.
- Keep every turn to one or two short sentences a Grade-5 child can follow.
- When the doubt is settled, offer to return: "අපි ආයෙත් පාඩමට යමුද?"
`;
}

/** The ceilings the token route enforces on a client-supplied context. */
export const CHAT_CONTEXT_LIMITS = { line: 240, board: 400, lines: 3, answers: 2 } as const;

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
    recentAnswers,
    weakestConcept: typeof r.weakestConcept === "string" ? r.weakestConcept.slice(0, 80) : null,
  };
}
