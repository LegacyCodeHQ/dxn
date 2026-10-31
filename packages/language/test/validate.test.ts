import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { validate } from "../src/validate.js";

const schema = parse(`enum Tool = pen-dev | code
enum Verdict = passed | failed
record Source {
  tool: Tool
  verdict: Verdict
}
record Evidence {
  source: Source
}
`);

// Each problem in the data as "line:column: code: path: message".
const problems = (data: string, record = "Evidence") =>
  validate(schema, record, data).map(
    ({ line, column, code, path, message }) => `${line}:${column}: ${code}: ${path}: ${message}`,
  );

describe("validating data against a record", () => {
  it("accepts a list of records that have every field, each of its type", () => {
    expect(
      problems(`[
  { "source": { "tool": "pen-dev", "verdict": "passed" } },
  { "source": { "tool": "code", "verdict": "failed" } }
]`),
    ).toEqual([]);
    expect(problems("[]")).toEqual([]);
  });

  it("reports a value that is not one of its enum's", () => {
    expect(problems('[{ "source": { "tool": "figma", "verdict": "passed" } }]')).toEqual([
      '1:24: unknown-value: $[0].source.tool: "figma" is not a value of Tool (pen-dev, code)',
    ]);
  });

  it("reports a missing field and a field the record does not have", () => {
    expect(problems('[{ "source": { "tool": "code", "colour": "red" } }]')).toEqual([
      "1:14: missing-field: $[0].source: Source is missing verdict",
      '1:32: unknown-field: $[0].source.colour: Source has no field "colour" (tool, verdict)',
    ]);
  });

  it("says what it expected where the JSON has the wrong kind of value", () => {
    expect([
      problems('{ "source": {} }'),
      problems('["evidence"]'),
      problems('[{ "source": "design.pen" }]'),
      problems('[{ "source": { "tool": 1, "verdict": "passed" } }]'),
    ]).toEqual([
      ["1:1: wrong-kind: $: expected a list of Evidence records, found an object"],
      ["1:2: wrong-kind: $[0]: expected an Evidence record (an object), found a string"],
      ["1:14: wrong-kind: $[0].source: expected a Source record (an object), found a string"],
      ["1:24: wrong-kind: $[0].source.tool: expected a value of Tool (a string), found a number"],
    ]);
  });

  it("reports every problem, in every record", () => {
    expect(
      problems(`[
  { "source": { "tool": "figma", "verdict": "passed" } },
  { "source": { "tool": "code", "verdict": "maybe" } }
]`),
    ).toEqual([
      '2:25: unknown-value: $[0].source.tool: "figma" is not a value of Tool (pen-dev, code)',
      '3:44: unknown-value: $[1].source.verdict: "maybe" is not a value of Verdict (passed, failed)',
    ]);
  });

  it("reports JSON that does not parse, and nothing more", () => {
    expect(problems('[{ "source": }]')).toEqual(['1:14: unexpected-token: $: unexpected "}"']);
  });

  it("refuses a name that is not a record of the file", () => {
    expect(() => validate(schema, "Tool", "[]")).toThrow("Tool is an enum, not a record");
    expect(() => validate(schema, "Proof", "[]")).toThrow(
      "Proof is not a record (Source, Evidence)",
    );
    expect(() => validate(parse("record Source {\n  tool: Tol\n}\n"), "Source", "[]")).toThrow(
      "cannot validate against a file with problems",
    );
  });
});
