import { expect as assert, describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { errors, problems } from "./support/language.js";

const model = `dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
enum Hover = rest | hovered
enum Focus = blurred | focused

type Link needs Pointer, Keyboard {
  state hover: Hover, focus: Focus
  hover = hovered only when Pointer = mouse
  focus = focused only when Keyboard = keyboard
}

type Menu {
  enum State = closed | open
  state menu: State
  type Panel {
    has blog: Link
  }
  has panel: Panel only when menu = open
}

type Toolbar {
  has link: Link
  has menu: Menu
}

type Page {
  has toolbar: Toolbar
}

environment Device = Pointer x Keyboard
profile Phone: Device { Pointer = touch, Keyboard = no-keyboard }
profile Desktop: Device { Pointer = mouse, Keyboard = keyboard }
`;
const rules = `
expect "Touch screens never show hover" {
  in Page.toolbar and below
  when Pointer = touch
  then hover = rest
}

expect "A Desktop link can be hovered and focused at once" {
  in Page.toolbar.link
  when profile = Desktop
  some hover = hovered, focus = focused
}

expect "On a Phone the menu link is only ever at rest and blurred" {
  in Page.toolbar.menu.panel.blog
  when profile = Phone
  then hover = rest, focus = blurred
}

expect "The menu panel only exists while the menu is open" {
  in Page.toolbar.menu.panel
  when toolbar.menu.menu = closed
  absent
}
`;

describe("expect", () => {
  it("states rules the model must follow, each checked against the tree in place", () => {
    const file = parse(model + rules);
    assert([
      problems(model + rules),
      file.expectations.map(({ title, path, below, assertion }) => [
        title,
        path.name,
        below,
        assertion,
      ]),
    ]).toEqual([
      [],
      [
        ["Touch screens never show hover", "Page.toolbar", true, "then"],
        ["A Desktop link can be hovered and focused at once", "Page.toolbar.link", false, "some"],
        [
          "On a Phone the menu link is only ever at rest and blurred",
          "Page.toolbar.menu.panel.blog",
          false,
          "then",
        ],
        [
          "The menu panel only exists while the menu is open",
          "Page.toolbar.menu.panel",
          false,
          "absent",
        ],
      ],
    ]);
  });

  it("reports a rule the model breaks, with a combination that breaks it", () => {
    // Touch can hover now, and the panel is there whether the menu is open or not.
    const broken = (model + rules)
      .replace("  hover = hovered only when Pointer = mouse\n", "")
      .replace(
        "has panel: Panel only when menu = open",
        "has panel: Panel only when menu in (closed, open)",
      );
    assert(errors(broken)).toEqual([
      "33:8: expectation-failed: Touch screens never show hover: Page.toolbar.link on Phone has hover = hovered",
      "45:8: expectation-failed: On a Phone the menu link is only ever at rest and blurred: Page.toolbar.menu.panel.blog on Phone with toolbar.menu.menu = closed has hover = hovered",
      "51:8: expectation-failed: The menu panel only exists while the menu is open: Page.toolbar.menu.panel is there on Phone with toolbar.menu.menu = closed",
    ]);
  });

  it("reports a some that no combination meets", () => {
    const never = (model + rules)
      .replace("some hover = hovered, focus = focused", "some hover = hovered, focus = blurred")
      .replace("profile = Desktop", "profile = Phone");
    assert(problems(never)).toEqual([
      "40:8: expectation-failed: A Desktop link can be hovered and focused at once: no combination of Page.toolbar.link on Phone has hover = hovered, focus = blurred",
    ]);
  });

  it("reports a rule that tests nothing, which would always pass", () => {
    const rule = (body: string) => `${model}\nexpect "Nothing" {\n${body}\n}\n`;
    assert([
      problems(rule("  in Page.toolbar.link\n  when profile = Laptop\n  then hover = rest")),
      problems(rule("  in Page.toolbar.link\n  when Pointer = touch\n  then colour = red")),
      problems(rule("  in Page.toolbar.lnk\n  then hover = rest")),
    ]).toEqual([
      [
        '34:8: expectation-empty: Nothing tests nothing: "Laptop" is not a profile (Phone, Desktop)',
      ],
      [
        "34:8: expectation-empty: Nothing tests nothing: no element in Page.toolbar.link has colour",
      ],
      [
        "34:8: expectation-empty: Nothing tests nothing: lnk is not a child of Toolbar; did you mean link?",
      ],
    ]);
  });

  it("picks a profile a modifier makes, by its name and the modifier's", () => {
    const rule = (profile: string) =>
      `${model}modifier Mouse on Phone {\n  Pointer = mouse\n}\nexpect "Hover with a mouse" {\n  in Page.toolbar.link\n  when profile = ${profile}\n  some hover = hovered\n}\n`;
    expect([problems(rule("Phone+Mouse")), problems(rule("Phone"))]).toEqual([
      [],
      [
        "36:8: expectation-failed: Hover with a mouse: no combination of Page.toolbar.link on Phone has hover = hovered",
      ],
    ]);
  });

  it("reports a value its key does not have, which would pick or assert nothing", () => {
    const rule = (body: string) => `${model}expect "Mistyped" {\n${body}\n}\n`;
    assert([
      problems(rule("  in Page.toolbar.menu.panel\n  when toolbar.menu.menu = clsoed\n  absent")),
      problems(rule("  in Page.toolbar and below\n  when Pointer = tuch\n  then hover = rest")),
      problems(rule("  in Page.toolbar.link\n  some hover = hoverd")),
    ]).toEqual([
      [
        '33:8: expectation-empty: Mistyped tests nothing: "clsoed" is not a value of toolbar.menu.menu (closed, open)',
      ],
      [
        '33:8: expectation-empty: Mistyped tests nothing: "tuch" is not a value of Pointer (mouse, touch)',
      ],
      [
        '33:8: expectation-empty: Mistyped tests nothing: "hoverd" is not a value of hover (rest, hovered)',
      ],
    ]);
  });

  it("picks a profile in a row it shares with others that have its values", () => {
    const merged = model.replace(
      "profile Desktop: Device { Pointer = mouse, Keyboard = keyboard }",
      "profile Desktop: Device { Pointer = mouse, Keyboard = keyboard }\nprofile Laptop: Device { Pointer = mouse, Keyboard = keyboard }",
    );
    const rule = (assertion: string) =>
      `${merged}expect "A Laptop link" {\n  in Page.toolbar.link\n  when profile = Laptop\n  ${assertion}\n}\n`;
    assert([
      problems(rule("some hover = hovered, focus = focused")),
      problems(rule("then hover = rest")),
      problems(rule("absent")),
    ]).toEqual([
      [],
      ["34:8: expectation-failed: A Laptop link: Page.toolbar.link on Laptop has hover = hovered"],
      ["34:8: expectation-failed: A Laptop link: Page.toolbar.link is there on Laptop"],
    ]);
  });

  it("reports an element below it that cannot be placed, rather than failing", () => {
    const unprovided = `enum S = a | b
type L receives c: S {
  state h: S
}
type P {
  has l: L
}
expect "Every h is a" {
  in P and below
  then h = a
}
`;
    assert(problems(unprovided)).toEqual([
      "8:8: expectation-empty: Every h is a tests nothing: P.l: c is received by L, but nothing above it provides it",
    ]);
  });

  it("has a title, once, a place, and one assertion", () => {
    assert([
      problems(`${model}expect Touch {\n  in Page.toolbar\n  absent\n}\n`),
      problems(`${model}expect "A" {\n  in Page.toolbar\n}\n`),
      problems(
        `${model}expect "A" {\n  in Page.toolbar\n  absent\n}\nexpect "A" {\n  in Page.toolbar\n  absent\n}\n`,
      ),
      problems(`${model}expect "A {\n`),
    ]).toEqual([
      ['33:8: syntax-error: expected a title, in quotes, after "expect", found "Touch"'],
      ['35:1: syntax-error: expected "then", "some" or "absent" in "A", found "}"'],
      ['37:8: duplicate-name: the expectation "A" is already at line 33'],
      ['33:8: syntax-error: expected a title, in quotes, after "expect", found an unclosed quote'],
    ]);
  });
});
