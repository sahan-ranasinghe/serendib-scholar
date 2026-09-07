/**
 * The human-readable review doc (docs/review/session-1-original.md).
 *
 * Extracted from scripts/author-script.ts so the offline review pass
 * (scripts/apply-review-edits.ts) regenerates exactly the same document
 * the author writes — a reviewer reads one format, whoever produced it.
 */
import type { AuthoredScriptFile } from "@/lib/authoredScript";
import { AUTHORED_OPENING_CONCEPT } from "@/lib/authoredScript";
import type { LessonDesign } from "@/lib/lessonDesign";

export function renderReviewDoc(file: AuthoredScriptFile, design: LessonDesign): string {
  const lines: string[] = [];
  const edited = file.beats.filter((beat) => beat.humanEdited).length;

  lines.push(`# Session 1 — Zara's original script (for review)`);
  lines.push("");
  lines.push(
    `Generated ${file.generatedAt.slice(0, 16).replace("T", " ")} with ${file.model}. ` +
      `${file.beats.length} beats across ${file.concepts.join(", ")}.`,
  );
  lines.push("");
  if (edited > 0) {
    lines.push(
      `${edited} of the ${file.beats.length} beats carry \`humanEdited: true\` — a native-speaker review rewrote ` +
        "them (docs/review/session-1-edits.json, then docs/review/gemini-review-decisions.json). " +
        "Each is marked **· human-edited** below.",
    );
    lines.push("");
  }
  lines.push(
    file.approved
      ? '**Status: APPROVED.** These are the words a child hears. Editing the JSON invalidates the cached script ' +
          "automatically; set `\"approved\": false` to take it back off the air."
      : '**Status: NOT APPROVED.** Nothing here is spoken to a child yet. Review, edit the JSON if needed, then set `"approved": true` in ' +
          "`src/data/lessons/authored/maths-5-1.json`. The audio renders itself from the approved words.",
  );
  lines.push("");
  lines.push(`Denylist (the recorded teacher's own numbers, never used): ${design.denylistNumbers.join(", ")}`);
  lines.push("");

  const sections: Array<{ title: string; tag: string }> = [
    ...(file.beats.some((beat) => beat.conceptTag === AUTHORED_OPENING_CONCEPT)
      ? [{ title: "opening", tag: AUTHORED_OPENING_CONCEPT }]
      : []),
    ...file.concepts.map((concept) => ({ title: concept, tag: concept as string })),
  ];

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    const analogy = file.analogies[section.tag as keyof typeof file.analogies];
    if (analogy) lines.push(`Analogy domain (what the teaching reasons through): **${analogy}**`);
    const hookAnalogy = file.hookAnalogy?.[section.tag as keyof typeof file.analogies];
    if (hookAnalogy) lines.push("", `Hook opens on: **${hookAnalogy}**`);
    const hooks = file.hookCandidates[section.tag as keyof typeof file.hookCandidates];
    if (hooks?.length) {
      lines.push("", "Hook candidates (first is in use):", "");
      hooks.forEach((hook, index) => lines.push(`${index + 1}. ${hook}`));
    }
    lines.push("");
    for (const beat of file.beats.filter((b) => b.conceptTag === section.tag)) {
      lines.push(`### \`${beat.id}\``);
      lines.push("");
      lines.push(
        `**${beat.type}** · pause: ${beat.pauseType ?? "—"} · guide: ${beat.guideStep ?? "—"}` +
          `${beat.textbookPage ? ` · page ${beat.textbookPage}` : ""}` +
          `${beat.expectedAnswer ? ` · expects **${beat.expectedAnswer}**` : ""}` +
          ` · max-sim J ${beat.maxSimilarity.jaccard.toFixed(2)}${beat.maxSimilarity.cosine !== null ? ` / C ${beat.maxSimilarity.cosine.toFixed(2)}` : ""}` +
          `${beat.humanEdited ? " · **human-edited**" : ""}`,
      );
      if (beat.errorPlanted) lines.push("", `Planted error: ${beat.errorPlanted}`);
      lines.push("");
      lines.push(`> ${beat.spokenText}`);
      if (beat.sourceText !== beat.spokenText) {
        lines.push("");
        lines.push(`Source: \`${beat.sourceText}\``);
      }
      lines.push("");
      lines.push(`Board: \`${JSON.stringify(beat.boardIntent)}\``);
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}
