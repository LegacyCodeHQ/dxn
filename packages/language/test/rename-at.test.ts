import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { renameInData, renameInSource } from "../src/rename.js";
import { renameAt } from "../src/rename-at.js";
import { validate } from "../src/validate.js";

const source = `dimension Pointer = mouse | touch
enum Hover = rest | hovered
enum Focus = blurred | focused

type Link needs Pointer {
  event press
  state hover: Hover, focus: Focus
  hover = hovered only when Pointer = mouse
  action take-focus: focus blurred -> focused
  on press: take-focus
}

type Menu {
  enum Openness = closed | open
  state menu: Openness
  has link: Link only when menu = open
  on link.press: link.take-focus
}

type Page {
  state shown: Menu.Openness = open
  has menu: Menu
}

environment Device = Pointer
profile phone: Device { Pointer = touch }
modifier trackpad on phone { Pointer = mouse }

enum Actor = designer | agent
record Evidence with context {
  actor: Actor
}

expect "A press takes the focus" {
  in Page.menu.link
  when hover = hovered, profile = phone+trackpad
  on press
  then focus = focused
}
`;

const data = `[
  {
    "context": {
      "path": "Page.menu.link",
      "profile": "phone",
      "dimensions": {},
      "parents": { "menu.menu": "open" },
      "states": { "hover": "rest", "focus": "blurred" }
    },
    "actor": "designer"
  }
]
`;

const stored = [{ record: "Evidence", path: "evidence/evidence.json", source: data }];

// The place of a word, after the text before it: its line and the column of
// its middle, both from one.
function at(before: string, word: string): [number, number] {
  const offset = source.indexOf(`${before}${word}`) + before.length;
  const above = source.slice(0, offset).split("\n");
  return [above.length, (above.at(-1) ?? "").length + 1 + Math.floor(word.length / 2)];
}

// The source with the edits made, by line and column, both from one.
function edited(edits: { line: number; column: number; length: number; text: string }[]): string {
  const lines = source.split("\n");
  const sorted = [...edits].sort((a, b) => b.line - a.line || b.column - a.column);
  for (const { line, column, length, text } of sorted) {
    const content = lines[line - 1] ?? "";
    lines[line - 1] = `${content.slice(0, column - 1)}${text}${content.slice(column - 1 + length)}`;
  }
  return lines.join("\n");
}

// The lines a rename changes, as they read after it.
function renamed(before: string, word: string, to: string): string[] | string {
  const result = renameAt(source, ...at(before, word), to, stored);
  if ("refusal" in result) return result.refusal;
  const after = edited(result.edits).split("\n");
  const lines = source.split("\n");
  return after.filter((line, index) => line !== lines[index]).map((line) => line.trim());
}

