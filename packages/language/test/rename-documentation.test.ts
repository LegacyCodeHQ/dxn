import { renameAt, renameable } from "@language/editor/rename-at.js";
import { parse } from "@language/syntax/parse.js";
import { describe, expect, it } from "vitest";

const source = `## @value focused Global focused.
enum GlobalFocus = blurred | focused
type Other { state focus: GlobalFocus = focused }
type Button {
  ## Local focus values.
  ## @value focused Local focused.
  ## @value focused Duplicate focused.
  enum Focus = blurred | focused
  ## @state focus Current focus.
  ## @state secondary Other focus.
  state focus: Focus, secondary: Focus
  action take-focus: focus blurred -> focused
  # focused stays ordinary.
  ## @value focused Detached focused.

}
`;
const at = (text: string, marker: string): [number, number] => {
  const column = marker.indexOf("^");
  const content = marker.replace("^", "");
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const line = lines.indexOf(content);
  if (line < 0) throw new Error(`Missing marker: ${marker}`);
  return [line + 1, column + 1];
};
const renamed = (text: string, marker: string, to: string) => {
  const result = renameAt(text, ...at(text, marker), to);
  if ("refusal" in result) throw new Error(result.refusal);
  return {
    source: result.source,
    errors: parse(result.source).diagnostics.filter(({ severity }) => severity === "error"),
  };
};

describe("renaming documented members", () => {
  it.each([
    "  enum Focus = blurred | ^focused",
    "  ## @value ^focused Local focused.",
    "  ## @value ^focused Duplicate focused.",
    "  action take-focus: focus blurred -> ^focused",
  ])("renames the local enum value and every attached tag from %s", (marker) => {
    expect(renamed(source, marker, "active")).toEqual({
      source: `## @value focused Global focused.
enum GlobalFocus = blurred | focused
type Other { state focus: GlobalFocus = focused }
type Button {
  ## Local focus values.
  ## @value active Local focused.
  ## @value active Duplicate focused.
  enum Focus = blurred | active
  ## @state focus Current focus.
  ## @state secondary Other focus.
  state focus: Focus, secondary: Focus
  action take-focus: focus blurred -> active
  # focused stays ordinary.
  ## @value focused Detached focused.

}
`,
      errors: [],
    });
  });
  it.each(["  state ^focus: Focus, secondary: Focus", "  ## @state ^focus Current focus."])(
    "renames a state and only its matching documentation target from %s",
    (marker) => {
      expect(renamed(source, marker, "primary")).toEqual({
        source: source
          .replace("@state focus Current", "@state primary Current")
          .replace("  state focus:", "  state primary:")
          .replace("take-focus: focus blurred", "take-focus: primary blurred"),
        errors: [],
      });
    },
  );
  it.each(["\n", "\r\n", "\r"])("preserves BOM and %j line endings", (newline) => {
    const text =
      `\uFEFF## @value on Enabled 😀.\nenum Mode = off | on\ntype Button { state mode: Mode = on }\n`.replaceAll(
        "\n",
        newline,
      );
    expect(renamed(text, "enum Mode = off | ^on", "active")).toEqual({
      source:
        `\uFEFF## @value active Enabled 😀.\nenum Mode = off | active\ntype Button { state mode: Mode = active }\n`.replaceAll(
          "\n",
          newline,
        ),
      errors: [],
    });
  });
  it.each([
    "  # ^focused stays ordinary.",
    "  ## @value ^focused Detached focused.",
    "  ## @value focused Local ^focused.",
  ])("does not treat ordinary, detached or prose text as a rename target: %s", (marker) => {
    expect(renameable(source, ...at(source, marker))).toEqual({
      refusal: "there is no name here to rename",
    });
  });
  it("prepares a rename from a documentation target", () => {
    expect(renameable(source, ...at(source, "  ## @value ^focused Local focused."))).toEqual({
      name: "focused",
      from: { line: 6, column: 13, length: 7 },
    });
  });
});
