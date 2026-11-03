import { tokens } from "@language/editor/semantic.js";
import { describe, expect, it } from "vitest";

const source = `dimension Pointer = mouse | touch
enum Hover = rest | hovered

type Link needs Pointer {
  event press
  state hover: Hover, lit: Hover
  hover = hovered only when Pointer = mouse
  action rest: hover hovered -> rest
  on press: rest
}

type Menu {
  enum Openness = closed | open
  state menu: Openness
  has link: Link { lit = when menu { open -> hovered, closed -> rest } }
}

environment Device = Pointer
profile Phone: Device { Pointer = touch }
modifier Trackpad on Phone { Pointer = mouse }
enum Actor = designer
record Evidence {
  actor: Actor
}

expect "A pressed link is at rest" {
  in Menu.link
  when profile = Phone+Trackpad
  on press
  then hover = rest
}
actor EvidenceRecorder records Evidence
`;

const lines = source.split("\n");

// Each token on a line: its text, its kind, and "declaration" where it is
// declared.
function on(line: number): string[] {
  return tokens(source)
    .filter((token) => token.line === line)
    .map(({ column, length, kind, declaration }) =>
      [
        (lines[line - 1] ?? "").slice(column - 1, column - 1 + length),
        kind,
        ...(declaration ? ["declaration"] : []),
      ].join(" "),
    );
}

describe("semantic tokens", () => {
  it("name what each name is, where it is declared and where it is used", () => {
    expect(
      Object.fromEntries([1, 2, 4, 6, 7, 8, 9, 15].map((line) => [line, on(line)])),
    ).toMatchInlineSnapshot(`
      {
        "1": [
          "Pointer dimension declaration",
          "mouse value declaration",
          "touch value declaration",
        ],
        "15": [
          "link child declaration",
          "Link type",
          "lit state",
          "menu state",
          "open value",
          "hovered value",
          "closed value",
          "rest value",
        ],
        "2": [
          "Hover enum declaration",
          "rest value declaration",
          "hovered value declaration",
        ],
        "4": [
          "Link type declaration",
          "Pointer dimension",
        ],
        "6": [
          "hover state declaration",
          "Hover enum",
          "lit state declaration",
          "Hover enum",
        ],
        "7": [
          "hover state",
          "hovered value",
          "Pointer dimension",
          "mouse value",
        ],
        "8": [
          "rest action declaration",
          "hover state",
          "hovered value",
          "rest value",
        ],
        "9": [
          "press event",
          "rest action",
        ],
      }
    `);
  });

  it("name environments, profiles, modifiers, records and their fields, and an expectation's names", () => {
    expect(
      Object.fromEntries([18, 19, 20, 22, 23, 27, 28, 29, 30].map((line) => [line, on(line)])),
    ).toMatchInlineSnapshot(`
      {
        "18": [
          "Device environment declaration",
          "Pointer dimension",
        ],
        "19": [
          "Phone profile declaration",
          "Device environment",
          "Pointer dimension",
          "touch value",
        ],
        "20": [
          "Trackpad modifier declaration",
          "Phone profile",
          "Pointer dimension",
          "mouse value",
        ],
        "22": [
          "Evidence record declaration",
        ],
        "23": [
          "actor field declaration",
          "Actor enum",
        ],
        "27": [
          "Menu type",
          "link child",
        ],
        "28": [
          "Phone profile",
          "Trackpad modifier",
        ],
        "29": [
          "press event",
        ],
        "30": [
          "hover state",
          "rest value",
        ],
      }
    `);
  });

  it("are in the order they are written, and none overlaps another", () => {
    const all = tokens(source);
    const overlapping = all.filter(
      (token, index) =>
        index > 0 &&
        token.line === all[index - 1]?.line &&
        token.column < (all[index - 1]?.column ?? 0) + (all[index - 1]?.length ?? 0),
    );
    expect(overlapping).toEqual([]);
  });
});
