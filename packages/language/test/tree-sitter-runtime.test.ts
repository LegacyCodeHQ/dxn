import { parse } from "@language/syntax/parse.js";
import { parseTreeSitter } from "@language/syntax/parse-tree-sitter.js";
import { describe, expect, it } from "vitest";

describe("in-process Tree-sitter semantic analysis", () => {
  it.each([
    "",
    "# Only a comment",
    "enum Hover = rest | hovered\ntype Button { state hover: Hover }",
    "type Button {\n enum Hover = rest | hovered\n state hover: Hover = rest\n type Icon {}\n}",
    "type Button { state hover: Missing }",
    "enum Hover = rest | rest",
  ])("agrees with shared semantic analysis for supported syntax: %s", (source) => {
    expect(parseTreeSitter(source)).toEqual(parse(source));
  });

  it.each(["\n", "\r\n", "\r"])(
    "preserves textual values and documentation locations with %j",
    (newline) => {
      const source = [
        "\ufeff## 中文 😀",
        "## @value 01 A textual value.",
        "enum Level = 1 | 01 | 2d | touch-screen",
      ].join(newline);
      const result = parseTreeSitter(source);
      expect({
        values: result.enums[0]?.values,
        documentation: result.enums[0]?.documentation,
      }).toMatchInlineSnapshot(`
      {
        "documentation": {
          "description": "中文 😀",
          "tags": [
            {
              "column": 5,
              "description": "A textual value.",
              "length": 5,
              "line": 2,
              "name": "value",
              "target": {
                "column": 11,
                "length": 2,
                "line": 2,
                "name": "01",
              },
            },
          ],
        },
        "values": [
          {
            "column": 14,
            "length": 1,
            "line": 3,
            "name": "1",
          },
          {
            "column": 18,
            "length": 2,
            "line": 3,
            "name": "01",
          },
          {
            "column": 23,
            "length": 2,
            "line": 3,
            "name": "2d",
          },
          {
            "column": 28,
            "length": 12,
            "line": 3,
            "name": "touch-screen",
          },
        ],
      }
    `);
    },
  );

  it.each([
    "enum Hover = | rest",
    "enum Hover = rest |",
    "type Button { state hover: Hover, }",
    "## Documentation\n# Ordinary\nenum Hover = rest",
  ])("refuses recovered syntax before semantic analysis: %s", (source) => {
    expect(() => parseTreeSitter(source)).toThrow("Cannot lower a tree with syntax errors");
  });

  it.each([
    "dimension Pointer = mouse | touch",
    "type Button { action click: hover rest -> hovered }",
  ])("refuses an unmigrated construct rather than omitting it: %s", (source) => {
    expect(() => parseTreeSitter(source)).toThrow(/Unsupported syntax node/);
  });

  it("preserves documentation through lowering and semantic analysis", () => {
    const result = parseTreeSitter(`## Interaction modes.
## @value rest No interaction.
enum Hover = rest | hovered
type Button {
  ## @state hover Current interaction.
  state hover: Hover
}`);
    expect({
      enums: result.enums,
      states: result.types[0]?.states,
      diagnostics: result.diagnostics,
    }).toMatchInlineSnapshot(`
      {
        "diagnostics": [],
        "enums": [
          {
            "column": 6,
            "documentation": {
              "description": "Interaction modes.",
              "tags": [
                {
                  "column": 5,
                  "description": "No interaction.",
                  "length": 5,
                  "line": 2,
                  "name": "value",
                  "target": {
                    "column": 11,
                    "length": 4,
                    "line": 2,
                    "name": "rest",
                  },
                },
              ],
            },
            "length": 5,
            "line": 3,
            "name": "Hover",
            "values": [
              {
                "column": 14,
                "length": 4,
                "line": 3,
                "name": "rest",
              },
              {
                "column": 21,
                "length": 7,
                "line": 3,
                "name": "hovered",
              },
            ],
          },
        ],
        "states": [
          {
            "column": 9,
            "documentation": {
              "description": "",
              "tags": [
                {
                  "column": 7,
                  "description": "Current interaction.",
                  "length": 5,
                  "line": 5,
                  "name": "state",
                  "target": {
                    "column": 13,
                    "length": 5,
                    "line": 5,
                    "name": "hover",
                  },
                },
              ],
            },
            "enum": {
              "column": 16,
              "length": 5,
              "line": 6,
              "name": "Hover",
            },
            "length": 5,
            "line": 6,
            "name": "hover",
          },
        ],
      }
    `);
  });
});