describe("renaming in the editor", () => {
  it("renames an enum, an action, an event, an environment and a modifier where they are used", () => {
    const snapshot: unknown[] = [];
    snapshot.push(renamed("enum ", "Hover", "Pointing"));
    snapshot.push(renamed("state menu: ", "Openness", "State"));
    snapshot.push(renamed("action ", "take-focus", "grab-focus"));
    snapshot.push(renamed("  event ", "press", "tap"));
    snapshot.push(renamed("environment ", "Device", "Screen"));
    snapshot.push(renamed("profile = phone+", "trackpad", "mouse-pad"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "enum Pointing = rest | hovered",
          "state hover: Pointing, focus: Focus",
        ],
        [
          "enum State = closed | open",
          "state menu: State",
          "state shown: Menu.State = open",
        ],
        [
          "action grab-focus: focus blurred -> focused",
          "on press: grab-focus",
          "on link.press: link.grab-focus",
        ],
        [
          "event tap",
          "on tap: take-focus",
          "on link.tap: link.take-focus",
          "on tap",
        ],
        [
          "environment Screen = Pointer",
          "profile phone: Screen { Pointer = touch }",
        ],
        [
          "modifier mouse-pad on phone { Pointer = mouse }",
          "when hover = hovered, profile = phone+mouse-pad",
        ],
      ]
    `);
  });

  it("renames a value where it is used, and in stored records, as dxn rename does", () => {
    const result = renameAt(source, ...at("enum Focus = ", "blurred"), "unfocused", stored);
    if ("refusal" in result) throw new Error(result.refusal);
    const file = parse(source);
    expect(edited(result.edits)).toBe(
      renameInSource(file, source, "Focus", "blurred", "unfocused"),
    );
    expect(result.data).toEqual([
      {
        path: "evidence/evidence.json",
        source: renameInData(file, "Evidence", data, "Focus", "blurred", "unfocused").source,
      },
    ]);
    expect(result.data[0]?.source).toContain('"focus": "unfocused"');
  });

  it("leaves stored records that do not use the name alone", () => {
    const result = renameAt(source, ...at("action ", "take-focus"), "grab-focus", stored);
    expect("refusal" in result ? result.refusal : result.data).toEqual([]);
  });

  it("renames a state where it is used, and as a key in stored records' contexts", () => {
    const snapshot: unknown[] = [];
    for (const [before, word, to] of [
      ["  state ", "hover", "pointing"],
      ["  state ", "menu", "openness"],
    ] as const) {
      const result = renameAt(source, ...at(before, word), to, stored);
      if ("refusal" in result) throw new Error(result.refusal);
      const after = edited(result.edits);
      const lines = source.split("\n");
      snapshot.push(
        after
          .split("\n")
          .filter((line, index) => line !== lines[index])
          .map((line) => line.trim()),
      );
      // The stored records still check, against the renamed file.
      const data = result.data[0]?.source ?? "";
      snapshot.push(data.match(/"(parents|states)": \{[^}]*\}/g));
      expect(validate(parse(after), "Evidence", data)).toEqual([]);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "state pointing: Hover, focus: Focus",
          "pointing = hovered only when Pointer = mouse",
          "when pointing = hovered, profile = phone+trackpad",
        ],
        [
          ""parents": { "menu.menu": "open" }",
          ""states": { "pointing": "rest", "focus": "blurred" }",
        ],
        [
          "state openness: Openness",
          "has link: Link only when openness = open",
        ],
        [
          ""parents": { "menu.openness": "open" }",
          ""states": { "hover": "rest", "focus": "blurred" }",
        ],
      ]
    `);
  });

  it("renames a child where it is used, and in stored records' paths and parents' keys", () => {
    const snapshot: unknown[] = [];
    for (const [before, word, to] of [
      ["  has ", "link", "item"],
      ["  has ", "menu", "nav"],
    ] as const) {
      const result = renameAt(source, ...at(before, word), to, stored);
      if ("refusal" in result) throw new Error(result.refusal);
      const after = edited(result.edits);
      const lines = source.split("\n");
      snapshot.push(
        after
          .split("\n")
          .filter((line, index) => line !== lines[index])
          .map((line) => line.trim()),
      );
      const data = result.data[0]?.source ?? "";
      snapshot.push(data.match(/"(path|parents)": ("[^"]*"|\{[^}]*\})/g));
      expect(validate(parse(after), "Evidence", data)).toEqual([]);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "has item: Link only when menu = open",
          "on item.press: item.take-focus",
          "in Page.menu.item",
        ],
        [
          ""path": "Page.menu.item"",
          ""parents": { "menu.menu": "open" }",
        ],
        [
          "has nav: Menu",
          "in Page.nav.link",
        ],
        [
          ""path": "Page.nav.link"",
          ""parents": { "nav.menu": "open" }",
        ],
      ]
    `);
  });

  it("refuses, for now, a state that is provided or received, which is matched by its name", () => {
    const shared = `enum Section = home | blog
type Link receives current: Section {
}
type Page {
  state current: Section = blog
  provides current
  has link: Link
}
`;
    const offset = (text: string, word: string) => {
      const lines = shared.split("\n");
      const line = lines.findIndex((each) => each.includes(text));
      return [line + 1, (lines[line] ?? "").indexOf(text) + text.indexOf(word) + 2] as const;
    };
    expect(
      [
        renameAt(shared, ...offset("receives current", "current"), "section"),
        renameAt(shared, ...offset("state current", "current"), "section"),
      ].map((result) => ("refusal" in result ? result.refusal : result)),
    ).toMatchInlineSnapshot(`
      [
        "current is received by its name from a type above; renaming it here is not supported yet",
        "current is provided by its name to the types below; renaming it here is not supported yet",
      ]
    `);
  });

  it("refuses a name that is not one, one already declared, and what stored records name", () => {
    const snapshot: unknown[] = [];
    snapshot.push(renamed("enum ", "Hover", "hover"));
    snapshot.push(renamed("action ", "take-focus", "Take"));
    snapshot.push(renamed("enum Hover = rest | ", "hovered", "a b"));
    snapshot.push(renamed("enum Hover = ", "rest", "hovered"));
    snapshot.push(renamed("enum ", "Focus", "Hover"));
    snapshot.push(renamed("type ", "Link", "Item"));
    snapshot.push(renamed("profile ", "phone", "handset"));
    snapshot.push(renamed("dimension ", "Pointer", "Input"));
    snapshot.push(renamed("dimension Pointer = ", "mouse", "cursor"));
    snapshot.push(renamed("record ", "Evidence", "Proof"));
    snapshot.push(renamed("", "type", "kind"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        ""hover" is not an enum name: a capital letter, then letters and digits",
        ""Take" is not an action name: a lowercase letter, then letters, digits and hyphens",
        ""a b" is not a value name: a letter or digit, then letters, digits and hyphens",
        "the rename would leave a problem: "hovered" appears twice in Hover",
        "the rename would leave a problem: Hover is already declared at line 2",
        "Link is a type, and stored records name it; renaming it here is not supported yet",
        "phone is a profile, and stored records name it; renaming it here is not supported yet",
        "Pointer is a dimension, and stored records name it; renaming it here is not supported yet",
        "mouse is a value of the dimension Pointer, and stored records name it; renaming it here is not supported yet",
        "Evidence is a record, and its stored records are in a folder named after it; renaming it here is not supported yet",
        "there is no name here to rename",
      ]
    `);
  });
});
