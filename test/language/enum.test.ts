import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";

const wordmark = `enum Hover      = rest | hovered
enum Focus      = blurred | focused
enum Breakpoint = base | sm | lg | xl
enum Pointer    = mouse | touch
enum Keyboard   = keyboard | no-keyboard
enum Size       = 19px | 20px | 22px
enum Ring       = none | focus
enum Color      = primary | accent
`;

// Each diagnostic as "line:column: code: message".
const problems = (source: string) =>
  parse(source).diagnostics.map(
    ({ line, column, code, message }) => `${line}:${column}: ${code}: ${message}`,
  );

describe("enum", () => {
  it("declares a named, finite set of values", () => {
    const { enums, diagnostics } = parse(wordmark);
    expect(diagnostics).toEqual([]);
    expect(enums.map(({ name, values }) => [name, values.map(({ name }) => name)])).toEqual([
      ["Hover", ["rest", "hovered"]],
      ["Focus", ["blurred", "focused"]],
      ["Breakpoint", ["base", "sm", "lg", "xl"]],
      ["Pointer", ["mouse", "touch"]],
      ["Keyboard", ["keyboard", "no-keyboard"]],
      ["Size", ["19px", "20px", "22px"]],
      ["Ring", ["none", "focus"]],
      ["Color", ["primary", "accent"]],
    ]);
  });

  it("records where each name and value is, for diagnostics later", () => {
    const [hover] = parse(wordmark).enums;
    expect([hover?.line, hover?.column, hover?.values[1]]).toEqual([
      1,
      6,
      { name: "hovered", line: 1, column: 26 },
    ]);
  });

  it("continues onto the next line after a |, and allows blank lines", () => {
    const { enums, diagnostics } = parse("\nenum Breakpoint = base | sm |\n  lg | xl\n\n");
    expect([diagnostics, enums[0]?.values.map(({ name }) => name)]).toEqual([
      [],
      ["base", "sm", "lg", "xl"],
    ]);
  });

  it("refuses names and values that do not follow the naming rules", () => {
    expect([
      problems("enum hover = rest | hovered\n"),
      problems("enum Hover = rest | -hovered\n"),
      problems("enum Hover = rest | hover_ed\n"),
    ]).toEqual([
      ['1:6: enum-name: enum names start with a capital letter: "hover"'],
      ['1:21: syntax-error: expected a value after "|", found "-"'],
      ['1:26: syntax-error: expected "|" or the end of the line after "hover", found "_"'],
    ]);
  });

  it("refuses an enum or a value declared twice", () => {
    expect([
      problems("enum Breakpoint = base | sm | lg | lg\n"),
      problems("enum Ring = none | focus\nenum Ring = none\n"),
    ]).toEqual([
      ['1:36: duplicate-value: "lg" appears twice in Breakpoint'],
      ["2:6: duplicate-name: Ring is already declared at line 1"],
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems("enum Focus = blurred, focused\n"),
      problems("enum Focus blurred | focused\n"),
      problems("enum Focus =\n"),
      problems("enum Focus = blurred |\n"),
      problems("enumm Focus = blurred\n"),
    ]).toEqual([
      ['1:21: syntax-error: expected "|" or the end of the line after "blurred", found ","'],
      ['1:12: syntax-error: expected "=" after the enum name, found "blurred"'],
      ['1:13: syntax-error: expected a value after "=", found the end of the line'],
      ['2:1: syntax-error: expected a value after "|", found the end of the file'],
      ['1:1: syntax-error: expected "enum" or "type", found "enumm"'],
    ]);
  });
});
