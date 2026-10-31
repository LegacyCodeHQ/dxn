import { describe, expect, it } from "vitest";
import { problems } from "../support/language.js";

const model =
  "dimension D = x | y\nenum E = a | b\ntype T needs D {\n  state s: E = when D { x->a, y->b }\n}\n";

describe("the text of a file", () => {
  it("can write an arrow without spaces around it", () => {
    expect(problems(model)).toEqual([]);
  });

  it("can start with a byte order mark, and end lines with a carriage return alone", () => {
    expect([problems(`﻿${model}`), problems(model.replaceAll("\n", "\r"))]).toEqual([[], []]);
  });

  it("counts a character outside the basic plane as one column", () => {
    expect(problems("enum E = a | b\ntype T {\n  state s: E 😀\n}\n")).toEqual([
      '3:14: syntax-error: expected "," or the end of the line after "E", found "😀"',
    ]);
    expect(problems('expect "😀" { x\n')).toEqual([
      '1:14: syntax-error: expected "in", "when", "then", "some", "absent" or "}", found "x"',
    ]);
  });
});
