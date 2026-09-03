/**
 * Re-derives component_type/component_props (and a structured `answer`) for
 * content_bank rows so that every problem renders as its real visual
 * component instead of a text card:
 *
 *   abacusRepresentation  → AbacusDiagram   { digits, numeral, label? }
 *   numberExpansion       → ExpansionExercise { rows: [{ prompt, parts }] }
 *   placeValueBreakdown   → PlaceValueTable  { variant: "breakdown", rows }
 *   numberSequence        → SequenceTable    { rows: [{ before, number, after }] }
 *
 * Everything is parsed from the row's EXISTING verified content (its
 * question text, solution and stepsShown) — nothing is invented. The
 * original answer fields (solution, stepsShown, derivedBy…) are preserved
 * and the structured fields are added alongside, so MODE 1 walk-throughs
 * keep the teacher's own working while the blanks machinery
 * (src/lib/lessonBlanks.ts) gains real cells to reveal and ask.
 *
 * A row the parsers cannot map confidently is FLAGGED and left untouched —
 * never silently left as text.
 *
 *   npm run migrate:visuals            # report only (no writes)
 *   npm run migrate:visuals -- --apply # write the changes
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";

const APPLY = process.argv.includes("--apply");

interface Row {
  id: string;
  concept_tag: string;
  component_type: string;
  component_props: Record<string, unknown>;
  answer: Record<string, unknown> | null;
  source: string;
  difficulty: string;
}

interface Migration {
  row: Row;
  component_type: string;
  component_props: Record<string, unknown>;
  answer: Record<string, unknown>;
  note: string;
}

interface Flagged {
  row: Row;
  reason: string;
}

// --- Sinhala parsing helpers ----------------------------------------------

/** "75 501" / "75,501" → 75501. Returns null for anything non-numeric or truncated ("300..."). */
function parseNumber(text: string | undefined | null): number | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (/(\.\.\.|…)/.test(trimmed)) return null;
  const match = trimmed.match(/^\d[\d\s,]*$/);
  if (!match) return null;
  const value = Number(trimmed.replace(/[\s,]/g, ""));
  return Number.isSafeInteger(value) ? value : null;
}

/** First full number appearing inside a longer Sinhala string. */
function firstNumberIn(text: string): number | null {
  const match = text.match(/\d[\d,]*(?:\s\d{3})*/);
  return match ? parseNumber(match[0]) : null;
}

/**
 * Place names as they appear in this lesson's transcripts, → place value.
 * Longest-first so "දස දහ…" (10000) wins over "දහ…" (1000).
 */
const PLACES: Array<[RegExp, number]> = [
  [/දස\s*දහ/u, 10000],
  [/දහස|දාහ|දාහේ/u, 1000],
  [/සිය/u, 100],
  [/දහය|දහයේ/u, 10],
  [/එක/u, 1],
];

function placeValueOf(text: string): number | null {
  for (const [pattern, value] of PLACES) if (pattern.test(text)) return value;
  return null;
}

const PLACE_NAMES: Record<number, string> = {
  10000: "දස දහසස්ථානය",
  1000: "දහසස්ථානය",
  100: "සියයස්ථානය",
  10: "දහයස්ථානය",
  1: "එකස්ථානය",
};

function contentText(row: Row): string {
  const content = row.component_props.content;
  return Array.isArray(content) ? content.join(" ") : String(content ?? "");
}

function solutionText(row: Row): string {
  return typeof row.answer?.solution === "string" ? row.answer.solution : "";
}

function steps(row: Row): string[] {
  return Array.isArray(row.answer?.stepsShown) ? (row.answer!.stepsShown as string[]) : [];
}

/** The migrated answer: original fields preserved, structured fields added. */
function mergedAnswer(row: Row, structured: Record<string, unknown>): Record<string, unknown> {
  return { ...(row.answer ?? {}), ...structured, migratedBy: "migrate-content-bank-visuals" };
}

// --- per-concept parsers ---------------------------------------------------

/**
 * AbacusDiagram from an abacus problem. The numeral comes from wherever the
 * source states it in full (a "සංඛ්‍යාව: N" step, the question text, or the
 * solution); digits are simply its digits. stepsShown per-place bead lines
 * are used only as a cross-check where a full numeral also exists.
 */
