import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * THE SOURCE AUDIT (29 Sep 2026, docs/cms/content-inventory.md §16) — two greps the app must keep passing, run by
 * src/lib/sourceAudit.test.ts and printed by `npm run audit:source`.
 *
 * 1. No Sinhala literal in child- or parent-facing code outside the two text tables (src/lib/appCopy.ts, the screens'
 *    words; src/lib/authoredLines.ts, Zara's fixed spoken lines). "Literal" means a string, a template or JSX text
 *    with a Sinhala letter in it — found by parsing each file, so a comment never counts and JSX text always does.
 * 2. Each duplicated setting is written once: its definition in src/lib/settings.ts and nowhere else.
 */

const APP = path.resolve(__dirname, "../..");
const SRC = path.join(APP, "src");
const SINHALA = /[඀-෿]/u;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/u.test(name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(APP, file);

/**
 * Child- and parent-facing code: every screen, hook and route, and the lib modules that write screen text. Out of
 * scope, each for its reason:
 *   - src/lib/appCopy.ts, src/lib/authoredLines.ts — the two tables themselves;
 *   - src/app/(app)/admin/**, src/app/(app)/portal/**, src/app/api/portal/** — the developer's galleries and the
 *     voice actor's portal (neither a child's nor a parent's screen);
 *   - src/app/(payload)/** — Payload's own generated route files (the CMS panel, docs/cms/SETUP.md);
 *   - tests and the design-export fixtures (src/lib/appFixtures.ts, src/lib/designFrames.ts), which must match the
 *     design export word for word;
 *   - lesson content and the language itself — src/data/** (the script, the storyboard, the transcripts), the number
 *     grammar, the speech and answer rules and the director's goal lines: they are the lesson, reviewed through the
 *     script's own rounds (docs/cms/content-inventory.md §1–§8), not screen copy;
 *   - the routes whose Sinhala is only an example inside a MODEL PROMPT (/api/hear, /api/planner, /api/speak-line, and
 *     /api/opener, which nothing calls) — words a model is told, never words a screen shows.
 * The lesson modules that DO put words on the board or in Zara's mouth (the close card, the concept and exercise
 * titles, the table columns, the number frames, the orchestrator's inserted beats, the recap question) are in scope:
 * a spoken line with no home in authoredLines.ts would be a line the voice actor's portal cannot list.
 *
 * Two kinds of Sinhala literal are identifiers, not words shown, and pass: a string literal TYPE (the board's `Place`
 * union), and the rods' identifier lists ROD_LABELS / PLACES_4 in src/components/board/tokens.ts — the storyboard's
 * events are keyed by them (`{ rod: "සි" }`); what the child reads under a rod is rodLabel(), from the sheet.
 */
const MODEL_PROMPT_ROUTES = /^src\/app\/api\/(hear|planner|speak-line|opener)\//u;
const IDENTIFIER_CONSTS = new Set(["src/components/board/tokens.ts:ROD_LABELS", "src/components/board/tokens.ts:PLACES_4"]);
export const UI_SCOPE = (file: string): boolean => {
  const r = rel(file);
  if (/\.test\.tsx?$/u.test(r)) return false;
  if (r === "src/lib/appCopy.ts" || r === "src/lib/authoredLines.ts") return false;
  if (/^src\/app\/\(app\)\/(admin|portal)\//u.test(r) || /^src\/app\/\(payload\)\//u.test(r) || /^src\/app\/api\/portal\//u.test(r) || MODEL_PROMPT_ROUTES.test(r)) return false;
  return (
    /^src\/(components|hooks|app)\//u.test(r) ||
    ["src/proxy.ts", "src/lib/rateLimit.ts", "src/lib/appData.ts", "src/lib/avatars.ts", "src/lib/settings.ts", "src/lib/choreography.ts", "src/lib/lessonScriptBuilder.ts", "src/lib/composeNumberAudio.ts", "src/lib/lessonOrchestrator.ts", "src/lib/recapBeat.ts", "src/lib/spokenLines.ts"].includes(r)
  );
};

export interface Literal {
  file: string;
  line: number;
  text: string;
}

/** Every Sinhala string, template or JSX text in a file (comments excluded — the parser never sees them as literals). */
export function sinhalaLiteralsIn(file: string): Literal[] {
  const isIdentifier = (node: ts.Node): boolean => {
    for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
      if (ts.isLiteralTypeNode(at) || ts.isTypeAliasDeclaration(at)) return true;
      if (ts.isVariableDeclaration(at) && ts.isIdentifier(at.name)) return IDENTIFIER_CONSTS.has(`${rel(file)}:${at.name.text}`);
    }
    return false;
  };
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Literal[] = [];
  const visit = (node: ts.Node) => {
    const text =
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
        ? node.text
        : ts.isJsxText(node)
          ? node.getText()
          : null;
    if (text !== null && SINHALA.test(text) && !isIdentifier(node)) found.push({ file: rel(file), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: text.trim().replace(/\s+/gu, " ") });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

export function uiSinhalaLiterals(): Literal[] {
  return walk(SRC).filter(UI_SCOPE).flatMap(sinhalaLiteralsIn);
}

/**
 * Each duplicated setting, as the forms it used to be written in. After the settings module, every pattern must match
 * exactly once in the app's source — its definition in src/lib/settings.ts (tests and the design fixtures excluded,
 * as above). A pattern matches code and comments alike: a comment restating a number is a second copy of it.
 */
export const SETTING_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "daily-limit choices (15 · 20 · 30)", pattern: /15\s*(?:,|\||·)\s*20\s*(?:,|\||·)\s*30/gu },
  { name: "daily-limit default (30)", pattern: /DEFAULT_DAILY_LIMIT[^=\n]*=\s*30\b|dailyLimitMinutes:\s*30\b|limit === 30/gu },
  { name: "chat choices (15 · 30 · 60)", pattern: /15\s*(?:,|\||·)\s*30\s*(?:,|\||·)\s*60|value === 15 \|\| value === 30/gu },
  { name: "chat default (30)", pattern: /DEFAULT_CHAT_MINUTES[^=\n]*=\s*30\b|chatMinutes \?\? 30\b/gu },
  { name: "mastery (85 %)", pattern: /(?:>=|<=|===|=)\s*85\b|\b85\s*%/gu },
  { name: "practice minutes (3)", pattern: /PRACTICE_MINUTES\s*=\s*3\b|මිනිත්තු\s*3|\b3 minutes (?:—|·)|minutesN", \{ n: 3 \}/gu },
  { name: "tagline", pattern: /ඔයාගේම ගුරුතුමිය, ඔයාගේ ෆෝන් එකේ/gu },
  { name: "sticker total (12)", pattern: /STICKER_SLOTS\s*=\s*12\b|total:\s*12\b/gu },
  { name: "outfit rule (one per 3 stickers)", pattern: /STICKERS_PER_OUTFIT\s*=\s*3\b|\(\s*(?:i|index)\s*\+\s*1\s*\)\s*\*\s*3\b/gu },
];

export function settingOccurrences(): Array<{ name: string; hits: Array<{ file: string; line: number }> }> {
  const files = walk(SRC).filter((file) => {
    const r = rel(file);
    return !/\.test\.tsx?$/u.test(r) && r !== "src/lib/appFixtures.ts" && r !== "src/lib/designFrames.ts" && !/^src\/app\/admin\//u.test(r);
  });
  return SETTING_PATTERNS.map(({ name, pattern }) => ({
    name,
    hits: files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [...text.matchAll(pattern)].map((m) => ({ file: rel(file), line: text.slice(0, m.index).split("\n").length }));
    }),
  }));
}
