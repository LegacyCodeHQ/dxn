import { describe, expect, it } from "vitest";
import { parseJson } from "../../src/compiler/json.js";

function errors(source: string) {
  return parseJson(source).diagnostics.map(({ code, line, column }) => ({ code, line, column }));
}

describe("json parser", () => {
  it("parses every JSON value kind with source spans", () => {
    const result = parseJson('{ "a": [1, -2.5e3, "x\\n\\u0041", true, false, null] }');
    expect(result.diagnostics).toEqual([]);
    expect(result.root).toMatchObject({
      kind: "object",
      span: { start: 0, end: 52 },
      members: [
        {
          key: { kind: "string", value: "a", span: { start: 2, end: 5 } },
          value: {
            kind: "array",
            elements: [
              { kind: "number", value: 1 },
              { kind: "number", value: -2500 },
              { kind: "string", value: "x\nA" },
              { kind: "boolean", value: true },
              { kind: "boolean", value: false },
              { kind: "null" },
            ],
          },
        },
      ],
    });
  });

  it("reports an unexpected token with its line and column", () => {
    expect(errors('{\n  "a": }')).toEqual([{ code: "unexpected-token", line: 2, column: 8 }]);
  });

  it("reports a trailing comma as an unexpected token", () => {
    expect(errors('{ "a": 1, }')).toEqual([{ code: "unexpected-token", line: 1, column: 11 }]);
  });

  it("reports unexpected end of input", () => {
    expect(errors("")).toEqual([{ code: "unexpected-end", line: 1, column: 1 }]);
    expect(errors('{ "a": 1')).toEqual([{ code: "unexpected-end", line: 1, column: 9 }]);
  });

  it("reports an unterminated string at its opening quote", () => {
    expect(errors('["abc')).toEqual([{ code: "unterminated-string", line: 1, column: 2 }]);
  });

  it("reports an invalid escape", () => {
    expect(errors('["\\x"]')).toEqual([{ code: "invalid-escape", line: 1, column: 3 }]);
    expect(errors('["\\u12"]')).toEqual([{ code: "invalid-escape", line: 1, column: 3 }]);
  });

  it("reports a raw control character inside a string", () => {
    expect(errors('["a\nb"]')).toEqual([{ code: "invalid-character", line: 1, column: 4 }]);
  });

  it("reports an invalid number", () => {
    expect(errors("[-]")).toEqual([{ code: "invalid-number", line: 1, column: 2 }]);
    expect(errors("[01]")).toEqual([{ code: "unexpected-token", line: 1, column: 3 }]);
  });

  it("reports trailing content after the root value", () => {
    expect(errors("{} x")).toEqual([{ code: "trailing-content", line: 1, column: 4 }]);
  });

  it("reports a duplicate key at the second occurrence and keeps parsing", () => {
    const result = parseJson('{ "a": 1, "a": 2 }');
    expect(result.root).toBeDefined();
    expect(result.diagnostics).toMatchObject([
      { code: "duplicate-key", path: "$.a", line: 1, column: 11 },
    ]);
  });

  it("parses 512 levels of nesting", () => {
    expect(errors("[".repeat(512) + "]".repeat(512))).toEqual([]);
  });

  it("reports nesting deeper than 512 levels instead of overflowing the stack", () => {
    expect(errors("[".repeat(20000) + "]".repeat(20000))).toEqual([
      { code: "too-deep", line: 1, column: 513 },
    ]);
  });

  it("reports a byte order mark and keeps parsing", () => {
    const result = parseJson("\uFEFF{}");
    expect(result.root).toMatchObject({ kind: "object", members: [] });
    expect(errors("\uFEFF{}")).toEqual([{ code: "byte-order-mark", line: 1, column: 1 }]);
  });

  it("reports unpaired surrogates in values and keys", () => {
    expect(parseJson('["\\ud800"]').diagnostics).toMatchObject([
      { code: "invalid-surrogate", path: "$[0]", line: 1, column: 2 },
    ]);
    expect(errors('{ "\\udc00": 1 }')).toEqual([{ code: "invalid-surrogate", line: 1, column: 3 }]);
  });

  it("accepts surrogate pairs", () => {
    expect(errors('["\\ud83d\\ude00"]')).toEqual([]);
  });
});
