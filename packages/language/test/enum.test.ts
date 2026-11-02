import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { errors, problems } from "./support/language.js";

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
    const { enums } = parse(wordmark);
    expect(errors(wordmark)).toEqual([]);
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
      { name: "hovered", line: 1, column: 26, length: 7 },
    ]);
  });

  it("continues onto the next line after a |, and allows blank lines", () => {
    const source = "\nenum Breakpoint = base | sm |\n  lg | xl\n\n";
    const { enums } = parse(source);
    expect([errors(source), enums[0]?.values.map(({ name }) => name)]).toEqual([
      [],
      ["base", "sm", "lg", "xl"],
    ]);
  });

  it("can start a line with the |, and its first value with one", () => {
    const values = (source: string) => {
      const { enums, dimensions } = parse(source);
      return [errors(source), [...enums, ...dimensions][0]?.values.map(({ name }) => name)];
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
      errors("enum Size =\n"),
      errors("enum Size = xs |\n  | sm\n"),
      errors("enum Size =\n  | xs\n  md\n"),
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
      return [declared?.values.map(({ name }) => name).join(" | "), ...errors(source)];
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
      errors("enum hover = rest | hovered\n"),
      errors("enum Hover = rest | -hovered\n"),
      errors("enum Hover = rest | hover_ed\n"),
      errors("enum Hover-State = rest\n"),
    ]).toEqual([
      ["1:6: enum-name: enum names start with a capital letter: `hover`"],
      ["1:21: value-name: values start with a lowercase letter or a digit: `-hovered`"],
      ["1:21: syntax-error: names and values are ASCII letters, digits and hyphens: `hover_ed`"],
      ["1:6: enum-name: enum names are letters and digits: `Hover-State`"],
    ]);
  });

  it("names the whole word when it has a character no name or value can have", () => {
    const snapshot: string[][] = [];
    snapshot.push(errors("enum Size = café | sm\n"));
    snapshot.push(errors("enum Größe = xs\n"));
    snapshot.push(errors("enum Size_2 = xs\n"));
    snapshot.push(errors("enum Size = xs | sm_\n"));
    snapshot.push(errors("enum Size = xs\ntype Menu {\n  state open_now: Size\n}\n"));
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
    snapshot.push(errors("enum Hover = rest | no-keyboard | 19px | 2xl\n"));
    snapshot.push(errors("enum Hover = Rest | hovered\n"));
    snapshot.push(errors("enum Keyboard = noKeyboard | keyboard\n"));
    snapshot.push(errors("enum Hover = rest | hovered-\n"));
    snapshot.push(errors("enum Hover = rest | hov--ered\n"));
    snapshot.push(errors("enum Hover = -rest | --hovered\n"));
    snapshot.push(errors("dimension Pointer = Mouse | touch\n"));
    snapshot.push(errors("type Menu {\n  enum State = Closed | open\n}\n"));
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
          "1:14: value-name: values start with a lowercase letter or a digit: \`-rest\`",
          "1:22: value-name: values start with a lowercase letter or a digit: \`--hovered\`",
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
      errors("enum Breakpoint = base | sm | lg | lg\n"),
      errors("enum Ring = none | focus\nenum Ring = none\n"),
    ]).toEqual([
      ["1:36: duplicate-value: `lg` appears twice in `Breakpoint`"],
      ["2:6: duplicate-name: `Ring` is already declared at line 1"],
    ]);
  });

  it("warns of an enum that no state or record field takes its values from", () => {
    const snapshot: string[][] = [];
    snapshot.push(problems("enum Hover = rest | hovered\n"));
    snapshot.push(problems("enum Hover = rest | hovered\ntype Link {\n  state hover: Hover\n}\n"));
    snapshot.push(problems("enum Hover = rest\ntype Link {\n  enum State = closed | open\n}\n"));
    snapshot.push(
      problems("enum Hover = rest\ntype Menu {\n  type Link receives hover: Hover {\n  }\n}\n"),
    );
    snapshot.push(problems("enum Source = figma | code\nrecord Evidence {\n  source: Source\n}\n"));
    // A misspelled enum uses the enums it might mean; another error warns.
    snapshot.push(problems("enum Hover = rest\ntype Link {\n  state hover: Hovr\n}\n"));
    snapshot.push(problems("enum Source = figma\nrecord Evidence {\n  source: Sorce\n}\n"));
    snapshot.push(
      problems("enum Size = sm\nenum Hover = rest\ntype Link {\n  state hover: Hover = rset\n}\n"),
    );
    // An enum declared twice is warned of once, at its first declaration.
    snapshot.push(problems("enum Hover = rest\nenum Hover = hovered\n"));
    // A syntax error may hide what uses an enum: none is reported.
    snapshot.push(
      problems(
        "enum Hover = rest\ntype Link {\n  hover = rest only when hover rest\n  state hover: Hover\n}\n",
      ),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "1:6: warning: unused-enum: \`Hover\` is not used: no state or record field takes its values",
        ],
        [],
        [
          "1:6: warning: unused-enum: \`Hover\` is not used: no state or record field takes its values",
          "3:8: warning: unused-enum: \`Link.State\` is not used: no state or record field takes its values",
        ],
        [],
        [],
        [
          "3:16: unknown-enum: \`Hovr\` is not an enum; did you mean \`Hover\`?",
        ],
        [
          "3:11: unknown-type: \`Sorce\` is not an enum, a record or a scalar; did you mean \`Source\`?",
        ],
        [
          "1:6: warning: unused-enum: \`Size\` is not used: no state or record field takes its values",
          "4:24: unknown-value: \`rset\` is not a value of \`hover\` (\`rest\`)",
        ],
        [
          "1:6: warning: unused-enum: \`Hover\` is not used: no state or record field takes its values",
          "2:6: duplicate-name: \`Hover\` is already declared at line 1",
        ],
        [
          "3:32: syntax-error: expected \`=\` or \`in\` after \`hover\`, found \`rest\`",
        ],
      ]
    `);
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