function parseAbacus(row: Row): Migration | Flagged {
  const stepList = steps(row);
  // A truncated solution ("300...") must never contribute a numeral — the
  // regex would happily capture the digits before the dots.
  const solution = solutionText(row);
  const sources = [
    ...stepList.map((s) => s.match(/සංඛ්‍යාව\s*:?\s*(\d[\d\s,]*)/u)?.[1]),
    ...stepList.map((s) => s.match(/හඳුනා ගැනීම\s*:?\s*(\d[\d\s,]*)/u)?.[1]),
    contentText(row).match(/(\d[\d\s,]{2,})/u)?.[1],
    /(\.\.\.|…)/.test(solution) ? undefined : solution.match(/^(\d[\d\s,]*)/u)?.[1],
  ];
  let numeral: number | null = null;
  for (const candidate of sources) {
    numeral = parseNumber(candidate ?? null);
    // This lesson's abacus numbers are all 4-5 digits; anything smaller is
    // a fragment of something, not a numeral.
    if (numeral !== null && numeral >= 1000) break;
    numeral = null;
  }
  if (numeral === null) {
    // Last resort: per-place bead lines ("දාහේ ස්ථානයේ ගණක 3යි"), highest
    // place first — but only when they form a complete, contiguous number.
    const beads = stepList
      .map((s) => {
        const match = s.match(/ස්ථානයේ ගණක\s*(\d+)/u);
        const place = placeValueOf(s);
        return match && place ? { place, digit: Number(match[1]) } : null;
      })
      .filter((b): b is { place: number; digit: number } => b !== null)
      .sort((a, b) => b.place - a.place);
    if (beads.length >= 3 && beads[beads.length - 1].place === 1) {
      numeral = beads.reduce((sum, b) => sum + b.digit * b.place, 0);
    }
  }
  if (numeral === null || numeral < 1000) {
    return { row, reason: "no full 4-5 digit numeral in steps/content/solution (likely truncated source)" };
  }
  const digits = String(numeral).split("").map(Number);
  const label = solutionText(row).match(/-\s*([඀-෿][^,]*)$/u)?.[1]?.trim() ?? null;
  return {
    row,
    component_type: "AbacusDiagram",
    component_props: { digits, numeral: String(numeral), ...(label ? { label } : { label: "" }) },
    answer: mergedAnswer(row, { numeral: String(numeral), ...(label ? { label } : {}) }),
    note: `numeral ${numeral}${label ? ` (${label.slice(0, 20)}…)` : ""}`,
  };
}

/** ExpansionExercise from "N විහිදුවා…" + solution "A + B + C…". */
function parseExpansion(row: Row): Migration | Flagged {
  // The sum may live in the solution ("A + B + C", "N = A + B + C",
  // "A + B + C = N (name)") or — for worked textbook examples with no
  // stored answer — in the question text itself ("4031 → 4000 + 0 + 30 + 1").
  const candidates = [...solutionText(row).split(/[=→]/u), ...contentText(row).split(/[=→]/u)];
  const sumPart = candidates.find((part) => part.includes("+")) ?? "";
  const parts = sumPart
    .split("+")
    .map((p) => parseNumber(p))
    .filter((p): p is number => p !== null);
  if (parts.length < 2 || parts.length !== sumPart.split("+").length) {
    return { row, reason: `no clean plus-sum in solution or content ("${solutionText(row).slice(0, 40)}")` };
  }
  const total = parts.reduce((a, b) => a + b, 0);
  const stated = firstNumberIn(contentText(row));
  if (stated !== null && stated !== total) {
    return { row, reason: `sum of parts ${total} ≠ number in question ${stated}` };
  }
  const prompt = stated ?? total;
  return {
    row,
    component_type: "ExpansionExercise",
    component_props: { rows: [{ prompt, parts: parts.map(() => null) }] },
    answer: mergedAnswer(row, { rows: [{ prompt, parts }] }),
    note: `${prompt} = ${parts.join(" + ")}`,
  };
}

