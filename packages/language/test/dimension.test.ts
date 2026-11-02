import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { problems } from "./support/language.js";

describe("dimension", () => {
  it("declares a name and its values, in one place", () => {
    const { dimensions, diagnostics } = parse(
      "dimension Breakpoint = base | sm | lg | xl\ndimension Pointer = mouse | touch\n",
    );
    expect(diagnostics).toEqual([]);
    expect(dimensions.map(({ name, values }) => [name, values.map(({ name }) => name)])).toEqual([
      ["Breakpoint", ["base", "sm", "lg", "xl"]],
      ["Pointer", ["mouse", "touch"]],
    ]);
    expect([dimensions[0]?.line, dimensions[0]?.column, dimensions[0]?.values[1]]).toEqual([
      1,
      11,
      { name: "sm", line: 1, column: 31 },
    ]);
  });

  it("continues onto the next line after a |", () => {
    const { dimensions, diagnostics } = parse("dimension Breakpoint = base | sm |\n  lg | xl\n");
    expect([diagnostics, dimensions[0]?.values.map(({ name }) => name)]).toEqual([
      [],
      ["base", "sm", "lg", "xl"],
    ]);
  });

  it("has a capitalized name, declared once in the file, and each value once", () => {
    expect([
      problems("dimension breakpoint = base | sm\n"),
      problems("enum Breakpoint = base | sm\ndimension Breakpoint = base | sm\n"),
      problems("dimension Pointer = mouse | touch | mouse\n"),
    ]).toEqual([
      ["1:11: dimension-name: dimension names start with a capital letter: `breakpoint`"],
      ["2:11: duplicate-name: `Breakpoint` is already declared at line 1"],
      ["1:37: duplicate-value: `mouse` appears twice in `Pointer`"],
    ]);
  });

  it("lists its own values: there is no form that names an enum", () => {
    expect(problems("enum Size = sm | lg\ndimension Breakpoint: Size\n")).toEqual([
      "2:21: syntax-error: expected `=` after the dimension name, found `:`",
    ]);
  });

  it("is not an enum: a state cannot take its values from a dimension", () => {
    expect(
      problems("dimension Hover = rest | hovered\ntype Wordmark {\n  state hover: Hover\n}\n"),
    ).toEqual(["3:16: unknown-enum: `Hover` is a dimension, not an enum"]);
  });

  it("says what it expected when a value is missing", () => {
    expect([problems("dimension Pointer =\n"), problems("dimension Pointer = mouse |\n")]).toEqual([
      ["1:20: syntax-error: expected a value after `=`, found the end of the line"],
      ["2:1: syntax-error: expected a value after `|`, found the end of the file"],
    ]);
  });
});
