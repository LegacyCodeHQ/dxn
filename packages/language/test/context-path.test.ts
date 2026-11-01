import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { renameInData } from "../src/rename.js";
import { validate } from "../src/validate.js";

const source = `dimension Breakpoint = base | sm | lg | xl
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
profile Laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }

record Evidence {}
actor EvidenceRecorder records Evidence
`;
const schema = parse(source);
const toggle = (overrides: Record<string, unknown> = {}) => ({
  path: "Toolbar.menu.toggle",
  profile: "Phone",
  dimensions: {},
  parents: { layout: "compact", "menu.menu": "closed" },
  states: { hover: "rest", focus: "blurred", expanded: "closed" },
  ...overrides,
});
// The problems in one stored Evidence record with this context, as
// "code: path: message".
const check = (context: unknown) =>
  validate(schema, "Evidence", JSON.stringify([{ context, actor: "EvidenceRecorder" }])).map(
    ({ code, path, message }) => `${code}: ${path}: ${message}`,
  );

describe("a context for a child", () => {
  it("names its path, and is one row of its matrix in place", () => {
    expect([
      check(toggle()),
      check(
        toggle({
          parents: { layout: "compact", "menu.menu": "open" },
          states: { hover: "rest", focus: "blurred", expanded: "open" },
        }),
      ),
    ]).toEqual([[], []]);
  });

  it("names a child that is one, on the way from a type", () => {
    expect(check(toggle({ path: "Toolbar.menu.togle" }))).toEqual([
      'unknown-value: $[0].context.path: "Toolbar.menu.togle" is not a path: togle is not a child of Menu; did you mean toggle?',
    ]);
  });

  it("starts at a type nothing contains, or at a component, a type declared at the top, on its own", () => {
    expect([
      check(toggle()),
      // Menu, inside Toolbar, is a component: its toggle on its own.
      check(toggle({ path: "Menu.toggle", parents: { menu: "closed" } })),
      check(toggle({ path: "Menu.toggle", parents: { layout: "compact", "menu.menu": "closed" } })),
    ]).toEqual([
      [],
      [],
      [
        "missing-field: $[0].context.parents: context.parents is missing menu",
        "unknown-field: $[0].context.parents.layout: layout does not decide where Menu.toggle is (menu)",
        'unknown-field: $[0].context.parents["menu.menu"]: menu.menu does not decide where Menu.toggle is (menu)',
      ],
    ]);
  });

  it("gives the states of the parents that decide where it is, or that it is given", () => {
    expect([
      check(toggle({ parents: { layout: "compact" } })),
      check(toggle({ parents: { layout: "compact", "menu.menu": "closed", "menu.size": "big" } })),
      check(toggle({ parents: { layout: "compact", "menu.menu": "shut" } })),
    ]).toEqual([
      ["missing-field: $[0].context.parents: context.parents is missing menu.menu"],
      [
        'unknown-field: $[0].context.parents["menu.size"]: menu.size does not decide where Toolbar.menu.toggle is (layout, menu.menu)',
      ],
      [
        'unknown-value: $[0].context.parents["menu.menu"]: "shut" is not a value of menu.menu (closed, open)',
      ],
    ]);
  });

  it("is where the child is: the parents' states and the world must place it", () => {
    expect([
      check(toggle({ parents: { layout: "inline", "menu.menu": "closed" } })),
      check(
        toggle({
          profile: "Laptop",
          states: { hover: "rest", focus: "blurred", expanded: "closed" },
        }),
      ),
    ]).toEqual([
      [
        "unknown-value: $[0].context.parents: Toolbar.menu.toggle is not there on Phone with layout = inline, menu.menu = closed",
      ],
      [
        "unknown-value: $[0].context.parents: Toolbar.menu.toggle is not there on Laptop with layout = compact, menu.menu = closed",
      ],
    ]);
  });

  it("has its bound states as its parents give them", () => {
    expect(
      check(toggle({ states: { hover: "rest", focus: "blurred", expanded: "open" } })),
    ).toEqual([
      'unknown-value: $[0].context.states.expanded: "open" is not a value of expanded on Phone with layout = compact, menu.menu = closed (closed)',
    ]);
  });

  it("names a type or a path, not both, and one of them", () => {
    expect([
      check({ ...toggle(), type: "Menu.Toggle" }),
      check({ profile: "Phone", dimensions: {}, states: {} }),
    ]).toEqual([
      ["unknown-field: $[0].context.type: context has both type and path; give one"],
      ["missing-field: $[0].context: context is missing type or path"],
    ]);
  });

  it("is renamed with its parents' and its own states", () => {
    const data = JSON.stringify([
      {
        actor: "EvidenceRecorder",
        context: toggle({
          parents: { layout: "compact", "menu.menu": "open" },
          states: { hover: "rest", focus: "blurred", expanded: "open" },
        }),
      },
    ]);
    const renamed = renameInData(schema, "Evidence", data, "Menu.State", "open", "shown");
    expect([
      renamed.changed,
      JSON.parse(renamed.source)[0].context.parents["menu.menu"],
      JSON.parse(renamed.source)[0].context.states.expanded,
    ]).toEqual([2, "shown", "shown"]);
  });
});
