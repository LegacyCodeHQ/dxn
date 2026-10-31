import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";

const problems = (source: string) =>
  parse(source)
    .diagnostics.sort((a, b) => a.line - b.line || a.column - b.column)
    .map(({ line, column, code, message }) => `${line}:${column}: ${code}: ${message}`);

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
});
