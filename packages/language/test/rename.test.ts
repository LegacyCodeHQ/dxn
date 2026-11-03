import { describe, expect, it } from "vitest";
import { renameInData, renameInSource } from "../src/evidence/rename.js";
import { parse } from "../src/syntax/parse.js";

const source = `# What can be hovered.
enum Hover = rest | hovered   # the pointer's
enum Other = hovered | idle
dimension Mode = hovered | quiet
type Wordmark needs Mode {
  state hover: Hover, other: Other
  hover = hovered only when Mode = hovered
  other = hovered only when Mode = quiet
}
record Entry {
  hover: Hover
  other: Other
  note: NonEmptyString
  inner: Inner
}
record Inner {
  hover: Hover
}
`;

describe("renaming an enum value", () => {
  it("renames it where the enum is declared and where a rule names it, and nowhere else", () => {
    expect(renameInSource(parse(source), source, "Hover", "hovered", "over")).toBe(
      source
        .replace("enum Hover = rest | hovered", "enum Hover = rest | over")
        .replace("hover = hovered only when", "hover = over only when"),
    );
  });

  it("renames it in children's conditions, actions, expectations and derived fields", () => {
    const menu = `enum State = closed | open
enum Other = open | shut
type Panel {
  state other: Other
}
type Menu {
  state menu: State
  has panel: Panel only when menu = open
  action open: menu closed -> open
  action close: menu open -> closed
}
type Page {
  has menu: Menu
}
expect "Open" {
  in Page.menu
  when menu = open
  then menu = open
}
expect "Other" {
  in Page.menu.panel
  some other = open
}
enum Actor = agent
record Entry {
  actor: Actor
  state: State = when actor {
    agent -> open
  }
  other: Other = when actor {
    agent -> open
  }
}
`;
    const renamed = renameInSource(parse(menu), menu, "State", "open", "shown");
    expect([renamed, parse(renamed).diagnostics]).toEqual([
      menu
        .replace("closed | open", "closed | shown")
        .replace("only when menu = open", "only when menu = shown")
        .replace("menu closed -> open", "menu closed -> shown")
        .replace("menu open -> closed", "menu shown -> closed")
        .replace("when menu = open\n  then menu = open", "when menu = shown\n  then menu = shown")
        .replace(
          "state: State = when actor {\n    agent -> open",
          "state: State = when actor {\n    agent -> shown",
        ),
      [],
    ]);
  });

  it("renames it in stored records, only in fields of that enum, keeping the file as it was", () => {
    const data = `[
  { "hover": "hovered", "other": "hovered", "note": "hovered",
    "inner": { "hover": "hovered" } },
  { "hover": "rest", "other": "idle", "note": "x", "inner": { "hover": "rest" } }
]
`;
    expect(renameInData(parse(source), "Entry", data, "Hover", "hovered", "over")).toEqual({
      source: `[
  { "hover": "over", "other": "hovered", "note": "hovered",
    "inner": { "hover": "over" } },
  { "hover": "rest", "other": "idle", "note": "x", "inner": { "hover": "rest" } }
]
`,
      changed: 2,
    });
  });
});