/** PlaceValueTable breakdown rows from digit/place/value questions. */
function parseBreakdown(row: Row): Migration | Flagged {
  const content = contentText(row);
  const solution = solutionText(row);
  const number = firstNumberIn(content);
  if (number === null) return { row, reason: "no number in question text" };

  const rows: Array<Record<string, unknown>> = [];
  const answerRows: Array<Record<string, unknown>> = [];

  // Shape A: the four-field question ("ඉලක්කම = X, ස්ථානය = Y, ස්ථානීය අගය = Z, … අගය = W").
  const digitMatch = solution.match(/ඉලක්කම\s*[=:]\s*(\d)/u) ?? content.match(/(?:හි|සංඛ්‍යාවේ)\s*(\d)\s*ඉලක්කම/u);
  const placeValueMatch = solution.match(/ස්ථානීය අගය\s*[=:]\s*([\d\s,]+)/u);
  const representedMatch = solution.match(/නිරූපිත අගය\s*[=:]\s*([\d\s,]+)/u);
  if (digitMatch && placeValueMatch) {
    const digit = Number(digitMatch[1]);
    const placeValue = parseNumber(placeValueMatch[1]);
    const represented = representedMatch ? parseNumber(representedMatch[1]) : placeValue !== null ? digit * placeValue : null;
    if (placeValue !== null && represented !== null && represented === digit * placeValue) {
      rows.push({ number, digit, place: null, placeValue: null, valueRepresented: null });
      answerRows.push({ number, digit, place: PLACE_NAMES[placeValue] ?? null, placeValue, valueRepresented: represented });
    }
  }

  // Shape B: "…N හි <place> ස්ථානයේ ඉලක්කම D හි අගය" with a bare-number solution.
  if (rows.length === 0) {
    const valueOnly = parseNumber(solution);
    const digitInContent = content.match(/ඉලක්කම\s*(\d)\s*හි/u) ?? content.match(/\s(\d)\s*හි අගය/u);
    const place = placeValueOf(content.replace(/^[\d\s,]+/u, ""));
    if (valueOnly !== null && digitInContent && place) {
      const digit = Number(digitInContent[1]);
      if (digit * place === valueOnly) {
        rows.push({ number, digit, place: null, placeValue: null, valueRepresented: null });
        answerRows.push({ number, digit, place: PLACE_NAMES[place] ?? null, placeValue: place, valueRepresented: valueOnly });
      }
    }
  }

  // Shape C: one or more "D හි ස්ථානය <place>ස්ථානය" fragments (place-only questions).
  if (rows.length === 0) {
    const fragments = [...solution.matchAll(/(\d)\s*හි ස්ථානය\s*([඀-෿][඀-෿\s]*ස්ථානය)/gu)];
    for (const fragment of fragments) {
      rows.push({ number, digit: Number(fragment[1]), place: null, placeValue: null, valueRepresented: null });
      answerRows.push({ number, digit: Number(fragment[1]), place: fragment[2].trim(), placeValue: null, valueRepresented: null });
    }
  }

  // Shape D: digit in the question, solution is a bare place name
  // ("76 109 හි 6 පිහිටි ස්ථානය නම් කරන්න." → "දහස්ස්ථානය").
  if (rows.length === 0) {
    const digitInQuestion = content.match(/(?:හි|සංඛ්‍යාවේ)\s*(\d)\s*(?:පිහිටි|ඉලක්කම)/u);
    const barePlace = solution.match(/^\s*([඀-෿][඀-෿\s]*ස්ථානය)\s*$/u);
    if (digitInQuestion && barePlace) {
      const digit = Number(digitInQuestion[1]);
      const placeValue = placeValueOf(barePlace[1]);
      rows.push({ number, digit, place: null, placeValue: null, valueRepresented: null });
      answerRows.push({
        number,
        digit,
        place: barePlace[1].trim(),
        placeValue,
        valueRepresented: placeValue !== null ? digit * placeValue : null,
      });
    }
  }

  // Shape E: digit in the question, solution is the bare represented value
  // ("76 109 හි 6 ඉලක්කමෙන් දක්වන අගය ලියන්න." → "6000").
  if (rows.length === 0) {
    const digitInQuestion = content.match(/(?:හි|සංඛ්‍යාවේ)\s*(\d)\s*(?:පිහිටි|ඉලක්කම)/u);
    const bareValue = parseNumber(solution);
    if (digitInQuestion && bareValue !== null) {
      const digit = Number(digitInQuestion[1]);
      const placeValue = digit > 0 ? bareValue / digit : null;
      if (placeValue !== null && PLACE_NAMES[placeValue]) {
        rows.push({ number, digit, place: null, placeValue: null, valueRepresented: null });
        answerRows.push({ number, digit, place: PLACE_NAMES[placeValue], placeValue, valueRepresented: bareValue });
      }
    }
  }

  // Shape F: solution "placeName, value" for a digit named in the question
  // ("…0 පිහිටි ස්ථානය සහ එහි අගය සෙවීම" → "දහයස්ථානය, 0").
  if (rows.length === 0) {
    const digitInQuestion = content.match(/(?:හි|සංඛ්‍යාවේ)\s*(\d)\s*පිහිටි/u);
    const pair = solution.match(/^\s*([඀-෿][඀-෿\s]*ස්ථානය)\s*,\s*([\d\s,]+)\s*$/u);
    if (digitInQuestion && pair) {
      const digit = Number(digitInQuestion[1]);
      const value = parseNumber(pair[2]);
      const placeValue = placeValueOf(pair[1]);
      if (value !== null && placeValue !== null && value === digit * placeValue) {
        rows.push({ number, digit, place: null, placeValue: null, valueRepresented: null });
        answerRows.push({ number, digit, place: pair[1].trim(), placeValue, valueRepresented: value });
      }
    }
  }

  // Shape G: positional "digit->value" pairs, units first
  // ("1->1, 0->0, 5->500, 5->5000, 7->70000" for 75 501).
  if (rows.length === 0) {
    const pairs = [...solution.matchAll(/(\d)\s*->\s*([\d\s,]+)/gu)];
    const reversedDigits = String(number).split("").reverse().map(Number);
    if (pairs.length >= 2 && pairs.length === reversedDigits.length) {
      const consistent = pairs.every((pair, index) => {
        const digit = Number(pair[1]);
        const value = parseNumber(pair[2]);
        return digit === reversedDigits[index] && value === digit * 10 ** index;
      });
      if (consistent) {
        for (let index = pairs.length - 1; index >= 0; index -= 1) {
          const digit = reversedDigits[index];
          const placeValue = 10 ** index;
          rows.push({ number, digit, place: null, placeValue: null, valueRepresented: null });
          answerRows.push({ number, digit, place: PLACE_NAMES[placeValue] ?? null, placeValue, valueRepresented: digit * placeValue });
        }
      }
    }
  }

  // Shape F2: solution "placeName, placeValue, represented" for a digit in
  // the question ("5024 සංඛ්‍යාවේ 4 ඉලක්කම…" → "එකස්ථානය, 1, 4").
  if (rows.length === 0) {
    const digitInQuestion = content.match(/(?:හි|සංඛ්‍යාවේ)\s*(\d)\s*(?:පිහිටි|ඉලක්කම)/u);
    const triple = solution.match(/^\s*([඀-෿][඀-෿\s]*ස්ථානය)\s*,\s*([\d\s,]+)\s*,\s*([\d\s,]+)\s*$/u);
    if (digitInQuestion && triple) {
      const digit = Number(digitInQuestion[1]);
      const placeValue = parseNumber(triple[2]);
      const represented = parseNumber(triple[3]);
      if (placeValue !== null && represented !== null && represented === digit * placeValue) {
        rows.push({ number, digit, place: null, placeValue: null, valueRepresented: null });
        answerRows.push({ number, digit, place: triple[1].trim(), placeValue, valueRepresented: represented });
      }
    }
  }

  // Shape H: the reverse task — represented value in the question, solution
  // "ඉලක්කම D, placeName, placeValue" ("…නිරූපිත අගය 700 වන විට…" → "ඉලක්කම 7, සියයස්ථානය, 100").
  if (rows.length === 0) {
    const reverse = solution.match(/ඉලක්කම\s*(\d)\s*,\s*([඀-෿][඀-෿\s]*ස්ථානය)\s*,\s*([\d\s,]+)/u);
    const representedInQuestion = content.match(/අගය\s*([\d\s,]+)\s*වන විට/u);
    if (reverse && representedInQuestion) {
      const digit = Number(reverse[1]);
      const placeValue = parseNumber(reverse[3]);
      const represented = parseNumber(representedInQuestion[1]);
      if (placeValue !== null && represented !== null && represented === digit * placeValue) {
        rows.push({ number, digit: null, place: null, placeValue: null, valueRepresented: represented });
        answerRows.push({ number, digit, place: reverse[2].trim(), placeValue, valueRepresented: represented });
      }
    }
  }

  if (rows.length === 0) return { row, reason: `no parseable digit/place/value pattern ("${solution.slice(0, 50)}")` };
  return {
    row,
    component_type: "PlaceValueTable",
    component_props: { variant: "breakdown", rows },
    answer: mergedAnswer(row, { rows: answerRows }),
    note: `${number}: ${answerRows.map((r) => `${r.digit}→${r.place ?? "?"}`).join(", ")}`,
  };
}

