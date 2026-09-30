import path from "node:path";

/** The teacher's design file (the source) and the app's generated copy of what it reads from it. */
export const DESIGN_SOURCE_PATH = path.resolve(__dirname, "../../../docs/design/maths-5-1.json");
export const DESIGN_DATA_PATH = path.resolve(__dirname, "../../src/data/lessons/design/maths-5-1.json");

export interface DesignSlice {
  $comment: string;
  subject: string;
  grade: number;
  lesson: number;
  concepts: Array<{ conceptTag: string; description: string; objective: string; vocabularyIntroduced: string[] }>;
}

/** The slice of a design file the app reads — deterministic, so the generated file and the test agree byte for byte. */
export function designSlice(design: {
  subject: string;
  grade: number;
  lesson: number;
  concepts: Array<{ conceptTag: string; description?: string; objective: string; vocabularyIntroduced: string[] }>;
}): DesignSlice {
  return {
    $comment: "GENERATED from docs/design/maths-5-1.json by `npm run generate:design` — edit the design file, not this.",
    subject: design.subject,
    grade: design.grade,
    lesson: design.lesson,
    concepts: design.concepts.map((c) => ({
      conceptTag: c.conceptTag,
      description: c.description ?? "",
      objective: c.objective,
      vocabularyIntroduced: [...c.vocabularyIntroduced],
    })),
  };
}
