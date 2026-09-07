/**
 * Voice coverage on its own, for when the dry run is more than you want.
 *
 *   npm run portal:coverage
 *
 * The same report the dry run prints: how many lines exist in her voice,
 * how many in the rendered one, per concept, and every line still waiting
 * for her.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseAuthoredScript } from "../src/lib/authoredScript";
import { formatCoverage, voiceCoverage } from "../src/lib/voiceCoverage";
import { voiceProfile } from "../src/lib/humanClips";

async function main(): Promise<void> {
  const file = parseAuthoredScript(
    await readFile(path.join(process.cwd(), "src/data/lessons/authored/maths-5-1.json"), "utf8"),
  );
  if (!file) throw new Error("Nothing authored yet.");
  console.log(`\nVOICE COVERAGE — ${file.beats.length} authored beats\n${"=".repeat(70)}`);
  console.log(formatCoverage(await voiceCoverage(file), voiceProfile()));
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
