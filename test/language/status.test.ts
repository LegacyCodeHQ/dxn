import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";
import { coverage } from "../../src/language/status.js";

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
profile phone: Device { Pointer = touch }
profile laptop: Device { Pointer = mouse }
profile studio: Device { Pointer = mouse }

record Evidence with context {}
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
      JSON.stringify([toggle("phone", "closed", "rest"), toggle("studio", "open", "hovered")]),
    ]);
    expect(
      report.paths.map(({ path, combinations, present }) => [path, combinations, present]),
    ).toEqual([
      ["Toolbar", 2, 0],
      ["Toolbar.menu", 4, 0],
      ["Toolbar.menu.toggle", 6, 2],
    ]);
    expect([report.combinations, report.present]).toEqual([12, 2]);
  });

  it("lists each combination without evidence, as the context that would cover it", () => {
    const report = coverage(file, "Evidence", [
      JSON.stringify([toggle("phone", "closed", "rest"), toggle("studio", "open", "hovered")]),
    ]);
    expect(report.paths[2]?.missing).toEqual([
      {
        profiles: ["phone"],
        dimensions: {},
        parents: { "menu.menu": "open" },
        states: { hover: "rest", expanded: "open" },
      },
      {
        profiles: ["laptop", "studio"],
        dimensions: {},
        parents: { "menu.menu": "closed" },
        states: { hover: "rest", expanded: "closed" },
      },
      {
        profiles: ["laptop", "studio"],
        dimensions: {},
        parents: { "menu.menu": "closed" },
        states: { hover: "hovered", expanded: "closed" },
      },
      {
        profiles: ["laptop", "studio"],
        dimensions: {},
        parents: { "menu.menu": "open" },
        states: { hover: "rest", expanded: "open" },
      },
    ]);
  });
});
