import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";
import { problems } from "../support/language.js";

describe("diagnostics", () => {
  it("say when nothing of a kind is declared, instead of an empty list", () => {
    expect([
      problems("type Wordmark {\n  states hover: Hover\n}\n"),
      problems(
        "enum Hover = rest | hovered\ntype Wordmark {\n  states hover: Hover\n  hover = hovered only when Pointer = mouse\n}\n",
      ),
      problems("environment Device = Pointer\n"),
      problems("profile laptop: Device { Pointer = mouse }\n"),
      problems(
        "enum Hover = rest | hovered\ndimension Pointer = mouse\ntype Wordmark {\n  hover = hovered only when Pointer = mouse\n}\n",
      ),
    ]).toEqual([
      ["2:17: unknown-enum: Hover is not an enum; the file declares none"],
      ["4:29: unknown-dimension: Pointer is not a dimension; the file declares none"],
      ["1:22: unknown-dimension: Pointer is not a dimension; the file declares none"],
      ["1:17: unknown-environment: Device is not an environment; the file declares none"],
      ["4:3: unknown-state: hover is not a state of Wordmark; it has none"],
    ]);
  });

  it("report a declaration that does not parse once, not again where it is used", () => {
    expect([
      problems(
        "enum Hover = rest hovered\ndimension Pointer = mouse\ntype Wordmark {\n  states hover: Hover\n  hover = hovered only when Pointer = mouse\n}\n",
      ),
      problems(
        "enum Hover = rest | hovered\ndimension Pointer = mouse touch\ntype Wordmark {\n  states hover: Hover\n  hover = hovered only when Pointer = touch\n}\nenvironment Device = Pointer\n",
      ),
      problems(
        "dimension Pointer = mouse\ndimension Keyboard = none\nenvironment Device = Pointer Keyboard\nprofile laptop: Device { Pointer = mouse, Keyboard = none }\n",
      ),
      problems(
        "enum Hover = rest | hovered\ndimension Pointer = mouse\ntype Wordmark {\n  hover = hovered only when Pointer = mouse\n  states hover Hover\n}\n",
      ),
      problems(
        "dimension Pointer = mouse\nenvironment Device = Pointer\nprofile laptop: Device { Pointer = }\nprofile laptop: Device { Pointer = mouse }\n",
      ),
    ]).toEqual([
      ['1:19: syntax-error: expected "|" or the end of the line after "rest", found "hovered"'],
      ['2:27: syntax-error: expected "|" or the end of the line after "mouse", found "touch"'],
      ['3:30: syntax-error: expected "×" or the end of the line after "Pointer", found "Keyboard"'],
      ['5:16: syntax-error: expected ":" after "hover", found "Hover"'],
      [
        '3:36: syntax-error: expected a value after "=", found "}"',
        "4:9: duplicate-name: laptop is already declared at line 3",
      ],
    ]);
  });

  it("skip to the next declaration after a mistake, wherever it is", () => {
    expect([
      problems("type {\n  states hover: Hover\n}\nenum Hover = rest\n"),
      problems(
        "dimension Pointer = mouse\nenvironment Device = Pointer\nprofile laptop Device {\n  Pointer = mouse\n}\n",
      ),
      problems("enum Hover = rest\ntype Wordmark\n  states hover: Hover\n}\n"),
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

  it("come in source order", () => {
    expect(
      parse("type Wordmark {\n  states hover: Hover\n}\nenum Size =\n").diagnostics.map(
        ({ line, code }) => `${line}: ${code}`,
      ),
    ).toEqual(["2: unknown-enum", "4: syntax-error"]);
  });
});
