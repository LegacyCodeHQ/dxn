import { hover } from "@language/editor/hover.js";
import { format } from "@language/syntax/format.js";
import { describe, expect, it } from "vitest";

function comment(source: string, marker: string) {
  const lines = source.split(/\r\n|\r|\n/);
  const text = marker.replace("^", "");
  const row = lines.findIndex((line) => line.includes(text));
  if (row < 0) throw new Error(`Missing marker ${marker}`);
  return hover(source, row + 1, (lines[row]?.indexOf(text) ?? 0) + marker.indexOf("^") + 1)
    ?.comment;
}
const file = (docs: string, declaration = "state mode: Mode") =>
  `enum Mode = off | on\ntype Button {\n${docs}\n  ${declaration}\n  action enable: mode off -> on\n}\n`;

const cases = [
  {
    title: "plain prose",
    source: file("  ## Whether input is accepted."),
    expected: "Whether input is accepted.",
  },
  {
    title: "explicit tag takes precedence",
    source: file("  ## General prose.\n  ## @state mode Specific text."),
    expected: "Specific text.",
  },
  {
    title: "an explicitly empty tag takes precedence",
    source: file("  ## General prose.\n  ## @state mode"),
    expected: undefined,
  },
  {
    title: "the first duplicate, even if empty, takes precedence",
    source: file("  ## General prose.\n  ## @state mode\n  ## @state mode Later."),
    expected: undefined,
  },
  {
    title: "multi-state prose stays group prose",
    source: file("  ## Group description.", "state mode: Mode, other: Mode"),
    expected: undefined,
  },
  {
    title: "multi-state tags stay specific",
    source: file(
      "  ## Group description.\n  ## @state mode Specific text.",
      "state mode: Mode, other: Mode",
    ),
    expected: "Specific text.",
  },
  { title: "detached prose", source: file("  ## Detached.\n"), expected: undefined },
  { title: "ordinary comments", source: file("  # Ordinary."), expected: undefined },
  {
    title: "fixed state",
    source: file("  ## Current mode.", "state mode: Mode = off"),
    expected: "Current mode.",
  },
  {
    title: "missing enum",
    source: file("  ## Current mode.", "state mode: Missing"),
    expected: "Current mode.",
  },
  {
    title: "multiple separate single-state declarations",
    source: file("  ## Current mode.", "state mode: Mode\n  ## Another mode.\n  state other: Mode"),
    expected: "Current mode.",
  },
];

describe("single-state documentation prose", () => {
  it.each(cases)(
    "applies the rule at declarations and code uses: $title",
    ({ source, expected }) => {
      expect({
        declared: comment(source, "state ^mode:"),
        used: comment(source, "action enable: ^mode"),
      }).toEqual({ declared: expected, used: expected });
    },
  );
  it.each(cases.filter(({ title }) => title !== "missing enum"))(
    "formatting preserves the interpretation: $title",
    ({ source, expected }) => {
      const formatted = format(source);
      if (formatted === undefined) throw new Error("Valid source must format");
      expect(comment(formatted, "state ^mode:")).toBe(expected);
    },
  );
  it("changes prose scope when a second state is added and restores it when removed", () => {
    const single = file("  ## Current mode.");
    const group = single.replace("state mode: Mode", "state mode: Mode, other: Mode");
    expect({
      single: comment(single, "state ^mode:"),
      group: comment(group, "state ^mode:"),
      other: comment(group, "^other: Mode"),
      restored: comment(group.replace(", other: Mode", ""), "state ^mode:"),
    }).toEqual({
      single: "Current mode.",
      group: undefined,
      other: undefined,
      restored: "Current mode.",
    });
  });
  it("uses the nested declaration's own prose", () => {
    const text =
      "enum Mode = off\ntype Outer {\n  ## Outer mode.\n  state mode: Mode\n  type Inner {\n    ## Inner mode.\n    state mode: Mode\n  }\n}\n";
    expect(comment(text, "    state ^mode:")).toBe("Inner mode.");
  });
});
