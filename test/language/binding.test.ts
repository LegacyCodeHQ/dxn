import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";
import { problems } from "../support/language.js";

const menu = (binding: string, extra = "") => `enum Hover = rest | hovered
enum Layout = compact | inline

type Menu {
  enum State = closed | open
  state menu: State
  state layout: Layout${extra}

  type Toggle {
    state hover: Hover
    state expanded: State
  }

  has toggle: Toggle ${binding}
}
`;

describe("a binding", () => {
  it("sets a child's state from one of the type's own", () => {
    const toggle = parse(menu("{ expanded = menu }")).types.find(({ name }) => name === "Menu")
      ?.children[0];
    expect([
      problems(menu("{ expanded = menu }")),
      toggle?.bindings?.map(({ state, from }) => [state.name, from.name]),
    ]).toEqual([[], [["expanded", "menu"]]]);
  });

  it("can come before where the child is", () => {
    expect(problems(menu("{ expanded = menu } only when layout = compact"))).toEqual([]);
  });

  it("names a state of the child, and a state of the type, whose values come from one enum", () => {
    expect([
      problems(menu("{ expnded = menu }")),
      problems(menu("{ expanded = men }")),
      problems(menu("{ expanded = layout }")),
    ]).toEqual([
      ["14:24: unknown-state: expnded is not a state of Menu.Toggle (hover, expanded)"],
      ["14:35: unknown-state: men is not a state of Menu (menu, layout)"],
      [
        "14:24: binding-mismatch: expanded's values come from Menu.State, but layout's from Layout; a binding needs one enum",
      ],
    ]);
  });

  it("sets each of the child's states once", () => {
    expect(problems(menu("{ expanded = menu, expanded = menu }"))).toEqual([
      "14:41: duplicate-binding: expanded is already bound",
    ]);
  });

  it("cannot set a state its child's when decides", () => {
    const source = `dimension Breakpoint = base | lg
enum Layout = compact | inline
type Panel needs Breakpoint {
  state layout: Layout = when Breakpoint {
    base -> compact
    lg -> inline
  }
}
type Menu {
  state layout: Layout
  has panel: Panel { layout = layout }
}
`;
    expect(problems(source)).toEqual([
      "11:22: bound-derived: layout is decided by its when; it cannot also be bound",
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([problems(menu("{ expanded menu }")), problems(menu("{ expanded = }"))]).toEqual([
      ['14:33: syntax-error: expected "=" after "expanded", found "menu"'],
      ['14:35: syntax-error: expected a state after "=", found "}"'],
    ]);
  });
});
