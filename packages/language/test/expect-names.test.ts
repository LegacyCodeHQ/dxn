import { describe, expect, it } from "vitest";
import { definition, usages } from "../src/definition.js";

const source = `dimension Pointer = mouse | touch
enum Hover = rest | hovered
enum Focus = blurred | focused
enum Openness = closed | open

type Link needs Pointer {
  state hover: Hover
  hover = hovered only when Pointer = mouse
}

type Toggle needs Pointer {
  event activate
  state hover: Hover, focus: Focus
  hover = hovered only when Pointer = mouse
  action take-focus: focus blurred -> focused
}

type Menu needs Pointer {
  event escape
  state menu: Openness
  has toggle: Toggle
  has link: Link only when menu = open
  action close: menu open -> closed
  on escape: close, toggle.take-focus
}

type Page {
  has menu: Menu
}

environment Device = Pointer
profile Phone: Device { Pointer = touch }
modifier trackpad on Phone { Pointer = mouse }

expect "Escape closes the menu" {
  in Page.menu
  when menu = open, profile = Phone+trackpad
  on escape
  then menu = closed, toggle.focus = focused
}

expect "Touch never hovers" {
  in Page.menu and below
  when Pointer = touch
  then hover = rest
}

expect "The link is there while the menu is open" {
  in Page.menu.link
  when menu.menu = open
  some hover = hovered
}
`;

const lines = source.split("\n");

// The line and the column, both from one, of the middle of a word, where the
// text before it first appears.
function middle(before: string, word: string): [number, number] {
  const offset = source.indexOf(`${before}${word}`) + before.length;
  const above = source.slice(0, offset).split("\n");
  return [above.length, (above.at(-1) ?? "").length + 1 + Math.floor(word.length / 2)];
}

// Where going to the definition of a word, after the text before it, leads:
// that line, as written.
function go(before: string, word: string): string | undefined {
  const found = definition(source, ...middle(before, word))?.to;
  if (found === undefined) return undefined;
  return `${found.line}: ${(lines[found.line - 1] ?? "").trim()}`;
}

// The lines a declaration is used on, from its name after the text before it.
function used(before: string, word: string): number[] | undefined {
  return usages(source, ...middle(before, word))?.usages.map(({ line }) => line);
}

describe("names in an expectation", () => {
  it("go from the element's path, part by part, to its type and its children", () => {
    const snapshot: unknown[] = [];
    snapshot.push(go("in ", "Page"));
    snapshot.push(go("in Page.", "menu"));
    snapshot.push(go("in Page.menu.", "link"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "27: type Page {",
        "28: has menu: Menu",
        "22: has link: Link only when menu = open",
      ]
    `);
  });

  it("go from a key to the element's state, a parent's, a child's after an event, or a dimension", () => {
    const snapshot: unknown[] = [];
    snapshot.push(go("  when ", "menu"));
    snapshot.push(go("then menu = closed, ", "toggle"));
    snapshot.push(go("then menu = closed, toggle.", "focus"));
    snapshot.push(go("when ", "Pointer"));
    snapshot.push(go("when menu.", "menu"));
    snapshot.push(go("  when ", "menu.menu"));
    snapshot.push(go("some ", "hover"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "20: state menu: Openness",
        "21: has toggle: Toggle",
        "13: state hover: Hover, focus: Focus",
        "1: dimension Pointer = mouse | touch",
        "20: state menu: Openness",
        "28: has menu: Menu",
        "7: state hover: Hover",
      ]
    `);
  });

  it("go from a value to its enum's or its dimension's, and from a profile and its modifier", () => {
    const snapshot: unknown[] = [];
    snapshot.push(go("when menu = ", "open"));
    snapshot.push(go("then menu = ", "closed"));
    snapshot.push(go("toggle.focus = ", "focused"));
    snapshot.push(go("when Pointer = ", "touch"));
    snapshot.push(go("profile = ", "Phone"));
    snapshot.push(go("profile = Phone+", "trackpad"));
    snapshot.push(go("  on ", "escape"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "4: enum Openness = closed | open",
        "4: enum Openness = closed | open",
        "3: enum Focus = blurred | focused",
        "1: dimension Pointer = mouse | touch",
        "32: profile Phone: Device { Pointer = touch }",
        "33: modifier trackpad on Phone { Pointer = mouse }",
        "19: event escape",
      ]
    `);
  });

  it("count as usages, of every element's state a key below a path names", () => {
    const snapshot: unknown[] = [];
    snapshot.push(used("type ", "Page"));
    snapshot.push(used("  event ", "escape"));
    snapshot.push(used("  state ", "menu"));
    snapshot.push(used("state hover: Hover, focus: ", "Focus"));
    snapshot.push(used("type Link needs Pointer {\n  state ", "hover"));
    snapshot.push(used("  state ", "hover"));
    snapshot.push(used("type Toggle needs Pointer {\n  event activate\n  state ", "hover"));
    snapshot.push(used("profile ", "Phone"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          36,
          43,
          49,
        ],
        [
          24,
          38,
        ],
        [
          22,
          23,
          37,
          39,
          50,
        ],
        [
          13,
        ],
        [
          8,
          45,
          51,
        ],
        [
          8,
          45,
          51,
        ],
        [
          14,
          45,
        ],
        [
          33,
          37,
        ],
      ]
    `);
  });
});
