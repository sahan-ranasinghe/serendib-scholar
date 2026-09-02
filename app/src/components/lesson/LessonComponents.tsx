/**
 * TEMPORARY PROOF-OF-CONCEPT — static renderers for Lesson 1's 7 board
 * component types. None of these existed before this POC (see
 * src/data/lessons/lesson1-numbers.ts's module doc for the full removal
 * list). Deliberately simple and read-only — no drag/drop; answer
 * *checking* happens server-side (check_answer) — this file just renders
 * whatever the model has already confirmed via submit_blank_answer.
 */
import { useState } from "react";
import type {
  LessonComponent,
  DigitPickerPuzzleProps,
  PlaceValueTableProps,
  AbacusDiagramProps,
  ExampleBoxProps,
  ExpansionExerciseProps,
  NumberedQuestionListProps,
  SequenceTableProps,
  FilledAnswer,
} from "@/data/lessons/lesson1-numbers";

interface BlankState {
  filledAnswers: FilledAnswer[];
  /** Which blank the AI is currently asking about — see set_active_blank. */
  activeBlank: { rowIndex: number; field: string } | null;
  /**
   * Called when the child types/taps an answer for the active blank
   * instead of speaking it — sent into the live session as a real text
   * turn (see submitTypedAnswer in useGeminiLive.ts), so the model reacts
   * to it exactly like a spoken answer (same check_answer/
   * submit_blank_answer flow). Only ever rendered for the active cell.
   */
  onSubmitTypedAnswer: (value: string) => void;
}

/**
 * A single blank cell in any of the tables below. Three visual states:
 * - answered: a matching entry exists in `filledAnswers` (via
 *   submit_blank_answer) — a filled, confirmed cell.
 * - active: not yet answered, but matches `activeBlank` (via
 *   set_active_blank) — the AI is asking about this one right now,
 *   highlighted distinctly from other still-blank cells.
 * - blank: the ordinary dashed placeholder, everything else.
 * `field` values are documented per component in the submit_blank_answer
 * tool description (geminiLiveTools.ts).
 */
function AnswerCell({
  rowIndex,
  field,
  filledAnswers,
  activeBlank,
  onSubmitTypedAnswer,
}: { rowIndex: number; field: string } & BlankState) {
  // Local to this one cell — cleared on submit, and naturally discarded
  // (a fresh AnswerCell) once this cell stops being the active one, since
  // submit_blank_answer/set_active_blank always re-render with new props
  // rather than this component instance persisting across blanks.
  const [draft, setDraft] = useState("");

  const answer = filledAnswers.find((a) => a.rowIndex === rowIndex && a.field === field);
  if (answer) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
        <span aria-hidden>✓</span>
        {answer.value}
      </span>
    );
  }

  const isActive = activeBlank?.rowIndex === rowIndex && activeBlank?.field === field;
  if (isActive) {
    return (
      <span className="inline-flex flex-col items-center gap-1">
        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white">
          දැන් මේක
        </span>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draft.trim();
            if (!trimmed) return;
            onSubmitTypedAnswer(trimmed);
            setDraft("");
          }}
          className="flex items-center gap-1"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="?"
            aria-label="ඔබේ පිළිතුර ටයිප් කරන්න"
            className="h-8 w-20 rounded border-2 border-dashed border-rose-500 bg-rose-50 px-2 text-center text-sm font-semibold text-rose-900 focus:border-solid focus:ring-2 focus:ring-rose-300 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="පිළිතුර යවන්න"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-sm text-white shadow-sm disabled:opacity-40"
          >
            ➤
          </button>
        </form>
      </span>
    );
  }

  return <span className="inline-block h-5 w-12 rounded border-2 border-dashed border-orange-300" aria-label="blank" />;
}

function DigitPickerPuzzleView({ availableDigits, exampleAnswer, instructions }: DigitPickerPuzzleProps) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-lg leading-relaxed font-medium text-orange-950">{instructions}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {availableDigits.map((digit, index) => (
          <span
            key={index}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-400 text-xl font-bold text-white shadow-sm"
          >
            {digit}
          </span>
        ))}
      </div>
      <p className="text-sm text-orange-600">
        උදාහරණයක්: <span className="font-semibold">{exampleAnswer}</span>
      </p>
    </div>
  );
}

