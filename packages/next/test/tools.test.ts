import { analyze, format, renameAt, semanticTokens, symbolAt } from "@next/index.js";
import { describe, expect, it } from "vitest";

describe("enum tools", () => {
  it("formats syntax without changing its declarations, even when names are invalid", () => {
    const snapshot = [
      "enum Light{off,on}",
      "enum light { Off }",
      "",
      "enum Light = off | on",
      "enum Light { off, }",
    ].map((source) => ({ source, formatted: format(source) }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "formatted": "enum Light { off, on }
      ",
          "source": "enum Light{off,on}",
        },
        {
          "formatted": "enum light { Off }
      ",
          "source": "enum light { Off }",
        },
        {
          "formatted": "",
          "source": "",
        },
        {
          "formatted": undefined,
          "source": "enum Light = off | on",
        },
        {
          "formatted": undefined,
          "source": "enum Light { off, }",
        },
      ]
    `);
  });
  it("reports file and syntax errors with codes and source spans", () => {
    expect(
      [analyze("enum Light { on, on }"), analyze("enum Light = on")].map((f) => f.problems),
    ).toMatchInlineSnapshot(`
      [
        [
          {
            "at": [
              {
                "end": 15,
                "start": 13,
              },
              {
                "end": 19,
                "start": 17,
              },
            ],
            "code": "duplicate",
            "message": "[E4] 'on': a value is declared more than once; remove the repeated declaration",
            "rule": "E4",
          },
        ],
        [
          {
            "at": [
              {
                "end": 12,
                "start": 11,
              },
            ],
            "code": "syntax-error",
            "message": "expected '{' after the enumeration name, found '='",
          },
        ],
      ]
    `);
  });
  it("keeps enum keywords as values and identifies the enum when renaming", () => {
    const source = "enum Light { enum, on }";
    expect({
      value: symbolAt(source, 20),
      name: symbolAt(source, 6),
      tokens: semanticTokens(source),
      renamed: renameAt(source, 6, "Lamp"),
      refused: renameAt(source, 20, "active"),
    }).toMatchInlineSnapshot(`
      {
        "name": {
          "definition": {
            "end": 10,
            "start": 5,
          },
          "kind": "enum",
          "name": "Light",
          "signature": "enum Light { enum, on }",
          "span": {
            "end": 10,
            "start": 5,
          },
        },
        "refused": undefined,
        "renamed": {
          "edits": [
            {
              "span": {
                "end": 10,
                "start": 5,
              },
              "text": "Lamp",
            },
          ],
          "file": CheckedFile {
            "enums": [
              Enum {
                "declaration": {
                  "name": {
                    "span": {
                      "end": 9,
                      "start": 5,
                    },
                    "text": "Lamp",
                  },
                  "span": {
                    "end": 22,
                    "start": 0,
                  },
                  "values": [
                    {
                      "span": {
                        "end": 16,
                        "start": 12,
                      },
                      "text": "enum",
                    },
                    {
                      "span": {
                        "end": 20,
                        "start": 18,
                      },
                      "text": "on",
                    },
                  ],
                },
              },
            ],
            "records": [],
            "types": [],
          },
          "refusals": [],
          "source": "enum Lamp { enum, on }",
        },
        "tokens": [
          {
            "declaration": true,
            "kind": "enum",
            "span": {
              "end": 10,
              "start": 5,
            },
          },
          {
            "declaration": true,
            "kind": "enumMember",
            "span": {
              "end": 17,
              "start": 13,
            },
          },
          {
            "declaration": true,
            "kind": "enumMember",
            "span": {
              "end": 21,
              "start": 19,
            },
          },
        ],
        "value": {
          "definition": {
            "end": 21,
            "start": 19,
          },
          "kind": "value",
          "name": "on",
          "signature": "Light.on",
          "span": {
            "end": 21,
            "start": 19,
          },
        },
      }
    `);
  });
  it("is idempotent and preserves the parsed declarations", () => {
    const source = "enum Light{off,on}\r\nenum Power{dim}";
    const formatted = format(source);
    expect(format(formatted ?? "")).toBe(formatted);
    const names = (text: string) =>
      analyze(text).declarations.map((d) => [
        d.name.text,
        ("values" in d ? d.values : "varies" in d ? d.varies : d.fields.map((f) => f.name)).map(
          (v) => v.text,
        ),
      ]);
    expect(names(formatted ?? "")).toEqual(names(source));
  });
});

it.each([
  ["enum light { off }", "E1"],
  ["enum Light {}", "E2"],
  ["enum Light { Off }", "E3"],
  ["enum Light { on, on }", "E4"],
  ["enum Light { off } enum Light { on }", "F1"],
] as const)("identifies the notebook rule for %s as %s", (source, rule) => {
  const problems = analyze(source).problems;
  expect(problems).toHaveLength(1);
  expect(problems[0]).toHaveProperty("rule", rule);
  expect(problems[0]?.message).toContain(`[${rule}]`);
});

it("does not assign a checker-rule ID to a syntax error", () => {
  expect(analyze("enum Light = off").problems[0]).not.toHaveProperty("rule");
});
