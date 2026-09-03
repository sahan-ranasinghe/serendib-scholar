/**
 * Working out which cells of a content_bank item are blanks, and what the
 * right value for each one is.
 *
 * This is what lets the orchestrator drive REVEAL_PART and ASK beats itself
 * instead of asking the model to decide what to fill in next. A blank is a
 * `null` in the stored component_props (the same convention the renderers in
 * LessonComponents.tsx use to draw a dashed cell); its answer comes from the
 * row's `answer` column, whose shape differs per component type — see each
 * branch below.
 *
 * Blanks whose answer isn't known are returned with `value: null`. The
 * script builder skips those for REVEAL_PART (nothing to write) and for ASK
 * (nothing to check against), rather than guessing — a wrong "correct
 * answer" in front of a child is worse than one fewer question.
 */

export interface ItemBlank {
  rowIndex: number;
  /** Cell identifier, matching submit_blank_answer's `field` naming. */
  field: string;
  /** The verified correct value, or null when the source doesn't state one. */
  value: string | null;
  /** Human-readable description of what's being asked for, for the beat goal. */
  label: string;
}

type Row = Record<string, unknown>;

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() === "" ? null : value;
  return null;
}

const PLACE_VALUE_BREAKDOWN_FIELDS = ["digit", "place", "placeValue", "valueRepresented"] as const;
const SEQUENCE_FIELDS = ["before", "number", "after"] as const;

const FIELD_LABELS: Record<string, string> = {
  number: "the number",
  numberName: "the number's name in Sinhala",
  digit: "the digit",
  place: "the place name",
  placeValue: "the place value",
  valueRepresented: "the value that digit represents",
  before: "the number that comes before",
  after: "the number that comes after",
};

/**
 * ExpansionExercise stores two different answer shapes (see
 * lesson1-numbers.ts's ADAPTATION note): place-value parts as
 * `{ parts: [...] }`, and the step-7 rollover rows as
 * `{ result, numberName }`. Normalizes both to a parts array.
 */
function expansionAnswerParts(answerRow: Row | undefined): (string | null)[] {
  if (!answerRow) return [];
  if (Array.isArray(answerRow.parts)) return (answerRow.parts as unknown[]).map(stringOrNull);
  if ("result" in answerRow || "numberName" in answerRow) {
    return [stringOrNull(answerRow.result), stringOrNull(answerRow.numberName)];
  }
  return [];
}

export function blanksForItem(componentType: string, props: unknown, answer: unknown): ItemBlank[] {
  const propsObj = (props ?? {}) as Row;
  const answerObj = (answer ?? {}) as Row;
  const propRows = asRows(propsObj.rows);
  const answerRows = asRows(answerObj.rows);
  const blanks: ItemBlank[] = [];

  if (componentType === "PlaceValueTable") {
    const fields =
      propsObj.variant === "breakdown" ? PLACE_VALUE_BREAKDOWN_FIELDS : (["number", "numberName"] as const);
    propRows.forEach((row, rowIndex) => {
      // answer.rows is positionally aligned with props.rows, and holds null
      // for rows the source never states an answer for.
      const answerRow = (answerRows[rowIndex] ?? undefined) as Row | undefined;
      for (const field of fields) {
        if (row[field] !== null && row[field] !== undefined) continue;
        blanks.push({
          rowIndex,
          field,
          value: stringOrNull(answerRow?.[field]),
          label: `${FIELD_LABELS[field] ?? field}${
            row.number !== null && row.number !== undefined ? ` for ${row.number}` : ""
          }`,
        });
      }
    });
    return blanks;
  }

  if (componentType === "ExpansionExercise") {
    propRows.forEach((row, rowIndex) => {
      const parts = Array.isArray(row.parts) ? (row.parts as unknown[]) : [];
      const answerParts = expansionAnswerParts(answerRows[rowIndex] as Row | undefined);
      parts.forEach((part, partIndex) => {
        if (part !== null && part !== undefined) return;
        blanks.push({
          rowIndex,
          field: `part${partIndex}`,
          value: answerParts[partIndex] ?? null,
          label: `part ${partIndex + 1} of ${String(row.prompt ?? "the expansion")}`,
        });
      });
    });
    return blanks;
  }

  if (componentType === "SequenceTable") {
    propRows.forEach((row, rowIndex) => {
      const answerRow = (answerRows[rowIndex] ?? undefined) as Row | undefined;
      for (const field of SEQUENCE_FIELDS) {
        if (row[field] !== null && row[field] !== undefined) continue;
        const known = Object.values(row).find((v) => v !== null && v !== undefined);
        blanks.push({
          rowIndex,
          field,
          value: stringOrNull(answerRow?.[field]),
          label: `${FIELD_LABELS[field] ?? field}${known !== undefined ? ` in the row with ${String(known)}` : ""}`,
        });
      }
    });
    return blanks;
  }

  // DigitPickerPuzzle, AbacusDiagram, ExampleBox and NumberedQuestionList
  // have no fillable cells — they're worked verbally against a static
  // display (see workedStepsForItem).
  return blanks;
}

/**
 * The worked steps for an item that has no fillable cells — the 108
 * ExampleBox rows, which are most of the bank. `stepsShown` is the real
 * teacher's own working, so a MODE 1 demonstration walks these in order
 * rather than the model inventing its own derivation.
 */
export function workedStepsForItem(answer: unknown): string[] {
  const steps = (answer as Row | null)?.stepsShown;
  return Array.isArray(steps) ? steps.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
}

/**
 * A stored answer that was never fully captured — the transcription
 * truncated it, or the source only gestured at it. Real examples in the
 * bank: "300...", "…". Asking a child to produce one of these is worse than
 * not asking at all, so they are treated as "no answer stated".
 */
function isUnusableAnswer(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (/(\.\.\.|…)/.test(trimmed)) return true;
  // A bare punctuation or dash fragment carries nothing to check against.
  return /^[\s\-–—.,:;]+$/.test(trimmed);
}

/** The single final answer for an item with no fillable cells, if the source states a usable one. */
export function solutionForItem(answer: unknown): string | null {
  const obj = (answer ?? {}) as Row;
  const candidate = stringOrNull(obj.solution) ?? stringOrNull(obj.numeral) ?? stringOrNull(obj.label);
  if (candidate === null || isUnusableAnswer(candidate)) return null;
  return candidate;
}

/** A one-line description of what's on the board, for the director line's "Board shows:" clause. */
export function describeItem(componentType: string, props: unknown): string {
  const obj = (props ?? {}) as Row;
  switch (componentType) {
    case "ExampleBox": {
      const content = Array.isArray(obj.content) ? obj.content.join(" ") : "";
      return `a worked example — ${content}`.trim();
    }
    case "AbacusDiagram":
      return `an abacus showing ${String(obj.numeral ?? "a number")}`;
    case "PlaceValueTable":
      return obj.variant === "breakdown"
        ? `a place-value breakdown table with ${asRows(obj.rows).length} rows`
        : `a number-and-name table with ${asRows(obj.rows).length} rows`;
    case "ExpansionExercise":
      return `an expansion exercise with ${asRows(obj.rows).length} rows`;
    case "SequenceTable":
      return `a before-and-after sequence table with ${asRows(obj.rows).length} rows`;
    case "DigitPickerPuzzle":
      return `a digit-choice puzzle: ${String(obj.instructions ?? "")}`;
    case "NumberedQuestionList": {
      const questions = asRows(obj.questions);
      return `a numbered question list with ${questions.length} questions`;
    }
    default:
      return componentType;
  }
}
