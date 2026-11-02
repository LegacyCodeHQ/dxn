import { describe, expect, it } from "vitest";
import { inPlace, states } from "../src/evaluate.js";
import { parse } from "../src/parse.js";
import { renameInSource } from "../src/rename.js";
import { validate } from "../src/validate.js";
import { errors, problems } from "./support/language.js";

const button = (...rules: string[]) => `dimension Pointer = mouse | touch
enum Enabled = enabled | disabled
enum Hover = rest | hovered
enum Focus = blurred | focused

type Button needs Pointer {
  state enabled: Enabled
  state hover: Hover, focus: Focus
${rules.map((rule) => `  ${rule}\n`).join("")}}
`;
const disabled = button("hover = hovered only when Pointer = mouse and enabled = enabled");

describe("a rule on another state of its type", () => {
  it("names the state, as a condition names a dimension", () => {
    expect(problems(disabled)).toEqual([]);
  });

  it("gives a row for each value of a state another depends on", () => {
    expect(
      states(parse(disabled), "Button").rows.map(({ when, states: own }) => [
        when.Pointer,
        own.enabled,
        own.hover,
      ]),
    ).toEqual([
      ["mouse", ["enabled"], ["rest", "hovered"]],
      ["mouse", ["disabled"], ["rest"]],
      ["touch", ["enabled"], ["rest"]],
      ["touch", ["disabled"], ["rest"]],
    ]);
  });

  it("depends through other states, as long as no state depends on itself", () => {
    const chained = button(
      "hover = hovered only when focus = blurred",
      "focus = focused only when enabled = enabled",
    );
    expect([
      problems(chained),
      states(parse(chained), "Button").rows.map(({ when, states: own }) => [
        when.Pointer,
        ...[own.enabled, own.focus, own.hover].map((values) => values?.join("|")),
      ]),
    ]).toEqual([
      [],
      [
        ["mouse", "enabled", "blurred", "rest|hovered"],
        ["mouse", "enabled", "focused", "rest"],
        ["mouse", "disabled", "blurred", "rest|hovered"],
        ["touch", "enabled", "blurred", "rest|hovered"],
        ["touch", "enabled", "focused", "rest"],
        ["touch", "disabled", "blurred", "rest|hovered"],
      ],
    ]);
  });

  it("refuses a state that depends on itself, directly or through others", () => {
    expect([
      errors(
        button(
          "hover = hovered only when Pointer = mouse and focus = blurred",
          "focus = focused only when hover = rest",
        ),
      ),
      errors(button("hover = hovered only when hover = rest")),
      errors(button("hover = hovered only when enabld = enabled")),
    ]).toEqual([
      [
        "10:29: rule-cycle: `focus` depends on `hover`, which depends on `focus`; no state can depend on itself",
      ],
      ["9:29: rule-cycle: `hover` depends on `hover`; no state can depend on itself"],
      ["9:29: unknown-state: `enabld` is not a state of `Button`; did you mean `enabled`?"],
    ]);
  });

  it("splits the rows in place, where a parent binds the state it depends on", () => {
    const menu = `dimension Pointer = mouse | touch
enum Hover = rest | hovered
type Menu {
  enum State = closed | open
  state menu: State
  type Toggle needs Pointer {
    state expanded: State
    state hover: Hover
    hover = hovered only when Pointer = mouse and expanded = closed
  }
  has toggle: Toggle { expanded = menu }
}
type Page {
  has menu: Menu
}
`;
    expect(
      inPlace(parse(menu), "Page.menu.toggle").rows.map(({ when, parents, states: own }) => [
        when.Pointer,
        parents["menu.menu"],
        own.hover,
      ]),
    ).toEqual([
      ["mouse", "closed", ["rest", "hovered"]],
      ["mouse", "open", ["rest"]],
      ["touch", "closed", ["rest"]],
      ["touch", "open", ["rest"]],
    ]);
  });

  it("checks a stored context against the row its states are in", () => {
    const stored = `${disabled}record Evidence {}\n
actor EvidenceRecorder records Evidence`;
    const context = (enabled: string, hover: string) =>
      JSON.stringify([
        {
          actor: "EvidenceRecorder",
          context: {
            type: "Button",
            dimensions: { Pointer: "mouse" },
            states: { enabled, hover, focus: "blurred" },
          },
        },
      ]);
    expect([
      validate(parse(stored), "Evidence", context("enabled", "hovered")),
      validate(parse(stored), "Evidence", context("disabled", "hovered")).map(
        ({ message }) => message,
      ),
    ]).toEqual([[], ["`hovered` is not a value of `hover` on `Pointer mouse` (`rest`)"]]);
  });

  it("is renamed with the values it names", () => {
    expect(renameInSource(parse(disabled), disabled, "Enabled", "enabled", "on")).toBe(
      disabled
        .replace("enabled | disabled", "on | disabled")
        .replace("enabled = enabled", "enabled = on"),
    );
  });
});
