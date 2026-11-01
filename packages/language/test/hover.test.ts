import { describe, expect, it } from "vitest";
import { hover } from "../src/hover.js";

const source = `dimension Pointer = mouse | touch

# Whether the pointer is over it.
enum Hover = rest | hovered
enum Focus = blurred | focused
enum Section = home | blog

# A link, in the toolbar or the menu.
type Link needs Pointer receives current: Section {
  event press
  # Over it, with a mouse only.
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
profile laptop: Device { Pointer = mouse }
modifier tablet on laptop { Pointer = touch }

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
  it("shows a declaration as it is written, with its comment, from where it is used or itself", () => {
    const snapshot: unknown[] = [];
    snapshot.push(over("state hover: ", "Hover"));
    snapshot.push(over("enum ", "Hover"));
    snapshot.push(over("needs ", "Pointer"));
    snapshot.push(over("has link: ", "Link"));
    snapshot.push(over("state menu: ", "Openness"));
    snapshot.push(over("section: ", "Section"));
    snapshot.push(over("record ", "Source"));
    snapshot.push(over("profile laptop: ", "Device"));
    snapshot.push(over("modifier tablet on ", "laptop"));
    snapshot.push(over("modifier ", "tablet"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "[Hover]
      enum Hover = rest | hovered
      -- Whether the pointer is over it.",
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
        "[Source]
      record Source {
        file: RelativePath
        section: Section
      }
      -- Where a drawing is.",
        "[Device]
      environment Device = Pointer",
        "[laptop]
      profile laptop: Device { Pointer = mouse }",
        "[tablet]
      modifier tablet on laptop { Pointer = touch }",
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
    snapshot.push(over("Pointer = ", "mouse"));
    snapshot.push(over("only when menu = ", "open"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "[hover]
      state Link.hover: Hover
      enum Hover = rest | hovered
      -- Over it, with a mouse only.",
        "[shown]
      state Menu.shown: Section = blog
      enum Section = home | blog",
        "[current]
      receives Link.current: Section
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

  it("shows nothing over a keyword or a name the file does not declare", () => {
    expect(over("", "type")).toBeUndefined();
    expect(hover("type Link {\n  state hover: Hovr\n}\n", 2, 16)).toBeUndefined();
  });
});
