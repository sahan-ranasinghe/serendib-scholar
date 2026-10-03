import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A choice in a group shows which one is chosen with a border — and must SAY it too. The parent's settings have two
 * such groups (the daily limit, the ✋ chat's minutes): every choice carries aria-pressed, bound to the very condition
 * that draws the border, so it is rendered "true" on the chosen one and "false" on the others. (crawl:check's
 * cluster M reads the same thing from the real screen.)
 */
const source = readFileSync(path.resolve(__dirname, "../components/app/ParentClients.tsx"), "utf8");
/** Every JSX opening tag in the file that marks a chosen choice. */
const choices = [...source.matchAll(/<div key=\{m\} role="button"[^\n]*data-selected=\{[^\n]*/gu)].map((m) => m[0]);
const attribute = (tag: string, name: string): string | null => new RegExp(`${name}=\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`, "u").exec(tag)?.[1] ?? null;

test("the settings screen has its two groups of choices: the daily limit and the chat minutes", () => {
  assert.equal(choices.length, 2);
  assert.ok(choices[0]!.includes("data-limit={m}"));
  assert.ok(choices[1]!.includes("data-chat-limit={m}"));
});

test("every choice says whether it is the chosen one: aria-pressed, true or false, never absent", () => {
  for (const tag of choices) {
    const pressed = attribute(tag, "aria-pressed");
    assert.ok(pressed, `aria-pressed on ${tag.slice(0, 60)}`);
    // A boolean, so the others are rendered aria-pressed="false": `|| undefined` would leave the attribute off them.
    assert.doesNotMatch(pressed, /undefined/u);
  }
});

test("what is said is what is shown: aria-pressed and the chosen border come from the same condition", () => {
  for (const tag of choices) {
    const pressed = attribute(tag, "aria-pressed")!;
    assert.equal(attribute(tag, "data-selected"), `${pressed} || undefined`);
    // The border: style={sx(choice(<the same condition>))}.
    assert.ok(tag.includes(`style={sx(choice(${pressed}))}`), `the border's condition on ${tag.slice(0, 60)}`);
  }
});
