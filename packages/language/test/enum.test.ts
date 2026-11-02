import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { problems } from "./support/language.js";

const wordmark = `enum Hover      = rest | hovered
enum Focus      = blurred | focused
enum Breakpoint = base | sm | lg | xl
enum Pointer    = mouse | touch
enum Keyboard   = keyboard | no-keyboard
enum Size       = 19px | 20px | 22px
enum Ring       = none | focus
enum Color      = primary | accent
`;

describe("enum", () => {
  it("declares a named, finite set of values", () => {
    const { enums, diagnostics } = parse(wordmark);
    expect(diagnostics).toEqual([]);
    expect(enums.map(({ name, values }) => [name, values.map(({ name }) => name)])).toEqual([
      ["Hover", ["rest", "hovered"]],
      ["Focus", ["blurred", "focused"]],
      ["Breakpoint", ["base", "sm", "lg", "xl"]],
      ["Pointer", ["mouse", "touch"]],
      ["Keyboard", ["keyboard", "no-keyboard"]],
      ["Size", ["19px", "20px", "22px"]],
      ["Ring", ["none", "focus"]],
      ["Color", ["primary", "accent"]],
    ]);
  });

  it("records where each name and value is, for diagnostics later", () => {
    const [hover] = parse(wordmark).enums;
    expect([hover?.line, hover?.column, hover?.values[1]]).toEqual([
      1,
      6,
      { name: "hovered", line: 1, column: 26 },
    ]);
  });

  it("continues onto the next line after a |, and allows blank lines", () => {
    const { enums, diagnostics } = parse("\nenum Breakpoint = base | sm |\n  lg | xl\n\n");
    expect([diagnostics, enums[0]?.values.map(({ name }) => name)]).toEqual([
      [],
      ["base", "sm", "lg", "xl"],
    ]);
  });

  it("can start a line with the |, and its first value with one", () => {
    const values = (source: string) => {
      const { enums, dimensions, diagnostics } = parse(source);
      return [diagnostics, [...enums, ...dimensions][0]?.values.map(({ name }) => name)];
    };
    expect([
      values("enum Size =\n  | xs\n  | sm\n  | md\n"),
      values("enum Size = xs | sm\n  | md\n"),
      values("enum Size = | xs | sm\n"),
      values("dimension Pointer =\n  | mouse\n  | touch\n"),
    ]).toEqual([
      [[], ["xs", "sm", "md"]],
      [[], ["xs", "sm", "md"]],
      [[], ["xs", "sm"]],
      [[], ["mouse", "touch"]],
    ]);
    expect([
      problems("enum Size =\n"),
      problems("enum Size = xs |\n  | sm\n"),
      problems("enum Size =\n  | xs\n  md\n"),
    ]).toEqual([
      ["1:12: syntax-error: expected a value after `=`, found the end of the line"],
      ["2:3: syntax-error: expected a value after `|`, found `|`"],
      [
        "3:3: syntax-error: expected `enum`, `dimension`, `type`, `environment`, `profile`, `modifier`, `record`, `actor` or `expect`, found `md`",
      ],
    ]);
  });

  it("allows comments and blank lines between the values of an enum over several lines", () => {
    const read = (source: string) => {
      const { enums, types } = parse(source);
      const [declared] = [...enums, ...types.flatMap(({ enums }) => enums)];
      return [declared?.values.map(({ name }) => name).join(" | "), ...problems(source)];
    };
    const snapshot: (string | undefined)[][] = [];
    snapshot.push(read("enum Size = xs |\n  # sm |\n  md\n"));
    snapshot.push(read("enum Size = xs |\n\n  md\n"));
    snapshot.push(read("enum Size =\n  | xs\n  # | sm\n  | md\n"));
    snapshot.push(read("enum Size =\n  | xs\n\n  | md\n"));
    snapshot.push(read("enum Size =\n  # the smallest first\n  | xs\n  | md\n"));
    snapshot.push(
      read("type Menu {\n  enum State =\n    | closed\n    # | opening\n    | open\n}\n"),
    );
    // A declaration after the comments still starts a declaration of its own.
    snapshot.push(read("enum Size = xs |\n  # sm\n\nenum Gap = sm\n"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "xs | md",
        ],
        [
          "xs | md",
        ],
        [
          "xs | md",
        ],
        [
          "xs | md",
        ],
        [
          "xs | md",
        ],
        [
          "closed | open",
        ],
        [
          "xs",
          "1:17: syntax-error: expected a value after \`|\`, found the end of the line",
        ],
      ]
    `);
  });

  it("refuses names and values that do not follow the naming rules", () => {
    expect([
      problems("enum hover = rest | hovered\n"),
      problems("enum Hover = rest | -hovered\n"),
      problems("enum Hover = rest | hover_ed\n"),
      problems("enum Hover-State = rest\n"),
    ]).toEqual([
      ["1:6: enum-name: enum names start with a capital letter: `hover`"],
      ["1:21: syntax-error: expected a value after `|`, found `-`"],
      ["1:21: syntax-error: names and values are ASCII letters, digits and hyphens: `hover_ed`"],
      ["1:6: enum-name: enum names are letters and digits: `Hover-State`"],
    ]);
  });

  it("names the whole word when it has a character no name or value can have", () => {
    const snapshot: string[][] = [];
    snapshot.push(problems("enum Size = café | sm\n"));
    snapshot.push(problems("enum Größe = xs\n"));
    snapshot.push(problems("enum Size_2 = xs\n"));
    snapshot.push(problems("enum Size = xs | sm_\n"));
    snapshot.push(problems("enum Size = xs\ntype Menu {\n  state open_now: Size\n}\n"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "1:13: syntax-error: names and values are ASCII letters, digits and hyphens: \`café\`",
        ],
        [
          "1:6: syntax-error: names and values are ASCII letters, digits and hyphens: \`Größe\`",
        ],
        [
          "1:6: syntax-error: names and values are ASCII letters, digits and hyphens: \`Size_2\`",
        ],
        [
          "1:18: syntax-error: names and values are ASCII letters, digits and hyphens: \`sm_\`",
        ],
        [
          "3:9: syntax-error: names and values are ASCII letters, digits and hyphens: \`open_now\`",
        ],
      ]
    `);
  });

  it("refuses values that are not lowercase letters and digits, joined by single hyphens", () => {
    const snapshot: string[][] = [];
    snapshot.push(problems("enum Hover = rest | no-keyboard | 19px | 2xl\n"));
    snapshot.push(problems("enum Hover = Rest | hovered\n"));
    snapshot.push(problems("enum Keyboard = noKeyboard | keyboard\n"));
    snapshot.push(problems("enum Hover = rest | hovered-\n"));
    snapshot.push(problems("enum Hover = rest | hov--ered\n"));
    snapshot.push(problems("dimension Pointer = Mouse | touch\n"));
    snapshot.push(problems("type Menu {\n  enum State = Closed | open\n}\n"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [
          "1:14: value-name: values start with a lowercase letter or a digit: \`Rest\`",
        ],
        [
          "1:17: value-name: values are lowercase letters and digits, with single hyphens between them: \`noKeyboard\`",
        ],
        [
          "1:21: value-name: values are lowercase letters and digits, with single hyphens between them: \`hovered-\`",
        ],
        [
          "1:21: value-name: values are lowercase letters and digits, with single hyphens between them: \`hov--ered\`",
        ],
        [
          "1:21: value-name: values start with a lowercase letter or a digit: \`Mouse\`",
        ],
        [
          "2:16: value-name: values start with a lowercase letter or a digit: \`Closed\`",
        ],
      ]
    `);
  });

  it("refuses an enum or a value declared twice", () => {
    expect([
      problems("enum Breakpoint = base | sm | lg | lg\n"),
      problems("enum Ring = none | focus\nenum Ring = none\n"),
    ]).toEqual([
      ["1:36: duplicate-value: `lg` appears twice in `Breakpoint`"],
      ["2:6: duplicate-name: `Ring` is already declared at line 1"],
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems("enum Focus = blurred, focused\n"),
      problems("enum Focus blurred | focused\n"),
      problems("enum Focus =\n"),
      problems("enum Focus = blurred |\n"),
      problems("enumm Focus = blurred\n"),
    ]).toEqual([
      ["1:21: syntax-error: expected `|` or the end of the line after `blurred`, found `,`"],
      ["1:12: syntax-error: expected `=` after the enum name, found `blurred`"],
      ["1:13: syntax-error: expected a value after `=`, found the end of the line"],
      ["2:1: syntax-error: expected a value after `|`, found the end of the file"],
      [
        "1:1: syntax-error: expected `enum`, `dimension`, `type`, `environment`, `profile`, `modifier`, `record`, `actor` or `expect`, found `enumm`",
      ],
    ]);
  });
});