/** SequenceTable row from before/number/after questions. */
function parseSequence(row: Row): Migration | Flagged {
  const text = `${contentText(row)} , ${solutionText(row)}`;
  const grab = (pattern: RegExp) => parseNumber(text.match(pattern)?.[1] ?? null);
  const before = grab(/පෙර සංඛ්‍යාව\s*(?:ලෙස දී ඇති විට)?\s*:?\s*(\d[\d\s,]*)/u);
  const after = grab(/පසු සංඛ්‍යාව\s*(?:ලෙස දී ඇති විට)?\s*:?\s*(\d[\d\s,]*)/u);
  const middle = grab(/(?<!පෙර )(?<!පසු )සංඛ්‍යාව\s*:\s*(\d[\d\s,]*)/u);

  const known = [before, middle, after].filter((v): v is number => v !== null);
  if (known.length < 2) return { row, reason: "fewer than two of before/number/after found" };
  // Derive the full consecutive triple from any anchor.
  const number = middle ?? (before !== null ? before + 1 : after! - 1);
  const full = { before: number - 1, number, after: number + 1 };
  if ((before !== null && before !== full.before) || (after !== null && after !== full.after) || (middle !== null && middle !== full.number)) {
    return { row, reason: `values are not consecutive (${before}/${middle}/${after})` };
  }
  // What the question GIVES stays visible; the rest are blanks.
  const given = firstNumberIn(contentText(row));
  const props = {
    before: given === full.before ? full.before : null,
    number: given === full.number ? full.number : null,
    after: given === full.after ? full.after : null,
  };
  if (props.before === null && props.number === null && props.after === null) props.after = full.after;
  return {
    row,
    component_type: "SequenceTable",
    component_props: { rows: [props] },
    answer: mergedAnswer(row, { rows: [full] }),
    note: `${full.before} ← ${full.number} → ${full.after}`,
  };
}

