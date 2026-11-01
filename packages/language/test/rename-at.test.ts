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
profile Phone: Device { Pointer = touch }
modifier trackpad on Phone { Pointer = mouse }

enum Actor = designer | agent
record Evidence {
}

expect "A press takes the focus" {
  in Page.menu.link
  when hover = hovered, profile = Phone+trackpad
  on press
  then focus = focused
}
actor Designer records Evidence
`;

const data = `[
  {
    "context": {
      "path": "Page.menu.link",
      "profile": "Phone",
      "dimensions": {},
      "parents": { "menu.menu": "open" },
      "states": { "hover": "rest", "focus": "blurred" }
    },
    "actor": "Designer"
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
    snapshot.push(renamed("profile = Phone+", "trackpad", "mouse-pad"));
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
          "profile Phone: Screen { Pointer = touch }",
        ],
        [
          "modifier mouse-pad on Phone { Pointer = mouse }",
          "when hover = hovered, profile = Phone+mouse-pad",
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
        changed: 1,
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
          "when pointing = hovered, profile = Phone+trackpad",
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

  it("renames a type where it is used, written in full too, and in stored records' paths", () => {
    const snapshot: unknown[] = [];
    for (const [before, word, to] of [
      ["type ", "Link", "Item"],
      ["type ", "Menu", "Nav"],
      ["type ", "Page", "Screen"],
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
      // A type that is not at the root of a stored path leaves the data alone.
      const records = result.data[0]?.source ?? data;
      snapshot.push(records.match(/"path": "[^"]*"/g));
      expect(validate(parse(after), "Evidence", records)).toEqual([]);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "type Item needs Pointer {",
          "has link: Item only when menu = open",
        ],
        [
          ""path": "Page.menu.link"",
        ],
        [
          "type Nav {",
          "state shown: Nav.Openness = open",
          "has menu: Nav",
        ],
        [
          ""path": "Page.menu.link"",
        ],
        [
          "type Screen {",
          "in Screen.menu.link",
        ],
        [
          ""path": "Screen.menu.link"",
        ],
      ]
    `);
  });

  it("renames a profile and a modifier where they are used, and in stored records' profiles", () => {
    const record = (profile: string) => `  {
    "context": {
      "path": "Page.menu.link",
      "profile": "${profile}",
      "dimensions": {},
      "parents": { "menu.menu": "open" },
      "states": { "hover": "rest", "focus": "blurred" }
    },
    "actor": "Designer"
  }`;
    const both = [
      {
        record: "Evidence",
        path: "evidence/evidence.json",
        source: `[\n${record("Phone")},\n${record("Phone+trackpad")}\n]\n`,
      },
    ];
    const snapshot: unknown[] = [];
    for (const [before, word, to] of [
      ["profile ", "Phone", "Handset"],
      ["modifier ", "trackpad", "mouse-pad"],
    ] as const) {
      const result = renameAt(source, ...at(before, word), to, both);
      if ("refusal" in result) throw new Error(result.refusal);
      const after = edited(result.edits);
      const lines = source.split("\n");
      snapshot.push(
        after
          .split("\n")
          .filter((line, index) => line !== lines[index])
          .map((line) => line.trim()),
      );
      const records = result.data[0]?.source ?? "";
      snapshot.push(records.match(/"profile": "[^"]*"/g));
      expect(validate(parse(after), "Evidence", records)).toEqual([]);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "profile Handset: Device { Pointer = touch }",
          "modifier trackpad on Handset { Pointer = mouse }",
          "when hover = hovered, profile = Handset+trackpad",
        ],
        [
          ""profile": "Handset"",
          ""profile": "Handset+trackpad"",
        ],
        [
          "modifier mouse-pad on Phone { Pointer = mouse }",
          "when hover = hovered, profile = Phone+mouse-pad",
        ],
        [
          ""profile": "Phone"",
          ""profile": "Phone+mouse-pad"",
        ],
      ]
    `);
  });

  it("renames a dimension and its values where they are used, and in stored records' dimensions", () => {
    const themed = `dimension Pointer = mouse | touch
dimension Theme = light | dark
enum Actor = designer
type Card needs Pointer, Theme {
  enum Shade = pale | deep
  enum Glow = off | on
  state shade: Shade = when Theme { light -> pale, dark -> deep }
  state glow: Glow
  on Theme in (dark): glow -> on
}
environment Device = Pointer
profile Phone: Device { Pointer = touch }
record Evidence {
}
expect "A dark card is deep" {
  in Card
  when Theme = dark
  then shade = deep
}
actor Designer records Evidence
`;
    const records = `[
  {
    "context": {
      "path": "Card",
      "profile": "Phone",
      "dimensions": { "Theme": "dark" },
      "parents": {},
      "states": { "shade": "deep", "glow": "off" }
    },
    "actor": "Designer"
  }
]
`;
    const where = (before: string, word: string): [number, number] => {
      const offset = themed.indexOf(`${before}${word}`) + before.length;
      const above = themed.slice(0, offset).split("\n");
      return [above.length, (above.at(-1) ?? "").length + 1 + Math.floor(word.length / 2)];
    };
    expect(validate(parse(themed), "Evidence", records)).toEqual([]);
    const snapshot: unknown[] = [];
    for (const [before, word, to] of [
      ["dimension ", "Theme", "Mode"],
      ["dimension Theme = light | ", "dark", "night"],
      ["dimension ", "Pointer", "Input"],
      ["dimension Pointer = mouse | ", "touch", "finger"],
    ] as const) {
      const result = renameAt(themed, ...where(before, word), to, [
        { record: "Evidence", path: "evidence/card.json", source: records },
      ]);
      if ("refusal" in result) throw new Error(result.refusal);
      const lines = themed.split("\n");
      const sorted = [...result.edits].sort((a, b) => b.line - a.line || b.column - a.column);
      for (const { line, column, length, text } of sorted) {
        const content = lines[line - 1] ?? "";
        lines[line - 1] =
          `${content.slice(0, column - 1)}${text}${content.slice(column - 1 + length)}`;
      }
      const after = lines.join("\n");
      const before_ = themed.split("\n");
      snapshot.push(
        lines.filter((line, index) => line !== before_[index]).map((line) => line.trim()),
      );
      const data = result.data[0]?.source ?? records;
      snapshot.push(data.match(/"dimensions": \{[^}]*\}/g));
      expect(validate(parse(after), "Evidence", data)).toEqual([]);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "dimension Mode = light | dark",
          "type Card needs Pointer, Mode {",
          "state shade: Shade = when Mode { light -> pale, dark -> deep }",
          "on Mode in (dark): glow -> on",
          "when Mode = dark",
        ],
        [
          ""dimensions": { "Mode": "dark" }",
        ],
        [
          "dimension Theme = light | night",
          "state shade: Shade = when Theme { light -> pale, night -> deep }",
          "on Theme in (night): glow -> on",
          "when Theme = night",
        ],
        [
          ""dimensions": { "Theme": "night" }",
        ],
        [
          "dimension Input = mouse | touch",
          "type Card needs Input, Theme {",
          "environment Device = Input",
          "profile Phone: Device { Input = touch }",
        ],
        [
          ""dimensions": { "Theme": "dark" }",
        ],
        [
          "dimension Pointer = mouse | finger",
          "profile Phone: Device { Pointer = finger }",
        ],
        [
          ""dimensions": { "Theme": "dark" }",
        ],
      ]
    `);
  });

  it("renames a provided state with every state that receives it, from any of them", () => {
    const shared = `enum Section = home | blog
enum Selection = unselected | selected
enum Actor = designer
type Link receives current: Section {
  state selection: Selection
}
type Panel receives current: Section {
  has link: Link { selection = when current { blog -> selected, home -> unselected } }
}
type Page {
  state current: Section = blog
  provides current
  has panel: Panel
}
record Evidence {
}
expect "The link is selected on the blog" {
  in Page.panel.link
  when current = blog
  then selection = selected
}
actor Designer records Evidence
`;
    const records = `[
  {
    "context": {
      "path": "Page.panel.link",
      "dimensions": {},
      "parents": { "current": "blog" },
      "states": { "current": "blog", "selection": "selected" }
    },
    "actor": "Designer"
  }
]
`;
    expect(validate(parse(shared), "Evidence", records)).toEqual([]);
    const lines = shared.split("\n");
    const where = (text: string): [number, number] => {
      const line = lines.findIndex((each) => each.includes(text));
      return [line + 1, (lines[line] ?? "").indexOf(text) + text.indexOf("current") + 2];
    };
    const snapshot: unknown[] = [];
    // From the provider's state, from what provides it, and from a receiver.
    for (const text of ["state current", "provides current", "Link receives current"]) {
      const result = renameAt(shared, ...where(text), "section", [
        { record: "Evidence", path: "evidence/link.json", source: records },
      ]);
      if ("refusal" in result) throw new Error(result.refusal);
      const after = [...lines];
      const sorted = [...result.edits].sort((a, b) => b.line - a.line || b.column - a.column);
      for (const { line, column, length, text: to } of sorted) {
        const content = after[line - 1] ?? "";
        after[line - 1] =
          `${content.slice(0, column - 1)}${to}${content.slice(column - 1 + length)}`;
      }
      snapshot.push(
        after.filter((line, index) => line !== lines[index]).map((line) => line.trim()),
      );
      const data = result.data[0]?.source ?? records;
      snapshot.push(data.match(/"(parents|states)": \{[^}]*\}/g));
      expect(validate(parse(after.join("\n")), "Evidence", data)).toEqual([]);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "type Link receives section: Section {",
          "type Panel receives section: Section {",
          "has link: Link { selection = when section { blog -> selected, home -> unselected } }",
          "state section: Section = blog",
          "provides section",
          "when section = blog",
        ],
        [
          ""parents": { "section": "blog" }",
          ""states": { "section": "blog", "selection": "selected" }",
        ],
        [
          "type Link receives section: Section {",
          "type Panel receives section: Section {",
          "has link: Link { selection = when section { blog -> selected, home -> unselected } }",
          "state section: Section = blog",
          "provides section",
          "when section = blog",
        ],
        [
          ""parents": { "section": "blog" }",
          ""states": { "section": "blog", "selection": "selected" }",
        ],
        [
          "type Link receives section: Section {",
          "type Panel receives section: Section {",
          "has link: Link { selection = when section { blog -> selected, home -> unselected } }",
          "state section: Section = blog",
          "provides section",
          "when section = blog",
        ],
        [
          ""parents": { "section": "blog" }",
          ""states": { "section": "blog", "selection": "selected" }",
        ],
      ]
    `);
  });

  it("renames a record where it is used, and names the folder its stored records move to", () => {
    const records = `enum Actor = designer
record Source {
  file: RelativePath
}
record DesignReview {
  source: Source
}
actor DesignReviewRecorder records DesignReview
`;
    const lines = records.split("\n");
    const where = (text: string, word: string): [number, number] => {
      const line = lines.findIndex((each) => each.includes(text));
      return [line + 1, (lines[line] ?? "").indexOf(text) + text.indexOf(word) + 2];
    };
    const snapshot: unknown[] = [];
    for (const [text, word, to] of [
      ["record Source", "Source", "Origin"],
      ["source: Source", "Source", "Origin"],
      ["record DesignReview", "DesignReview", "Critique"],
    ] as const) {
      const result = renameAt(records, ...where(text, word), to);
      if ("refusal" in result) throw new Error(result.refusal);
      snapshot.push(
        result.edits.map(({ line }) => (lines[line - 1] ?? "").trim()),
        result.folder,
      );
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "record Source {",
          "source: Source",
        ],
        {
          "from": "source",
          "to": "origin",
        },
        [
          "record Source {",
          "source: Source",
        ],
        {
          "from": "source",
          "to": "origin",
        },
        [
          "record DesignReview {",
          "actor DesignReviewRecorder records DesignReview",
        ],
        {
          "from": "design-review",
          "to": "critique",
        },
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
    snapshot.push(renamed("", "type", "kind"));
    snapshot.push(renamed("actor ", "Designer", "designer"));
    snapshot.push(renamed("profile ", "Phone", "phone"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        ""hover" is not an enum name: a capital letter, then letters and digits",
        ""Take" is not an action name: a lowercase letter, then letters, digits and hyphens",
        ""a b" is not a value name: a letter or digit, then letters, digits and hyphens",
        "the rename would leave a problem: "hovered" appears twice in Hover",
        "the rename would leave a problem: Hover is already declared at line 2",
        "there is no name here to rename",
        ""designer" is not an actor name: a capital letter, then letters and digits",
        ""phone" is not a profile name: a capital letter, then letters and digits",
      ]
    `);
  });
});
