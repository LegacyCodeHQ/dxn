import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { problems } from "./support/language.js";

const dimensions = `dimension Breakpoint = base | sm | lg | xl
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
`;
const device = `${dimensions}environment Device = Breakpoint x Pointer x Keyboard\n`;
// A one-dimension environment, so each problem below stands alone.
const pointing = `${dimensions}environment Device = Pointer\n`;

describe("environment", () => {
  it("is a product of dimensions, written with x", () => {
    const parts = (source: string) =>
      parse(source).environments.map(({ name, dimensions }) => [
        name,
        dimensions.map(({ name }) => name),
      ]);
    expect([
      parse(device).diagnostics,
      parts(device),
      parts(`${dimensions}environment Device = Breakpoint x Pointer x\n  Keyboard\n`),
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
      problems(`${dimensions}environment Device = Pointer x Pointer\n`),
    ]).toEqual([
      ['4:13: environment-name: environment names start with a capital letter: "device"'],
      ["4:22: unknown-dimension: Pointr is not a dimension; did you mean Pointer?"],
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
      ['4:30: syntax-error: expected "x" or the end of the line after "Pointer", found "Keyboard"'],
    ]);
  });

  it("is written with x only, which needs spaces around it", () => {
    expect([
      problems(`${dimensions}environment Device = Breakpoint × Pointer\n`),
      problems(`${dimensions}environment Device = Breakpoint * Pointer\n`),
      problems(`${dimensions}environment Device = BreakpointxPointer\n`),
    ]).toEqual([
      ['4:33: syntax-error: expected "x" or the end of the line after "Breakpoint", found "×"'],
      ['4:33: syntax-error: expected "x" or the end of the line after "Breakpoint", found "*"'],
      [
        "4:22: unknown-dimension: BreakpointxPointer is not a dimension (Breakpoint, Pointer, Keyboard)",
      ],
    ]);
  });

  it("leaves x an ordinary value outside environments", () => {
    const source = "enum Axis = x | y\ndimension Corner = x | y\n";
    expect([problems(source), parse(source).enums[0]?.values.map(({ name }) => name)]).toEqual([
      [],
      ["x", "y"],
    ]);
  });
});

describe("profile", () => {
  it("is an instance of an environment: one value for each of its dimensions", () => {
    const { profiles, diagnostics } = parse(`${device}profile Phone: Device {
  Breakpoint = base
  Pointer = touch
  Keyboard = no-keyboard
}
profile Laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
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
        "Phone",
        "Device",
        [
          ["Breakpoint", "base"],
          ["Pointer", "touch"],
          ["Keyboard", "no-keyboard"],
        ],
      ],
      [
        "Laptop",
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

  it("has a capitalized name, as records, enums and types do, declared once in the file", () => {
    const phone = "profile Phone: Device { Pointer = touch }\n";
    expect([
      problems(`${pointing}${phone.replace("Phone", "phone")}`),
      problems(`${pointing}${phone.replace("Phone", "Tablet-portrait")}`),
      problems(`${pointing}${phone}${phone}`),
    ]).toEqual([
      ['5:9: profile-name: profile names start with a capital letter: "phone"'],
      ['5:9: profile-name: profile names are letters and digits: "Tablet-portrait"'],
      ["6:9: duplicate-name: Phone is already declared at line 5"],
    ]);
  });

  it("names a declared environment", () => {
    expect([
      problems(`${pointing}profile Phone: Devce { Pointer = touch }\n`),
      problems(`${pointing}profile Phone: Pointer { Pointer = touch }\n`),
      problems(`${pointing}type Wordmark {}\nprofile Phone: Wordmark { Pointer = touch }\n`),
    ]).toEqual([
      ["5:16: unknown-environment: Devce is not an environment; did you mean Device?"],
      ["5:16: unknown-environment: Pointer is a dimension, not an environment"],
      ["6:16: unknown-environment: Wordmark is a type, not an environment"],
    ]);
  });

  it("gives its environment's dimensions, each once, with their values", () => {
    expect([
      problems(`${pointing}profile Phone: Device { Pointr = touch }\n`),
      problems(`${pointing}profile Phone: Device { Pointer = tuch }\n`),
      problems(`${pointing}profile Phone: Device { Pointer = touch, Pointer = mouse }\n`),
      problems(`${device}profile Laptop: Device { Pointer = mouse }\n`),
    ]).toEqual([
      [
        "5:9: incomplete-profile: Phone does not give Pointer, which Device requires",
        "5:25: unknown-dimension: Pointr is not a dimension of Device (Pointer)",
      ],
      ['5:35: unknown-value: "tuch" is not a value of Pointer (mouse, touch)'],
      ["5:42: duplicate-dimension: Pointer is already given in Phone"],
      ["5:9: incomplete-profile: Laptop does not give Breakpoint, Keyboard, which Device requires"],
    ]);
  });

  it("shares one environment with every other profile, and may share a combination", () => {
    expect([
      problems(
        `${pointing}environment Input = Keyboard\nprofile Phone: Device { Pointer = touch }\nprofile Desk: Input { Keyboard = keyboard }\n`,
      ),
      problems(
        `${pointing}profile Phone: Device { Pointer = touch }\nprofile Tablet: Device { Pointer = touch }\n`,
      ),
      problems(
        `${pointing}profile Phone: Nowhere { Pointer = touch }\nprofile Tablet: Device { Pointer = touch }\n`,
      ),
    ]).toEqual([
      [
        "7:9: mixed-profiles: Desk is an Input, but Phone is a Device; all profiles share one environment",
      ],
      [],
      ["5:16: unknown-environment: Nowhere is not an environment (Device)"],
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems(`${pointing}profile Phone Device { Pointer = touch }\n`),
      problems(`${pointing}profile Phone: Device { Pointer touch }\n`),
      problems(`${pointing}profile Phone: Device { Pointer = touch\n`),
    ]).toEqual([
      ['5:15: syntax-error: expected ":" after "Phone", found "Device"'],
      ['5:33: syntax-error: expected "=" after "Pointer", found "touch"'],
      ['6:1: syntax-error: expected "}" to close Phone, found the end of the file'],
    ]);
  });
});
