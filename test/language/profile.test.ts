import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";
import { problems } from "../support/language.js";

const dimensions = `dimension Breakpoint = base | sm | lg | xl
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
`;
const device = `${dimensions}environment Device = Breakpoint × Pointer × Keyboard\n`;
// A one-dimension environment, so each problem below stands alone.
const pointing = `${dimensions}environment Device = Pointer\n`;

describe("environment", () => {
  it("is a product of dimensions, written with × or *", () => {
    const parts = (source: string) =>
      parse(source).environments.map(({ name, dimensions }) => [
        name,
        dimensions.map(({ name }) => name),
      ]);
    expect([
      parse(device).diagnostics,
      parts(device),
      parts(`${dimensions}environment Device = Breakpoint * Pointer *\n  Keyboard\n`),
    ]).toEqual([
      [],
      [["Device", ["Breakpoint", "Pointer", "Keyboard"]]],
      [["Device", ["Breakpoint", "Pointer", "Keyboard"]]],
    ]);
  });

  it("has a capitalized name, and declared dimensions, each once", () => {
    expect([
      problems(`${dimensions}environment device = Pointer\n`),
      problems(`${dimensions}environment Device = Pointr\n`),
      problems(`${dimensions}enum Hover = rest | hovered\nenvironment Device = Hover\n`),
      problems(`${dimensions}environment Device = Pointer × Pointer\n`),
    ]).toEqual([
      ['4:13: environment-name: environment names start with a capital letter: "device"'],
      ["4:22: unknown-dimension: Pointr is not a dimension (Breakpoint, Pointer, Keyboard)"],
      ["5:22: unknown-dimension: Hover is an enum, not a dimension"],
      ["4:32: duplicate-dimension: Pointer is already part of Device"],
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems(`${dimensions}environment Device Pointer\n`),
      problems(`${dimensions}environment Device = Pointer Keyboard\n`),
    ]).toEqual([
      ['4:20: syntax-error: expected "=" after the environment name, found "Pointer"'],
      ['4:30: syntax-error: expected "×" or the end of the line after "Pointer", found "Keyboard"'],
    ]);
  });
});

describe("profile", () => {
  it("is an instance of an environment: one value for each of its dimensions", () => {
    const { profiles, diagnostics } = parse(`${device}profile phone: Device {
  Breakpoint = base
  Pointer = touch
  Keyboard = no-keyboard
}
profile laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
`);
    expect(diagnostics).toEqual([]);
    expect(
      profiles.map(({ name, environment, values }) => [
        name,
        environment.name,
        values.map(({ dimension, value }) => [dimension.name, value.name]),
      ]),
    ).toEqual([
      [
        "phone",
        "Device",
        [
          ["Breakpoint", "base"],
          ["Pointer", "touch"],
          ["Keyboard", "no-keyboard"],
        ],
      ],
      [
        "laptop",
        "Device",
        [
          ["Breakpoint", "lg"],
          ["Pointer", "mouse"],
          ["Keyboard", "keyboard"],
        ],
      ],
    ]);
    expect([profiles[0]?.line, profiles[0]?.column, profiles[0]?.values[0]]).toEqual([
      5,
      9,
      {
        dimension: { name: "Breakpoint", line: 6, column: 3 },
        value: { name: "base", line: 6, column: 16 },
      },
    ]);
  });

  it("has a lowercase name, declared once in the file", () => {
    const phone = "profile phone: Device { Pointer = touch }\n";
    expect([
      problems(`${pointing}${phone.replace("phone", "Phone")}`),
      problems(`${pointing}${phone}${phone}`),
    ]).toEqual([
      ['5:9: profile-name: profile names start with a lowercase letter: "Phone"'],
      ["6:9: duplicate-name: phone is already declared at line 5"],
    ]);
  });

  it("names a declared environment", () => {
    expect([
      problems(`${pointing}profile phone: Devce { Pointer = touch }\n`),
      problems(`${pointing}profile phone: Pointer { Pointer = touch }\n`),
      problems(`${pointing}type Wordmark {}\nprofile phone: Wordmark { Pointer = touch }\n`),
    ]).toEqual([
      ["5:16: unknown-environment: Devce is not an environment (Device)"],
      ["5:16: unknown-environment: Pointer is a dimension, not an environment"],
      ["6:16: unknown-environment: Wordmark is a type, not an environment"],
    ]);
  });

  it("gives its environment's dimensions, each once, with their values", () => {
    expect([
      problems(`${pointing}profile phone: Device { Pointr = touch }\n`),
      problems(`${pointing}profile phone: Device { Pointer = tuch }\n`),
      problems(`${pointing}profile phone: Device { Pointer = touch, Pointer = mouse }\n`),
      problems(`${device}profile laptop: Device { Pointer = mouse }\n`),
    ]).toEqual([
      [
        "5:9: incomplete-profile: phone does not give Pointer, which Device requires",
        "5:25: unknown-dimension: Pointr is not a dimension of Device (Pointer)",
      ],
      ['5:35: unknown-value: "tuch" is not a value of Pointer (mouse, touch)'],
      ["5:42: duplicate-dimension: Pointer is already given in phone"],
      ["5:9: incomplete-profile: laptop does not give Breakpoint, Keyboard, which Device requires"],
    ]);
  });

  it("shares one environment with every other profile, and may share a combination", () => {
    expect([
      problems(
        `${pointing}environment Input = Keyboard\nprofile phone: Device { Pointer = touch }\nprofile desk: Input { Keyboard = keyboard }\n`,
      ),
      problems(
        `${pointing}profile phone: Device { Pointer = touch }\nprofile tablet: Device { Pointer = touch }\n`,
      ),
    ]).toEqual([
      [
        "7:9: mixed-profiles: desk is an Input, but phone is a Device; all profiles share one environment",
      ],
      [],
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems(`${pointing}profile phone Device { Pointer = touch }\n`),
      problems(`${pointing}profile phone: Device { Pointer touch }\n`),
      problems(`${pointing}profile phone: Device { Pointer = touch\n`),
    ]).toEqual([
      ['5:15: syntax-error: expected ":" after "phone", found "Device"'],
      ['5:33: syntax-error: expected "=" after "Pointer", found "touch"'],
      ['6:1: syntax-error: expected "}" to close phone, found the end of the file'],
    ]);
  });
});
