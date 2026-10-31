import { describe, expect, it } from "vitest";
import { states } from "../../src/language/evaluate.js";
import { parse } from "../../src/language/parse.js";
import { problems } from "../support/language.js";

const declarations = `dimension Breakpoint = base | lg
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
enum Hover = rest | hovered
`;

// The wordmark with these needs and rules, from line 7 on.
const wordmark = (needs: string, ...rules: string[]) =>
  `${declarations}type Wordmark${needs} {
  state hover: Hover
${rules.map((rule) => `  ${rule}\n`).join("")}}
`;

describe("needs", () => {
  it("lists the dimensions a type depends on, with where each is", () => {
    const source = `${declarations}type Wordmark needs Pointer,\n    Keyboard {\n  state hover: Hover\n  hover = hovered only when Pointer = mouse\n}\n`;
    const { types } = parse(source);
    expect([problems(source), types[0]?.needs]).toEqual([
      ["6:5: warning: unused-need: Wordmark needs Keyboard, but no rule uses it"],
      [
        { name: "Pointer", line: 5, column: 21 },
        { name: "Keyboard", line: 6, column: 5 },
      ],
    ]);
    expect(parse("type Toolbar {}\n").types[0]?.needs).toEqual([]);
  });

  it("names declared dimensions, each once", () => {
    expect([
      problems(wordmark(" needs Hover")),
      problems(wordmark(" needs Theme")),
      problems(wordmark(" needs Pointer, Pointer", "hover = hovered only when Pointer = mouse")),
      problems(wordmark(" needs Pointer Keyboard")),
    ]).toEqual([
      ["5:21: unknown-dimension: Hover is an enum, not a dimension"],
      ["5:21: unknown-dimension: Theme is not a dimension (Breakpoint, Pointer, Keyboard)"],
      ["5:30: duplicate-dimension: Pointer is already a need of Wordmark"],
      ['5:29: syntax-error: expected "," or "{" after "Pointer", found "Keyboard"'],
    ]);
  });

  it("must include every dimension a rule uses, and says how to declare them", () => {
    expect([
      problems(wordmark("", "hover = hovered only when Pointer = mouse")),
      problems(
        wordmark(
          " needs Breakpoint",
          "hover = hovered only when Pointer = mouse",
          "hover = rest only when Keyboard = keyboard",
        ),
      ),
    ]).toEqual([
      [
        '7:29: unneeded-dimension: Wordmark does not need Pointer; declare "type Wordmark needs Pointer"',
      ],
      [
        "5:21: warning: unused-need: Wordmark needs Breakpoint, but no rule uses it",
        '7:29: unneeded-dimension: Wordmark does not need Pointer; declare "type Wordmark needs Breakpoint, Pointer, Keyboard"',
        '8:26: unneeded-dimension: Wordmark does not need Keyboard; declare "type Wordmark needs Breakpoint, Pointer, Keyboard"',
      ],
    ]);
  });

  it("warns about a need no rule uses, and only warns", () => {
    const { diagnostics } = parse(
      wordmark(" needs Breakpoint, Pointer", "hover = hovered only when Pointer = mouse"),
    );
    expect(diagnostics.map(({ severity, code }) => [severity, code])).toEqual([
      ["warning", "unused-need"],
    ]);
  });

  it("gives the dimensions a type's states are evaluated under, in the order needed", () => {
    const source = wordmark(
      " needs Pointer, Breakpoint",
      "hover = hovered only when Pointer = mouse",
    );
    const evaluated = states(parse(source), "Wordmark");
    expect([
      evaluated.dimensions,
      evaluated.rows.map(({ when, states }) => [when.Pointer, when.Breakpoint, states.hover]),
    ]).toEqual([
      ["Pointer", "Breakpoint"],
      [
        ["mouse", "base", ["rest", "hovered"]],
        ["mouse", "lg", ["rest", "hovered"]],
        ["touch", "base", ["rest"]],
        ["touch", "lg", ["rest"]],
      ],
    ]);
  });
});
