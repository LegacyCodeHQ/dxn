import { describe, expect, it } from "vitest";
import type { Condition } from "../src/ast.js";
import { inPlace, states } from "../src/evaluate.js";
import { parse } from "../src/parse.js";
import { renameInSource } from "../src/rename.js";
import { errors, problems } from "./support/language.js";

const declarations = `dimension Breakpoint = base | lg | xl
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
enum Hover = rest | hovered
enum Focus = blurred | focused
`;
// A type that needs the dimensions its rules use.
const needs = (text: string) =>
  ["Breakpoint", "Pointer", "Keyboard"].filter((name) => text.includes(name)).join(", ");
const link = (...rules: string[]) => `${declarations}
type Link needs ${needs(rules.join(" ")) || "Pointer"} {
  state hover: Hover, focus: Focus
${rules.map((rule) => `  ${rule}\n`).join("")}}
`;
const menu = (condition: string) => `${declarations}
type Panel {}
type Menu${needs(condition) === "" ? "" : ` needs ${needs(condition)}`} {
  enum State = closed | open
  state menu: State
  has panel: Panel only when ${condition}
}
`;

// A condition as it reads: its comparisons, and "and" or "or" in brackets.
const text = (condition: Condition | undefined): string => {
  if (condition === undefined) return "";
  if (condition.kind === "compare") {
    const values = condition.values.map(({ name }) => name);
    return `${condition.subject.name} ${values.length === 1 ? `= ${values[0]}` : `in (${values.join(", ")})`}`;
  }
  return `(${condition.terms.map(text).join(` ${condition.kind} `)})`;
};

