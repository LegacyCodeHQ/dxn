import { describe, expect, it } from "vitest";
import { definition } from "../src/definition.js";

const source = `dimension Breakpoint = base | lg
dimension Pointer = mouse | touch

enum Hover = rest | hovered
enum Section = home | blog
enum Focus = blurred | focused

type Link needs Pointer receives current: Section {
  event activate
  state hover: Hover
  state focus: Focus
  hover = hovered only when Pointer = mouse and focus = blurred
  alike hover in (rest, hovered) when focus = focused
  action take-focus: focus blurred -> focused
  on activate: take-focus, hover -> rest
}

type Menu needs Breakpoint {
  event escape
  enum Openness = closed | open
  state menu: Openness
  type Toggle {
    state expanded: Openness
  }
  has toggle: Toggle { expanded = menu }
  has link: Link only when menu = open and Breakpoint = base
  action close: menu open -> closed
  on escape: close, link.take-focus only when menu = open
  on link.activate: close
  on Breakpoint in (lg): close
}

type Page {
  state current: Section = blog
  provides current
  has menu: Menu
}

environment Device = Breakpoint x Pointer
profile phone: Device { Breakpoint = base, Pointer = touch }
modifier trackpad on phone { Pointer = mouse }

record Source {
  section: Section
}
record Evidence {
  source: Source
}
`;

const lines = source.split("\n");

// Where going to the definition of a word, in the first line holding the text
// before it, leads: that line, and the word there.
function go(before: string, word: string): [string, string] | undefined {
  const line = lines.findIndex((text) => text.includes(`${before}${word}`));
  const column = (lines[line] ?? "").indexOf(`${before}${word}`) + before.length + 1;
  // From the middle of the word, as an editor's cursor usually is.
  const found = definition(source, line + 1, column + Math.floor(word.length / 2));
  if (found === undefined) return undefined;
  const text = lines[found.line - 1] ?? "";
  const at = text.slice(found.column - 1).match(/^[A-Za-z0-9-]+/)?.[0] ?? "";
  return [text.trim(), at];
}

describe("definition", () => {
  it("goes from a name to its declaration: an enum, a dimension, a type, a record", () => {
    expect(go("state hover: ", "Hover")).toEqual(["enum Hover = rest | hovered", "Hover"]);
    expect(go("type Link needs ", "Pointer")).toEqual([
      "dimension Pointer = mouse | touch",
      "Pointer",
    ]);
    expect(go("has menu: ", "Menu")).toEqual(["type Menu needs Breakpoint {", "Menu"]);
    expect(go("source: ", "Source")).toEqual(["record Source {", "Source"]);
    expect(go("section: ", "Section")).toEqual(["enum Section = home | blog", "Section"]);
    expect(go("receives current: ", "Section")).toEqual(["enum Section = home | blog", "Section"]);
  });

  it("goes to an environment, a profile and their dimensions", () => {
    expect(go("profile phone: ", "Device")).toEqual([
      "environment Device = Breakpoint x Pointer",
      "Device",
    ]);
    expect(go("environment Device = ", "Breakpoint")).toEqual([
      "dimension Breakpoint = base | lg",
      "Breakpoint",
    ]);
    expect(go("{ Breakpoint = base, ", "Pointer")).toEqual([
      "dimension Pointer = mouse | touch",
      "Pointer",
    ]);
    expect(go("modifier trackpad on ", "phone")).toEqual([
      "profile phone: Device { Breakpoint = base, Pointer = touch }",
      "phone",
    ]);
  });

  it("finds a type's own enum and type before the file's", () => {
    expect(go("state menu: ", "Openness")).toEqual(["enum Openness = closed | open", "Openness"]);
    expect(go("state expanded: ", "Openness")).toEqual([
      "enum Openness = closed | open",
      "Openness",
    ]);
    expect(go("has toggle: ", "Toggle")).toEqual(["type Toggle {", "Toggle"]);
  });

  it("goes from a state, an action or an event to where its type declares it", () => {
    expect(go("only when Pointer = mouse and ", "focus")).toEqual(["state focus: Focus", "focus"]);
    expect(go("alike ", "hover")).toEqual(["state hover: Hover", "hover"]);
    expect(go("only when ", "Pointer")).toEqual(["dimension Pointer = mouse | touch", "Pointer"]);
    expect(go("on activate: ", "take-focus")).toEqual([
      "action take-focus: focus blurred -> focused",
      "take-focus",
    ]);
    expect(go("on ", "activate")).toEqual(["event activate", "activate"]);
    expect(go("take-focus, ", "hover")).toEqual(["state hover: Hover", "hover"]);
    expect(go("action take-focus: ", "focus")).toEqual(["state focus: Focus", "focus"]);
    expect(go("provides ", "current")).toEqual(["state current: Section = blog", "current"]);
    expect(go("  on ", "Breakpoint")).toEqual(["dimension Breakpoint = base | lg", "Breakpoint"]);
    expect(go("has link: Link only when ", "menu")).toEqual(["state menu: Openness", "menu"]);
  });

  it("goes along a path into a child, to the child or to what its type declares", () => {
    expect(go("on escape: close, ", "link")).toEqual([
      "has link: Link only when menu = open and Breakpoint = base",
      "link",
    ]);
    expect(go("on escape: close, link.", "take-focus")).toEqual([
      "action take-focus: focus blurred -> focused",
      "take-focus",
    ]);
    expect(go("on link.", "activate")).toEqual(["event activate", "activate"]);
    expect(go("has toggle: Toggle { ", "expanded")).toEqual([
      "state expanded: Openness",
      "expanded",
    ]);
    expect(go("expanded = ", "menu")).toEqual(["state menu: Openness", "menu"]);
  });

  it("goes nowhere from a declaration itself, a keyword, or a name that is not declared", () => {
    expect(go("enum ", "Hover")).toBeUndefined();
    expect(go("", "type")).toBeUndefined();
    expect(definition("type Link {\n  state hover: Hovr\n}\n", 2, 16)).toBeUndefined();
  });
});
