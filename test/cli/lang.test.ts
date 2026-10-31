import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
  it("prints the records a file declares, with their fields", () => {
    const run = file("enum Tool = pen-dev | code\nrecord Source {\n  tool: Tool\n}\n");
    const result = run("check", "wordmark.dim");
    expect([result.code, JSON.parse(result.stdout).records]).toEqual([
      0,
      [{ name: "Source", fields: [{ name: "tool", type: "Tool" }] }],
    ]);
  });

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
        records: [],
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
${wordmark}environment Device = Breakpoint x Pointer x Keyboard
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

describe("lang validate", () => {
  const schema = `enum Tool = pen-dev | code
record Source {
  tool: Tool
}
record Evidence {
  at: Timestamp
}
`;
  // A folder with the schema in it, and these files, by path from it.
  const project = (files: Record<string, string>, at = "evidence.dim") => {
    const root = writeProject({});
    mkdirSync(join(root, dirname(at)), { recursive: true });
    writeFileSync(join(root, at), schema);
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(root, dirname(path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return (...args: string[]) => capture(["lang", "validate", ...args], root);
  };

  it("checks every JSON file in each record's folder, and says what it checked", () => {
    const run = project({
      "source/designs.json": '[{ "tool": "pen-dev" }, { "tool": "code" }]',
      "source/code.json": '[{ "tool": "code" }]',
      "source/notes.md": "not data",
      "source/old/ignored.json": "not checked",
    });
    const result = run("evidence.dim");
    expect([result.code, result.stderr, JSON.parse(result.stdout)]).toEqual([
      0,
      "",
      {
        file: "evidence.dim",
        stored: [{ record: "Source", folder: "source", files: 2, records: 3 }],
      },
    ]);
  });

  it("leaves out a record with no folder: it is not stored", () => {
    const result = project({})("evidence.dim");
    expect([result.code, JSON.parse(result.stdout).stored]).toEqual([0, []]);
  });

  it("reports every problem in every file, with the file's path, and fails", () => {
    const result = project({
      "source/a.json": '[{ "tool": "figma" }]',
      "evidence/b.json": '[{ "at": "yesterday" }]',
      "evidence/c.json": '{ "at": "2026-10-31T08:50:05Z" }',
    })("evidence.dim");
    expect([result.code, result.stderr.split("\n"), result.stdout]).toEqual([
      1,
      [
        'source/a.json:1:12: unknown-value: $[0].tool: "figma" is not a value of Tool (pen-dev, code)',
        'evidence/b.json:1:10: invalid-value: $[0].at: "yesterday" is not a Timestamp: an ISO 8601 date and time with a time zone, e.g. 2026-10-31T08:50:05Z',
        "evidence/c.json:1:1: wrong-kind: $: expected a list of Evidence records, found an object",
        "",
      ],
      "",
    ]);
  });

  it("looks for the folders next to the file", () => {
    const result = project(
      { "model/source/a.json": '[{ "tool": "lisp" }]', "source/b.json": '[{ "tool": "lisp" }]' },
      "model/evidence.dim",
    )("model/evidence.dim");
    expect(result.stderr).toBe(
      'model/source/a.json:1:12: unknown-value: $[0].tool: "lisp" is not a value of Tool (pen-dev, code)\n',
    );
  });

  it("needs one file", () => {
    const run = project({});
    expect([run().code, run("evidence.dim", "Source", "records.json").code]).toEqual([2, 2]);
  });
});
