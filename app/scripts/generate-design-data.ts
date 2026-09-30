/**
 * The design file is the source; this writes the part the app reads.
 *
 *   npm run generate:design
 *
 * docs/design/<lesson>.json (the teacher's design, outside the app so the build cannot import it) → the slice the app
 * needs at build time: each concept's tag, English description, syllabus objective and the vocabulary it introduces,
 * in teaching order. src/lib/lessonDesign.ts derives VOCABULARY_INTRODUCED_BY and the concept descriptions from it;
 * src/lib/lessonDesign.test.ts fails if this copy and the design file disagree (so an edit to the design that is not
 * regenerated is caught, not shipped).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { designSlice, DESIGN_DATA_PATH, DESIGN_SOURCE_PATH } from "./lib/designSlice";

async function main(): Promise<void> {
  const design = JSON.parse(await readFile(DESIGN_SOURCE_PATH, "utf8"));
  const slice = designSlice(design);
  await mkdir(path.dirname(DESIGN_DATA_PATH), { recursive: true });
  await writeFile(DESIGN_DATA_PATH, `${JSON.stringify(slice, null, 2)}\n`, "utf8");
  console.log(`wrote ${path.relative(process.cwd(), DESIGN_DATA_PATH)}: ${slice.concepts.length} concepts, ${slice.concepts.reduce((n, c) => n + c.vocabularyIntroduced.length, 0)} vocabulary terms`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
