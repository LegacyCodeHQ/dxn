import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { progress } from "../src/status.js";

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
      [12, 7, ["Evidence 1 of 6, 1 stale, 0 gone"]],
      [15, 6, ["Evidence 0 of 1, 0 stale, 0 gone"]],
      [16, 7, ["Evidence 0 of 2, 0 stale, 0 gone"]],
    ]);
  });

  it("lists, for each, the combinations not present, as dxn status --missing words them", () => {
    const toggles = progress(file, stored, ({ node }) =>
      node === "changed" ? "stale" : "present",
    )[0];
    expect(toggles?.records[0]?.listed).toMatchInlineSnapshot(`
      {
        "gone": [],
        "missing": [
          "Toolbar.menu.toggle on Phone with menu.menu = open: hover = rest, expanded = open",
          "Toolbar.menu.toggle on Laptop with menu.menu = closed: hover = rest, expanded = closed",
          "Toolbar.menu.toggle on Laptop with menu.menu = closed: hover = hovered, expanded = closed",
          "Toolbar.menu.toggle on Laptop with menu.menu = open: hover = rest, expanded = open",
        ],
        "stale": [
          "Toolbar.menu.toggle on Laptop with menu.menu = open: hover = hovered, expanded = open",
        ],
      }
    `);
  });

  it("counts every entry as present without a check", () => {
    expect(progress(file, stored)[0]?.records[0]?.present).toBe(2);
  });
});
