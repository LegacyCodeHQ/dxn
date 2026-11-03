import { parseJson } from "@language/data/json.js";
import { describe, expect, it } from "vitest";

function errors(source: string) {
  return parseJson(source).diagnostics.map(({ code, line, column }) => ({ code, line, column }));
}

describe("json parser", () => {
  it("parses every JSON value kind with source spans", () => {
    const snapshot: unknown[] = [];
    const result = parseJson('{ "a": [1, -2.5e3, "x\\n\\u0041", true, false, null] }');
    snapshot.push(result.diagnostics);
    snapshot.push(result.root);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    {
      "kind": "object",
      "members": [
        {
          "key": {
            "kind": "string",
            "span": {
              "end": 5,
              "start": 2,
            },
            "value": "a",
          },
          "value": {
            "elements": [
              {
                "kind": "number",
                "span": {
                  "end": 9,
                  "start": 8,
                },
                "value": 1,
              },
              {
                "kind": "number",
                "span": {
                  "end": 17,
                  "start": 11,
                },
                "value": -2500,
              },
              {
                "kind": "string",
                "span": {
                  "end": 30,
                  "start": 19,
                },
                "value": "x
  A",
              },
              {
                "kind": "boolean",
                "span": {
                  "end": 36,
                  "start": 32,
                },
                "value": true,
              },
              {
                "kind": "boolean",
                "span": {
                  "end": 43,
                  "start": 38,
                },
                "value": false,
              },
              {
                "kind": "null",
                "span": {
                  "end": 49,
                  "start": 45,
                },
              },
            ],
            "kind": "array",
            "span": {
              "end": 50,
              "start": 7,
            },
          },
        },
      ],
      "span": {
        "end": 52,
        "start": 0,
      },
    },
  ]
`);
  });

  it("reports an unexpected token with its line and column", () => {
    expect(errors('{\n  "a": }')).toEqual([{ code: "unexpected-token", line: 2, column: 8 }]);
  });

  it("reports a trailing comma as an unexpected token", () => {
    expect(errors('{ "a": 1, }')).toEqual([{ code: "unexpected-token", line: 1, column: 11 }]);
  });

  it("reports unexpected end of input", () => {
    const snapshot: unknown[] = [];
    snapshot.push(errors(""));
    snapshot.push(errors('{ "a": 1'));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "unexpected-end",
        "column": 1,
        "line": 1,
      },
    ],
    [
      {
        "code": "unexpected-end",
        "column": 9,
        "line": 1,
      },
    ],
  ]
`);
  });

  it("reports an unterminated string at its opening quote", () => {
    expect(errors('["abc')).toEqual([{ code: "unterminated-string", line: 1, column: 2 }]);
  });

  it("reports an invalid escape", () => {
    const snapshot: unknown[] = [];
    snapshot.push(errors('["\\x"]'));
    snapshot.push(errors('["\\u12"]'));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "invalid-escape",
        "column": 3,
        "line": 1,
      },
    ],
    [
      {
        "code": "invalid-escape",
        "column": 3,
        "line": 1,
      },
    ],
  ]
`);
  });

  it("reports a raw control character inside a string", () => {
    expect(errors('["a\nb"]')).toEqual([{ code: "invalid-character", line: 1, column: 4 }]);
  });

  it("reports an invalid number", () => {
    const snapshot: unknown[] = [];
    snapshot.push(errors("[-]"));
    snapshot.push(errors("[01]"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "invalid-number",
        "column": 2,
        "line": 1,
      },
    ],
    [
      {
        "code": "unexpected-token",
        "column": 3,
        "line": 1,
      },
    ],
  ]
`);
  });

  it("reports trailing content after the root value", () => {
    expect(errors("{} x")).toEqual([{ code: "trailing-content", line: 1, column: 4 }]);
  });

  it("reports a duplicate key at the second occurrence and keeps parsing", () => {
    const snapshot: unknown[] = [];
    const result = parseJson('{ "a": 1, "a": 2 }');
    snapshot.push(result.root);
    snapshot.push(result.diagnostics);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "kind": "object",
          "members": [
            {
              "key": {
                "kind": "string",
                "span": {
                  "end": 5,
                  "start": 2,
                },
                "value": "a",
              },
              "value": {
                "kind": "number",
                "span": {
                  "end": 8,
                  "start": 7,
                },
                "value": 1,
              },
            },
            {
              "key": {
                "kind": "string",
                "span": {
                  "end": 13,
                  "start": 10,
                },
                "value": "a",
              },
              "value": {
                "kind": "number",
                "span": {
                  "end": 16,
                  "start": 15,
                },
                "value": 2,
              },
            },
          ],
          "span": {
            "end": 18,
            "start": 0,
          },
        },
        [
          {
            "code": "duplicate-key",
            "column": 11,
            "line": 1,
            "message": "duplicate key \`a\`",
            "path": "$.a",
          },
        ],
      ]
    `);
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
    const snapshot: unknown[] = [];
    const result = parseJson("\uFEFF{}");
    snapshot.push(result.root);
    snapshot.push(errors("\uFEFF{}"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "kind": "object",
      "members": [],
      "span": {
        "end": 3,
        "start": 1,
      },
    },
    [
      {
        "code": "byte-order-mark",
        "column": 1,
        "line": 1,
      },
    ],
  ]
`);
  });

  it("reports unpaired surrogates in values and keys", () => {
    const snapshot: unknown[] = [];
    snapshot.push(parseJson('["\\ud800"]').diagnostics);
    snapshot.push(errors('{ "\\udc00": 1 }'));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "invalid-surrogate",
        "column": 2,
        "line": 1,
        "message": "string contains an unpaired surrogate",
        "path": "$[0]",
      },
    ],
    [
      {
        "code": "invalid-surrogate",
        "column": 3,
        "line": 1,
      },
    ],
  ]
`);
  });

  it("accepts surrogate pairs", () => {
    expect(errors('["\\ud83d\\ude00"]')).toEqual([]);
  });
});
