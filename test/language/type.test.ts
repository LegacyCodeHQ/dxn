import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";
import { problems } from "../support/language.js";

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
  states hover: Hover, focus: Focus
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
    const [wordmark] = parse(`${enums}type Wordmark {\n  states hover: Hover\n}\n`).types;
    expect([wordmark?.line, wordmark?.column, wordmark?.states[0]]).toEqual([
      3,
      6,
      { name: "hover", line: 4, column: 10, enum: { name: "Hover", line: 4, column: 17 } },
    ]);
  });

  it("continues the states onto the next line after a comma", () => {
    const source = `${enums}type MenuButton {\n  states hover: Hover,\n         focus: Focus\n}\n`;
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
  states hover: Hovr, Focus: Focus, hover: Hover
}
`),
    ).toEqual([
      "3:6: duplicate-name: Hover is already declared at line 1",
      '4:6: type-name: type names start with a capital letter: "wordmark"',
      "5:17: unknown-enum: Hovr is not an enum (Hover, Focus)",
      '5:23: state-name: state names start with a lowercase letter: "Focus"',
      "5:37: duplicate-state: hover is already a state of wordmark",
    ]);
  });

  it("refuses a type where an enum belongs, and states listed twice", () => {
    expect([
      problems(`${enums}type Toolbar {}\ntype Wordmark {\n  states hover: Toolbar\n}\n`),
      problems(`${enums}type Wordmark {\n  states hover: Hover\n  states focus: Focus\n}\n`),
    ]).toEqual([
      ["5:17: unknown-enum: Toolbar is a type, not an enum"],
      ["5:3: states-twice: Wordmark lists its states twice; put them on one states line"],
    ]);
  });

  it("says what it expected when the syntax is wrong, and goes on after the type", () => {
    expect([
      problems("type Wordmark states hover: Hover }\nenum Ring = none\n"),
      problems(`${enums}type Wordmark {\n  states hover Hover\n}\nenum Ring = none | none\n`),
      problems(`${enums}type Wordmark {\n  states hover: Hover\n`),
    ]).toEqual([
      ['1:15: syntax-error: expected "{" after the type name, found "states"'],
      [
        '4:16: syntax-error: expected ":" after "hover", found "Hover"',
        '6:20: duplicate-value: "none" appears twice in Ring',
      ],
      ['5:1: syntax-error: expected "}" to close Wordmark, found the end of the file'],
    ]);
  });
});
