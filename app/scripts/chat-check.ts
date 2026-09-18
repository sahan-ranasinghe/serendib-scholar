/**
 * Does the ✋ chat know where it is?
 *
 *   npm run chat:check
 *
 * Builds the SAME context the runtime would mint at placeValue4Digit:44
 * (the storyboard reduced to that beat, the surrounding lines, the
 * concept) and puts one question to the model under the chat's own
 * system prompt: "මොකද්ද මේ දහසස්ථානය?". Asserts the reply refers to the
 * abacus / the thousands rod and introduces no new topic. One model call
 * (the text model the planner route already uses), not a Live session.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { initialStage, isKnownEvent, reduceStage, conceptTitle, type Storyboard } from "../src/lib/choreography";
import { boardFocus, chatContextPrompt, sanitizeChatContext, serializeStage } from "../src/lib/chatContext";
import { buildSystemPrompt } from "../src/lib/prompt";
import { CHAT_BOARD_TOOLS } from "../src/lib/geminiLiveTools";

const BEAT = "authored:placeValue4Digit:44";
const QUESTION = "මොකද්ද මේ දහසස්ථානය?";
const MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.6-flash";

async function main(): Promise<void> {
  const storyboard = JSON.parse(readFileSync(path.join(process.cwd(), "src/data/storyboard/maths-5-1-session-1.json"), "utf8")) as Storyboard;
  const design = JSON.parse(readFileSync(path.join(process.cwd(), "../docs/design/maths-5-1.json"), "utf8")) as { concepts: Array<{ conceptTag: string; objective: string }> };
  const index = storyboard.beats.findIndex((b) => b.id === BEAT);
  if (index < 0) throw new Error(`${BEAT} not in the storyboard`);

  // The board as the runtime would have it when :44 is on.
  let stage = initialStage();
  for (const beat of storyboard.beats.slice(0, index + 1)) for (const event of beat.events) if (isKnownEvent(event)) stage = reduceStage(stage, event, { lastBuilt: 1364 });

  const context = sanitizeChatContext({
    subject: "maths",
    lesson: "1 · සංඛ්‍යා - 1",
    concept: { tag: "placeValue4Digit", title: conceptTitle("placeValue4Digit"), objective: design.concepts.find((c) => c.conceptTag === "placeValue4Digit")?.objective ?? "" },
    recentLines: storyboard.beats.slice(Math.max(0, index - 3), index).map((b) => b.line),
    nextLine: storyboard.beats[index]?.line ?? null,
    board: serializeStage(stage),
    boardFocus: boardFocus(stage),
    recentAnswers: [{ question: storyboard.beats[index - 1]?.line ?? "", answer: "(tapped)", correct: true }],
    weakestConcept: null,
  })!;
  console.log(`context board: ${context.board}`);
  console.log(`what they are pointing at: ${context.boardFocus ?? "(nothing specific)"}`);
  console.log(`last lines: ${context.recentLines.map((l) => l.slice(0, 40)).join(" | ")}`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });
  const system = buildSystemPrompt([]) + chatContextPrompt(context);
  // The chat's turn, with its tool loop: a turn that only points at the
  // board gets the tool's reply and continues, as the Live session would.
  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
    { role: "user", parts: [{ text: "[The child raised their hand during the lesson.]" }] },
    { role: "model", parts: [{ text: "ඔයා ගණක රාමුව දිහා බලාගෙන ඉන්නවා නේද පුතේ — මොකක්ද අහන්න ඕනේ?" }] },
    { role: "user", parts: [{ text: QUESTION }] },
  ];
  const config = {
    systemInstruction: { parts: [{ text: system }] },
    tools: [{ functionDeclarations: CHAT_BOARD_TOOLS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parametersJsonSchema })) }],
    maxOutputTokens: 400,
  };
  let text = "";
  const calls: string[] = [];
  for (let turn = 0; turn < 3; turn += 1) {
    const response = await ai.models.generateContent({ model: MODEL, contents, config });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    text = [text, ...parts.map((p) => p.text ?? "")].join(" ").trim();
    const functionCalls = parts.filter((p) => p.functionCall);
    for (const p of functionCalls) calls.push(`${p.functionCall!.name}(${JSON.stringify(p.functionCall!.args)})`);
    if (functionCalls.length === 0) break;
    contents.push({ role: "model", parts: parts as Array<Record<string, unknown>> });
    contents.push({ role: "user", parts: functionCalls.map((p) => ({ functionResponse: { name: p.functionCall!.name, response: { ok: true } } })) });
  }
  console.log(`\nZara: ${text}`);
  if (calls.length) console.log(`tools: ${calls.join(", ")}`);

  const refersToBoard = /ගණක රාමු|දහසස්ථාන|කූර|පබළු|5 ?421|පන්දහස/u.test(text) || calls.some((c) => /rod:0|number:5421|abacus/u.test(c));
  const newTopic = /ගුණ|බෙදීම|භාග|දශම|දස දහස|ලක්ෂ|දිග|බර|කාලය|multiplication|fraction/u.test(text);
  const teachesAhead = /දස දහසස්ථාන|ඉලක්කම් පහ|10 ?000/u.test(text);
  const problems: string[] = [];
  if (!text) problems.push("no reply text");
  if (!refersToBoard) problems.push("the reply does not refer to the abacus / thousands rod");
  if (newTopic) problems.push("the reply starts a new topic");
  if (teachesAhead) problems.push("the reply teaches ahead of the lesson");
  console.log(`\nrefers to the abacus/thousands rod: ${refersToBoard ? "yes" : "NO"} · new topic: ${newTopic ? "YES" : "no"} · teaches ahead: ${teachesAhead ? "YES" : "no"}`);
  if (problems.length) {
    console.log(`FAILURES: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS  the chat answers about the board it was opened on");
}

main().catch((error) => {
  console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
