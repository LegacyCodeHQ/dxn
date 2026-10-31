import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

function file(source: string) {
  const root = writeProject({});
  writeFileSync(join(root, "wordmark.dim"), source);
  return (...args: string[]) => capture(["lang", ...args], root);
}

describe("lang check", () => {
  it("prints warnings, and still succeeds", () => {
    const run = file(
      "dimension Breakpoint = base | lg\nenum Hover = rest | hovered\ntype Wordmark needs Breakpoint {\n  states hover: Hover\n}\n",
    );
    const result = run("check", "wordmark.dim");
    expect([result.code, result.stderr, JSON.parse(result.stdout).types[0].needs]).toEqual([
      0,
      "wordmark.dim:3:21: warning: unused-need: Wordmark needs Breakpoint, but no rule uses it\n",
      ["Breakpoint"],
    ]);
  });

  it("prints the enums a file declares, as JSON", () => {
    const run = file(
      "enum Hover = rest | hovered\nenum Size = 19px | 20px | 22px\ndimension Breakpoint = base | lg\ndimension Pointer = mouse | touch\ntype Wordmark needs Pointer {\n  states hover: Hover\n  hover = hovered only when Pointer = mouse\n}\n",
    );
    const result = run("check", "wordmark.dim");
    expect([result.code, JSON.parse(result.stdout)]).toEqual([
      0,
      {
        file: "wordmark.dim",
        enums: [
          { name: "Hover", values: ["rest", "hovered"] },
          { name: "Size", values: ["19px", "20px", "22px"] },
        ],
        dimensions: [
          { name: "Breakpoint", values: ["base", "lg"] },
          { name: "Pointer", values: ["mouse", "touch"] },
        ],
        types: [
          {
            name: "Wordmark",
            needs: ["Pointer"],
            states: [{ name: "hover", enum: "Hover" }],
            rules: [
              {
                state: "hover",
                value: "hovered",
                when: { dimension: "Pointer", values: ["mouse"] },
              },
            ],
          },
        ],
        environments: [],
        profiles: [],
      },
    ]);
  });

  it("reports every problem with its file, line and column, and fails", () => {
    const run = file("enum hover = rest\nenum Ring = none | none\n");
    const result = run("check", "wordmark.dim");
    expect([result.code, result.stderr, result.stdout]).toEqual([
      1,
      [
        'wordmark.dim:1:6: enum-name: enum names start with a capital letter: "hover"',
        'wordmark.dim:2:20: duplicate-value: "none" appears twice in Ring',
        "",
      ].join("\n"),
      "",
    ]);
  });

  it("needs a file that exists, and no project", () => {
    const run = file("");
    expect([run("check", "nope.dim").stderr, run("check").code]).toEqual([
      'dimensions: file not found: "nope.dim"\n',
      2,
    ]);
  });
});

describe("lang states", () => {
  const wordmark = `dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
enum Hover = rest | hovered
enum Focus = blurred | focused
type Wordmark needs Pointer, Keyboard {
  states hover: Hover, focus: Focus
  hover = hovered only when Pointer = mouse
  focus = focused only when Keyboard = keyboard
}
`;

  it("prints which states a type has under which conditions, as a table", () => {
    const result = file(wordmark)("states", "wordmark.dim", "Wordmark", "--table");
    expect([result.code, result.stdout]).toEqual([
      0,
      [
        "| Pointer | Keyboard    | hover: rest | hover: hovered | focus: blurred | focus: focused |",
        "| ------- | ----------- | ----------- | -------------- | -------------- | -------------- |",
        "| mouse   | keyboard    | ✓           | ✓              | ✓              | ✓              |",
        "| mouse   | no-keyboard | ✓           | ✓              | ✓              | —              |",
        "| touch   | keyboard    | ✓           | —              | ✓              | ✓              |",
        "| touch   | no-keyboard | ✓           | —              | ✓              | —              |",
        "",
      ].join("\n"),
    ]);
    expect(
      JSON.parse(file(wordmark)("states", "wordmark.dim", "Wordmark").stdout).rows,
    ).toHaveLength(4);
  });

  it("refuses a type the file does not declare, and a file with problems", () => {
    expect([
      file(wordmark)("states", "wordmark.dim", "Wordmrk").stderr,
      file("enum hover = rest\n")("states", "wordmark.dim", "Wordmark").stderr,
    ]).toEqual([
      'dimensions: no type "Wordmrk" in wordmark.dim (Wordmark)\n',
      'wordmark.dim:1:6: enum-name: enum names start with a capital letter: "hover"\n',
    ]);
  });

  it("names the profile of each row when there are profiles", () => {
    const withProfiles = `dimension Breakpoint = base | lg
${wordmark}environment Device = Breakpoint × Pointer × Keyboard
profile phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
`;
    expect(file(withProfiles)("states", "wordmark.dim", "Wordmark", "--table").stdout).toBe(
      [
        "| profile | Pointer | Keyboard    | hover: rest | hover: hovered | focus: blurred | focus: focused |",
        "| ------- | ------- | ----------- | ----------- | -------------- | -------------- | -------------- |",
        "| phone   | touch   | no-keyboard | ✓           | —              | ✓              | —              |",
        "| laptop  | mouse   | keyboard    | ✓           | ✓              | ✓              | ✓              |",
        "",
      ].join("\n"),
    );
  });
});
