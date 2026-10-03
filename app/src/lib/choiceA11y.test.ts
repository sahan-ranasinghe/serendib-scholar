import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A choice in a group shows which one is chosen with a border — and must SAY it too. Six groups in the app work
 * this way: the parent's daily limit and ✋ chat minutes, the onboarding avatar, grade and pay-method pickers, the
 * quiz's answer options. Every choice carries aria-pressed, bound to the very condition that draws the chosen look,
 * so it is rendered "true" on the chosen one and "false" on the others. The parent's sound and captions rows are
 * toggles and say on or off the same way, and every list of children says which child is active. (crawl:check's
 * cluster M reads these from the real screens — all but the splash's child chooser, which only a device with two
 * children shows.)
 */
interface Group {
  name: string;
  file: string;
  /** What only this choice has on its opening tag. */
  mark: string;
  /** The condition under which a choice is the chosen one. */
  chosen: string;
  /** What aria-pressed must be bound to. */
  pressed: string;
  /** Where the chosen look comes from: the same condition, in the tag's style… */
  shown: string;
  /** …or, where the style is built by a helper the tag calls, the helper's own condition in the file. */
  helper?: RegExp;
}
const ONBOARDING = "components/app/screens/Onboarding.tsx";
const GROUPS: Group[] = [
  { name: "settings · daily limit", file: "components/app/ParentClients.tsx", mark: "data-limit={m}", chosen: "settings.dailyLimitMinutes === m", pressed: "settings.dailyLimitMinutes === m", shown: "style={sx(choice(settings.dailyLimitMinutes === m))}" },
  { name: "settings · chat minutes", file: "components/app/ParentClients.tsx", mark: "data-chat-limit={m}", chosen: "(settings.chatMinutes ?? DEFAULT_CHAT_MINUTES) === m", pressed: "(settings.chatMinutes ?? DEFAULT_CHAT_MINUTES) === m", shown: "style={sx(choice((settings.chatMinutes ?? DEFAULT_CHAT_MINUTES) === m))}" },
  // The onboarding pickers are also drawn as still pictures (the design preview passes no handler): each is a button,
  // and says pressed or not, only where it can be pressed — aria-pressed belongs to a button.
  { name: "onboarding · avatar picker", file: ONBOARDING, mark: "data-avatar={a}", chosen: "i === avatarIndex", pressed: "onAvatar ? i === avatarIndex : undefined", shown: 'border:3px solid ${i === avatarIndex ? "#E9B44C"' },
  { name: "onboarding · grade picker", file: ONBOARDING, mark: "data-grade={g}", chosen: "g === grade", pressed: "onGrade ? g === grade : undefined", shown: "style={sx(gradeBox(g))}", helper: /const gradeBox = \(g: 4 \| 5\) => \(g === grade \? "[^"]*border:2px solid var\(--color-saffron\)/u },
  { name: "onboarding · pay method, card", file: ONBOARDING, mark: 'data-method="card"', chosen: 'method === "card"', pressed: 'onMethod ? method === "card" : undefined', shown: 'style={sx(box(method === "card"))}', helper: /const box = \(on: boolean\) => \(on \? "[^"]*border:2px solid var\(--color-teal\)/u },
  { name: "onboarding · pay method, bank", file: ONBOARDING, mark: 'data-method="bank"', chosen: 'method === "bank"', pressed: 'onMethod ? method === "bank" : undefined', shown: 'style={sx(box(method === "bank"))}', helper: /const box = \(on: boolean\) => \(on \? "[^"]*border:2px solid var\(--color-teal\)/u },
  { name: "quiz · answer options", file: "components/app/screens/Quiz.tsx", mark: "data-selected={sel || undefined}", chosen: "sel", pressed: "sel", shown: 'border:2px solid ${sel ? "#E9B44C"' },
];

const sources = new Map<string, string>();
const source = (file: string): string => sources.get(file) ?? (sources.set(file, readFileSync(path.resolve(__dirname, "..", file), "utf8")), sources.get(file)!);
/** The one line of the file that opens this choice. */
const tagOf = (group: { file: string; mark: string }): string[] => source(group.file).split("\n").filter((line) => line.includes(group.mark));
const attribute = (tag: string, name: string): string | null => new RegExp(`${name}=\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`, "u").exec(tag)?.[1] ?? null;
/** A button: by role (always, or wherever it has a handler), or by being one. */
const isButton = (tag: string): boolean => /role="button"/u.test(tag) || /^\s*<button /u.test(tag) || /role=\{on[A-Z][A-Za-z]* \? "button" : undefined\}/u.test(tag);

