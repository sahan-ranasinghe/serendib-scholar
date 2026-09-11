/**
 * docs/review/app-copy.md — every child- and parent-facing string of the
 * app shell (src/lib/appCopy.ts) for one review pass: screen, key,
 * Sinhala, English gloss, status. A string is `fromScript` when it appears
 * verbatim in the authored lesson script (the storyboard's source of
 * Sinhala) and `drafted` otherwise; strings the app needs but has no
 * Sinhala for are listed as `missing`, never invented.
 *
 *   npx tsx scripts/extract-copy.ts
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { COPY, MISSING } from "../src/lib/appCopy";

async function main() {
  const authored = await readFile(path.resolve(process.cwd(), "src/data/lessons/authored/maths-5-1.json"), "utf8");
  const storyboard = await readFile(path.resolve(process.cwd(), "src/data/storyboard/maths-5-1-session-1.json"), "utf8").catch(() => "");
  const script = `${authored}\n${storyboard}`;
  const strip = (s: string) => s.replace(/\{[a-z]+\}/gu, "").trim();
  const rows = Object.entries(COPY).map(([key, entry]) => {
    const probe = strip(entry.si).split(/\s*[{}]\s*/u).filter((p) => p.length >= 4)[0] ?? strip(entry.si);
    const fromScript = probe.length >= 4 && script.includes(probe);
    return { key, screen: entry.screen, si: entry.si, en: entry.en, status: fromScript ? "fromScript" : "drafted" };
  });
  const counts = { fromScript: rows.filter((r) => r.status === "fromScript").length, drafted: rows.filter((r) => r.status === "drafted").length, missing: MISSING.length };
  const lines: string[] = [];
  lines.push("# App copy — review sheet", "");
  lines.push("Every child-facing and parent-facing string outside the session, extracted from `src/lib/appCopy.ts` by `scripts/extract-copy.ts`.", "");
  lines.push("- **fromScript**: the Sinhala appears verbatim in the authored lesson script (`src/data/lessons/authored/maths-5-1.json`) or the storyboard.");
  lines.push("- **drafted**: from the design export (Screens A/B/C) or the runtime — needs sign-off (README \"Copy\").");
  lines.push("- **missing**: the app needs the line and the export has no Sinhala for it; the screen leaves the spot empty or reuses an export string, and the English gloss says what is needed.", "");
  lines.push(`Counts: fromScript ${counts.fromScript} · drafted ${counts.drafted} · missing ${counts.missing}`, "");
  lines.push("Terms: ගණක රාමුව (never අබකසය) · සාරා · සෙරෙන්ඩිබ් ශිෂ්‍ය. `{name}`-style holes are filled at runtime.", "");
  lines.push("| screen | key | Sinhala | English gloss | status |", "|---|---|---|---|---|");
  for (const r of rows) lines.push(`| ${r.screen} | \`${r.key}\` | ${r.si.replace(/\|/gu, "\\|")} | ${r.en.replace(/\|/gu, "\\|")} | ${r.status} |`);
  lines.push("", "## Missing — no Sinhala in the export (not rendered)", "", "| screen | key | needed (English) | where |", "|---|---|---|---|");
  for (const m of MISSING) lines.push(`| ${m.screen} | \`${m.key}\` | ${m.en.replace(/\|/gu, "\\|")} | ${m.where.replace(/\|/gu, "\\|")} |`);
  const out = path.resolve(process.cwd(), "../docs/review/app-copy.md");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, lines.join("\n") + "\n");
  console.log(`app-copy.md: ${rows.length} strings — fromScript ${counts.fromScript} · drafted ${counts.drafted} · missing ${counts.missing}`);
  console.log(JSON.stringify(counts));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
