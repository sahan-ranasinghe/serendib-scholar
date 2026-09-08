/**
 * How much of the storyboard the board library can now draw.
 *
 *   npm run board:coverage
 *
 * Reads docs/storyboard/maths-5-1-session-1.json, counts every event by
 * primitive.event, and checks each against src/components/board/events.ts
 * — the vocabulary as the library implements it. Prints the producible
 * count against the total, the partials with their notes, anything not
 * producible, and the pointer-target kinds the storyboard uses.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { DURATION_MS, IMPLEMENTED, VOCABULARY, type EventName } from "../src/components/board/events";
import { SPRING, SPRING_BOUNCY, SPRING_SNAPPY } from "../src/components/board/theme";

interface StoryboardEvent {
  primitive: string;
  event: string;
  args?: Record<string, unknown>;
}
interface Storyboard {
  beats: Array<{ id: string; events: StoryboardEvent[] }>;
}

const file = path.resolve(process.cwd(), "../docs/storyboard/maths-5-1-session-1.json");
const storyboard = JSON.parse(readFileSync(file, "utf8")) as Storyboard;

const counts = new Map<string, number>();
const targetKinds = new Map<string, number>();
let total = 0;
for (const beat of storyboard.beats) {
  for (const event of beat.events) {
    total += 1;
    const name = `${event.primitive}.${event.event}`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    const target = event.args?.target as Record<string, unknown> | undefined;
    if (target) {
      const kind = Object.keys(target).filter((k) => k !== "place").join("+") + ("place" in target ? "+place" : "");
      targetKinds.set(kind, (targetKinds.get(kind) ?? 0) + 1);
    }
  }
}

let producible = 0;
const partial: string[] = [];
const missing: string[] = [];
const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`storyboard: ${storyboard.beats.length} beats, ${total} events\n`);
for (const [name, count] of rows) {
  const support = IMPLEMENTED[name as EventName];
  const status = support ? support.support : "NOT IN VOCABULARY";
  if (support) producible += count;
  if (support?.support === "partial") partial.push(`${name} ×${count} — ${support.note}`);
  if (!support) missing.push(`${name} ×${count}`);
  console.log(`  ${String(count).padStart(4)}  ${name.padEnd(30)} ${status}${support ? `  ≤ ${DURATION_MS[name as EventName]} ms` : ""}`);
}

console.log(`\nproducible: ${producible} / ${total} storyboard events (${((producible / total) * 100).toFixed(1)}%)`);
if (partial.length) {
  console.log(`\npartial (producible, with a note):`);
  for (const line of partial) console.log(`  · ${line}`);
}
if (missing.length) {
  console.log(`\nnot producible:`);
  for (const line of missing) console.log(`  ✗ ${line}`);
}

console.log(`\npointer/highlight target kinds used:`);
for (const [kind, count] of [...targetKinds.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(4)}  {${kind}}`);

// Every vocabulary event, whether or not the storyboard used it.
const vocabulary = Object.entries(VOCABULARY).flatMap(([primitive, events]) => events.map((e) => `${primitive}.${e}` as EventName));
const unused = vocabulary.filter((name) => !counts.has(name));
console.log(`\nvocabulary: ${vocabulary.length} events, all implemented (${vocabulary.filter((n) => IMPLEMENTED[n].support === "partial").length} partial); ${unused.length} not used by this storyboard: ${unused.join(", ")}`);

// The springs, as the settle time a viewer would see (amplitude down to 0.1 %).
const settle = (spring: { stiffness?: number; damping?: number; mass?: number }) => {
  const decay = (spring.damping ?? 10) / (2 * (spring.mass ?? 1));
  return Math.round((6.9 / decay) * 1000);
};
console.log(`\nmotion: SPRING settles in ~${settle(SPRING)} ms · SPRING_BOUNCY ~${settle(SPRING_BOUNCY)} ms · SPRING_SNAPPY ~${settle(SPRING_SNAPPY)} ms (ceiling 600 ms)`);
const overBudget = Object.entries(DURATION_MS).filter(([, ms]) => ms > 600);
if (overBudget.length) {
  console.log(`  ✗ over 600 ms: ${overBudget.map(([n, ms]) => `${n}=${ms}`).join(", ")}`);
  process.exit(1);
}
process.exit(missing.length ? 1 : 0);
