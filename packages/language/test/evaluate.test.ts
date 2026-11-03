import { states } from "@language/evaluation/evaluate.js";
import { parse } from "@language/syntax/parse.js";
import { describe, expect, it } from "vitest";

const wordmark = `dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
enum Hover = rest | hovered
enum Focus = blurred | focused
type Wordmark needs Pointer, Keyboard {
  state hover: Hover, focus: Focus
  hover = hovered only when Pointer = mouse
  focus = focused only when Keyboard = keyboard
}
type Toolbar {}
`;

describe("evaluating a type's states", () => {
  it("lists the states available for each combination of the dimensions its rules use", () => {
    expect(states(parse(wordmark), "Wordmark")).toEqual({
      type: "Wordmark",
      dimensions: ["Pointer", "Keyboard"],
      rows: [
        {
          when: { Pointer: "mouse", Keyboard: "keyboard" },
          states: { hover: ["rest", "hovered"], focus: ["blurred", "focused"] },
        },
        {
          when: { Pointer: "mouse", Keyboard: "no-keyboard" },
          states: { hover: ["rest", "hovered"], focus: ["blurred"] },
        },
        {
          when: { Pointer: "touch", Keyboard: "keyboard" },
          states: { hover: ["rest"], focus: ["blurred", "focused"] },
        },
        {
          when: { Pointer: "touch", Keyboard: "no-keyboard" },
          states: { hover: ["rest"], focus: ["blurred"] },
        },
      ],
    });
  });

  it("keeps a value for every value in an in condition", () => {
    const source = `dimension Breakpoint = base | sm | lg | xl
enum Hover = rest | hovered
type BlogLink needs Breakpoint {
  state hover: Hover
  hover = hovered only when Breakpoint in (lg, xl)
}
`;
    expect(
      states(parse(source), "BlogLink").rows.map(({ when, states: available }) => [
        when.Breakpoint,
        available.hover,
      ]),
    ).toEqual([
      ["base", ["rest"]],
      ["sm", ["rest"]],
      ["lg", ["rest", "hovered"]],
      ["xl", ["rest", "hovered"]],
    ]);
  });

  it("gives a type without rules one row, whatever the dimensions", () => {
    expect(states(parse(wordmark), "Toolbar")).toEqual({
      type: "Toolbar",
      dimensions: [],
      rows: [{ when: {}, states: {} }],
    });
  });

  it("gives a row per profile when there are profiles, not every combination", () => {
    const source = `dimension Breakpoint = base | sm | lg | xl
${wordmark}environment Device = Breakpoint x Pointer x Keyboard
profile Phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile Laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
`;
    expect(states(parse(source), "Wordmark").rows).toEqual([
      {
        profiles: ["Phone"],
        when: { Pointer: "touch", Keyboard: "no-keyboard" },
        states: { hover: ["rest"], focus: ["blurred"] },
      },
      {
        profiles: ["Laptop"],
        when: { Pointer: "mouse", Keyboard: "keyboard" },
        states: { hover: ["rest", "hovered"], focus: ["blurred", "focused"] },
      },
    ]);
  });

  it("still goes through the values of a dimension no profile gives", () => {
    const source = `dimension Pointer = mouse | touch
dimension Theme = light | dark
enum Hover = rest | hovered
type Link needs Pointer, Theme {
  state hover: Hover
  hover = hovered only when Pointer = mouse
  hover = rest only when Theme = light
}
environment Device = Pointer
profile Laptop: Device { Pointer = mouse }
`;
    expect(
      states(parse(source), "Link").rows.map(({ profiles, when, states: available }) => [
        profiles,
        when.Theme,
        available.hover,
      ]),
    ).toEqual([
      [["Laptop"], "light", ["rest", "hovered"]],
      [["Laptop"], "dark", ["hovered"]],
    ]);
  });

  it("gives profiles with the same values one row, which names them all", () => {
    const source = `dimension Breakpoint = base | lg
${wordmark}environment Device = Breakpoint x Pointer x Keyboard
profile Laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
profile Tablet: Device { Breakpoint = lg, Pointer = touch, Keyboard = no-keyboard }
profile Studio: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
profile Phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
`;
    expect(states(parse(source), "Wordmark").rows.map(({ profiles }) => profiles)).toEqual([
      ["Laptop", "Studio"],
      ["Tablet"],
      ["Phone"],
    ]);
  });

  it("refuses a file with problems, which it cannot evaluate", () => {
    expect(() => states(parse(`${wordmark}enum Size =\n`), "Wordmark")).toThrow(
      "cannot evaluate a file with problems",
    );
  });
});