describe("a condition with and and or", () => {
  it("joins comparisons with one of them, or with both in brackets", () => {
    const rules = (...lines: string[]) => {
      const file = parse(link(...lines));
      return [problems(link(...lines)), file.types[0]?.rules.map(({ when }) => text(when))];
    };
    expect([
      rules("hover = hovered only when Pointer = mouse and Breakpoint in (lg, xl)"),
      rules("focus = focused only when Keyboard = keyboard or Pointer = mouse"),
      rules(
        "hover = hovered only when Pointer = mouse and (Breakpoint = lg or (Breakpoint = xl and Keyboard = keyboard))",
      ),
      rules("hover = hovered only when (Pointer = mouse)"),
    ]).toEqual([
      [[], ["(Pointer = mouse and Breakpoint in (lg, xl))"]],
      [[], ["(Keyboard = keyboard or Pointer = mouse)"]],
      [
        [],
        ["(Pointer = mouse and (Breakpoint = lg or (Breakpoint = xl and Keyboard = keyboard)))"],
      ],
      [[], ["Pointer = mouse"]],
    ]);
  });

  it("refuses and and or mixed without brackets, saying both ways to bracket them", () => {
    expect(
      problems(
        link("hover = hovered only when Pointer = mouse and Breakpoint = lg or Breakpoint = xl"),
      ),
    ).toEqual([
      '9:65: syntax-error: "and" and "or" need brackets to mix: write "(Pointer = mouse and Breakpoint = lg) or Breakpoint = xl" or "Pointer = mouse and (Breakpoint = lg or Breakpoint = xl)"',
    ]);
    expect([
      problems(link("hover = hovered only when (Pointer = mouse")),
      problems(link("hover = hovered only when Pointer = mouse and")),
    ]).toEqual([
      ['9:45: syntax-error: expected ")" after "mouse", found the end of the line'],
      ['9:48: syntax-error: expected a dimension after "and", found the end of the line'],
    ]);
  });

  it("gives a value where the whole condition holds", () => {
    const hover = (rule: string) =>
      states(parse(link(rule)), "Link").rows.map(({ when, states: own }) => [
        [when.Breakpoint, when.Pointer, when.Keyboard].filter(Boolean).join(" "),
        own.hover?.includes("hovered"),
      ]);
    const hovered = (rule: string) =>
      hover(rule)
        .filter(([, there]) => there)
        .map(([where]) => where);
    expect([
      hovered("hover = hovered only when Pointer = mouse and Breakpoint in (lg, xl)"),
      hovered(
        "hover = hovered only when Breakpoint = xl or (Keyboard = keyboard and Pointer = mouse)",
      ),
    ]).toEqual([
      ["lg mouse", "xl mouse"],
      [
        "base mouse keyboard",
        "lg mouse keyboard",
        "xl mouse keyboard",
        "xl mouse no-keyboard",
        "xl touch keyboard",
        "xl touch no-keyboard",
      ],
    ]);
  });

  it("places a child where it holds, on states and dimensions together", () => {
    const panel = (condition: string) =>
      states(parse(menu(condition)), "Menu").rows.map(({ when, children }) => [
        when.Breakpoint,
        children?.panel,
      ]);
    expect([
      panel("menu = open and Breakpoint = base"),
      panel("menu = open or Breakpoint = xl"),
      panel("menu in (closed, open) and Breakpoint = lg"),
    ]).toEqual([
      [
        ["base", { menu: ["open"] }],
        ["lg", false],
        ["xl", false],
      ],
      [
        ["base", { menu: ["open"] }],
        ["lg", { menu: ["open"] }],
        ["xl", true],
      ],
      [
        ["base", false],
        ["lg", true],
        ["xl", false],
      ],
    ]);
    const page = `${menu("menu = open and Breakpoint = base")}type Page {\n  has menu: Menu\n}\n`;
    expect(
      inPlace(parse(page), "Page.menu.panel").rows.map(({ when, parents }) => [
        when.Breakpoint,
        parents["menu.menu"],
      ]),
    ).toEqual([["base", "open"]]);
  });

  it("says, where a child depends on several states, the states that still decide", () => {
    const sized = `dimension Breakpoint = base | lg
enum State = closed | open
enum Size = small | big
type Panel {}
type Menu needs Breakpoint {
  state menu: State, size: Size
  has panel: Panel only when menu = open and (size = big or Breakpoint = lg)
}
`;
    expect(
      states(parse(sized), "Menu").rows.map(({ when, children }) => [
        when.Breakpoint,
        children?.panel,
      ]),
    ).toEqual([
      ["base", "menu = open and (size = big or Breakpoint = lg)"],
      ["lg", { menu: ["open"] }],
    ]);
  });

  it("checks each comparison, and the whole: never true is an error, always true a warning", () => {
    expect([
      errors(link("hover = hovered only when Pointer = mouse and Theme = dark")),
      errors(link("hover = hovered only when Pointer = mouse and Breakpoint = sm")),
      problems(link("hover = hovered only when Pointer = mouse and Pointer = touch")),
      problems(link("hover = hovered only when Pointer = mouse or Pointer = touch")),
      problems(menu("menu = open and menu = closed")),
      problems(menu("menu = open or menu = closed")),
    ]).toEqual([
      ["9:49: unknown-dimension: Theme is not a dimension (Breakpoint, Pointer, Keyboard)"],
      ['9:62: unknown-value: "sm" is not a value of Breakpoint (base, lg, xl)'],
      [
        "9:49: repeated-comparison: Pointer is already compared in this and; give its values once, with in (…)",
      ],
      [
        "9:3: warning: vacuous-condition: Pointer = mouse or Pointer = touch is always true, so the rule restricts nothing",
      ],
      [
        "11:46: repeated-comparison: menu is already compared in this and; give its values once, with in (…)",
      ],
      [
        "11:7: warning: vacuous-condition: menu = open or menu = closed is always true, so panel is always there",
      ],
    ]);
    expect([
      problems(
        link(
          "hover = hovered only when Pointer in (mouse, touch) and Breakpoint in (base, lg, xl)",
        ),
      ),
      problems(menu("menu = open and Breakpoint in (base, lg, xl) and menu in (closed, open)")),
    ]).toEqual([
      [
        "9:3: warning: vacuous-condition: Pointer in (mouse, touch) and Breakpoint in (base, lg, xl) is always true, so the rule restricts nothing",
      ],
      [
        "11:79: repeated-comparison: menu is already compared in this and; give its values once, with in (…)",
      ],
    ]);
  });

  it("is impossible only through its comparisons' values, which an and of different subjects never is", () => {
    expect(
      problems(
        link("hover = hovered only when (Pointer = mouse or Pointer = touch) and Pointer = mouse"),
      ),
    ).toEqual([]);
    expect(
      problems(
        link(
          "hover = hovered only when (Pointer = mouse and Keyboard = keyboard) and (Pointer = touch and Keyboard = keyboard)",
        ),
      ),
    ).toEqual([
      "9:3: impossible-condition: (Pointer = mouse and Keyboard = keyboard) and (Pointer = touch and Keyboard = keyboard) is never true, so hovered exists nowhere",
    ]);
  });

  it("needs every dimension it compares, and is renamed with the values it names", () => {
    const unneeded = `${declarations}
type Link needs Pointer {
  state hover: Hover
  hover = hovered only when Pointer = mouse and Breakpoint = lg
}
`;
    expect(errors(unneeded)).toEqual([
      '9:49: unneeded-dimension: Link does not need Breakpoint; declare "type Link needs Pointer, Breakpoint"',
    ]);
    const source = menu("menu = open and Breakpoint = base");
    expect(renameInSource(parse(source), source, "Menu.State", "open", "shown")).toBe(
      source
        .replace("closed | open", "closed | shown")
        .replace("menu = open and", "menu = shown and"),
    );
  });
});
