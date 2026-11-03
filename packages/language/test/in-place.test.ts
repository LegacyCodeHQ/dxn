import { describe, expect, it } from "vitest";
import { inPlace } from "../src/evaluation/evaluate.js";
import { parse } from "../src/syntax/parse.js";

const toolbar = parse(`dimension Breakpoint = base | sm | lg | xl
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
enum Hover = rest | hovered
enum Focus = blurred | focused
enum Layout = compact | inline

type Menu {
  enum State = closed | open
  state menu: State

  type Toggle needs Pointer, Keyboard {
    state hover: Hover, focus: Focus
    state expanded: State
    hover = hovered only when Pointer = mouse
    focus = focused only when Keyboard = keyboard
  }
  type Panel {}

  has toggle: Toggle { expanded = menu }
  has panel: Panel only when menu = open
}

type Toolbar needs Breakpoint {
  state layout: Layout = when Breakpoint {
    base, sm -> compact
    lg, xl -> inline
  }
  has menu: Menu only when layout = compact
}

environment Device = Breakpoint x Pointer x Keyboard
profile Phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile TabletPortrait: Device { Breakpoint = sm, Pointer = touch, Keyboard = no-keyboard }
profile Laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
modifier MagicKeyboard on TabletPortrait { Pointer = mouse, Keyboard = keyboard }
`);

// Each row as [profiles, the parents' states, the child's states].
const rows = (path: string) =>
  inPlace(toolbar, path).rows.map(({ profiles, parents, states }) => [profiles, parents, states]);

describe("evaluating a child in place", () => {
  it("gives its combinations inside its parents: where each is there, with its bound states set", () => {
    expect(rows("Toolbar.menu.toggle")).toEqual([
      [
        ["Phone"],
        { layout: "compact", "menu.menu": "closed" },
        { hover: ["rest"], focus: ["blurred"], expanded: ["closed"] },
      ],
      [
        ["Phone"],
        { layout: "compact", "menu.menu": "open" },
        { hover: ["rest"], focus: ["blurred"], expanded: ["open"] },
      ],
      [
        ["TabletPortrait"],
        { layout: "compact", "menu.menu": "closed" },
        { hover: ["rest"], focus: ["blurred"], expanded: ["closed"] },
      ],
      [
        ["TabletPortrait"],
        { layout: "compact", "menu.menu": "open" },
        { hover: ["rest"], focus: ["blurred"], expanded: ["open"] },
      ],
      [
        ["TabletPortrait+MagicKeyboard"],
        { layout: "compact", "menu.menu": "closed" },
        { hover: ["rest", "hovered"], focus: ["blurred", "focused"], expanded: ["closed"] },
      ],
      [
        ["TabletPortrait+MagicKeyboard"],
        { layout: "compact", "menu.menu": "open" },
        { hover: ["rest", "hovered"], focus: ["blurred", "focused"], expanded: ["open"] },
      ],
    ]);
  });

  it("counts 12 combinations for the toggle, where its menu is", () => {
    const count = inPlace(toolbar, "Toolbar.menu.toggle").rows.reduce(
      (total, { states }) =>
        total + Object.values(states).reduce((product, values) => product * values.length, 1),
      0,
    );
    expect(count).toBe(12);
  });

  it("leaves out where a child is not there: the panel only while the menu is open", () => {
    expect(rows("Toolbar.menu.panel").map(([profiles, parents]) => [profiles, parents])).toEqual([
      [["Phone"], { layout: "compact", "menu.menu": "open" }],
      [["TabletPortrait"], { layout: "compact", "menu.menu": "open" }],
      [["TabletPortrait+MagicKeyboard"], { layout: "compact", "menu.menu": "open" }],
    ]);
  });

  it("names the dimensions of every type on the way, and refuses a path that is not one", () => {
    expect(inPlace(toolbar, "Toolbar.menu.toggle").dimensions).toEqual([
      "Breakpoint",
      "Pointer",
      "Keyboard",
    ]);
    expect(() => inPlace(toolbar, "Toolbar.menu.togle")).toThrow(
      "`togle` is not a child of `Menu`; did you mean `toggle`?",
    );
    expect(() => inPlace(toolbar, "Toolbr.menu")).toThrow("no type `Toolbr`");
  });

  it("has no rows below a child where the child cannot be, as it is bound", () => {
    const bound = parse(`dimension Pointer = mouse | touch
enum Hover = rest | hovered
type Leaf {}
type Mid needs Pointer {
  state hover: Hover
  hover = hovered only when Pointer = mouse
  has leaf: Leaf
}
type Root {
  state h: Hover
  has mid: Mid { hover = h }
}
`);
    const worlds = (path: string) =>
      inPlace(bound, path).rows.map(({ when, parents }) => [when.Pointer, parents.h]);
    expect([worlds("Root.mid"), worlds("Root.mid.leaf")]).toEqual([
      [
        ["mouse", "rest"],
        ["mouse", "hovered"],
        ["touch", "rest"],
      ],
      [
        ["mouse", "rest"],
        ["mouse", "hovered"],
        ["touch", "rest"],
      ],
    ]);
  });

  it("places a child bound to a root state of its own name: the two always agree", () => {
    const bound = parse(`enum Focus = blurred | focused
type Item {
  state focus: Focus
}
type Button {
  state focus: Focus
  has item: Item { focus = focus }
}
`);
    expect([
      bound.diagnostics,
      inPlace(bound, "Button.item").rows.map(({ parents, states: own }) => [
        parents.focus,
        own.focus,
      ]),
    ]).toEqual([
      [],
      [
        ["blurred", ["blurred"]],
        ["focused", ["focused"]],
      ],
    ]);
  });

  it("refuses a child whose own state has the name of a parent's state it is under", () => {
    const shadowed = parse(`enum Mode = a | b
type Inner {
  state mode: Mode
}
type Root {
  state mode: Mode
  has inner: Inner only when mode = a
}
`);
    expect(() => inPlace(shadowed, "Root.inner")).toThrow(
      "`Inner` has a state `mode`, and so does `Root` above it; rename one, so that each can be told apart",
    );
  });
});

describe("a child deep in a tree", () => {
  // Types nested so deep, each with a state another of its states depends on,
  // which gives each type a row for each of its values.
  const nested = (depth: number) => {
    let text = "enum E = v1 | v2 | v3\n";
    for (let level = depth - 1; level >= 0; level--) {
      const child = level < depth - 1 ? `  has c: L${level + 1}\n` : "";
      text += `type L${level} {\n  state s0: E\n  state s1: E\n  s0 = v2 only when s1 = v1\n${child}}\n`;
    }
    return text;
  };

  it("has each of its rows once, whatever its parents' rows that do not decide it", () => {
    const result = inPlace(parse(nested(6)), `L0${".c".repeat(5)}`);
    const distinct = new Set(result.rows.map((row) => JSON.stringify(row)));
    expect([result.rows.length, distinct.size]).toEqual([3, 3]);
  });

  it("is evaluated, with an expectation on every element below, in time that grows with its depth", () => {
    const text = `${nested(12)}expect "Each level can be v3" {\n  in L0 and below\n  some s1 = v3\n}\n`;
    const start = performance.now();
    const file = parse(text);
    expect([file.diagnostics, performance.now() - start < 100]).toEqual([[], true]);
  });
});
