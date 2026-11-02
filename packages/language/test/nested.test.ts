import { describe, expect, it } from "vitest";
import { states } from "../src/evaluate.js";
import { format } from "../src/format.js";
import { parse } from "../src/parse.js";
import { renameInSource } from "../src/rename.js";
import { errors, problems } from "./support/language.js";

const menu = `dimension Pointer = mouse | touch
enum Hover = rest | hovered

type Menu {
  enum State = closed | open
  state menu: State

  type Toggle needs Pointer {
    state hover: Hover
    state expanded: State
    hover = hovered only when Pointer = mouse
  }
}
`;

describe("nested declarations", () => {
  it("declare enums and types inside a type, named after it from outside", () => {
    const { types, enums } = parse(menu);
    expect([
      problems(menu),
      enums.map(({ name }) => name),
      types.map(({ name }) => name),
      types.find(({ name }) => name === "Menu.Toggle")?.states.map((state) => state.enum.name),
    ]).toEqual([[], ["Hover", "Menu.State"], ["Menu", "Menu.Toggle"], ["Hover", "Menu.State"]]);
  });

  it("see what is declared around them, by its bare name, but not inside a sibling", () => {
    const source = `${menu}type Toolbar {
  state menu: State
}
`;
    expect(problems(source)).toEqual([
      "15:15: unknown-enum: `State` is not an enum (`Hover`, `Menu.State`)",
    ]);
  });

  it("are named after their type outside it, in a type or a record", () => {
    const source = `${menu}type Toolbar {
  state menu: Menu.State
}
record Snapshot {
  menu: Menu.State
}
`;
    expect([
      problems(source),
      parse(source).types.find(({ name }) => name === "Toolbar")?.states[0]?.enum.name,
    ]).toEqual([[], "Menu.State"]);
  });

  it("cannot repeat a name from around them, so a bare name means one thing", () => {
    expect([
      errors("enum Hover = rest | hovered\ntype Menu {\n  enum Hover = closed | open\n}\n"),
      errors("type Menu {\n  enum State = closed | open\n  enum State = shut\n}\n"),
      errors("type Menu {\n  enum state = closed | open\n}\n"),
    ]).toEqual([
      ["3:8: duplicate-name: `Hover` is already declared at line 1"],
      ["3:8: duplicate-name: `State` is already declared at line 2"],
      ["2:8: enum-name: enum names start with a capital letter: `state`"],
    ]);
  });

  it("are evaluated by their full name", () => {
    expect(
      states(parse(menu), "Menu.Toggle").rows.map(({ when, states }) => [
        when.Pointer,
        states.hover,
        states.expanded,
      ]),
    ).toEqual([
      ["mouse", ["rest", "hovered"], ["closed", "open"]],
      ["touch", ["rest"], ["closed", "open"]],
    ]);
  });

  it("can nest further: a type in a type in a type", () => {
    const source = `type Toolbar {
  type Menu {
    enum State = closed | open
    type Toggle {
      state expanded: State
    }
  }
}
`;
    expect([problems(source), parse(source).types.map(({ name }) => name)]).toEqual([
      [],
      ["Toolbar", "Toolbar.Menu", "Toolbar.Menu.Toggle"],
    ]);
  });

  it("are renamed by their full name", () => {
    expect(renameInSource(parse(menu), menu, "Menu.State", "open", "shown")).toBe(
      menu.replace("closed | open", "closed | shown"),
    );
  });

  it("belong to the type whose braces hold them, even at the start of a line, and are indented when formatted", () => {
    // Moved inside Toggle, and not indented yet.
    const moved = `enum Interaction = idle | pressed

type Toggle {
enum Setting = off | on

state setting: Setting, interaction: Interaction
}

type Tab {
  state interaction: Interaction
}
`;
    const { enums, types } = parse(moved);
    expect([
      problems(moved),
      enums.map(({ name, scope }) => [name, scope]),
      types.map(({ name, states: declared }) => [name, declared.map(({ name: state }) => state)]),
      format(moved),
    ]).toEqual([
      [],
      [
        ["Interaction", undefined],
        ["Toggle.Setting", "Toggle"],
      ],
      [
        ["Toggle", ["setting", "interaction"]],
        ["Tab", ["interaction"]],
      ],
      `enum Interaction = idle | pressed

type Toggle {
  enum Setting = off | on

  state setting: Setting, interaction: Interaction
}

type Tab {
  state interaction: Interaction
}
`,
    ]);
  });

  it("say what they expected when the syntax is wrong", () => {
    expect([
      errors("type Menu {\n  state menu: Menu.\n}\n"),
      errors("type Menu {\n  record Note {}\n}\n"),
      errors("type Menu {\n  | open\n}\n"),
      errors("type Menu { enum State = closed | open }\n"),
      errors(
        "dimension D = x | y\nenum E = a | b\ntype Menu needs D {\n  state profile: E\n  profile = b only when D = x\n}\n",
      ),
    ]).toEqual([
      ["2:20: syntax-error: expected a name after `.`, found the end of the line"],
      [
        "2:3: syntax-error: expected `state`, `has`, `action`, `on`, `provides`, `enum`, `type`, a rule or `}`, found `record`",
      ],
      [
        "2:3: syntax-error: expected `state`, `has`, `action`, `on`, `provides`, `enum`, `type`, a rule or `}`, found `|`",
      ],
      [],
      [],
    ]);
  });
});
