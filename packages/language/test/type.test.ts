import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { problems } from "./support/language.js";

const enums = "enum Hover = rest | hovered\nenum Focus = blurred | focused\n";

const shape = (source: string) =>
  parse(source).types.map(({ name, states }) => ({
    name,
    states: states.map((state) => [state.name, state.enum.name]),
  }));

describe("type", () => {
  it("declares a name and its states, each from an enum", () => {
    const source = `${enums}
type Wordmark {
  state hover: Hover, focus: Focus
}

type Toolbar {}
`;
    expect(parse(source).diagnostics).toEqual([]);
    expect(shape(source)).toEqual([
      {
        name: "Wordmark",
        states: [
          ["hover", "Hover"],
          ["focus", "Focus"],
        ],
      },
      { name: "Toolbar", states: [] },
    ]);
  });

  it("records where each state is, for diagnostics later", () => {
    const [wordmark] = parse(`${enums}type Wordmark {\n  state hover: Hover\n}\n`).types;
    expect([wordmark?.line, wordmark?.column, wordmark?.states[0]]).toEqual([
      3,
      6,
      { name: "hover", line: 4, column: 9, enum: { name: "Hover", line: 4, column: 16 } },
    ]);
  });

  it("continues the states onto the next line after a comma", () => {
    const source = `${enums}type MenuButton {\n  state hover: Hover,\n         focus: Focus\n}\n`;
    expect([problems(source), shape(source)[0]?.states]).toEqual([
      [],
      [
        ["hover", "Hover"],
        ["focus", "Focus"],
      ],
    ]);
  });

  it("keeps names unique in each scope, and names to their case", () => {
    expect(
      problems(`${enums}type Hover {}
type wordmark {
  state hover: Hovr, Focus: Focus, hover: Hover
}
`),
    ).toEqual([
      "3:6: duplicate-name: Hover is already declared at line 1",
      '4:6: type-name: type names start with a capital letter: "wordmark"',
      "5:16: unknown-enum: Hovr is not an enum; did you mean Hover?",
      '5:22: state-name: state names start with a lowercase letter: "Focus"',
      "5:36: duplicate-state: hover is already a state of wordmark",
    ]);
  });

  it("refuses a type where an enum belongs", () => {
    expect(
      problems(`${enums}type Toolbar {}\ntype Wordmark {\n  state hover: Toolbar\n}\n`),
    ).toEqual(["5:16: unknown-enum: Toolbar is a type, not an enum"]);
  });

  it("says what it expected when the syntax is wrong, and goes on after the type", () => {
    expect([
      problems("type Wordmark state hover: Hover }\nenum Ring = none\n"),
      problems(`${enums}type Wordmark {\n  state hover Hover\n}\nenum Ring = none | none\n`),
      problems(`${enums}type Wordmark {\n  state hover: Hover\n`),
    ]).toEqual([
      ['1:15: syntax-error: expected "{" after the type name, found "state"'],
      [
        '4:15: syntax-error: expected ":" after "hover", found "Hover"',
        '6:20: duplicate-value: "none" appears twice in Ring',
      ],
      ['5:1: syntax-error: expected "}" to close Wordmark, found the end of the file'],
    ]);
  });

  describe("state", () => {
    it("declares one or more states a line, on as many lines as the type needs", () => {
      const source = `${enums}enum Selection = unselected | selected
type Link {
  state hover: Hover, focus: Focus
  # the current page's link is selected
  state selection: Selection
}
`;
      expect([problems(source), shape(source)[0]?.states]).toEqual([
        [],
        [
          ["hover", "Hover"],
          ["focus", "Focus"],
          ["selection", "Selection"],
        ],
      ]);
    });

    it("declares each state once, whichever lines it is on", () => {
      expect(
        problems(`${enums}type Link {\n  state hover: Hover\n  state hover: Focus\n}\n`),
      ).toEqual(["5:9: duplicate-state: hover is already a state of Link"]);
    });

    it("is one keyword for one or more states: states is not", () => {
      expect(problems(`${enums}type Link {\n  states hover: Hover\n}\n`)).toEqual([
        '4:3: syntax-error: expected "state", found "states"',
      ]);
    });
  });
});
