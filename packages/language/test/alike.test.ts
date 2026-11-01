import { describe, expect, it } from "vitest";
import { cases as casesOf } from "../src/cases.js";
import { parse } from "../src/parse.js";
import { renameInSource } from "../src/rename.js";
import { errors, problems } from "./support/language.js";

const button = (...lines: string[]) => `dimension Pointer = mouse | touch
enum Enabled = enabled | disabled
enum Hover = rest | hovered

type Button needs Pointer {
  state enabled: Enabled
  state hover: Hover
  hover = hovered only when Pointer = mouse and enabled = enabled
${lines.map((line) => `  ${line}\n`).join("")}}
`;

// Each distinct case, by the values that tell it apart, and how many
// combinations it covers.
const cases = (source: string, target: string) => {
  const { combinations, cases: found } = casesOf(parse(source), target);
  return [
    combinations,
    found.map(({ values, combinations: covered }) => [
      Object.entries(values)
        .map(([name, value]) => `${name} = ${value}`)
        .join(", "),
      covered.length,
    ]),
  ];
};

describe("alike", () => {
  it("makes combinations that differ only in a state or dimension one distinct case", () => {
    expect([problems(button("alike Pointer")), cases(button("alike Pointer"), "Button")]).toEqual([
      [],
      [
        5,
        [
          ["enabled = enabled, hover = rest", 2],
          ["enabled = enabled, hover = hovered", 1],
          ["enabled = disabled, hover = rest", 2],
        ],
      ],
    ]);
  });

  it("tells every combination apart by default, by the type's own states and needs", () => {
    expect(cases(button(), "Button")).toEqual([
      5,
      [
        ["Pointer = mouse, enabled = enabled, hover = rest", 1],
        ["Pointer = mouse, enabled = enabled, hover = hovered", 1],
        ["Pointer = mouse, enabled = disabled, hover = rest", 1],
        ["Pointer = touch, enabled = enabled, hover = rest", 1],
        ["Pointer = touch, enabled = disabled, hover = rest", 1],
      ],
    ]);
  });

  it("makes some values alike, and only where its condition holds", () => {
    const wordmark = `dimension Breakpoint = base | sm | lg | xl
type Wordmark needs Breakpoint {
  alike Breakpoint in (lg, xl)
}
`;
    const link = `enum Hover = rest | hovered
enum Selection = unselected | selected
type Link {
  state hover: Hover, selection: Selection
  alike hover in (rest, hovered) when selection = selected
}
`;
    expect([cases(wordmark, "Wordmark"), cases(link, "Link")]).toEqual([
      [
        4,
        [
          ["Breakpoint = base", 1],
          ["Breakpoint = sm", 1],
          ["Breakpoint = lg, xl", 2],
        ],
      ],
      [
        4,
        [
          ["hover = rest, selection = unselected", 1],
          ["hover = rest, hovered, selection = selected", 2],
          ["hover = hovered, selection = unselected", 1],
        ],
      ],
    ]);
  });

  it("leaves alike, in place, what only the types around it depend on", () => {
    const page = `dimension Screen = small | large
type Logo needs Screen {}
type Icon {}
type Page needs Screen {
  has logo: Logo
  has icon: Icon
}
`;
    expect([problems(page), cases(page, "Page.logo"), cases(page, "Page.icon")]).toEqual([
      [],
      [
        2,
        [
          ["Screen = small", 1],
          ["Screen = large", 1],
        ],
      ],
      [2, [["", 2]]],
    ]);
  });

  it("counts a need as used where it tells combinations apart, and warns where it is alike", () => {
    expect([
      problems("dimension Screen = small | large\ntype Logo needs Screen {}\n"),
      problems("dimension Screen = small | large\ntype Logo needs Screen {\n  alike Screen\n}\n"),
    ]).toEqual([
      [],
      [
        "2:17: warning: unused-need: Logo needs Screen, but nothing in it uses it, and it is alike throughout",
      ],
    ]);
  });

  it("is on one of the type's states or needs, with two or more of its values", () => {
    expect([
      errors(button("alike enabld")),
      errors(button("alike Theme")),
      errors(button("alike hover in (rest, hoverd)")),
      errors(button("alike hover in (rest)")),
      errors(button("alike hover when enabld = enabled")),
    ]).toEqual([
      ["9:9: unknown-state: enabld is not a state of Button (enabled, hover)"],
      ["9:9: unknown-dimension: Theme is not a dimension (Pointer)"],
      ['9:25: unknown-value: "hoverd" is not a value of hover (rest, hovered)'],
      [
        "9:9: alike-one-value: alike hover in (rest) names one value, which is alike only with itself",
      ],
      ["9:20: unknown-state: enabld is not a state of Button (enabled, hover)"],
    ]);
    expect(
      errors(
        "dimension Screen = small | large\ndimension Theme = light | dark\ntype Logo needs Screen {\n  alike Theme\n}\n",
      ),
    ).toEqual([
      '4:9: unneeded-dimension: Logo does not need Theme; declare "type Logo needs Screen, Theme"',
    ]);
  });

  it("is renamed with the values it names", () => {
    const source = button("alike hover in (rest, hovered) when enabled = enabled");
    expect(renameInSource(parse(source), source, "Hover", "rest", "idle")).toBe(
      source
        .replace("rest | hovered", "idle | hovered")
        .replace("in (rest, hovered)", "in (idle, hovered)"),
    );
  });
});
