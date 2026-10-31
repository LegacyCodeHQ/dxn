import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";

const enums = "enum Breakpoint = base | sm | lg | xl\nenum Pointer = mouse | touch\n";

// Each diagnostic as "line:column: code: message", in source order.
const problems = (source: string) =>
  parse(source)
    .diagnostics.sort((a, b) => a.line - b.line || a.column - b.column)
    .map(({ line, column, code, message }) => `${line}:${column}: ${code}: ${message}`);

describe("dimension", () => {
  it("declares a name and its type, an enum", () => {
    const source = `${enums}dimension breakpoint: Breakpoint\ndimension pointer: Pointer\n`;
    const { dimensions, diagnostics } = parse(source);
    expect(diagnostics).toEqual([]);
    expect(dimensions).toEqual([
      { name: "breakpoint", type: "Breakpoint", line: 3, column: 11, typeLine: 3, typeColumn: 23 },
      { name: "pointer", type: "Pointer", line: 4, column: 11, typeLine: 4, typeColumn: 20 },
    ]);
  });

  it("is declared once, with a lowercase name", () => {
    expect([
      problems(`${enums}dimension breakpoint: Breakpoint\ndimension breakpoint: Pointer\n`),
      problems(`${enums}dimension Width: Breakpoint\n`),
    ]).toEqual([
      ["4:11: duplicate-name: breakpoint is already declared at line 3"],
      ['3:11: dimension-name: dimension names start with a lowercase letter: "Width"'],
    ]);
  });

  it("takes its values from an enum, not a type with states", () => {
    expect([
      problems(`${enums}dimension breakpoint: Brekpoint\n`),
      problems(`${enums}type Toolbar {}\ndimension breakpoint: Toolbar\n`),
    ]).toEqual([
      ["3:23: unknown-enum: Brekpoint is not an enum (Breakpoint, Pointer)"],
      ["4:23: unknown-enum: Toolbar is a type, not an enum"],
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems(`${enums}dimension breakpoint Breakpoint\n`),
      problems(`${enums}dimension breakpoint:\n`),
      problems(`${enums}dimension breakpoint: Breakpoint Pointer\n`),
    ]).toEqual([
      ['3:22: syntax-error: expected ":" after "breakpoint", found "Breakpoint"'],
      ['3:22: syntax-error: expected an enum name after ":", found the end of the line'],
      ['3:34: syntax-error: expected the end of the line after "Breakpoint", found "Pointer"'],
    ]);
  });
});
