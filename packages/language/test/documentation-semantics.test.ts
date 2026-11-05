import { parse } from "@language/syntax/parse.js";
import { parseTreeSitter } from "@language/syntax/parse-tree-sitter.js";
import { read } from "@language/syntax/read.js";
import { describe, expect, it } from "vitest";

const enumeration = (tag: string) =>
  `${tag}\nenum Mode = off | on\ntype Button { state mode: Mode }`;
const state = (tag: string, fields = "mode: Mode") =>
  `enum Mode = off | on\ntype Button {\n${tag}\n  state ${fields}\n}`;

describe("documentation semantics", () => {
  it.each([
    [enumeration("## @bogus off Description."), "unknown-documentation-tag", 1, 5],
    [enumeration("## @VALUE off Description."), "unknown-documentation-tag", 1, 5],
    [enumeration("## @state off Description."), "documentation-tag-kind", 1, 5],
    [enumeration("## @value"), "missing-documentation-target", 1, 5],
    [enumeration("## @value missing Description."), "unknown-documentation-target", 1, 11],
    [state("  ## @value off Description."), "documentation-tag-kind", 3, 7],
    [state("  ## @state"), "missing-documentation-target", 3, 7],
    [state("  ## @state other Description."), "unknown-documentation-target", 3, 13],
    [
      "enum Mode = off\ntype Button {\n  state mode: Mode\n  ## @state mode Wrong declaration.\n  state other: Mode\n}",
      "unknown-documentation-target",
      4,
      13,
    ],
    [
      "enum Mode = off\n## @state mode Description.\ntype Button { state mode: Mode }",
      "documentation-tag-kind",
      2,
      5,
    ],
  ] as const)(
    "reports the documentation problem at its source: %s",
    (source, code, line, column) => {
      expect(
        parse(source).diagnostics.map(({ severity, code, line, column }) => ({
          severity,
          code,
          line,
          column,
        })),
      ).toEqual([{ severity: "error", code, line, column }]);
    },
  );

  it.each([
    enumeration("## @value off\n## @value on On."),
    "## @value 1 First.\n## @value 01 Second.\nenum Level = 1 | 01\ntype Button { state level: Level }",
    state("  ## @state mode"),
    state("  ## @state mode Mode.\n  ## @state other Other.", "mode: Mode, other: Mode"),
    "enum Mode = off\ntype Button {\n  ## @state mode Outer.\n  state mode: Mode\n  type Inner {\n    ## @state mode Inner.\n    state mode: Mode\n  }\n}",
    "type Button {\n## @value off Off.\nenum Mode = off\nstate mode: Mode\n}",
    "enum Mode = off\ntype Button { state mode: Mode }",
  ])("accepts optional documentation and direct declaration targets: %s", (source) => {
    expect(parse(source).diagnostics).toEqual([]);
  });

  it("warns on later duplicate tags and keeps the first description without combining", () => {
    const source = enumeration("## @value off First.\n##   Continued.\n## @value off Second.");
    expect({
      raw: read(source).enums[0]?.documentation?.tags.map(({ description }) => description),
      analyzed: parse(source).enums[0]?.documentation,
      diagnostics: parse(source).diagnostics,
    }).toMatchInlineSnapshot(`
      {
        "analyzed": {
          "description": "",
          "tags": [
            {
              "column": 5,
              "description": "First.
      Continued.",
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
          ],
        },
        "diagnostics": [
          {
            "code": "duplicate-documentation-tag",
            "column": 5,
            "line": 3,
            "message": "\`@value\` already documents \`off\` at line 1; the first description is kept",
            "severity": "warning",
          },
        ],
        "raw": [
          "First.
      Continued.",
          "Second.",
        ],
      }
    `);
  });

  it("validates a comma-separated state declaration once, with all its targets", () => {
    const source = state(
      "  ## @state mode First.\n  ## @state other Other.\n  ## @state mode Second.",
      "mode: Mode, other: Mode",
    );
    const file = parse(source);
    expect({
      tags: file.types[0]?.states.map(({ documentation }) =>
        documentation?.tags.map(({ target, description }) => ({ name: target?.name, description })),
      ),
      diagnostics: file.diagnostics,
    }).toMatchInlineSnapshot(`
      {
        "diagnostics": [
          {
            "code": "duplicate-documentation-tag",
            "column": 7,
            "line": 5,
            "message": "\`@state\` already documents \`mode\` at line 3; the first description is kept",
            "severity": "warning",
          },
        ],
        "tags": [
          [
            {
              "description": "First.",
              "name": "mode",
            },
            {
              "description": "Other.",
              "name": "other",
            },
          ],
          [
            {
              "description": "First.",
              "name": "mode",
            },
            {
              "description": "Other.",
              "name": "other",
            },
          ],
        ],
      }
    `);
  });

  it("agrees between the shared and migration analyzers", () => {
    const source = enumeration("## @value off First.\n## @value off Second.\n## @bogus unknown");
    expect(parseTreeSitter(source)).toEqual(parse(source));
  });

  it("does not count documentation as enum usage", () => {
    const source = "## @value off Description.\nenum Mode = off";
    expect(parse(source).diagnostics.map(({ code }) => code)).toEqual(["unused-enum"]);
  });

  it("avoids target errors caused by incomplete declarations", () => {
    const source = "## @value missing Description.\nenum Mode =\ntype Button {}";
    expect(parse(source).diagnostics.map(({ code }) => code)).toEqual(["syntax-error"]);
  });
});
