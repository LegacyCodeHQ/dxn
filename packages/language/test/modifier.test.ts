import { describe, expect, it } from "vitest";
import { states } from "../src/evaluate.js";
import { parse } from "../src/parse.js";
import { validate } from "../src/validate.js";
import { problems } from "./support/language.js";

const device = `dimension Breakpoint = base | sm | lg
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
environment Device = Breakpoint x Pointer x Keyboard
profile phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile tablet-portrait: Device { Breakpoint = sm, Pointer = touch, Keyboard = no-keyboard }
profile tablet-landscape: Device { Breakpoint = lg, Pointer = touch, Keyboard = no-keyboard }
profile laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
`;
const magic = `${device}modifier magic-keyboard on tablet-portrait, tablet-landscape {
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
    const { modifiers } = parse(magic);
    expect([
      problems(magic),
      modifiers.map(({ name, on, values }) => [
        name,
        on.map(({ name }) => name),
        values.map(({ dimension, value }) => [dimension.name, value.name]),
      ]),
    ]).toEqual([
      [],
      [
        [
          "magic-keyboard",
          ["tablet-portrait", "tablet-landscape"],
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
      states(parse(wordmark + magic), "Wordmark").rows.map(({ profiles, when, states }) => [
        profiles,
        when.Pointer,
        states.hover,
      ]),
    ).toEqual([
      [["phone"], "touch", ["rest"]],
      [["tablet-portrait"], "touch", ["rest"]],
      [["tablet-landscape"], "touch", ["rest"]],
      [["laptop", "tablet-landscape+magic-keyboard"], "mouse", ["rest", "hovered"]],
      [["tablet-portrait+magic-keyboard"], "mouse", ["rest", "hovered"]],
    ]);
  });

  it("can be named in a context, as the profile it makes", () => {
    const schema = parse(`${wordmark}${magic}record Evidence with context {}\n`);
    const context = (profile: string, hover: string) =>
      JSON.stringify([
        { context: { type: "Wordmark", profile, dimensions: {}, states: { hover } } },
      ]);
    expect([
      validate(schema, "Evidence", context("tablet-portrait+magic-keyboard", "hovered")),
      validate(schema, "Evidence", context("phone+magic-keyboard", "rest")).map(
        ({ message }) => message,
      ),
    ]).toEqual([
      [],
      [
        '"phone+magic-keyboard" is not a profile (phone, tablet-portrait, tablet-landscape, laptop, tablet-portrait+magic-keyboard, tablet-landscape+magic-keyboard)',
      ],
    ]);
  });

  it("lets a context name either of two profiles with the same values", () => {
    const schema = parse(`${wordmark}${magic}record Evidence with context {}\n`);
    const context = (profile: string) =>
      JSON.stringify([
        { context: { type: "Wordmark", profile, dimensions: {}, states: { hover: "hovered" } } },
      ]);
    expect([
      validate(schema, "Evidence", context("laptop")),
      validate(schema, "Evidence", context("tablet-landscape+magic-keyboard")),
    ]).toEqual([[], []]);
  });

  it("has a lowercase name, declared once, on profiles that exist, each once", () => {
    expect([
      problems(`${device}modifier Magic on phone {\n  Keyboard = keyboard\n}\n`),
      problems(`${device}modifier laptop on phone {\n  Keyboard = keyboard\n}\n`),
      problems(`${device}modifier magic on tablet {\n  Keyboard = keyboard\n}\n`),
      problems(`${device}modifier magic on phone, phone {\n  Keyboard = keyboard\n}\n`),
    ]).toEqual([
      ['9:10: modifier-name: modifier names start with a lowercase letter: "Magic"'],
      ["9:10: duplicate-name: laptop is already declared at line 8"],
      [
        "9:19: unknown-profile: tablet is not a profile (phone, tablet-portrait, tablet-landscape, laptop)",
      ],
      ["9:26: duplicate-profile: phone is already listed in magic"],
    ]);
  });

  it("sets dimensions of the profiles' environment, each once, with one of their values", () => {
    const set = (values: string) =>
      problems(`${device}modifier magic on phone {\n  ${values}\n}\n`);
    expect([
      set("Theme = dark"),
      set("Keyboard = keyboard, Keyboard = keyboard"),
      set("Keyboard = yes"),
    ]).toEqual([
      [
        "10:3: unknown-dimension: Theme is not a dimension of Device (Breakpoint, Pointer, Keyboard)",
      ],
      ["10:24: duplicate-dimension: Keyboard is already set by magic"],
      ['10:14: unknown-value: "yes" is not a value of Keyboard (keyboard, no-keyboard)'],
    ]);
  });

  it("is checked against the environment, even when the first profile's is misspelled", () => {
    const source = magic
      .replace("profile phone: Device", "profile phone: Devise")
      .replace("  Pointer = mouse, Keyboard = keyboard\n}", "  Pointer = mouse, Colour = red\n}");
    expect(problems(source).map((problem) => problem.split(": ").slice(1).join(": "))).toEqual([
      "unknown-environment: Devise is not an environment (Device)",
      "unknown-dimension: Colour is not a dimension of Device (Breakpoint, Pointer, Keyboard)",
    ]);
  });

  it("warns when it changes nothing on a profile it is on: that profile already exists", () => {
    expect(
      problems(`${device}modifier magic on laptop, phone {\n  Keyboard = keyboard\n}\n`),
    ).toEqual([
      "9:19: warning: unchanged-profile: magic changes nothing on laptop, which already has Keyboard = keyboard",
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems(`${device}modifier magic phone {\n  Keyboard = keyboard\n}\n`),
      problems(`${device}modifier magic on phone tablet-portrait {\n  Keyboard = keyboard\n}\n`),
    ]).toEqual([
      ['9:16: syntax-error: expected "on" after "magic", found "phone"'],
      ['9:25: syntax-error: expected "," or "{" after "phone", found "tablet-portrait"'],
    ]);
  });
});
