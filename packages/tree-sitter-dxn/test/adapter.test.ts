import { analyzeSemantics } from "@language/analysis/semantic-analyzer.js";
import { read } from "@language/syntax/read.js";
import { declarationsFromTree } from "@language/syntax/tree.js";
import { describe, expect, it } from "vitest";
import { concreteTree } from "./support/tree.js";

const declarations = (source: string) => declarationsFromTree(source, concreteTree(source));

describe("Tree-sitter declaration adapter", () => {
  it.each([
    "enum Hover = rest | hovered",
    "\ufeffenum Hover = rest | hovered",
    "type Button {\n enum Hover = rest | hovered\n state hover: Hover, focus: Focus\n type Icon {}\n}",
    "type Button needs Pointer, Theme receives mode: Mode {\n state hover: Outer.Hover = rest\n}",
    "type Button {\n state hover: Hover = when Pointer {\n mouse -> hovered\n else -> rest\n }\n}",
  ])("preserves the existing unqualified syntax AST: %s", (source) => {
    const old = read(source);
    const tree = declarations(source);
    expect({
      syntax: tree,
      analysis: analyzeSemantics({ ...read(source), ...declarations(source) }),
    }).toEqual({
      syntax: { enums: old.enums, types: old.types },
      analysis: analyzeSemantics(read(source)),
    });
  });

  it.each(["\n", "\r\n", "\r"])("preserves documentation attachment with %j", (newline) => {
    const source = ["## 中文 😀", "## @value off", "##   Continued.", "enum Mode = off | off"].join(
      newline,
    );
    const docs = declarations(source).enums[0]?.documentation;
    expect(docs).toEqual({
      description: "中文 😀",
      tags: [
        {
          name: "value",
          line: 2,
          column: 5,
          length: 5,
          target: { name: "off", line: 2, column: 11, length: 3 },
          description: "Continued.",
        },
      ],
    });
  });

  it.each(["\n", "\r\n", "\r"])(
    "retains textual values and source locations with %j",
    (newline) => {
      const source = ["# 中文 😀", "enum HOVER2", "= 1 | 01", "| when | else | touch-screen"].join(
        newline,
      );
      expect(declarations(source)).toMatchInlineSnapshot(`
        {
          "enums": [
            {
              "column": 6,
              "length": 6,
              "line": 2,
              "name": "HOVER2",
              "values": [
                {
                  "column": 3,
                  "length": 1,
                  "line": 3,
                  "name": "1",
                },
                {
                  "column": 7,
                  "length": 2,
                  "line": 3,
                  "name": "01",
                },
                {
                  "column": 3,
                  "length": 4,
                  "line": 4,
                  "name": "when",
                },
                {
                  "column": 10,
                  "length": 4,
                  "line": 4,
                  "name": "else",
                },
                {
                  "column": 17,
                  "length": 12,
                  "line": 4,
                  "name": "touch-screen",
                },
              ],
            },
          ],
          "types": [],
        }
      `);
    },
  );

  it("retains documentation, duplicate and unknown tags without checker decisions", () => {
    const source = `## Detached.

## A button.
type Button {
  ## @value rest First.
  ##   Continuation.
  ## General enum prose.
  ## @value rest Second.
  ## @bogus unknown
  enum Hover = rest | hovered
  ## @state hover Pointer interaction.
  state hover: Hover, focus: Hover
}`;
    expect(declarations(source)).toMatchInlineSnapshot(`
      {
        "enums": [],
        "types": [
          {
            "actions": [],
            "alikes": [],
            "children": [],
            "column": 6,
            "documentation": {
              "description": "A button.",
              "tags": [],
            },
            "enums": [
              {
                "column": 8,
                "documentation": {
                  "description": "General enum prose.",
                  "tags": [
                    {
                      "column": 7,
                      "description": "First.
      Continuation.",
                      "length": 5,
                      "line": 5,
                      "name": "value",
                      "target": {
                        "column": 13,
                        "length": 4,
                        "line": 5,
                        "name": "rest",
                      },
                    },
                    {
                      "column": 7,
                      "description": "Second.",
                      "length": 5,
                      "line": 8,
                      "name": "value",
                      "target": {
                        "column": 13,
                        "length": 4,
                        "line": 8,
                        "name": "rest",
                      },
                    },
                    {
                      "column": 7,
                      "description": "",
                      "length": 5,
                      "line": 9,
                      "name": "bogus",
                      "target": {
                        "column": 13,
                        "length": 7,
                        "line": 9,
                        "name": "unknown",
                      },
                    },
                  ],
                },
                "length": 5,
                "line": 10,
                "name": "Hover",
                "values": [
                  {
                    "column": 16,
                    "length": 4,
                    "line": 10,
                    "name": "rest",
                  },
                  {
                    "column": 23,
                    "length": 7,
                    "line": 10,
                    "name": "hovered",
                  },
                ],
              },
            ],
            "events": [],
            "length": 6,
            "line": 4,
            "name": "Button",
            "needs": [],
            "provides": [],
            "rules": [],
            "states": [
              {
                "column": 9,
                "documentation": {
                  "description": "",
                  "tags": [
                    {
                      "column": 7,
                      "description": "Pointer interaction.",
                      "length": 5,
                      "line": 11,
                      "name": "state",
                      "target": {
                        "column": 13,
                        "length": 5,
                        "line": 11,
                        "name": "hover",
                      },
                    },
                  ],
                },
                "enum": {
                  "column": 16,
                  "length": 5,
                  "line": 12,
                  "name": "Hover",
                },
                "length": 5,
                "line": 12,
                "name": "hover",
              },
              {
                "column": 23,
                "documentation": {
                  "description": "",
                  "tags": [
                    {
                      "column": 7,
                      "description": "Pointer interaction.",
                      "length": 5,
                      "line": 11,
                      "name": "state",
                      "target": {
                        "column": 13,
                        "length": 5,
                        "line": 11,
                        "name": "hover",
                      },
                    },
                  ],
                },
                "enum": {
                  "column": 30,
                  "length": 5,
                  "line": 12,
                  "name": "Hover",
                },
                "length": 5,
                "line": 12,
                "name": "focus",
              },
            ],
            "triggers": [],
            "types": [],
            "unions": [],
          },
        ],
      }
    `);
  });

  it("ends tag continuation at unindented prose", () => {
    const source = `## @value off First.
## General.
##   More general.
## @value on
##   Continued on.
enum Mode = off | on`;
    expect(declarations(source)).toMatchInlineSnapshot(`
      {
        "enums": [
          {
            "column": 6,
            "documentation": {
              "description": "General.
      More general.",
              "tags": [
                {
                  "column": 5,
                  "description": "First.",
                  "length": 5,
                  "line": 1,
                  "name": "value",
                  "target": {
                    "column": 11,
                    "length": 3,
                    "line": 1,
                    "name": "off",
                  },
                },
                {
                  "column": 5,
                  "description": "Continued on.",
                  "length": 5,
                  "line": 4,
                  "name": "value",
                  "target": {
                    "column": 11,
                    "length": 2,
                    "line": 4,
                    "name": "on",
                  },
                },
              ],
            },
            "length": 4,
            "line": 6,
            "name": "Mode",
            "values": [
              {
                "column": 13,
                "length": 3,
                "line": 6,
                "name": "off",
              },
              {
                "column": 19,
                "length": 2,
                "line": 6,
                "name": "on",
              },
            ],
          },
        ],
        "types": [],
      }
    `);
  });

  it.each([
    "enum Hover = | rest",
    "enum Hover = rest |",
    "type Button { state hover: Hover, }",
    "## Documentation\n# Ordinary\nenum Hover = rest",
  ])("refuses to silently lower a recovered syntax tree: %s", (source) => {
    expect(() => declarations(source)).toThrow(/syntax errors/);
  });

  it.each([
    "dimension Pointer = mouse | touch",
    "type Button { action click: hover rest -> hovered }",
  ])("refuses to silently drop an unmigrated construct: %s", (source) => {
    expect(() => declarations(source)).toThrow(/Unsupported syntax node/);
  });
});
