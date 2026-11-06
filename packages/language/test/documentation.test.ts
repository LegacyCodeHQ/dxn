import { parse } from "@language/syntax/parse.js";
import { read } from "@language/syntax/read.js";
import { declarationsFromTree } from "@language/syntax/tree.js";
import Dxn from "@legacycodehq/tree-sitter-dxn";
import Parser from "tree-sitter";
import { describe, expect, it } from "vitest";

const documented = `## A control.
type Button {
  ## Modes 中文 😀.
  ## @value off First.
  ##   Continuation.
  ## General prose.
  ## @value off Second.
  ## @bogus unknown
  enum Mode = off | on
  ## @state mode Current mode.
  state mode: Mode, other: Mode
  ## Nested.
  type Inner {}
}`;

const fromTree = (source: string) => {
  const parser = new Parser();
  parser.setLanguage(Dxn);
  return declarationsFromTree(source, parser.parse(source).rootNode);
};

describe("shared parser documentation", () => {
  it.each(["## @", "## @1 off", "## @value! off", "## @value ", "## @value\t"])(
    "reports malformed tag syntax and retains the following declaration: %s",
    (line) => {
      const source = `${line}\nenum Mode = off`;
      const parser = new Parser();
      parser.setLanguage(Dxn);
      const actual = read(source);
      expect({
        treeError: parser.parse(source).rootNode.hasError,
        diagnostics: actual.diagnostics,
        enumName: actual.enums[0]?.name,
      }).toEqual({
        treeError: true,
        diagnostics: [
          {
            severity: "error",
            code: "syntax-error",
            message: "invalid documentation tag syntax",
            line: 1,
            column: 4,
          },
        ],
        enumName: "Mode",
      });
    },
  );

  it.each(["\n", "\r\n", "\r"])(
    "agrees with Tree-sitter attachment and locations with %j",
    (newline) => {
      const source = `\ufeff${documented.replaceAll("\n", newline)}`;
      const actual = read(source);
      expect({ enums: actual.enums, types: actual.types, diagnostics: actual.diagnostics }).toEqual(
        {
          ...fromTree(source),
          diagnostics: [],
        },
      );
    },
  );

  it.each([
    "## @value off\nenum Mode = off",
    "##\nenum Mode = off",
    "## @value off First.\n##\n##   Continued.\nenum Mode = off",
    "## @value off First.\n##\tContinued.\nenum Mode = off",
    "## @value off First.\n## General.\n##   More general.\nenum Mode = off",
    "type Button { ## Modes.\nenum Mode = off\n}",
    "enum Mode = off # Not documentation.\n## A control.\ntype Button {}",
    "## Fixed.\ntype Button {\n## Mode.\nstate mode: Mode = off\n}",
  ])("preserves documentation without semantic decisions: %s", (source) => {
    const actual = read(source);
    expect({ enums: actual.enums, types: actual.types, diagnostics: actual.diagnostics }).toEqual({
      ...fromTree(source),
      diagnostics: [],
    });
  });

  it("exposes documentation through the shared parse entry point", () => {
    const source = "## Modes.\nenum Mode = off | on\ntype Button { state mode: Mode }";
    expect(parse(source).enums[0]?.documentation).toEqual({ description: "Modes.", tags: [] });
  });

  it.each([
    "## Detached.\n\n# Ordinary.\nenum Mode = off",
    "## Detached.\n# Ordinary.\n\nenum Mode = off",
    "## Not attached to a dimension.\ndimension Pointer = mouse",
    "## Not attached to a record.\nrecord Note {}",
    "# Ordinary.\nenum Mode = off",
  ])("keeps documentation detached and warns only for explicit documentation: %s", (source) => {
    const result = read(source);
    expect({
      diagnostics: result.diagnostics.map(({ code }) => code),
      documentation: [...result.enums, ...result.dimensions, ...result.records].map(
        (entry) => entry.documentation,
      ),
    }).toEqual({
      diagnostics: source.startsWith("##") ? ["unattached-documentation"] : [],
      documentation: [undefined],
    });
  });

  it.each([
    ["## Description.\n# Ordinary.\nenum Mode = off\n## Next.\ntype Button {}", 2],
    ["# Ordinary.\n## Description.\nenum Mode = off\n## Next.\ntype Button {}", 1],
    [
      "type Button {\n## Description.\n# Ordinary.\nstate mode: Mode\n## Next.\nenum Mode = off\n}",
      3,
    ],
  ] as const)(
    "reports a mixed attached block without hiding later declarations: %s",
    (source, line) => {
      const result = read(source);
      expect({
        diagnostics: result.diagnostics,
        followingDocumentation:
          result.types[0]?.enums[0]?.documentation ?? result.types[0]?.documentation,
      }).toEqual({
        diagnostics: [
          {
            severity: "error",
            code: "syntax-error",
            message: "ordinary comments and documentation cannot be mixed in an attached block",
            line,
            column: 1,
          },
        ],
        followingDocumentation: { description: "Next.", tags: [] },
      });
    },
  );

  it("preserves documentation on broken declarations and resumes attachment after recovery", () => {
    const result = read("## Broken.\nenum Mode =\n## Next.\ntype Button {}\n");
    expect({
      enums: result.enums.map(({ name, documentation, broken }) => ({
        name,
        documentation,
        broken,
      })),
      types: result.types.map(({ name, documentation }) => ({ name, documentation })),
      codes: result.diagnostics.map(({ code }) => code),
    }).toEqual({
      enums: [{ name: "Mode", documentation: { description: "Broken.", tags: [] }, broken: true }],
      types: [{ name: "Button", documentation: { description: "Next.", tags: [] } }],
      codes: ["syntax-error"],
    });
  });
});
