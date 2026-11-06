import { parse } from "@language/syntax/parse.js";
import { parseTreeSitter } from "@language/syntax/parse-tree-sitter.js";
import { describe, expect, it } from "vitest";

const source = (docs: string, fields = "mode: Mode, other: Mode") =>
  `enum Mode = off | on\ntype Button {\n${docs}\n  state ${fields}\n}`;
const warnings = (text: string, parser = parse) =>
  parser(text).diagnostics.filter(({ code }) => code === "missing-state-documentation");
const missing = (name: string, line: number, column: number) => ({
  severity: "warning",
  code: "missing-state-documentation",
  line,
  column,
  message: `state \`${name}\` has no documentation; this declaration documents other states`,
});

describe("partially documented state declarations", () => {
  it.each([parse, parseTreeSitter])(
    "warns on the undocumented state with either parser: %j",
    (parser) => {
      expect(warnings(source("  ## @state mode Current mode."), parser)).toEqual([
        missing("other", 4, 21),
      ]);
    },
  );
  it("warns once for each missing sibling, including the first state", () => {
    expect(
      warnings(source("  ## @state other Other mode.", "mode: Mode, other: Mode, third: Mode")),
    ).toEqual([missing("mode", 4, 9), missing("third", 4, 34)]);
  });
  it.each(["  ## @state mode", "  ## @state mode First.\n  ## @state mode Duplicate."])(
    "counts explicit empty and duplicate tags as documentation: %s",
    (docs) => {
      const line = docs.split("\n").length + 3;
      expect(warnings(source(docs))).toEqual([missing("other", line, 21)]);
    },
  );
  it.each([
    "  ## Group prose.",
    "  # Ordinary comment.",
    "",
    "  ## @state mode Mode.\n  ## @state other Other.",
    "  ## @state missing Unknown target.",
    "  ## @value mode Wrong kind.",
    "  ## @bogus mode Unknown tag.",
  ])("keeps documentation optional and ignores invalid-only tags: %s", (docs) => {
    expect(warnings(source(docs))).toEqual([]);
  });
  it("does not cross separate declarations or nested scopes", () => {
    const text =
      "enum Mode = off\ntype Outer {\n  ## @state mode Current.\n  state mode: Mode\n  state other: Mode\n  type Inner {\n    state mode: Mode, other: Mode\n  }\n}";
    expect(warnings(text)).toEqual([]);
  });
  it("adds and removes the warning as a group is documented", () => {
    const single = source("  ## @state mode Current.", "mode: Mode");
    const group = single.replace("state mode: Mode", "state mode: Mode, other: Mode");
    const complete = group.replace("  state", "  ## @state other Other.\n  state");
    expect({
      single: warnings(single),
      group: warnings(group),
      complete: warnings(complete),
    }).toEqual({ single: [], group: [missing("other", 4, 21)], complete: [] });
  });
});
