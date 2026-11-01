import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { problems } from "./support/language.js";

describe("diagnostics", () => {
  it("say when nothing of a kind is declared, instead of an empty list", () => {
    expect([
      problems("type Wordmark {\n  state hover: Hover\n}\n"),
      problems(
        "enum Hover = rest | hovered\ntype Wordmark {\n  state hover: Hover\n  hover = hovered only when Pointer = mouse\n}\n",
      ),
      problems("environment Device = Pointer\n"),
      problems("profile laptop: Device { Pointer = mouse }\n"),
      problems(
        "enum Hover = rest | hovered\ndimension Pointer = mouse\ntype Wordmark needs Pointer {\n  hover = hovered only when Pointer = mouse\n}\n",
      ),
    ]).toEqual([
      ["2:16: unknown-enum: Hover is not an enum; the file declares none"],
      ["4:29: unknown-dimension: Pointer is not a dimension; the file declares none"],
      ["1:22: unknown-dimension: Pointer is not a dimension; the file declares none"],
      ["1:17: unknown-environment: Device is not an environment; the file declares none"],
      ["4:3: unknown-state: hover is not a state of Wordmark; it has none"],
    ]);
  });

  it("report a declaration that does not parse once, not again where it is used", () => {
    expect([
      problems(
        "enum Hover = rest hovered\ndimension Pointer = mouse | touch\ntype Wordmark needs Pointer {\n  state hover: Hover\n  hover = hovered only when Pointer = mouse\n}\n",
      ),
      problems(
        "enum Hover = rest | hovered\ndimension Pointer = mouse touch\ntype Wordmark needs Pointer {\n  state hover: Hover\n  hover = hovered only when Pointer = touch\n}\nenvironment Device = Pointer\n",
      ),
      problems(
        "dimension Pointer = mouse\ndimension Keyboard = none\nenvironment Device = Pointer Keyboard\nprofile laptop: Device { Pointer = mouse, Keyboard = none }\n",
      ),
      problems(
        "enum Hover = rest | hovered\ndimension Pointer = mouse\ntype Wordmark {\n  hover = hovered only when Pointer = mouse\n  state hover Hover\n}\n",
      ),
      problems(
        "dimension Pointer = mouse\nenvironment Device = Pointer\nprofile laptop: Device { Pointer = }\nprofile laptop: Device { Pointer = mouse }\n",
      ),
    ]).toEqual([
      ['1:19: syntax-error: expected "|" or the end of the line after "rest", found "hovered"'],
      ['2:27: syntax-error: expected "|" or the end of the line after "mouse", found "touch"'],
      ['3:30: syntax-error: expected "x" or the end of the line after "Pointer", found "Keyboard"'],
      ['5:15: syntax-error: expected ":" after "hover", found "Hover"'],
      [
        '3:36: syntax-error: expected a value after "=", found "}"',
        "4:9: duplicate-name: laptop is already declared at line 3",
      ],
    ]);
  });

  it("skip to the next declaration after a mistake, wherever it is", () => {
    expect([
      problems("type {\n  state hover: Hover\n}\nenum Hover = rest\n"),
      problems(
        "dimension Pointer = mouse\nenvironment Device = Pointer\nprofile laptop Device {\n  Pointer = mouse\n}\n",
      ),
      problems("enum Hover = rest\ntype Wordmark\n  state hover: Hover\n}\n"),
    ]).toEqual([
      [
        '1:6: syntax-error: expected a type name after "type", found "{"',
        // Hover is still declared, after the skipped type.
      ],
      ['3:16: syntax-error: expected ":" after "laptop", found "Device"'],
      ['2:14: syntax-error: expected "{" after the type name, found the end of the line'],
    ]);
    expect(parse("type {\n}\nenum Hover = rest\n").enums.map(({ name }) => name)).toEqual([
      "Hover",
    ]);
  });

  it("end a declaration left open at the next one, and report nothing that follows from it", () => {
    expect([
      problems(
        "enum E = a | b\ntype A {\n  state a: E\n\ntype B {\n  state b: E\n}\nenum F = x | y\ntype C {\n  state c: Nope\n}\n",
      ),
      problems(
        "type Menu {\n  enum State = closed open\n  state menu: State\n}\ntype Bar {\n  state m: Menu.State = open\n}\n",
      ),
      problems(
        "enum E = a | b\ntype Toggle {\n  state t: E\n  bogus line\n  state u: E\n}\ntype Bar {\n  state x: E\n  has m: Toggle { u = x }\n}\n",
      ),
    ]).toEqual([
      [
        '5:1: syntax-error: expected "}" to close A, found "type"',
        "10:12: unknown-enum: Nope is not an enum (E, F)",
      ],
      ['2:23: syntax-error: expected "|" or the end of the line after "closed", found "open"'],
      ['4:9: syntax-error: expected "=" after "bogus", found "line"'],
    ]);
  });

  it("do not carry a line on into a declaration at the start of the next", () => {
    expect([
      problems("enum E = a |\nenum F = c | d\ntype U {\n  state f: F\n}\n"),
      problems("dimension P = m | t\ntype T needs P,\ntype U {}\n"),
      problems("enum H = a | b\ntype T {\n  state h: H,\nenum F = c\ntype U {\n  state f: F\n}\n"),
      problems(
        "dimension P = m | t\nenum H = a | b\ntype T needs P {\n  state h: H\n  h = b only when P = m and\n}\nenum F = c\n",
      ),
    ]).toEqual([
      ['1:13: syntax-error: expected a value after "|", found the end of the line'],
      ['2:16: syntax-error: expected a dimension after ",", found the end of the line'],
      ["3:14: syntax-error: expected a state name, found the end of the line"],
      ['6:1: syntax-error: expected a dimension after "and", found "}"'],
    ]);
  });

  it("come in source order", () => {
    expect(
      parse("type Wordmark {\n  state hover: Hover\n}\nenum Size =\n").diagnostics.map(
        ({ line, code }) => `${line}: ${code}`,
      ),
    ).toEqual(["2: unknown-enum", "4: syntax-error"]);
  });
});
