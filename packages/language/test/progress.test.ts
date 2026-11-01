import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { coverage, progress } from "../src/status.js";
import { validate } from "../src/validate.js";

const file = parse(`dimension Pointer = mouse | touch
enum Hover = rest | hovered

type Menu {
  enum State = closed | open
  state menu: State
  type Toggle needs Pointer {
    state hover: Hover
    state expanded: State
    hover = hovered only when Pointer = mouse
  }
  has toggle: Toggle { expanded = menu }
}

type Toolbar {
  has menu: Menu
}

environment Device = Pointer
profile Phone: Device { Pointer = touch }
profile Laptop: Device { Pointer = mouse }

record Evidence {
  source: PenNode
}
actor EvidenceRecorder records Evidence
`);

// A stored Evidence of the toggle on a profile, with its menu and hover, of a
// node.
const toggle = (profile: string, menu: string, hover: string, node: string) => ({
  context: {
    path: "Toolbar.menu.toggle",
    profile,
    dimensions: {},
    parents: { "menu.menu": menu },
    states: { hover, expanded: menu },
  },
  actor: "EvidenceRecorder",
  source: { file: "design.pen", frame: "f", node, fingerprint: "a1" },
});
const stored = [
  {
    record: "Evidence",
    source: JSON.stringify([
      toggle("Phone", "closed", "rest", "fresh"),
      toggle("Laptop", "open", "hovered", "changed"),
    ]),
  },
];

describe("progress", () => {
  it("says, where each element of the trees is, how much of it each record covers", () => {
    const found = progress(file, stored, ({ node }) => (node === "changed" ? "stale" : "present"));
    expect(
      found.map(({ line, column, records }) => [
        line,
        column,
        records.map(
          ({ record, combinations, present, stale, gone }) =>
            `${record} ${present} of ${combinations}, ${stale} stale, ${gone} gone`,
        ),
      ]),
    ).toEqual([
      // Menu, a component on its own, and its toggle, there and in Toolbar's
      // menu, which its records cover in both.
      [4, 6, ["Evidence 0 of 2, 0 stale, 0 gone"]],
      [12, 7, ["Evidence 2 of 12, 2 stale, 0 gone"]],
      [15, 6, ["Evidence 0 of 1, 0 stale, 0 gone"]],
      [16, 7, ["Evidence 0 of 2, 0 stale, 0 gone"]],
    ]);
  });

  it("lists, for each, the combinations not present, as dxn status --missing words them", () => {
    const toggles = progress(file, stored, ({ node }) =>
      node === "changed" ? "stale" : "present",
    ).find(({ line }) => line === 12);
    expect(toggles?.records[0]?.listed).toMatchInlineSnapshot(`
      {
        "gone": [],
        "missing": [
          "Menu.toggle on Phone with menu = open: hover = rest, expanded = open",
          "Menu.toggle on Laptop with menu = closed: hover = rest, expanded = closed",
          "Menu.toggle on Laptop with menu = closed: hover = hovered, expanded = closed",
          "Menu.toggle on Laptop with menu = open: hover = rest, expanded = open",
          "Toolbar.menu.toggle on Phone with menu.menu = open: hover = rest, expanded = open",
          "Toolbar.menu.toggle on Laptop with menu.menu = closed: hover = rest, expanded = closed",
          "Toolbar.menu.toggle on Laptop with menu.menu = closed: hover = hovered, expanded = closed",
          "Toolbar.menu.toggle on Laptop with menu.menu = open: hover = rest, expanded = open",
        ],
        "stale": [
          "Menu.toggle on Laptop with menu = open: hover = hovered, expanded = open",
          "Toolbar.menu.toggle on Laptop with menu.menu = open: hover = hovered, expanded = open",
        ],
      }
    `);
  });

  it("counts every entry as present without a check", () => {
    // Each, in Menu on its own and in Toolbar's menu.
    expect(progress(file, stored).find(({ line }) => line === 12)?.records[0]?.present).toBe(4);
  });
});

describe("an outdated stored record", () => {
  // A button that gained hover since one of its records was made.
  const button = parse(`enum Style = filled | plain
enum Hover = rest | hovered
type Button {
  state style: Style, hover: Hover
}
record Evidence {
  source: PenNode
}
actor DesignAgent records Evidence
`);
  const entry = (states: Record<string, string>) => ({
    context: { type: "Button", dimensions: {}, states },
    actor: "DesignAgent",
    source: { file: "design.pen", frame: "f", fingerprint: "a1" },
  });
  const stored = JSON.stringify([
    entry({ style: "filled" }),
    entry({ style: "plain", hover: "rest" }),
  ]);

  it("is counted apart, by what it says and what its element gained since", () => {
    const covered = coverage(button, "Evidence", [stored]);
    const [place] = progress(button, [{ record: "Evidence", source: stored }]);
    expect([
      [covered.present, covered.combinations, covered.outdated],
      covered.paths.map(({ outdated }) => outdated.map(({ says, added }) => [says, added])),
      place?.records.map(({ present, outdated }) => [
        present,
        outdated.map(({ says, added }) => [says, added]),
      ]),
    ]).toEqual([
      [1, 4, 1],
      [[["style = filled", ["hover"]]]],
      [[1, [["style = filled", ["hover"]]]]],
    ]);
  });
});

describe("a component", () => {
  // A tab, drawn on its own, and placed in a bar.
  const bar = parse(`enum Selection = unselected | selected
type Tab {
  state selection: Selection
}
type Bar {
  enum Section = first | second
  state section: Section
  has first: Tab {
    selection = when section {
      first -> selected
      second -> unselected
    }
  }
}
record Evidence {
  source: PenNode
}
actor DesignAgent records Evidence
`);
  const tab = (selection: string) => ({
    context: { path: "Tab", dimensions: {}, parents: {}, states: { selection } },
    actor: "DesignAgent",
    source: { file: "design.pen", frame: "f", fingerprint: "a1" },
  });
  const stored = JSON.stringify([tab("unselected"), tab("selected")]);

  it("is valid evidence of the type on its own, though another type contains it", () => {
    expect(validate(bar, "Evidence", stored)).toEqual([]);
  });

  it("counts on its own, and covers itself where it is placed, in the same look", () => {
    const covered = coverage(bar, "Evidence", [stored]);
    expect(
      covered.paths.map(({ path, combinations, present }) => [path, combinations, present]),
    ).toEqual([
      ["Tab", 2, 2],
      ["Bar", 2, 0],
      ["Bar.first", 2, 2],
    ]);
  });
});
