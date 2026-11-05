import { hover } from "@language/editor/hover.js";
import { describe, expect, it } from "vitest";

const source = `dimension Pointer = mouse | touch

## Whether the pointer is over it.
enum Hover = rest | hovered
enum Focus = blurred | focused
enum Section = home | blog

## A link, in the toolbar or the menu.
type Link needs Pointer receives current: Section {
  event press
  ## Over it, with a mouse only.
  state hover: Hover
  state focus: Focus
  hover = hovered only when Pointer = mouse
  # Takes the focus from wherever it was.
  action take-focus: focus blurred -> focused
  on press: take-focus
}

type Menu {
  enum Openness = closed | open
  state menu: Openness
  state shown: Section = blog
  has link: Link only when menu = open
  on link.press: link.take-focus
}

environment Device = Pointer
profile Laptop: Device { Pointer = mouse }
modifier Tablet on Laptop { Pointer = touch }

# Where a drawing is.
record Source {
  file: RelativePath
  section: Section
}
`;

const lines = source.split("\n");

// What hovering over a word, in the first line holding the text before it,
// shows: the declaration as written, then its comment, and the text it is
// over.
function over(before: string, word: string): string | undefined {
  const line = lines.findIndex((text) => text.includes(`${before}${word}`));
  const column = (lines[line] ?? "").indexOf(`${before}${word}`) + before.length + 1;
  const found = hover(source, line + 1, column + Math.floor(word.length / 2));
  if (found === undefined) return undefined;
  const { from } = found;
  const text = (lines[from.line - 1] ?? "").slice(from.column - 1, from.column - 1 + from.length);
  return [
    `[${text}]`,
    found.code,
    ...(found.comment === undefined ? [] : [`-- ${found.comment}`]),
  ].join("\n");
}

describe("hover", () => {
  it("shows a declaration as it is written, with its comment, where its name is used", () => {
    const snapshot: unknown[] = [];
    snapshot.push(over("state hover: ", "Hover"));
    snapshot.push(over("needs ", "Pointer"));
    snapshot.push(over("has link: ", "Link"));
    snapshot.push(over("state menu: ", "Openness"));
    snapshot.push(over("section: ", "Section"));
    snapshot.push(over("profile Laptop: ", "Device"));
    snapshot.push(over("modifier Tablet on ", "Laptop"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "[Hover]
      enum Hover = rest | hovered
      -- Whether the pointer is over it.",
        "[Pointer]
      dimension Pointer = mouse | touch",
        "[Link]
      type Link needs Pointer receives current: Section
        event press
        state hover: Hover, focus: Focus
        action take-focus
      -- A link, in the toolbar or the menu.",
        "[Openness]
      enum Menu.Openness = closed | open",
        "[Section]
      enum Section = home | blog",
        "[Device]
      environment Device = Pointer",
        "[Laptop]
      profile Laptop: Device { Pointer = mouse }",
      ]
    `);
  });

  it("shows a state with its enum, an action, an event, a child, and a value with its enum", () => {
    const snapshot: unknown[] = [];
    snapshot.push(over("  ", "hover"));
    snapshot.push(over("state ", "shown"));
    snapshot.push(over("receives ", "current"));
    snapshot.push(over("on press: ", "take-focus"));
    snapshot.push(over("on ", "press"));
    snapshot.push(over("on link.press: ", "link"));
    snapshot.push(over("on link.press: link.", "take-focus"));
    snapshot.push(over("hover = ", "hovered"));
    snapshot.push(over("when Pointer = ", "mouse"));
    snapshot.push(over("only when menu = ", "open"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "[hover]
      state Link.hover: Hover
      enum Hover = rest | hovered
      -- Over it, with a mouse only.",
        "[shown]
      enum Section = home | blog",
        "[current]
      enum Section = home | blog",
        "[take-focus]
      action Link.take-focus: focus blurred -> focused
      -- Takes the focus from wherever it was.",
        "[press]
      event Link.press",
        "[link]
      has Menu.link: Link only when menu = open",
        "[take-focus]
      action Link.take-focus: focus blurred -> focused
      -- Takes the focus from wherever it was.",
        "[hovered]
      enum Hover = rest | hovered
      -- Whether the pointer is over it.",
        "[mouse]
      dimension Pointer = mouse | touch",
        "[open]
      enum Menu.Openness = closed | open",
      ]
    `);
  });

  it("shows a state's enum and leaves undocumented declarations without a hover", () => {
    expect(over("state focus: ", "Focus")).toBe("[Focus]\nenum Focus = blurred | focused");
    expect(over("  state ", "focus")).toBe("[focus]\nenum Focus = blurred | focused");
    for (const [before, word] of [
      ["enum ", "Focus"],
      ["enum Focus = ", "blurred"],
      ["dimension ", "Pointer"],
      ["type ", "Menu"],
      ["record ", "Source"],
      ["environment ", "Device"],
      ["profile ", "Laptop"],
      ["modifier ", "Tablet"],
      ["  event ", "press"],
      ["action ", "take-focus"],
      ["has ", "link"],
    ] as const) {
      expect([word, over(before, word)]).toEqual([word, undefined]);
    }
  });

  it("shows nothing over a keyword or a name the file does not declare", () => {
    expect(over("", "type")).toBeUndefined();
    expect(hover("type Link {\n  state hover: Hovr\n}\n", 2, 16)).toBeUndefined();
  });
});
