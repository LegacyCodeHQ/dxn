import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";
import { problems } from "../support/language.js";

const declarations = `dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
enum Hover = rest | hovered
enum Focus = blurred | focused
type Wordmark {
  states hover: Hover, focus: Focus
`;

// The wordmark with these rules, from line 7 on.
const wordmark = (...rules: string[]) =>
  `${declarations}${rules.map((rule) => `  ${rule}\n`).join("")}}\n`;

describe("only when", () => {
  it("says a state's value exists only where a dimension has a value", () => {
    const { types, diagnostics } = parse(
      wordmark(
        "hover = hovered only when Pointer = mouse",
        "focus = focused only when Keyboard = keyboard",
      ),
    );
    expect(diagnostics).toEqual([]);
    expect(
      types[0]?.rules.map(({ state, value, when }) => [
        state,
        value,
        when.dimension,
        when.values.map(({ name }) => name),
      ]),
    ).toEqual([
      ["hover", "hovered", "Pointer", ["mouse"]],
      ["focus", "focused", "Keyboard", ["keyboard"]],
    ]);
    expect(types[0]?.rules[0]).toMatchObject({
      line: 7,
      column: 3,
      valueLine: 7,
      valueColumn: 11,
      when: { line: 7, column: 29, values: [{ name: "mouse", line: 7, column: 39 }] },
    });
  });

  it("can name several values with in", () => {
    const source = `dimension Breakpoint = base | sm | lg | xl
enum Hover = rest | hovered
type BlogLink {
  states hover: Hover
  hover = hovered only when Breakpoint in (lg, xl)
}
`;
    expect([
      problems(source),
      parse(source).types[0]?.rules[0]?.when.values.map(({ name }) => name),
    ]).toEqual([[], ["lg", "xl"]]);
  });

  it("names a state of the type and one of its values", () => {
    expect([
      problems(wordmark("hovr = hovered only when Pointer = mouse")),
      problems(wordmark("hover = hovred only when Pointer = mouse")),
    ]).toEqual([
      ["7:3: unknown-state: hovr is not a state of Wordmark (hover, focus)"],
      ['7:11: unknown-value: "hovred" is not a value of hover (rest, hovered)'],
    ]);
  });

  it("names a dimension and its values", () => {
    expect([
      problems(wordmark("hover = hovered only when Pointr = mouse")),
      problems(wordmark("hover = hovered only when Hover = rest")),
      problems(wordmark("hover = hovered only when Pointer = mous")),
      problems(wordmark("hover = hovered only when Pointer in (mouse, mouse)")),
    ]).toEqual([
      ["7:29: unknown-dimension: Pointr is not a dimension (Pointer, Keyboard)"],
      ["7:29: unknown-dimension: Hover is an enum, not a dimension"],
      ['7:39: unknown-value: "mous" is not a value of Pointer (mouse, touch)'],
      ['7:48: duplicate-value: "mouse" appears twice in the condition'],
    ]);
  });

  it("gives each state value one condition", () => {
    expect(
      problems(
        wordmark(
          "hover = hovered only when Pointer = mouse",
          "hover = hovered only when Keyboard = keyboard",
        ),
      ),
    ).toEqual(["8:3: duplicate-rule: hover = hovered already has a condition at line 7"]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems(wordmark("hover hovered only when Pointer = mouse")),
      problems(wordmark("hover = hovered when Pointer = mouse")),
      problems(wordmark("hover = hovered only Pointer = mouse")),
      problems(wordmark("hover = hovered only when Pointer mouse")),
      problems(wordmark("hover = hovered only when Pointer in (mouse, touch")),
    ]).toEqual([
      ['7:9: syntax-error: expected "=" after "hover", found "hovered"'],
      ['7:19: syntax-error: expected "only" after "hovered", found "when"'],
      ['7:24: syntax-error: expected "when" after "only", found "Pointer"'],
      ['7:37: syntax-error: expected "=" or "in" after "Pointer", found "mouse"'],
      ['7:53: syntax-error: expected "," or ")" after "touch", found the end of the line'],
    ]);
  });
});
