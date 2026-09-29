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
import { COPY, MISSING, APP_NAME_EN, APP_NAME_SI, COMPANY_NAME } from "../src/lib/appCopy";
import { AUTHORED_LINES, LESSON_TIME_DRAFTS } from "../src/lib/authoredLines";

async function main() {
  const authored = await readFile(path.resolve(process.cwd(), "src/data/lessons/authored/maths-5-1.json"), "utf8");
  const storyboard = await readFile(path.resolve(process.cwd(), "src/data/storyboard/maths-5-1-session-1.json"), "utf8").catch(() => "");
  const script = `${authored}\n${storyboard}`;
  const strip = (s: string) => s.replace(/\{[a-z]+\}/gu, "").trim();
  // The review rounds (docs/review/app-copy-corrections.json): each string's ruling is its status; a string the
  // reviewed table did not correct is "reviewed". Before any round, everything not in the script was "drafted".
  const corrections = JSON.parse(await readFile(path.resolve(process.cwd(), "../docs/review/app-copy-corrections.json"), "utf8").catch(() => "null")) as {
    round: string;
    statuses: Record<string, string>;
    strings: Record<string, { ruling: string }>;
    spokenDrafts?: Array<{ key: string; si: string; en: string }>;
  } | null;
  const RULING_STATUS: Record<string, string> = { accept: "accepted", adjust: "adjusted", reject: "kept", consistency: "consistency", add: "added" };
  const rows = Object.entries(COPY).map(([key, entry]) => {
    const probe = strip(entry.si).split(/\s*[{}]\s*/u).filter((p) => p.length >= 4)[0] ?? strip(entry.si);
    const fromScript = probe.length >= 4 && script.includes(probe);
    const ruling = corrections?.strings[key]?.ruling;
    const status = ruling ? RULING_STATUS[ruling]! : fromScript ? "fromScript" : corrections ? "reviewed" : "drafted";
    return { key, screen: entry.screen, si: entry.si, en: entry.en, status };
  });
  const order = ["accepted", "adjusted", "kept", "consistency", "added", "reviewed", "fromScript", "drafted"];
  const counts = Object.fromEntries([...order.map((status) => [status, rows.filter((r) => r.status === status).length] as const).filter(([, n]) => n > 0), ["missing", MISSING.length] as const]);
  const lines: string[] = [];
  lines.push("# App copy — review sheet", "");
  lines.push("Every child-facing and parent-facing string outside the session, extracted from `src/lib/appCopy.ts` by `scripts/extract-copy.ts`.", "");
  if (corrections) {
    lines.push(`Last review round: **${corrections.round}** — every ruling and its reason in \`docs/review/app-copy-corrections.json\`.`, "");
    for (const status of order) if (corrections.statuses[status]) lines.push(`- **${status}**: ${corrections.statuses[status]}.`);
  } else {
    lines.push("- **fromScript**: the Sinhala appears verbatim in the authored lesson script (`src/data/lessons/authored/maths-5-1.json`) or the storyboard.");
    lines.push("- **drafted**: from the design export (Screens A/B/C) or the runtime — needs sign-off (README \"Copy\").");
  }
  lines.push("- **missing**: the app needs the line and has no Sinhala for it; the screen leaves the spot empty or reuses another string, and the English gloss says what is needed.", "");
  lines.push(`Counts: ${Object.entries(counts).map(([status, n]) => `${status} ${n}`).join(" · ")}`, "");
  lines.push(`Terms: ගණක රාමුව (never අබකසය) · සාරා · ${APP_NAME_SI} (Latin "${APP_NAME_EN}" only on the splash wordmark, the manifest and the parent zone's English; "${COMPANY_NAME}" is the company, parent-zone footer only). \`{name}\`-style holes are filled at runtime.`, "");
  lines.push("| screen | key | Sinhala | English gloss | status |", "|---|---|---|---|---|");
  for (const r of rows) lines.push(`| ${r.screen} | \`${r.key}\` | ${r.si.replace(/\|/gu, "\\|")} | ${r.en.replace(/\|/gu, "\\|")} | ${r.status} |`);
  lines.push("", "## Missing — no Sinhala in the export (not rendered)", "");
  if (MISSING.length === 0) lines.push("None.");
  else lines.push("| screen | key | needed (English) | where |", "|---|---|---|---|");
  for (const m of MISSING) lines.push(`| ${m.screen} | \`${m.key}\` | ${m.en.replace(/\|/gu, "\\|")} | ${m.where.replace(/\|/gu, "\\|")} |`);
  // Lines Zara speaks (src/lib/authoredLines.ts) that the developer drafted: recorded only once a native speaker signs them off.
  lines.push("", "## Spoken lines drafted by the developer — need sign-off before recording", "", "Zara says these (src/lib/authoredLines.ts); they are in the render batch and read on the board until recorded.", "", "| key | Sinhala | English gloss | status |", "|---|---|---|---|");
  for (const d of LESSON_TIME_DRAFTS) lines.push(`| \`${d.key}\` | ${String(AUTHORED_LINES[d.key]).replace(/\|/gu, "\\|")} | ${d.en.replace(/\|/gu, "\\|")} | drafted |`);
  // Lines a review round added to the lesson script (docs/review/session-1-corrections.json) — the same sign-off applies.
  for (const d of corrections?.spokenDrafts ?? []) lines.push(`| \`${d.key}\` | ${d.si.replace(/\|/gu, "\\|")} | ${d.en.replace(/\|/gu, "\\|")} | drafted |`);
  const out = path.resolve(process.cwd(), "../docs/review/app-copy.md");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, lines.join("\n") + "\n");
  console.log(`app-copy.md: ${rows.length} strings — ${Object.entries(counts).map(([status, n]) => `${status} ${n}`).join(" · ")}`);
  console.log(JSON.stringify(counts));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
