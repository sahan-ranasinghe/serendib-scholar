/**
 * Voice coverage on its own, for when the dry run is more than you want.
 *
 *   npm run portal:coverage
 *
 * The same report the dry run prints and the portal shows (src/lib/voiceCoverage.ts coverageOf): distinct clips
 * needed — one per line the runtime can speak — against her recorded and approved clips and the AI ones, by group.
 */
import { coverageOf, formatCoverage, voiceShelf } from "../src/lib/voiceCoverage";
import { runtimeSpokenLines } from "../src/lib/spokenLines";
import { voiceProfile } from "../src/lib/humanClips";
import { buildOfflineScript } from "./lib/offlineScript";

async function main(): Promise<void> {
  // What the child hears: the built lesson with the actor's accepted re-wordings — every line it can speak.
  const lines = runtimeSpokenLines(await buildOfflineScript({ actorWording: true }));
  console.log(`\nVOICE COVERAGE — ${lines.length} distinct lines the runtime can speak\n${"=".repeat(70)}`);
  console.log(formatCoverage(coverageOf(lines, await voiceShelf()), voiceProfile()));
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
