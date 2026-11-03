import { describe, expect, it } from "vitest";
import { coverage, progress } from "../src/evaluation/status.js";
import { validate } from "../src/evidence/validate.js";
import { parse } from "../src/syntax/parse.js";

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
    const found = progress(file, stored, ({ node }) => (node === "changed" ? "stale" : "recorded"));
    expect(
      found.map(({ line, column, records }) => [
        line,
        column,
        records.map(
          ({ record, combinations, recorded, stale, gone }) =>
            `${record} ${recorded} of ${combinations}, ${stale} stale, ${gone} gone`,
        ),
      ]),
    ).toEqual([
      // Menu, a component on its own, and its toggle in Menu's own tree, not
      // again in Toolbar's menu.
      [4, 6, ["Evidence 0 of 2, 0 stale, 0 gone"]],
      [12, 7, ["Evidence 1 of 6, 1 stale, 0 gone"]],
      [15, 6, ["Evidence 0 of 1, 0 stale, 0 gone"]],
      [16, 7, ["Evidence 0 of 2, 0 stale, 0 gone"]],
    ]);
  });

  it("lists, for each, the combinations not recorded, as dxn status --missing words them", () => {
    const toggles = progress(file, stored, ({ node }) =>
      node === "changed" ? "stale" : "recorded",
    ).find(({ line }) => line === 12);
    expect(toggles?.records[0]?.listed).toMatchInlineSnapshot(`
      {
        "gone": [],
        "missing": [
          "Menu.toggle on Phone: hover = rest, expanded = open",
          "Menu.toggle on Laptop: hover = rest, expanded = closed",
          "Menu.toggle on Laptop: hover = hovered, expanded = closed",
          "Menu.toggle on Laptop: hover = rest, expanded = open",
        ],
        "stale": [
          "Menu.toggle on Laptop: hover = hovered, expanded = open",
        ],
      }
    `);
  });

  it("counts every entry as recorded without a check", () => {
    // In Menu's own tree.
    expect(progress(file, stored).find(({ line }) => line === 12)?.records[0]?.recorded).toBe(2);
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
      [covered.recorded, covered.combinations, covered.outdated],
      covered.paths.map(({ outdated }) => outdated.map(({ says, added }) => [says, added])),
      place?.records.map(({ recorded, outdated }) => [
        recorded,
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

  it("has no more looks where it is placed than on its own, only those its place allows", () => {
    // A tab the bar always selects, and one it selects in one section.
    const always = parse(`enum Selection = unselected | selected
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
  has pinned: Tab {
    selection = when section {
      first, second -> selected
    }
  }
}
record Evidence {
  source: PenNode
}
actor DesignAgent records Evidence
`);
    expect(
      coverage(always, "Evidence", ["[]"]).paths.map(({ path, combinations }) => [
        path,
        combinations,
      ]),
    ).toEqual([
      ["Tab", 2],
      ["Bar", 2],
      ["Bar.first", 2],
      ["Bar.pinned", 1],
    ]);
  });

  it("counts on its own, and covers itself where it is placed, in the same look", () => {
    const covered = coverage(bar, "Evidence", [stored]);
    expect(
      covered.paths.map(({ path, combinations, recorded }) => [path, combinations, recorded]),
    ).toEqual([
      ["Tab", 2, 2],
      ["Bar", 2, 0],
      ["Bar.first", 2, 2],
    ]);
  });
});

describe("a line placed in several trees", () => {
  // A bar with a tab, and a screen that pins the bar to one section.
  const screen = parse(`enum Selection = unselected | selected
type Tab {
  state selection: Selection
}
type Bar {
  enum Section = first | second
  state section: Section
  has first: Tab {
    selection = when section {
      first -> selected
      else -> unselected
    }
  }
}
type Screen {
  has bar: Bar { section = first }
}
record Evidence {
  source: PenNode
}
actor DesignAgent records Evidence
`);

  it("counts each look of its child once, wherever it appears", () => {
    const line = progress(screen, []).find(({ line: at }) => at === 8);
    expect([line?.records[0]?.combinations, line?.records[0]?.listed.missing]).toEqual([
      2,
      ["Bar.first: selection = selected", "Bar.first: selection = unselected"],
    ]);
  });
});