function PlaceValueTableView(props: PlaceValueTableProps & BlankState) {
  const { filledAnswers, activeBlank, onSubmitTypedAnswer } = props;
  const blankState = { filledAnswers, activeBlank, onSubmitTypedAnswer };
  if (props.variant === "numberName") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse overflow-hidden rounded-xl text-left">
          <thead>
            <tr className="bg-orange-400 text-white">
              <th className="px-4 py-2 text-sm font-semibold whitespace-nowrap">ඉලක්කම</th>
              <th className="px-4 py-2 text-sm font-semibold whitespace-nowrap">නම</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, index) => (
              <tr key={index} className={index % 2 === 0 ? "bg-orange-50" : "bg-white"}>
                <td className="px-4 py-2 font-medium whitespace-nowrap text-orange-950">
                  {row.number ?? <AnswerCell rowIndex={index} field="number" {...blankState} />}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-orange-950">
                  {row.numberName ?? <AnswerCell rowIndex={index} field="numberName" {...blankState} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse overflow-hidden rounded-xl text-left">
        <thead>
          <tr className="bg-orange-400 text-white">
            <th className="px-4 py-2 text-sm font-semibold whitespace-nowrap">සංඛ්‍යාව</th>
            <th className="px-4 py-2 text-sm font-semibold whitespace-nowrap">ඉලක්කම</th>
            <th className="px-4 py-2 text-sm font-semibold whitespace-nowrap">ස්ථානය</th>
            <th className="px-4 py-2 text-sm font-semibold whitespace-nowrap">ස්ථානීය අගය</th>
            <th className="px-4 py-2 text-sm font-semibold whitespace-nowrap">නිරූපිත අගය</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index} className={index % 2 === 0 ? "bg-orange-50" : "bg-white"}>
              <td className="px-4 py-2 font-medium whitespace-nowrap text-orange-950">
                {row.number ?? <AnswerCell rowIndex={index} field="number" {...blankState} />}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-orange-950">
                {row.digit ?? <AnswerCell rowIndex={index} field="digit" {...blankState} />}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-orange-950">
                {row.place ?? <AnswerCell rowIndex={index} field="place" {...blankState} />}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-orange-950">
                {row.placeValue ?? <AnswerCell rowIndex={index} field="placeValue" {...blankState} />}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-orange-950">
                {row.valueRepresented ?? <AnswerCell rowIndex={index} field="valueRepresented" {...blankState} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbacusDiagramView({ digits, label, numeral }: AbacusDiagramProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-end gap-4">
        {digits.map((digit, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <div className="relative flex h-32 w-3 flex-col-reverse items-center gap-1 rounded-full bg-orange-200 py-1">
              {Array.from({ length: digit }).map((_, beadIndex) => (
                <span key={beadIndex} className="h-4 w-4 shrink-0 rounded-full bg-rose-500 shadow-sm" />
              ))}
            </div>
            <span className="text-lg font-bold text-orange-900">{digit}</span>
          </div>
        ))}
      </div>
      <p className="text-lg font-semibold text-orange-900">{numeral}</p>
      <p className="text-sm text-orange-600">{label}</p>
    </div>
  );
}

const EXAMPLE_BOX_STYLES: Record<ExampleBoxProps["variant"], string> = {
  pink: "bg-rose-50 border-rose-200 text-rose-900",
  yellow: "bg-amber-50 border-amber-200 text-amber-900",
  green: "bg-emerald-50 border-emerald-200 text-emerald-900",
};

function ExampleBoxView({ variant, label, content }: ExampleBoxProps) {
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border-2 px-5 py-4 ${EXAMPLE_BOX_STYLES[variant]}`}>
      <span className="w-fit rounded-full bg-white/70 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      {content.map((line, index) => (
        <p key={index} className="text-base leading-relaxed font-medium">
          {line}
        </p>
      ))}
    </div>
  );
}

function ExpansionExerciseView({ rows, filledAnswers, activeBlank, onSubmitTypedAnswer }: ExpansionExerciseProps & BlankState) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div
          key={index}
          className={`flex flex-wrap items-center gap-2 rounded-xl px-4 py-2 ${index % 2 === 0 ? "bg-orange-50" : "bg-white"}`}
        >
          <span className="font-semibold whitespace-nowrap text-orange-950">{row.prompt}</span>
          <span className="text-orange-400">=</span>
          {row.parts.map((part, partIndex) => (
            <span key={partIndex} className="flex items-center gap-2">
              {partIndex > 0 && <span className="text-orange-400">+</span>}
              <span className="font-medium text-orange-950">
                {part ?? (
                  <AnswerCell
                    rowIndex={index}
                    field={`part${partIndex}`}
                    filledAnswers={filledAnswers}
                    activeBlank={activeBlank}
                    onSubmitTypedAnswer={onSubmitTypedAnswer}
                  />
                )}
              </span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function NumberedQuestionListView({ questions }: NumberedQuestionListProps) {
  return (
    <ol className="flex flex-col gap-3 text-left">
      {questions.map((question) => (
        <li key={question.number} className="rounded-xl bg-orange-50 px-4 py-3 text-orange-950">
          <div className="flex gap-2">
            <span className="font-bold whitespace-nowrap">{question.number}.</span>
            {question.text && <span>{question.text}</span>}
          </div>
          {question.subParts && (
            <ul className="mt-2 flex flex-col gap-2 pl-6">
              {question.subParts.map((sub) => (
                <li key={sub.letter} className="flex gap-2">
                  <span className="font-semibold whitespace-nowrap">({sub.letter})</span>
                  <span>{sub.text}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function SequenceTableView({ rows, filledAnswers, activeBlank, onSubmitTypedAnswer }: SequenceTableProps & BlankState) {
  const blankState = { filledAnswers, activeBlank, onSubmitTypedAnswer };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse overflow-hidden rounded-xl text-left">
        <thead>
          <tr className="bg-orange-400 text-white">
            <th className="px-4 py-2 text-sm font-semibold whitespace-nowrap">පෙර සංඛ්‍යාව</th>
            <th className="px-4 py-2 text-sm font-semibold whitespace-nowrap">සංඛ්‍යාව</th>
            <th className="px-4 py-2 text-sm font-semibold whitespace-nowrap">පසු සංඛ්‍යාව</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className={index % 2 === 0 ? "bg-orange-50" : "bg-white"}>
              <td className="px-4 py-2 whitespace-nowrap text-orange-950">
                {row.before ?? <AnswerCell rowIndex={index} field="before" {...blankState} />}
              </td>
              <td className="px-4 py-2 font-semibold whitespace-nowrap text-orange-950">
                {row.number ?? <AnswerCell rowIndex={index} field="number" {...blankState} />}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-orange-950">
                {row.after ?? <AnswerCell rowIndex={index} field="after" {...blankState} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Dispatches one lesson component to its renderer — see LessonStep in the
 * data file for why a step can have more than one of these. `filledAnswers`/
 * `activeBlank` are only meaningful to the three components with blanks
 * (PlaceValueTable, ExpansionExercise, SequenceTable); the others ignore them.
 */
export function LessonComponentView({
  component,
  filledAnswers,
  activeBlank,
  onSubmitTypedAnswer,
}: {
  component: LessonComponent;
} & BlankState) {
  const blankState = { filledAnswers, activeBlank, onSubmitTypedAnswer };
  switch (component.type) {
    case "DigitPickerPuzzle":
      return <DigitPickerPuzzleView {...component.props} />;
    case "PlaceValueTable":
      return <PlaceValueTableView {...component.props} {...blankState} />;
    case "AbacusDiagram":
      return <AbacusDiagramView {...component.props} />;
    case "ExampleBox":
      return <ExampleBoxView {...component.props} />;
    case "ExpansionExercise":
      return <ExpansionExerciseView {...component.props} {...blankState} />;
    case "NumberedQuestionList":
      return <NumberedQuestionListView {...component.props} />;
    case "SequenceTable":
      return <SequenceTableView {...component.props} {...blankState} />;
  }
}
