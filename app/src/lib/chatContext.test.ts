/**
 * The ✋ chat's context: EVERYTHING on the board (fullBoardState), the thing
 * the lesson itself is on (boardFocus — one of many things a child may ask
 * about, never her opening line since 18 Sep), and the teaching instructions.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { boardFocus, sanitizeChatContext, chatContextPrompt, fullBoardState, vocabularyAt } from "./chatContext";
import { enterAnswer, initialStage, reduceStage, type StageState } from "./choreography";

const play = (...events: Parameters<typeof reduceStage>[1][]): StageState => {
  let stage = initialStage();
  for (const event of events) stage = reduceStage(stage, event, { legacy: null, lastBuilt: 1364 });
  return stage;
};

test("an empty board has nothing to point at", () => {
  assert.equal(boardFocus(initialStage()), null);
});

test("the abacus: the number that is up, and the rod that is glowing", () => {
  const shown = play({ primitive: "abacus", event: "show", args: { digits: [5, 4, 2, 1] } });
  const focus = boardFocus(shown);
  assert.ok(focus && focus.includes("ගණක රාමුවේ"), `named the abacus: ${focus}`);
  assert.ok(focus!.replace(/\s/gu, "").includes("5421"), `named the number: ${focus}`);

  const glowing = reduceStage(shown, { primitive: "abacus", event: "rod_glow", args: { rod: 3 } }, { legacy: null, lastBuilt: null });
  const glowFocus = boardFocus(glowing);
  assert.ok(glowFocus && glowFocus.includes("එකස්ථානය"), `named the glowing rod: ${glowFocus}`);
  assert.ok(glowFocus!.replace(/\s/gu, "").includes("5421"), `kept the number beside the rod: ${glowFocus}`);
});

test("a table: the empty cell being asked, with what its row already shows", () => {
  // blankTable.show takes its shape from the beat's own item, so the table is set up directly here.
  const table: StageState = {
    ...initialStage(),
    base: {
      kind: "blankTable",
      columns: [
        { key: "number", label: "සංඛ්‍යාව" },
        { key: "numberName", label: "සංඛ්‍යා නාමය" },
      ],
      rows: [
        { number: 6528, numberName: null },
        { number: null, numberName: "දෙදහස් හාරසිය තිහ" },
      ],
      filled: [],
      activeBlank: null,
    },
  };
  const stage = reduceStage(table, { primitive: "blankTable", event: "row_activate", args: { row: 1, field: "number" } }, { legacy: null, lastBuilt: null });
  const focus = boardFocus(stage);
  assert.ok(focus && focus.includes("2 වෙනි පේළියේ"), `named the row: ${focus}`);
  assert.ok(focus!.includes("දෙදහස් හාරසිය තිහ"), `named what the row already shows: ${focus}`);
});

test("number cards: the one with the ring around it", () => {
  const stage = play(
    { primitive: "numberCards", event: "show", args: { values: [84, 101, 528, 997] } },
    { primitive: "numberCards", event: "highlight_ring", args: { value: 101 } },
  );
  const focus = boardFocus(stage);
  assert.ok(focus && focus.replace(/\s/gu, "").includes("101"), `named the ringed card: ${focus}`);
});

test("the digit picker: the number the child built from the hand", () => {
  const stage = play(
    { primitive: "digitPicker", event: "show", args: { pool: [1, 3, 6, 4] } },
    { primitive: "digitPicker", event: "built_number", args: { digits: "3641" } },
  );
  const focus = boardFocus(stage);
  assert.ok(focus && focus.replace(/\s/gu, "").includes("3641"), `named what they built: ${focus}`);
});

test("the focus reaches the prompt, and a missing one says so rather than pretending", () => {
  const context = sanitizeChatContext({ board: "ගණක රාමුවේ 5 421", boardFocus: "ගණක රාමුවේ 5 421 එකස්ථානය කූර" })!;
  assert.equal(context.boardFocus, "ගණක රාමුවේ 5 421 එකස්ථානය කූර");
  assert.ok(chatContextPrompt(context).includes("එකස්ථානය කූර"), "the prompt carries the focus");

  const blank = sanitizeChatContext({ board: "පුවරුව හිස්" })!;
  assert.equal(blank.boardFocus, null);
  assert.ok(chatContextPrompt(blank).includes("nothing in particular"), "an empty board says nothing in particular is up");
});

test("the chat is given EVERYTHING on the board — every rod, every value, the glow, the chips, the child's entry, whose fill it is", () => {
  const stage = play(
    { primitive: "abacus", event: "show", args: { digits: [5, 4, 2, 1] } },
    { primitive: "abacus", event: "rod_glow", args: { rod: 1 } },
    { primitive: "turn", event: "your_turn", args: { answerMode: "valueOrPlace", surface: "rod" } },
    { primitive: "choiceChips", event: "show", args: { options: ["4", "3", "5"], correctIndex: 0 } },
  );
  const lines = fullBoardState(enterAnswer(stage, "4")).join("\n");
  for (const needle of ["rod:0", "rod:1", "rod:2", "rod:3", "පබළු 5", "පබළු 4", "පබළු 2", "පබළු 1", "දැන් දිලිසෙනවා", "4 | 3 | 5", "ළමයා දැන් දුන්න උත්තරය: 4", "යටින් ළමයා දුන්න උත්තරය 4"]) assert.ok(lines.includes(needle), `the board state names ${needle}:\n${lines}`);

  const table = play({ primitive: "blankTable", event: "show", args: { rows: [] } }, { primitive: "blankTable", event: "cell_fill", args: { row: 0, field: "place", value: "දහසස්ථානය", by: "tutor" } });
  const tableLines = table.base?.kind === "blankTable" ? fullBoardState(table).join("\n") : "";
  if (tableLines) assert.ok(/සාරා ලිව්වා|ළමයා පිරෙව්වා/u.test(tableLines), "a filled cell says who filled it");
});

test("the teaching instructions: Sinhala only, never ahead, never an invented number, the vocabulary rule — and NO narrating where they are", () => {
  const prompt = chatContextPrompt(sanitizeChatContext({ board: "පුවරුව හිස්", concept: { tag: "placeValue4Digit" }, vocabularyAllowed: vocabularyAt("placeValue4Digit").allowed, vocabularyLater: vocabularyAt("placeValue4Digit").later })!);
  for (const rule of ["SINHALA ONLY", "NEVER invent a number", "VOCABULARY RULE", "NEVER TEACH AHEAD", "YOU MAY NOT", "REGISTER (the style card)", "DO NOT NARRATE WHERE THEY ARE", "ANYTHING currently on the board"]) assert.ok(prompt.includes(rule), `missing: ${rule}`);
  assert.ok(!/YOUR FIRST LINE/u.test(prompt), "she is no longer told to open by stating the board");
  const { allowed, later } = vocabularyAt("placeValue4Digit");
  assert.ok(allowed.includes("ස්ථානීය අගය") && allowed.includes("සංඛ්‍යා නාමය"), "terms introduced so far are hers to use");
  assert.ok(later.includes("දස දහසස්ථානය") && !allowed.includes("දස දහසස්ථානය"), "a term the lesson has not reached is held back");
  assert.deepEqual(vocabularyAt("lessonOpening").allowed, [], "before the first concept nothing has been introduced");
});
