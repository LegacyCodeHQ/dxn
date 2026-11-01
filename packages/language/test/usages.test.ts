import { describe, expect, it } from "vitest";
import { usages } from "../src/definition.js";

const source = `dimension Pointer = mouse | touch
enum Hover = rest | hovered
enum Focus = blurred | focused

type Link needs Pointer {
  event activate
  state hover: Hover
  state focus: Focus
  hover = hovered only when Pointer = mouse
  alike hover in (rest, hovered) when focus = blurred
  action take-focus: focus blurred -> focused
  on activate: take-focus, hover -> rest
}

type Menu {
  has link: Link
  has other: Link { focus = when Pointer { mouse -> focused, touch -> blurred } }
  event escape
  on escape: link.take-focus
  on link.activate: other.take-focus
}

environment Device = Pointer
profile laptop: Device { Pointer = mouse }
`;

const lines = source.split("\n");

// The usages of a word, from the first line holding the text before it: each
// as its line and the text it spans, the declaration first.
function find(before: string, word: string): string[] | undefined {
  const line = lines.findIndex((text) => text.includes(`${before}${word}`));
  const column = (lines[line] ?? "").indexOf(`${before}${word}`) + before.length + 1;
  const found = usages(source, line + 1, column + Math.floor(word.length / 2));
  if (found === undefined) return undefined;
  return [found.declaration, ...found.usages].map(
    (span) =>
      `${span.line}: ${(lines[span.line - 1] ?? "").slice(span.column - 1, span.column - 1 + span.length)}`,
  );
}

describe("usages", () => {
  it("finds where a declaration is used, from the declaration or from any usage", () => {
    const snapshot: unknown[] = [];
    // An enum, a dimension and a type.
    snapshot.push(find("enum ", "Hover"));
    snapshot.push(find("dimension ", "Pointer"));
    snapshot.push(find("has link: ", "Link"));
    snapshot.push(find("environment ", "Device"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "2: Hover",
          "7: Hover",
        ],
        [
          "1: Pointer",
          "5: Pointer",
          "9: Pointer",
          "17: Pointer",
          "23: Pointer",
          "24: Pointer",
        ],
        [
          "5: Link",
          "16: Link",
          "17: Link",
        ],
        [
          "23: Device",
          "24: Device",
        ],
      ]
    `);
  });

  it("finds where a state, an action, an event or a child is used, paths into children too", () => {
    const snapshot: unknown[] = [];
    snapshot.push(find("state ", "focus"));
    snapshot.push(find("action ", "take-focus"));
    snapshot.push(find("event ", "activate"));
    snapshot.push(find("has ", "link"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "8: focus",
          "10: focus",
          "11: focus",
          "17: focus",
        ],
        [
          "11: take-focus",
          "12: take-focus",
          "19: take-focus",
          "20: take-focus",
        ],
        [
          "6: activate",
          "12: activate",
          "20: activate",
        ],
        [
          "16: link",
          "19: link",
          "20: link",
        ],
      ]
    `);
  });

  it("finds where a value is used, from its declaration or from a usage", () => {
    const snapshot: unknown[] = [];
    snapshot.push(find("enum Focus = ", "blurred"));
    snapshot.push(find("when Pointer = ", "mouse"));
    snapshot.push(find("dimension Pointer = mouse | ", "touch"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "3: blurred",
          "10: blurred",
          "11: blurred",
          "17: blurred",
        ],
        [
          "1: mouse",
          "9: mouse",
          "17: mouse",
          "24: mouse",
        ],
        [
          "1: touch",
          "17: touch",
        ],
      ]
    `);
  });

  it("finds nothing at a keyword or a name the file does not declare", () => {
    expect(find("", "type")).toBeUndefined();
    expect(usages("type Link {\n  state hover: Hovr\n}\n", 2, 16)).toBeUndefined();
  });
});
