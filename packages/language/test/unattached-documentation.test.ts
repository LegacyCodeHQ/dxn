import { hover } from "@language/editor/hover.js";
import { format } from "@language/syntax/format.js";
import { parseTreeSitter } from "@language/syntax/parse-tree-sitter.js";
import { read } from "@language/syntax/read.js";
import { describe, expect, it } from "vitest";

const message =
  "documentation is not attached to a declaration; remove the separating blank line or use `#` for an ordinary comment";
const warning = (line: number, column = 1) => ({
  severity: "warning",
  code: "unattached-documentation",
  message,
  line,
  column,
});
const cases = [
  {
    title: "blank separation",
    source: "## Modes.\n## @value off No input.\n\nenum Mode = off",
    expected: [warning(1)],
  },
  { title: "end of file", source: "## Unattached.\n## Continued.", expected: [warning(1)] },
  {
    title: "separate blocks",
    source: "## First.\n\n## Second.\n",
    expected: [warning(1), warning(3)],
  },
  {
    title: "nested block before a closing brace",
    source: "type Button {\n  ## Unattached.\n}",
    expected: [warning(2, 3)],
  },
  {
    title: "unsupported declaration",
    source: "## Evidence.\nrecord Evidence {}",
    expected: [warning(1)],
    sharedOnly: true,
  },
  {
    title: "trailing documentation",
    source: "enum Mode = off ## Unattached.\n",
    expected: [warning(1, 17)],
  },
  { title: "ordinary comment", source: "# Ordinary.\n\nenum Mode = off", expected: [] },
  { title: "attached enum", source: "## Modes.\nenum Mode = off", expected: [] },
  {
    title: "attached type and shared states",
    source:
      "enum Mode = off\n## Control.\ntype Button {\n  ## @state mode Current.\n  state mode: Mode, other: Mode\n}",
    expected: [],
  },
  {
    title: "inline opening body",
    source: "type Button { ## Modes.\nenum Mode = off\n}",
    expected: [],
  },
  {
    title: "quoted marker",
    source: 'expect "## quoted" {\n in Missing\n absent\n}',
    expected: [],
    sharedOnly: true,
  },
];

describe("unattached documentation warnings", () => {
  it.each(cases)("warns once per block: $title", ({ source, expected }) => {
    expect(
      read(source).diagnostics.filter(({ code }) => code === "unattached-documentation"),
    ).toEqual(expected);
  });
  it.each(cases.filter(({ sharedOnly }) => !sharedOnly))(
    "agrees with the migration parser: $title",
    ({ source, expected }) => {
      expect(
        parseTreeSitter(source).diagnostics.filter(
          ({ code }) => code === "unattached-documentation",
        ),
      ).toEqual(expected);
    },
  );
  it.each(["\n", "\r\n", "\r"])("preserves locations with BOM and %j", (ending) => {
    expect(
      read(`\uFEFF  ## Detached 😀.\n\nenum Mode = off`.replaceAll("\n", ending)).diagnostics,
    ).toEqual([warning(1, 3)]);
  });
  it("keeps detached text out of hovers and formats a warning-only file", () => {
    const source = "## Description.\n\nenum Mode=off\n";
    const formatted = format(source);
    expect({
      formatted,
      comment: hover(source, 3, 11)?.comment,
      diagnostics: formatted && read(formatted).diagnostics,
    }).toEqual({
      formatted: "## Description.\n\nenum Mode = off\n",
      comment: undefined,
      diagnostics: [warning(1)],
    });
  });
  it("does not duplicate an attached mixed-block syntax error with a detached warning", () => {
    expect(
      read("## Docs.\n# Ordinary.\nenum Mode = off").diagnostics.map(({ code }) => code),
    ).toEqual(["syntax-error"]);
  });
});
