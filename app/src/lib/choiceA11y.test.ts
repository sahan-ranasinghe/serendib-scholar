import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A choice in a group shows which one is chosen with a border — and must SAY it too. Four groups in the app work
 * this way: the parent's daily limit and ✋ chat minutes, the onboarding avatar picker, the quiz's answer options.
 * Every choice carries aria-pressed, bound to the very condition that draws the chosen look, so it is rendered
 * "true" on the chosen one and "false" on the others. (crawl:check's cluster M reads the same from the real screens.)
 */
interface Group {
  name: string;
  file: string;
  /** What only this group's choice has on its opening tag. */
  mark: string;
  /** The condition under which a choice is the chosen one. */
  chosen: string;
  /** What aria-pressed must be bound to. */
  pressed: string;
  /** Where the chosen look comes from: the same condition, in the tag's style. */
  shown: string;
}
const GROUPS: Group[] = [
  { name: "settings · daily limit", file: "components/app/ParentClients.tsx", mark: "data-limit={m}", chosen: "settings.dailyLimitMinutes === m", pressed: "settings.dailyLimitMinutes === m", shown: "style={sx(choice(settings.dailyLimitMinutes === m))}" },
  { name: "settings · chat minutes", file: "components/app/ParentClients.tsx", mark: "data-chat-limit={m}", chosen: "(settings.chatMinutes ?? DEFAULT_CHAT_MINUTES) === m", pressed: "(settings.chatMinutes ?? DEFAULT_CHAT_MINUTES) === m", shown: "style={sx(choice((settings.chatMinutes ?? DEFAULT_CHAT_MINUTES) === m))}" },
  // The picker is also drawn as a still picture (the design preview passes no onAvatar): it is a button, and says
  // pressed or not, only where it can be pressed — aria-pressed belongs to a button.
  { name: "onboarding · avatar picker", file: "components/app/screens/Onboarding.tsx", mark: "data-avatar={a}", chosen: "i === avatarIndex", pressed: "onAvatar ? i === avatarIndex : undefined", shown: 'border:3px solid ${i === avatarIndex ? "#E9B44C"' },
  { name: "quiz · answer options", file: "components/app/screens/Quiz.tsx", mark: "data-selected={sel || undefined}", chosen: "sel", pressed: "sel", shown: 'border:2px solid ${sel ? "#E9B44C"' },
];

const sources = new Map<string, string>();
const source = (file: string): string => sources.get(file) ?? (sources.set(file, readFileSync(path.resolve(__dirname, "..", file), "utf8")), sources.get(file)!);
/** The one line of the file that opens this group's choice. */
const tagOf = (group: Group): string[] => source(group.file).split("\n").filter((line) => line.includes(group.mark));
const attribute = (tag: string, name: string): string | null => new RegExp(`${name}=\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`, "u").exec(tag)?.[1] ?? null;

test("the four groups of choices are where this test looks for them", () => {
  for (const group of GROUPS) assert.equal(tagOf(group).length, 1, `${group.name}: one opening tag with ${group.mark}`);
  // The quiz's `sel` is the screen's own selection: the option at the selected index.
  assert.match(source("components/app/screens/Quiz.tsx"), /const sel = i === selected;/u);
});

test("every choice says whether it is the chosen one: aria-pressed, true or false, never absent on a button", () => {
  for (const group of GROUPS) {
    const tag = tagOf(group)[0]!;
    assert.equal(attribute(tag, "aria-pressed"), group.pressed, group.name);
    // A boolean, so the others are rendered aria-pressed="false": `|| undefined` would leave the attribute off them.
    assert.doesNotMatch(group.pressed, /\|\| undefined/u, group.name);
    // A button: by role, or by being one.
    assert.ok(/role="button"/u.test(tag) || /^\s*<button /u.test(tag) || tag.includes('role={onAvatar ? "button" : undefined}'), `${group.name} is a button`);
  }
});

test("what is said is what is shown: aria-pressed, data-selected and the chosen look come from the same condition", () => {
  for (const group of GROUPS) {
    const tag = tagOf(group)[0]!;
    assert.ok(group.pressed.includes(group.chosen), group.name);
    assert.equal(attribute(tag, "data-selected"), `${group.chosen} || undefined`, `${group.name}: data-selected`);
    assert.ok(tag.includes(group.shown), `${group.name}: the chosen look's condition`);
  }
});