test("the groups of choices are where this test looks for them", () => {
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
    assert.ok(isButton(tag), `${group.name} is a button`);
    // Said only where it is a button: a picker's aria-pressed and its role hang on the same handler.
    const handler = /^(on[A-Z][A-Za-z]*) \? /u.exec(group.pressed)?.[1];
    if (handler) assert.ok(tag.includes(`role={${handler} ? "button" : undefined}`), `${group.name}: role and aria-pressed on the same handler`);
  }
});

test("what is said is what is shown: aria-pressed, data-selected and the chosen look come from the same condition", () => {
  for (const group of GROUPS) {
    const tag = tagOf(group)[0]!;
    assert.ok(group.pressed.includes(group.chosen), group.name);
    assert.equal(attribute(tag, "data-selected"), `${group.chosen} || undefined`, `${group.name}: data-selected`);
    assert.ok(tag.includes(group.shown), `${group.name}: the chosen look's condition`);
    if (group.helper) assert.match(source(group.file), group.helper, `${group.name}: the helper that draws the chosen look`);
  }
});

test("the sound and captions rows are toggles that say on or off: aria-pressed from the row's own state, which is the setting its ✓ shows", () => {
  // The row itself (SettingsRow): a button wherever it has a handler, pressed when its state is "on" — and only a
  // toggle row (one with a state) says so; a row that is a plain button or a link says nothing about pressing.
  const row = tagOf({ file: "components/app/screens/ParentZone.tsx", mark: "data-state={state}" });
  assert.equal(row.length, 1);
  assert.ok(isButton(row[0]!));
  assert.equal(attribute(row[0]!, "aria-pressed"), 'onClick && state ? state === "on" : undefined');
  // The two rows: the state, the ✓ and the tap all come from the one setting.
  for (const [testId, setting] of [["toggle-sound", "settings.sound"], ["toggle-captions", "settings.captions"]] as const) {
    const use = tagOf({ file: "components/app/ParentClients.tsx", mark: `testId="${testId}"` });
    assert.equal(use.length, 1, testId);
    assert.equal(attribute(use[0]!, "state"), `${setting} ? "on" : "off"`, `${testId}: state`);
    assert.equal(attribute(use[0]!, "value"), `${setting} ? "✓" : ""`, `${testId}: the ✓`);
    assert.ok(attribute(use[0]!, "onClick"), `${testId}: a handler, so it is a button`);
  }
});

test("which child is active is said by every list of children: aria-pressed from the same `active` that draws the saffron look", () => {
  // The home switcher was the first to say it; the profile rows and the splash's chooser match it.
  const LISTS = [
    { name: "home · child switcher", file: "components/app/ChildSwitcher.tsx", mark: 'data-testid="switch-child"', active: "k.active", marked: null, shown: 'border:2px solid ${k.active ? "var(--color-saffron)"' },
    { name: "parent · profile rows", file: "components/app/ParentClients.tsx", mark: 'data-testid="profile-row"', active: "c.active", marked: "c.active || undefined", shown: 'border:${c.active ? "2px solid var(--color-saffron)"' },
    { name: "splash · child chooser", file: "components/app/ChildChooser.tsx", mark: 'data-testid="choose-child"', active: "k.active", marked: "k.active || undefined", shown: 'border:${k.active ? "2px solid var(--color-saffron)"' },
  ];
  for (const list of LISTS) {
    const tags = tagOf(list);
    assert.equal(tags.length, 1, `${list.name}: one opening tag with ${list.mark}`);
    const tag = tags[0]!;
    assert.ok(isButton(tag), `${list.name} is a button`);
    // A boolean: the active child's says "true", every other child's "false".
    assert.equal(attribute(tag, "aria-pressed"), list.active, list.name);
    if (list.marked) assert.equal(attribute(tag, "data-active"), list.marked, `${list.name}: data-active`);
    assert.ok(tag.includes(list.shown), `${list.name}: the active look's condition`);
  }
});
