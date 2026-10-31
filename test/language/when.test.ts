import { describe, expect, it } from "vitest";
import { states } from "../../src/language/evaluate.js";
import { parse } from "../../src/language/parse.js";
import { renameInSource } from "../../src/language/rename.js";
import { validate } from "../../src/language/validate.js";
import { errors, problems } from "../support/language.js";

const base = `dimension Breakpoint = base | sm | lg | xl
enum Layout = compact | inline
`;
// The toolbar, with this when for its layout: the when on line 4, its branches from line 5.
const toolbar = (...branches: string[]) =>
  `${base}type Toolbar needs Breakpoint {
  state layout: Layout = when Breakpoint {
${branches.map((branch) => `    ${branch}\n`).join("")}  }
}
`;
const layout = toolbar("base, sm -> compact", "lg, xl -> inline");

describe("a state with when", () => {
  it("is derived from a dimension: one value for each of the dimension's values", () => {
    const state = parse(layout).types[0]?.states[0];
    expect([
      problems(layout),
      state?.derived?.dimension.name,
      state?.derived?.branches.map(({ values, result }) => [
        values.map(({ name }) => name),
        result.name,
      ]),
    ]).toEqual([
      [],
      "Breakpoint",
      [
        [["base", "sm"], "compact"],
        [["lg", "xl"], "inline"],
      ],
    ]);
  });

  it("has exactly one value in each row of the matrix", () => {
    expect(
      states(parse(layout), "Toolbar").rows.map(({ when, states }) => [
        when.Breakpoint,
        states.layout,
      ]),
    ).toEqual([
      ["base", ["compact"]],
      ["sm", ["compact"]],
      ["lg", ["inline"]],
      ["xl", ["inline"]],
    ]);
  });

  it("covers every value of the dimension, once, each with a value of the state's enum", () => {
    expect([
      problems(toolbar("base, sm -> compact", "lg -> inline")),
      problems(toolbar("base, sm -> compact", "sm, lg, xl -> inline")),
      problems(toolbar("base, sm -> compact", "lg, xxl -> inline", "xl -> inline")),
      problems(toolbar("base, sm -> compact", "lg, xl -> wide")),
    ]).toEqual([
      ["4:31: incomplete-when: when Breakpoint does not cover xl"],
      ['6:5: duplicate-value: "sm" is already covered by the when'],
      ['6:9: unknown-value: "xxl" is not a value of Breakpoint (base, sm, lg, xl)'],
      ['6:15: unknown-value: "wide" is not a value of layout (compact, inline)'],
    ]);
  });

  it("is on a dimension the type needs, and counts as using it", () => {
    const unneeded = `${base}type Toolbar {
  state layout: Layout = when Breakpoint {
    base, sm -> compact
    lg, xl -> inline
  }
}
`;
    expect([problems(unneeded), problems(layout)]).toEqual([
      [
        '4:31: unneeded-dimension: Toolbar does not need Breakpoint; declare "type Toolbar needs Breakpoint"',
      ],
      [],
    ]);
  });

  it("is decided by its when, so it has no rules of its own", () => {
    const source = layout.replace(
      "  }\n}\n",
      "  }\n  layout = compact only when Breakpoint in (base, sm)\n}\n",
    );
    expect(errors(source)).toEqual([
      "8:3: rule-on-derived: layout is decided by its when; it cannot also have a rule",
    ]);
  });

  it("is on a line of its own", () => {
    expect(
      problems(`${base}enum Hover = rest | hovered
type Toolbar needs Breakpoint {
  state hover: Hover, layout: Layout = when Breakpoint {
  }
}
`),
    ).toEqual([
      '5:38: syntax-error: expected "," or the end of the line after "Layout" (a state with when has a line of its own), found "="',
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems(
        `${base}type Toolbar needs Breakpoint {\n  state layout: Layout = Breakpoint {\n  }\n}\n`,
      ),
      problems(toolbar("base, sm compact", "lg, xl -> inline")),
      problems(toolbar("base, sm -> compact inline", "lg, xl -> inline")),
    ]).toEqual([
      ['4:26: syntax-error: expected "when" after "=", found "Breakpoint"'],
      ['5:14: syntax-error: expected "," or "->" after "sm", found "compact"'],
      ['5:25: syntax-error: expected the end of the line after "compact", found "inline"'],
    ]);
  });

  it("is checked in a stored context: the value must be the one the when gives", () => {
    const schema = parse(`${layout}record Evidence with context {}\n`);
    const context = (Breakpoint: string, value: string) =>
      JSON.stringify([
        { context: { type: "Toolbar", dimensions: { Breakpoint }, states: { layout: value } } },
      ]);
    expect([
      validate(schema, "Evidence", context("base", "compact")),
      validate(schema, "Evidence", context("base", "inline")).map(({ message }) => message),
    ]).toEqual([[], ['"inline" is not a value of layout on Breakpoint base (compact)']]);
  });

  it("is renamed with its enum's value", () => {
    expect(renameInSource(parse(layout), layout, "Layout", "inline", "wide")).toBe(
      layout
        .replace("enum Layout = compact | inline", "enum Layout = compact | wide")
        .replace("lg, xl -> inline", "lg, xl -> wide"),
    );
  });
});
