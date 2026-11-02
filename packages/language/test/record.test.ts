import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { problems } from "./support/language.js";

const enums = "enum Tool = pen-dev | code\nenum Verdict = passed | failed\n";

describe("record", () => {
  it("declares a name and its fields, one per line, each with a type", () => {
    const source = `${enums}
record Source {
  # where the evidence is
  tool: Tool
  verdict: Verdict
}

record Evidence { source: Source }
`;
    const { records } = parse(source);
    expect([
      problems(source),
      records.map(({ name, fields }) => [
        name,
        fields.map((field) => [field.name, field.type.name]),
      ]),
    ]).toEqual([
      [],
      [
        [
          "Source",
          [
            ["tool", "Tool"],
            ["verdict", "Verdict"],
          ],
        ],
        ["Evidence", [["source", "Source"]]],
      ],
    ]);
    expect(records[0]?.fields[0]).toEqual({
      name: "tool",
      line: 6,
      column: 3,
      type: { name: "Tool", line: 6, column: 9 },
    });
  });

  it("has a capitalized name, declared once in the file, and lowercase fields, each once", () => {
    expect([
      problems(`${enums}record source {\n  tool: Tool\n}\n`),
      problems(`${enums}record Tool {\n  tool: Tool\n}\n`),
      problems(`${enums}record Source {\n  Tool: Tool\n}\n`),
      problems(`${enums}record Source {\n  tool: Tool\n  tool: Verdict\n}\n`),
    ]).toEqual([
      ["3:8: record-name: record names start with a capital letter: `source`"],
      ["3:8: duplicate-name: `Tool` is already declared at line 1"],
      ["4:3: field-name: field names start with a lowercase letter: `Tool`"],
      ["5:3: duplicate-field: `tool` is already a field of `Source`"],
    ]);
  });

  it("types each field with an enum or a record", () => {
    expect([
      problems(
        `${enums}dimension Pointer = mouse | touch\nrecord Source {\n  pointer: Pointer\n}\n`,
      ),
      problems(`${enums}record Source {\n  tool: Tol\n}\n`),
      problems("record Source {\n  tool: Tool\n}\n"),
    ]).toEqual([
      ["5:12: unknown-type: `Pointer` is a dimension, not an enum, a record or a scalar"],
      ["4:9: unknown-type: `Tol` is not an enum, a record or a scalar; did you mean `Tool`?"],
      [
        "2:9: unknown-type: `Tool` is not an enum, a record or a scalar (`Source`, `Timestamp`, `NonEmptyString`, `RelativePath`, `PenNode`)",
      ],
    ]);
  });

  it("cannot contain itself, since every field must be given", () => {
    expect([
      problems("record Evidence {\n  source: Evidence\n}\n"),
      problems("record Evidence {\n  source: Source\n}\nrecord Source {\n  back: Evidence\n}\n"),
    ]).toEqual([
      ["2:3: recursive-record: `Evidence` contains itself: `Evidence.source` is an `Evidence`"],
      [
        "2:3: recursive-record: `Evidence` contains itself: `Evidence.source` is a `Source`, and `Source.back` is an `Evidence`",
        "5:3: recursive-record: `Source` contains itself: `Source.back` is an `Evidence`, and `Evidence.source` is a `Source`",
      ],
    ]);
  });

  it("is not an enum: a state cannot take its values from a record", () => {
    expect(
      problems(
        `${enums}record Source {\n  tool: Tool\n}\ntype Link {\n  state source: Source\n}\n`,
      ),
    ).toEqual(["7:17: unknown-enum: `Source` is a record, not an enum"]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems(`${enums}record Source\n  tool: Tool\n}\n`),
      problems(`${enums}record Source {\n  tool Tool\n}\n`),
      problems(`${enums}record Source {\n  tool: Tool, verdict: Verdict\n}\n`),
      problems(`${enums}record Source {\n  tool: Tool\n`),
    ]).toEqual([
      ["3:14: syntax-error: expected `{` after the record name, found the end of the line"],
      ["4:8: syntax-error: expected `:` after `tool`, found `Tool`"],
      ["4:13: syntax-error: expected the end of the line after `Tool`, found `,`"],
      ["5:1: syntax-error: expected `}` to close Source, found the end of the file"],
    ]);
  });
});
