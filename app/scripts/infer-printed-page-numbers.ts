/**
 * One-time post-processing pass: back-fills printed_page_number gaps by
 * sequential inference, for files where the vast majority of rows already
 * share a consistent (page_number - printed_page_number) offset.
 *
 * This is deliberately NOT part of ingest-syllabus.ts's per-page logic — it
 * runs manually, after ingestion, over whatever is currently in the
 * database. Re-running it is safe (idempotent): it only ever fills rows
 * that are still null, and only ever anchors its offset/bounds computation
 * on rows with printed_page_number_inferred = false (real, transcribed
 * values), so inferred rows never get used to justify further inference.
 *
 * Run with:  npx tsx scripts/infer-printed-page-numbers.ts
 * (from the app/ directory, same as ingest-syllabus.ts.)
 *
 * Prerequisite: syllabus_chunks needs the printed_page_number_inferred
 * column (see supabase/schema.sql) — run this in the Supabase SQL editor
 * first if it isn't there yet:
 *
 *   alter table syllabus_chunks
 *     add column if not exists printed_page_number_inferred boolean not null default false;
 *
 * Logic, per source file (grouped by source_reference's "<folder>/<file>"
 * prefix, i.e. independently per ingested PDF):
 *   1. Compute the dominant (page_number - printed_page_number) offset
 *      across that file's "confirmed" rows (printed_page_number_inferred
 *      = false and printed_page_number not null).
 *   2. If there are too few confirmed rows, or too many of them disagree
 *      with the dominant offset, the whole file is left untouched — there
 *      isn't a single trustworthy pattern to extrapolate from.
 *   3. Otherwise, for each null row whose page_number falls STRICTLY
 *      BETWEEN the lowest and highest confirmed page_number for that file
 *      (i.e. a genuine interior gap, never the start or end of the book,
 *      where "no printed number" may be real rather than missing),
 *      infer printed_page_number = page_number - dominant offset and mark
 *      printed_page_number_inferred = true.
 */
import { supabaseAdmin } from "../src/lib/supabaseAdmin";

// Minimum number of confirmed (non-inferred, non-null) rows a file needs
// before its offset pattern is trusted at all.
const MIN_CONFIRMED_SAMPLE_SIZE = 10;
// Fraction of confirmed rows that must agree with the dominant offset for
// the file to be considered a "vast majority" consensus worth trusting.
const MIN_CONSENSUS_RATIO = 0.9;

interface Row {
  id: string;
  source_reference: string;
  page_number: number;
  printed_page_number: number | null;
  printed_page_number_inferred: boolean;
}

function fileKeyOf(sourceReference: string): string {
  const hashIndex = sourceReference.indexOf("#chunk-");
  return hashIndex === -1 ? sourceReference : sourceReference.slice(0, hashIndex);
}

async function fetchAllRows(): Promise<Row[]> {
  const pageSize = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("syllabus_chunks")
      .select("id, source_reference, page_number, printed_page_number, printed_page_number_inferred")
      .range(from, from + pageSize - 1);
    if (error) {
      if (error.message.includes("printed_page_number_inferred")) {
        console.error(
          "\nsyllabus_chunks is missing the printed_page_number_inferred column. Run this in the " +
            "Supabase SQL editor first, then re-run this script:\n\n" +
            "  alter table syllabus_chunks\n" +
            "    add column if not exists printed_page_number_inferred boolean not null default false;\n",
        );
      }
      throw error;
    }
    rows.push(...(data as Row[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const rows = await fetchAllRows();
  const byFile = new Map<string, Row[]>();
  for (const row of rows) {
    const key = fileKeyOf(row.source_reference);
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key)!.push(row);
  }

  let totalInferred = 0;
  let totalLeftNull = 0;

  for (const [fileKey, fileRows] of byFile) {
    console.log(`\n${fileKey}`);

    const confirmed = fileRows.filter((r) => !r.printed_page_number_inferred && r.printed_page_number !== null);
    const nullRows = fileRows.filter((r) => r.printed_page_number === null);

    if (nullRows.length === 0) {
      console.log(`  No null printed_page_number rows — nothing to infer.`);
      continue;
    }

    if (confirmed.length < MIN_CONFIRMED_SAMPLE_SIZE) {
      console.log(
        `  Skipped: only ${confirmed.length} confirmed row(s) (need at least ${MIN_CONFIRMED_SAMPLE_SIZE}) — ` +
          `not enough evidence to trust an offset. ${nullRows.length} row(s) left null.`,
      );
      totalLeftNull += nullRows.length;
      continue;
    }

    const offsetCounts = new Map<number, number>();
    for (const row of confirmed) {
      const offset = row.page_number - row.printed_page_number!;
      offsetCounts.set(offset, (offsetCounts.get(offset) ?? 0) + 1);
    }
    const [dominantOffset, dominantCount] = [...offsetCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const consensusRatio = dominantCount / confirmed.length;

    console.log(
      `  Confirmed rows: ${confirmed.length} | dominant offset: ${dominantOffset} ` +
        `(${dominantCount}/${confirmed.length} = ${(consensusRatio * 100).toFixed(1)}% consensus)`,
    );

    if (consensusRatio < MIN_CONSENSUS_RATIO) {
      console.log(
        `  Skipped: consensus ${(consensusRatio * 100).toFixed(1)}% is below the ${MIN_CONSENSUS_RATIO * 100}% ` +
          `threshold — offsets are too inconsistent to trust a single dominant pattern. ` +
          `${nullRows.length} row(s) left null.`,
      );
      totalLeftNull += nullRows.length;
      continue;
    }

    const minConfirmedPage = Math.min(...confirmed.map((r) => r.page_number));
    const maxConfirmedPage = Math.max(...confirmed.map((r) => r.page_number));

    const toInfer: { row: Row; value: number }[] = [];
    const outOfBounds: Row[] = [];
    for (const row of nullRows) {
      if (row.page_number > minConfirmedPage && row.page_number < maxConfirmedPage) {
        toInfer.push({ row, value: row.page_number - dominantOffset });
      } else {
        outOfBounds.push(row);
      }
    }

    for (const { row, value } of toInfer) {
      const { error } = await supabaseAdmin
        .from("syllabus_chunks")
        .update({ printed_page_number: value, printed_page_number_inferred: true })
        .eq("id", row.id);
      if (error) throw error;
    }

    console.log(
      `  Inferred ${toInfer.length} row(s) (page_number - ${dominantOffset}) within the confirmed range ` +
        `[${minConfirmedPage}, ${maxConfirmedPage}].`,
    );
    if (outOfBounds.length > 0) {
      const pages = outOfBounds.map((r) => r.page_number).sort((a, b) => a - b);
      console.log(
        `  Left null: ${outOfBounds.length} row(s) outside that range (start/end of book, no ` +
          `bounding evidence either side) — pages: ${pages.join(", ")}`,
      );
    }

    totalInferred += toInfer.length;
    totalLeftNull += outOfBounds.length;
  }

  console.log(`\nDone. ${totalInferred} row(s) inferred, ${totalLeftNull} row(s) left as genuinely unknown.`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
