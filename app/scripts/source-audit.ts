/** `npm run audit:source` — prints the source audit (scripts/lib/sourceAudit.ts); src/lib/sourceAudit.test.ts asserts it. */
import { settingOccurrences, uiSinhalaLiterals } from "./lib/sourceAudit";

const literals = uiSinhalaLiterals();
const byFile = new Map<string, number>();
for (const l of literals) byFile.set(l.file, (byFile.get(l.file) ?? 0) + 1);
console.log(`Sinhala literals in child- and parent-facing code outside appCopy.ts / authoredLines.ts: ${literals.length} in ${byFile.size} file(s)`);
for (const [file, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${file}`);
if (process.argv.includes("--list")) for (const l of literals) console.log(`    ${l.file}:${l.line}  ${l.text.slice(0, 70)}`);
console.log("\nEach duplicated setting, occurrences in the app's source (the contract: exactly 1, in src/lib/settings.ts):");
for (const s of settingOccurrences()) console.log(`  ${String(s.hits.length).padStart(2)}  ${s.name.padEnd(36)} ${s.hits.map((h) => `${h.file}:${h.line}`).join(", ")}`);