const PARSERS: Record<string, (row: Row) => Migration | Flagged> = {
  abacusRepresentation: parseAbacus,
  numberExpansion: parseExpansion,
  placeValueBreakdown: parseBreakdown,
  numberSequence: parseSequence,
};

const TARGET_TYPE: Record<string, string> = {
  abacusRepresentation: "AbacusDiagram",
  numberExpansion: "ExpansionExercise",
  placeValueBreakdown: "PlaceValueTable",
  numberSequence: "SequenceTable",
};

async function main() {
  const { data, error } = await supabaseAdmin
    .from("content_bank")
    .select("id, concept_tag, component_type, component_props, answer, source, difficulty")
    .eq("subject", "maths")
    .eq("grade", 5)
    .eq("lesson", 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];

  const migrations: Migration[] = [];
  const flagged: Flagged[] = [];
  let alreadyTyped = 0;
  let outOfScope = 0;

  for (const row of rows) {
    const parser = PARSERS[row.concept_tag];
    if (!parser || row.component_type === "explanation") {
      outOfScope += 1;
      continue;
    }
    if (row.component_type === TARGET_TYPE[row.concept_tag]) {
      alreadyTyped += 1;
      continue;
    }
    const result = parser(row);
    if ("reason" in result) flagged.push(result);
    else migrations.push(result);
  }

  console.log(`Scanned ${rows.length} rows: ${migrations.length} to migrate, ${alreadyTyped} already correctly typed, ` +
      `${flagged.length} FLAGGED, ${outOfScope} out of scope (explanations + concepts without a structured target).`);

  console.log(`\n${"=".repeat(96)}`);
  console.log("MIGRATIONS" + (APPLY ? " (applying)" : " (report only — rerun with --apply to write)"));
  console.log("=".repeat(96));
  for (const m of migrations) {
    console.log(
      `  ${m.row.source.padEnd(22)} ${m.row.concept_tag.padEnd(22)} ${m.row.component_type} → ${m.component_type.padEnd(18)} ${m.note}`,
    );
  }

  if (flagged.length > 0) {
    console.log(`\n${"=".repeat(96)}`);
    console.log("FLAGGED — could not be mapped confidently; left untouched, needs your eyes:");
    console.log("=".repeat(96));
    for (const f of flagged) {
      console.log(`  ${f.row.source.padEnd(22)} ${f.row.concept_tag.padEnd(22)} id=${f.row.id}`);
      console.log(`    reason : ${f.reason}`);
      console.log(`    content: ${contentText(f.row).slice(0, 90)}`);
      console.log(`    answer : ${solutionText(f.row).slice(0, 90)}`);
    }
  }

  if (APPLY) {
    let written = 0;
    for (const m of migrations) {
      const { error: updateError } = await supabaseAdmin
        .from("content_bank")
        .update({ component_type: m.component_type, component_props: m.component_props, answer: m.answer })
        .eq("id", m.row.id);
      if (updateError) console.error(`  WRITE FAILED ${m.row.id}: ${updateError.message}`);
      else written += 1;
    }
    console.log(`\nApplied ${written}/${migrations.length} migrations.`);
    console.log("The lesson script cache invalidates itself: the fingerprint covers each row's component_type.");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
