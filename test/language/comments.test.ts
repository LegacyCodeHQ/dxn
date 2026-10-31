import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";
import { problems } from "../support/language.js";

describe("comments", () => {
  it("run from # to the end of the line, on a line of their own or after code", () => {
    const source = `# The wordmark, and what it varies by.
dimension Pointer = mouse | touch # how the reader points
enum Hover = rest |   # a value may follow on the next line
  hovered
type Wordmark needs Pointer {
  # touch has no hover
  state hover: Hover
  hover = hovered only when Pointer = mouse # only with a mouse
}
`;
    const { dimensions, enums, types } = parse(source);
    expect([
      problems(source),
      dimensions[0]?.values.map(({ name }) => name),
      enums[0]?.values.map(({ name }) => name),
      types[0]?.rules.length,
    ]).toEqual([[], ["mouse", "touch"], ["rest", "hovered"], 1]);
  });

  it("leave the lines and columns of everything else as they are", () => {
    expect(problems("# a comment\nenum hover = rest # another\n")).toEqual([
      '2:6: enum-name: enum names start with a capital letter: "hover"',
    ]);
  });

  it("end a word, since no word holds a #", () => {
    const { enums, diagnostics } = parse("enum Hover = rest#hovered\n");
    expect([diagnostics, enums[0]?.values.map(({ name }) => name)]).toEqual([[], ["rest"]]);
  });

  it("can be all a file has", () => {
    expect(parse("# nothing yet\n#\n").diagnostics).toEqual([]);
  });
});
