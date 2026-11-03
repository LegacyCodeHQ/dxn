import { states } from "@language/evaluation/evaluate.js";
import { validate } from "@language/evidence/validate.js";
import { parse } from "@language/syntax/parse.js";
import { describe, expect, it } from "vitest";
import { problems } from "./support/language.js";

const device = `dimension Breakpoint = base | sm | lg
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
environment Device = Breakpoint x Pointer x Keyboard
profile Phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile TabletPortrait: Device { Breakpoint = sm, Pointer = touch, Keyboard = no-keyboard }
profile TabletLandscape: Device { Breakpoint = lg, Pointer = touch, Keyboard = no-keyboard }
profile Laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
`;
const Magic = `${device}modifier MagicKeyboard on TabletPortrait, TabletLandscape {
  Pointer = mouse, Keyboard = keyboard
}
`;
const wordmark = `enum Hover = rest | hovered
type Wordmark needs Pointer {
  state hover: Hover
  hover = hovered only when Pointer = mouse
}
`;

describe("modifier", () => {
  it("declares an accessory: the profiles it fits, and the values it sets on them", () => {
    const { modifiers } = parse(Magic);
    expect([
      problems(Magic),
      modifiers.map(({ name, on, values }) => [
        name,
        on.map(({ name }) => name),
        values.map(({ dimension, value }) => [dimension.name, value.name]),
      ]),
    ]).toEqual([
      [],
      [
        [
          "MagicKeyboard",
          ["TabletPortrait", "TabletLandscape"],
          [
            ["Pointer", "mouse"],
            ["Keyboard", "keyboard"],
          ],
        ],
      ],
    ]);
  });

  it("makes a profile <profile>+<modifier> for each profile it is on", () => {
    expect(
      states(parse(wordmark + Magic), "Wordmark").rows.map(({ profiles, when, states }) => [
        profiles,
        when.Pointer,
        states.hover,
      ]),
    ).toEqual([
      [["Phone"], "touch", ["rest"]],
      [["TabletPortrait"], "touch", ["rest"]],
      [["TabletLandscape"], "touch", ["rest"]],
      [["Laptop", "TabletLandscape+MagicKeyboard"], "mouse", ["rest", "hovered"]],
      [["TabletPortrait+MagicKeyboard"], "mouse", ["rest", "hovered"]],
    ]);
  });

  it("can be named in a context, as the profile it makes", () => {
    const schema = parse(`${wordmark}${Magic}record Evidence {}\n
actor EvidenceRecorder records Evidence`);
    const context = (profile: string, hover: string) =>
      JSON.stringify([
        {
          actor: "EvidenceRecorder",
          context: { type: "Wordmark", profile, dimensions: {}, states: { hover } },
        },
      ]);
    expect([
      validate(schema, "Evidence", context("TabletPortrait+MagicKeyboard", "hovered")),
      validate(schema, "Evidence", context("Phone+MagicKeyboard", "rest")).map(
        ({ message }) => message,
      ),
    ]).toEqual([
      [],
      [
        "`Phone+MagicKeyboard` is not a profile (`Phone`, `TabletPortrait`, `TabletLandscape`, `Laptop`, `TabletPortrait+MagicKeyboard`, `TabletLandscape+MagicKeyboard`)",
      ],
    ]);
  });

  it("lets a context name either of two profiles with the same values", () => {
    const schema = parse(`${wordmark}${Magic}record Evidence {}\n
actor EvidenceRecorder records Evidence`);
    const context = (profile: string) =>
      JSON.stringify([
        {
          actor: "EvidenceRecorder",
          context: { type: "Wordmark", profile, dimensions: {}, states: { hover: "hovered" } },
        },
      ]);
    expect([
      validate(schema, "Evidence", context("Laptop")),
      validate(schema, "Evidence", context("TabletLandscape+MagicKeyboard")),
    ]).toEqual([[], []]);
  });

  it("has a capitalized name, declared once, on profiles that exist, each once", () => {
    expect([
      problems(`${device}modifier magic on Phone {\n  Keyboard = keyboard\n}\n`),
      problems(`${device}modifier Laptop on Phone {\n  Keyboard = keyboard\n}\n`),
      problems(`${device}modifier Magic on Tablet {\n  Keyboard = keyboard\n}\n`),
      problems(`${device}modifier Magic on Phone, Phone {\n  Keyboard = keyboard\n}\n`),
    ]).toEqual([
      ["9:10: modifier-name: modifier names start with a capital letter: `magic`"],
      ["9:10: duplicate-name: `Laptop` is already declared at line 8"],
      [
        "9:19: unknown-profile: `Tablet` is not a profile (`Phone`, `TabletPortrait`, `TabletLandscape`, `Laptop`)",
      ],
      ["9:26: duplicate-profile: `Phone` is already listed in `Magic`"],
    ]);
  });

  it("sets dimensions of the profiles' environment, each once, with one of their values", () => {
    const set = (values: string) =>
      problems(`${device}modifier Magic on Phone {\n  ${values}\n}\n`);
    expect([
      set("Theme = dark"),
      set("Keyboard = keyboard, Keyboard = keyboard"),
      set("Keyboard = yes"),
    ]).toEqual([
      [
        "10:3: unknown-dimension: `Theme` is not a dimension of `Device` (`Breakpoint`, `Pointer`, `Keyboard`)",
      ],
      ["10:24: duplicate-dimension: `Keyboard` is already set by `Magic`"],
      ["10:14: unknown-value: `yes` is not a value of `Keyboard` (`keyboard`, `no-keyboard`)"],
    ]);
  });

  it("is checked against the environment, even when the first profile's is misspelled", () => {
    const source = Magic.replace("profile Phone: Device", "profile Phone: Devise").replace(
      "  Pointer = mouse, Keyboard = keyboard\n}",
      "  Pointer = mouse, Colour = red\n}",
    );
    expect(problems(source).map((problem) => problem.split(": ").slice(1).join(": "))).toEqual([
      "unknown-environment: `Devise` is not an environment; did you mean `Device`?",
      "unknown-dimension: `Colour` is not a dimension of `Device` (`Breakpoint`, `Pointer`, `Keyboard`)",
    ]);
  });

  it("warns when it changes nothing on a profile it is on: that profile already exists", () => {
    expect(
      problems(`${device}modifier Magic on Laptop, Phone {\n  Keyboard = keyboard\n}\n`),
    ).toEqual([
      "9:19: warning: unchanged-profile: `Magic` changes nothing on `Laptop`, which already has `Keyboard = keyboard`",
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems(`${device}modifier Magic Phone {\n  Keyboard = keyboard\n}\n`),
      problems(`${device}modifier Magic on Phone TabletPortrait {\n  Keyboard = keyboard\n}\n`),
    ]).toEqual([
      ["9:16: syntax-error: expected `on` after `Magic`, found `Phone`"],
      ["9:25: syntax-error: expected `,` or `{` after `Phone`, found `TabletPortrait`"],
    ]);
  });
});
