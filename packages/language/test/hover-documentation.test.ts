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
  it("keeps a state's own documentation available while its enum is unresolved", () => {
    const text = "type Button {\n  ## @state mode Current mode.\n  state mode: Missing\n}";
    expect(at(text, "  state ^mode")?.comment).toBe("Current mode.");
  });

  it.each([
    ["state mode: ^Mode", "Modes 中文 😀."],
    ["has button: ^Button", "A control."],
    ["action turn-on: ^mode", "Interaction states.\n\nCurrent mode."],
    [
      "action turn-on: mode ^off -> on",
      "Modes 中文 😀.\n\nNo interaction.\nContinued description.",
    ],
    ["action turn-on: mode off -> ^on", "Modes 中文 😀.\n\nActive."],
    ["state mode: Mode, ^other: Mode", "Interaction states.\n\nAlternate mode."],
    ["enum ^Mode", "Modes 中文 😀."],
    ["enum Mode = ^off | on", "Modes 中文 😀.\n\nNo interaction.\nContinued description."],
    ["type ^Button", "A control."],
  ])("shows the prose for the hovered declaration: %s", (marker, comment) => {
    expect(at(source, marker as string)?.comment).toBe(comment);
  });

  it.each(["\n", "\r\n", "\r"])("reads documentation consistently with %j", (newline) => {
    expect(
      at(`\ufeff${source.replaceAll("\n", newline)}`, "action turn-on: mode off -> ^on")?.comment,
    ).toBe("Modes 中文 😀.\n\nActive.");
  });

  it("keeps only the first matching description and does not expose invalid tags", () => {
    const text = source.replace(
      "## @value on Active.",
      "## @value on First.\n## @value on Second.\n## @state on Wrong kind.\n## @bogus on Unknown.",
    );
    expect(at(text, "action turn-on: mode off -> ^on")?.comment).toBe("Modes 中文 😀.\n\nFirst.");
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
