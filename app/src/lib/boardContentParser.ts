/**
 * Parses a teaching segment's boardContent — the plain-text record of what
 * the real teacher had written on her board — into board actions the
 * orchestrator can stage, so an EXPLAIN beat shows what she was showing:
 *
 *   "5 4 2 1"                 → the animated abacus, beads landing per place
 *   "5000 + 400 + 20 + 1"     → an ExpansionExercise with the parts filled
 *   "| සංඛ්‍යාව | සංඛ්‍යා නාමය |…" → a PlaceValueTable
 *   anything else             → a chalk-style TextCard, verbatim
 *
 * Never returns nothing for non-empty input: unparseable content becomes a
 * TextCard rather than a silent "board: unchanged".
 */
import type { BeatBoardAction } from "@/lib/lessonOrchestrator";
import type { LessonComponent, PlaceValueNumberNameRow } from "@/data/lessons/lesson1-numbers";

/** A line of single digits separated by spaces — how she wrote abacus places ("5 4 2 1"). */
const ABACUS_DIGITS_LINE = /^\s*(\d(?:\s+\d){2,4})\s*$/;
/** A plus-expansion line ("5000 + 400 + 20 + 1", possibly with "= N" or a leading "N ="). */
const EXPANSION_LINE = /^[\d\s,=]*?(\d[\d\s,]*(?:\s*\+\s*\d[\d\s,]*){1,5})\s*(?:=.*)?$/;

function parseNumberLoose(text: string): number | null {
  const cleaned = text.replace(/[\s,]/g, "");
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

/** One visual block recovered from the board text. */
export type BoardBlock =
  | { kind: "abacus"; digits: number[] }
  | { kind: "expansion"; prompt: number; parts: number[] }
  | { kind: "table"; rows: PlaceValueNumberNameRow[] }
  | { kind: "text"; text: string };

export function parseBoardContent(boardContent: string): BoardBlock[] {
  const blocks: BoardBlock[] = [];
  const lines = boardContent.split(/\\n|\n/);
  const leftoverLines: string[] = [];
  let tableRows: PlaceValueNumberNameRow[] | null = null;

  const flushTable = () => {
    if (tableRows && tableRows.length > 0) blocks.push({ kind: "table", rows: tableRows });
    tableRows = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flushTable();
      continue;
    }

    // Markdown-style table rows: | number-or-dots | name-or-dots |
    if (/^\|.*\|$/.test(line)) {
      const cells = line.split("|").map((c) => c.trim()).filter((c) => c !== "");
      if (cells.length === 2 && !/^[-:\s|]+$/.test(cells.join(""))) {
        const isHeader = /සංඛ්‍යාව/.test(cells[0]) && /නාමය/.test(cells[1]);
        if (!isHeader) {
          const number = parseNumberLoose(cells[0]);
          const name = /^[.…\s]+$/.test(cells[1]) ? null : cells[1];
          tableRows = tableRows ?? [];
          tableRows.push({ number: number, numberName: name });
        } else {
          tableRows = tableRows ?? [];
        }
        continue;
      }
      continue; // separator row
    }
    flushTable();

    const abacus = line.match(ABACUS_DIGITS_LINE);
    if (abacus) {
      blocks.push({ kind: "abacus", digits: abacus[1].split(/\s+/).map(Number) });
      continue;
    }

    if (line.includes("+")) {
      const expansion = line.match(EXPANSION_LINE);
      if (expansion) {
        const parts = expansion[1].split("+").map((p) => parseNumberLoose(p));
        if (parts.every((p): p is number => p !== null) && parts.length >= 2) {
          blocks.push({ kind: "expansion", prompt: parts.reduce((a, b) => a + b, 0), parts });
          continue;
        }
      }
    }

    leftoverLines.push(line);
  }
  flushTable();

  if (leftoverLines.length > 0) blocks.push({ kind: "text", text: leftoverLines.join("\n") });
  if (blocks.length === 0 && boardContent.trim() !== "") blocks.push({ kind: "text", text: boardContent.trim() });
  return blocks;
}

/** Turns one recovered block into the board action an EXPLAIN beat stages. */
export function blockToBoardAction(block: BoardBlock, beatId: string): BeatBoardAction {
  switch (block.kind) {
    case "abacus":
      // Self-animating: beads land rod by rod while she names each place.
      return { kind: "abacus_set", digits: block.digits, animate: true };
    case "expansion": {
      const components: LessonComponent[] = [
        { type: "ExpansionExercise", props: { rows: [{ prompt: block.prompt, parts: block.parts }] } },
      ];
      return { kind: "show_components", itemId: `explain:${beatId}`, components };
    }
    case "table": {
      const components: LessonComponent[] = [
        { type: "PlaceValueTable", props: { variant: "numberName", rows: block.rows } },
      ];
      return { kind: "show_components", itemId: `explain:${beatId}`, components };
    }
    case "text":
      return { kind: "text_card", text: block.text };
  }
}

// ---------------------------------------------------------------------------
// Abacus reveal steps ("දාහේ ස්ථානයේ ගණක 5යි" → rod index + bead count)
// ---------------------------------------------------------------------------

const PLACE_PATTERNS: Array<[RegExp, number]> = [
  [/දස\s*දහ/u, 10000],
  [/දහස|දාහ|දාහේ/u, 1000],
  [/සිය/u, 100],
  [/දහය|දහයේ/u, 10],
  [/එක/u, 1],
];

/**
 * Parses one worked step of an abacus item into a bead action, or null for
 * steps that aren't bead placements (e.g. "සංඛ්‍යාව: 5322").
 * `rod` is an index from the LEFT (0 = highest place shown).
 */
export function parseAbacusStep(step: string, digitCount: number): { rod: number; count: number } | null {
  const beadMatch = step.match(/ස්ථානයේ ගණක\s*(\d+)/u);
  if (!beadMatch) return null;
  let place: number | null = null;
  for (const [pattern, value] of PLACE_PATTERNS) {
    if (pattern.test(step)) {
      place = value;
      break;
    }
  }
  if (place === null) return null;
  const rod = digitCount - 1 - Math.round(Math.log10(place));
  if (rod < 0 || rod >= digitCount) return null;
  return { rod, count: Number(beadMatch[1]) };
}
