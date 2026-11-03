import { describe, expect, it } from "vitest";
import { coverage } from "../src/evaluation/status.js";
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
      report.paths.map(({ path, combinations, recorded }) => [path, combinations, recorded]),
    ).toEqual([
      // Menu, a component on its own, its toggle covered by the same entries.
      ["Menu", 2, 0],
      ["Menu.toggle", 6, 2],
      ["Toolbar", 1, 0],
      ["Toolbar.menu", 2, 0],
      ["Toolbar.menu.toggle", 6, 2],
    ]);
    expect([report.combinations, report.recorded]).toEqual([17, 4]);
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
      path?.recorded,
      path?.missing.map(({ profiles }) => profiles),
    ]).toEqual([2, 2, []]);
  });

  it("lists each look without evidence, by its own states, whatever placed it", () => {
    const report = coverage(file, "Evidence", [
      JSON.stringify([toggle("Phone", "closed", "rest"), toggle("Studio", "open", "hovered")]),
    ]);
    expect(report.paths.find(({ path }) => path === "Toolbar.menu.toggle")?.missing).toEqual([
      {
        profiles: ["Phone"],
        dimensions: {},
        parents: {},
        states: { hover: "rest", expanded: "open" },
      },
      {
        profiles: ["Laptop", "Studio"],
        dimensions: {},
        parents: {},
        states: { hover: "rest", expanded: "closed" },
      },
      {
        profiles: ["Laptop", "Studio"],
        dimensions: {},
        parents: {},
        states: { hover: "hovered", expanded: "closed" },
      },
      {
        profiles: ["Laptop", "Studio"],
        dimensions: {},
        parents: {},
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
      ({ frame }) => (frame === "fresh" ? "recorded" : frame === "changed" ? "stale" : "gone"),
    );
    const toggles = report.paths.find(({ path }) => path === "Toolbar.menu.toggle");
    expect([
      toggles?.recorded,
      toggles?.stale.length,
      toggles?.gone.length,
      toggles?.missing.length,
    ]).toEqual([1, 2, 0, 3]);
    // There, and in Menu on its own.
    expect([report.recorded, report.stale, report.gone]).toEqual([2, 4, 0]);
  });
});
