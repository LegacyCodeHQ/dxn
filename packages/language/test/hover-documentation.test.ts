import { hover } from "@language/editor/hover.js";
import { describe, expect, it } from "vitest";

const source = `## Modes 中文 😀.
## @value off No interaction.
##   Continued description.
## @value on Active.
enum Mode = off | on
## A control.
type Button {
  ## Interaction states.
  ## @state mode Current mode.
  ## @state other Alternate mode.
  state mode: Mode, other: Mode
  action turn-on: mode off -> on
}
type App { has button: Button }
`;

function at(text: string, marker: string) {
  const offset = marker.indexOf("^");
  const content = marker.replace("^", "");
  const lines = text.split(/\r\n|\r|\n/);
  const index = lines.findIndex((line) => line.includes(content));
  if (index < 0) throw new Error(`Missing hover marker ${marker}`);
  return hover(text, index + 1, (lines[index]?.indexOf(content) ?? 0) + offset + 1);
}

describe("structured documentation hovers", () => {
  it.each([
    ["enum Mode = off | ^on", "text"],
    ["action turn-on: mode off -> ^on", "text"],
    ["state mode: ^Mode", "dxn"],
    ["state ^mode: Mode", "dxn"],
  ])("uses the correct code language for %s", (marker, language) => {
    expect(at(source, marker)?.language).toBe(language);
  });

  it.each([
    ["enum Mode = ^off | on", "Mode.off"],
    ["action turn-on: mode ^off -> on", "Mode.off"],
    ["state mode: Mode, ^other: Mode", "state Button.other: Mode"],
    ["action turn-on: ^mode", "state Button.mode: Mode"],
  ])("identifies only the hovered member: %s", (marker, code) => {
    expect(at(source, marker as string)?.code).toBe(code);
  });

  it.each([
    "## Parent only.\nenum Mode = off | on\ntype Button { state mode: Mode }",
    "## Parent.\n## @value off\nenum Mode = off | on\ntype Button { state mode: Mode }",
  ])("does not fall back to enum prose for an undocumented value: %s", (text) => {
    const found = at(text, "enum Mode = ^off | on");
    expect(found && { code: found.code, comment: found.comment }).toEqual({
      code: "Mode.off",
      comment: undefined,
    });
  });

  it("does not fall back to state-block or enum prose for an undocumented state", () => {
    const text =
      "## Enum prose.\nenum Mode = off | on\ntype Button {\n  ## State prose.\n  state mode: Mode\n}";
    const found = at(text, "state ^mode: Mode");
    expect(found && { code: found.code, comment: found.comment }).toEqual({
      code: "state Button.mode: Mode",
      comment: undefined,
    });
  });

  it("keeps a state's own documentation available while its enum is unresolved", () => {
    const text = "type Button {\n  ## @state mode Current mode.\n  state mode: Missing\n}";
    expect(at(text, "  state ^mode")?.comment).toBe("Current mode.");
  });

  it.each([
    ["state mode: ^Mode", "Modes 中文 😀."],
    ["has button: ^Button", "A control."],
    ["action turn-on: ^mode", "Current mode."],
    ["action turn-on: mode ^off -> on", "No interaction.\nContinued description."],
    ["action turn-on: mode off -> ^on", "Active."],
    ["state mode: Mode, ^other: Mode", "Alternate mode."],
    ["enum ^Mode", "Modes 中文 😀."],
    ["enum Mode = ^off | on", "No interaction.\nContinued description."],
    ["type ^Button", "A control."],
  ])("shows the prose for the hovered declaration: %s", (marker, comment) => {
    expect(at(source, marker as string)?.comment).toBe(comment);
  });

  it.each(["\n", "\r\n", "\r"])("reads documentation consistently with %j", (newline) => {
    expect(
      at(`\ufeff${source.replaceAll("\n", newline)}`, "action turn-on: mode off -> ^on")?.comment,
    ).toBe("Active.");
  });

  it("keeps only the first matching description and does not expose invalid tags", () => {
    const text = source.replace(
      "## @value on Active.",
      "## @value on First.\n## @value on Second.\n## @state on Wrong kind.\n## @bogus on Unknown.",
    );
    expect(at(text, "action turn-on: mode off -> ^on")?.comment).toBe("First.");
  });

  it("uses only the attached state declaration in a nested scope", () => {
    const text = `enum Mode = off | on
type Button {
  ## @state mode Outer.
  state mode: Mode
  type Inner {
    ## @state mode Inner.
    state mode: Mode
    action turn-on: mode off -> on
  }
}`;
    expect(at(text, "action turn-on: ^mode")?.comment).toBe("Inner.");
  });

  it.each([
    "# Ordinary comment.\nenum Mode = off | on\ntype Button { state mode: Mode }",
    "## Detached.\n\nenum Mode = off | on\ntype Button { state mode: Mode }",
    "## @value off\nenum Mode = off | on\ntype Button { state mode: Mode }",
  ])("does not promote ordinary, detached or empty documentation: %s", (text) => {
    expect(at(text, "state mode: ^Mode")?.comment).toBeUndefined();
  });
});
