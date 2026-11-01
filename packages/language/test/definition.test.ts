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
enum Layout = compact | inline
type Ring {
  state focus: Focus
}
type Bar needs Breakpoint {
  state layout: Layout = when Breakpoint { base -> compact, lg -> inline }
  has ring: Ring { focus = when layout { compact -> blurred, inline -> focused } }
}
enum Kind = draft | final
record Note {
  kind: Kind
  section: Section = when kind { draft -> home, final -> blog }
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
  const found = definition(source, line + 1, column + Math.floor(word.length / 2))?.to;
  if (found === undefined) return undefined;
  const text = lines[found.line - 1] ?? "";
  const at = text.slice(found.column - 1).match(/^[A-Za-z0-9-]+/)?.[0] ?? "";
  return [text.trim(), at];
}

// The text that going to a definition from a word, in the first line holding
// the text before it, goes from.
function from(before: string, word: string): string | undefined {
  const line = lines.findIndex((text) => text.includes(`${before}${word}`));
  const column = (lines[line] ?? "").indexOf(`${before}${word}`) + before.length + 1;
  const found = definition(source, line + 1, column + Math.floor(word.length / 2))?.from;
  if (found === undefined) return undefined;
  return (lines[found.line - 1] ?? "").slice(found.column - 1, found.column - 1 + found.length);
}

describe("definition", () => {
  it("goes from the whole name under the cursor, or the part of a path it is in", () => {
    const snapshot: (string | undefined)[] = [];
    snapshot.push(from("on activate: ", "take-focus"));
    snapshot.push(from("state hover: ", "Hover"));
    snapshot.push(from("on escape: close, ", "link"));
    snapshot.push(from("on escape: close, link.", "take-focus"));
    snapshot.push(from("on link.", "activate"));
    snapshot.push(from("modifier trackpad on ", "phone"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "take-focus",
        "Hover",
        "link",
        "take-focus",
        "activate",
        "phone",
      ]
    `);
  });

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

  it("goes from a value to where its enum or dimension declares it", () => {
    const snapshot: unknown[] = [];
    // A rule's value, and the values its condition compares.
    snapshot.push(go("hover = ", "hovered"));
    snapshot.push(go("when Pointer = ", "mouse"));
    snapshot.push(go("and focus = ", "blurred"));
    // What is alike, and its condition.
    snapshot.push(go("alike hover in (", "rest"));
    snapshot.push(go("when focus = ", "focused"));
    // An action's values, and a trigger's change in place.
    snapshot.push(go("action take-focus: focus ", "blurred"));
    snapshot.push(go("focus blurred -> ", "focused"));
    snapshot.push(go("hover -> ", "rest"));
    // A child's and a trigger's conditions, and a dimension event.
    snapshot.push(go("only when menu = ", "open"));
    snapshot.push(go("on Breakpoint in (", "lg"));
    // A fixed state, and a derived state's branches.
    snapshot.push(go("state current: Section = ", "blog"));
    snapshot.push(go("when Breakpoint { ", "base"));
    snapshot.push(go("when Breakpoint { base -> ", "compact"));
    // A binding's map: the type's state's values, and the child's state's.
    snapshot.push(go("when layout { ", "compact"));
    snapshot.push(go("when layout { compact -> ", "blurred"));
    // A profile's and a modifier's dimensions' values.
    snapshot.push(go("{ Breakpoint = ", "base"));
    snapshot.push(go("trackpad on phone { Pointer = ", "mouse"));
    // A derived field's branches.
    snapshot.push(go("when kind { ", "draft"));
    snapshot.push(go("when kind { draft -> ", "home"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "enum Hover = rest | hovered",
          "hovered",
        ],
        [
          "dimension Pointer = mouse | touch",
          "mouse",
        ],
        [
          "enum Focus = blurred | focused",
          "blurred",
        ],
        [
          "enum Hover = rest | hovered",
          "rest",
        ],
        [
          "enum Focus = blurred | focused",
          "focused",
        ],
        [
          "enum Focus = blurred | focused",
          "blurred",
        ],
        [
          "enum Focus = blurred | focused",
          "focused",
        ],
        [
          "enum Hover = rest | hovered",
          "rest",
        ],
        [
          "enum Openness = closed | open",
          "open",
        ],
        [
          "dimension Breakpoint = base | lg",
          "lg",
        ],
        [
          "enum Section = home | blog",
          "blog",
        ],
        [
          "dimension Breakpoint = base | lg",
          "base",
        ],
        [
          "enum Layout = compact | inline",
          "compact",
        ],
        [
          "enum Layout = compact | inline",
          "compact",
        ],
        [
          "enum Focus = blurred | focused",
          "blurred",
        ],
        [
          "dimension Breakpoint = base | lg",
          "base",
        ],
        [
          "dimension Pointer = mouse | touch",
          "mouse",
        ],
        [
          "enum Kind = draft | final",
          "draft",
        ],
        [
          "enum Section = home | blog",
          "home",
        ],
      ]
    `);
  });

  it("goes nowhere from a declaration itself, a keyword, or a name that is not declared", () => {
    expect(go("enum ", "Hover")).toBeUndefined();
    expect(go("", "type")).toBeUndefined();
    expect(definition("type Link {\n  state hover: Hovr\n}\n", 2, 16)).toBeUndefined();
  });
});
