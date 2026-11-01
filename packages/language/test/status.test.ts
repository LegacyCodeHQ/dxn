import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { coverage } from "../src/status.js";

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
profile Studio: Device { Pointer = mouse }

record Evidence {
  source: PenNode
}
actor EvidenceRecorder records Evidence
`);
const toggle = (profile: string, menu: string, hover: string) => ({
  context: {
    path: "Toolbar.menu.toggle",
    profile,
    dimensions: {},
    parents: { "menu.menu": menu },
    states: { hover, expanded: menu },
  },
});

describe("coverage", () => {
  it("counts every combination of every element in the tree, and those with evidence", () => {
    const report = coverage(file, "Evidence", [
      JSON.stringify([toggle("Phone", "closed", "rest"), toggle("Studio", "open", "hovered")]),
    ]);
    expect(
      report.paths.map(({ path, combinations, present }) => [path, combinations, present]),
    ).toEqual([
      ["Toolbar", 1, 0],
      ["Toolbar.menu", 2, 0],
      ["Toolbar.menu.toggle", 6, 2],
    ]);
    expect([report.combinations, report.present]).toEqual([9, 2]);
  });

  it("counts as one what differs only in profiles, with evidence on any of them", () => {
    const menu = (profile: string, state: string) => ({
      context: {
        path: "Toolbar.menu",
        profile,
        dimensions: {},
        parents: {},
        states: { menu: state },
      },
    });
    const report = coverage(file, "Evidence", [
      JSON.stringify([menu("Phone", "closed"), menu("Laptop", "open")]),
    ]);
    const path = report.paths.find(({ path: at }) => at === "Toolbar.menu");
    expect([
      path?.combinations,
      path?.present,
      path?.missing.map(({ profiles }) => profiles),
    ]).toEqual([2, 2, []]);
  });

  it("lists each combination without evidence, as the context that would cover it", () => {
    const report = coverage(file, "Evidence", [
      JSON.stringify([toggle("Phone", "closed", "rest"), toggle("Studio", "open", "hovered")]),
    ]);
    expect(report.paths[2]?.missing).toEqual([
      {
        profiles: ["Phone"],
        dimensions: {},
        parents: { "menu.menu": "open" },
        states: { hover: "rest", expanded: "open" },
      },
      {
        profiles: ["Laptop", "Studio"],
        dimensions: {},
        parents: { "menu.menu": "closed" },
        states: { hover: "rest", expanded: "closed" },
      },
      {
        profiles: ["Laptop", "Studio"],
        dimensions: {},
        parents: { "menu.menu": "closed" },
        states: { hover: "hovered", expanded: "closed" },
      },
      {
        profiles: ["Laptop", "Studio"],
        dimensions: {},
        parents: { "menu.menu": "open" },
        states: { hover: "rest", expanded: "open" },
      },
    ]);
  });

  it("counts a combination as stale or gone when its only entries are", () => {
    const entry = (profile: string, menu: string, hover: string, frame: string) => ({
      ...toggle(profile, menu, hover),
      source: { file: "design.pen", frame, fingerprint: "then" },
    });
    const report = coverage(
      file,
      "Evidence",
      [
        JSON.stringify([
          entry("Phone", "closed", "rest", "fresh"),
          entry("Phone", "open", "rest", "changed"),
          entry("Laptop", "open", "rest", "deleted"),
          entry("Laptop", "open", "rest", "changed"),
        ]),
      ],
      ({ frame }) => (frame === "fresh" ? "present" : frame === "changed" ? "stale" : "gone"),
    );
    const toggles = report.paths[2];
    expect([
      toggles?.present,
      toggles?.stale.length,
      toggles?.gone.length,
      toggles?.missing.length,
    ]).toEqual([1, 2, 0, 3]);
    expect([report.present, report.stale, report.gone]).toEqual([1, 2, 0]);
  });
});
