import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

function file(source: string) {
  const root = writeProject({});
  writeFileSync(join(root, "wordmark.dxn"), source);
  return (...args: string[]) => capture(["lang", ...args], root);
}

describe("lang check", () => {
  it("prints the records a file declares, with their fields", () => {
    const run = file("enum Tool = pen-dev | code\nrecord Source {\n  tool: Tool\n}\n");
    const result = run("check", "wordmark.dxn");
    expect([result.code, JSON.parse(result.stdout).records]).toEqual([
      0,
      [{ name: "Source", fields: [{ name: "tool", type: "Tool" }] }],
    ]);
  });

  it("prints warnings, and still succeeds", () => {
    const run = file(
      "dimension Breakpoint = base | lg\nenum Hover = rest | hovered\ntype Wordmark needs Breakpoint {\n  states hover: Hover\n}\n",
    );
    const result = run("check", "wordmark.dxn");
    expect([result.code, result.stderr, JSON.parse(result.stdout).types[0].needs]).toEqual([
      0,
      "wordmark.dxn:3:21: warning: unused-need: Wordmark needs Breakpoint, but no rule uses it\n",
      ["Breakpoint"],
    ]);
  });

  it("prints the enums a file declares, as JSON", () => {
    const run = file(
      "enum Hover = rest | hovered\nenum Size = 19px | 20px | 22px\ndimension Breakpoint = base | lg\ndimension Pointer = mouse | touch\ntype Wordmark needs Pointer {\n  states hover: Hover\n  hover = hovered only when Pointer = mouse\n}\n",
    );
    const result = run("check", "wordmark.dxn");
    expect([result.code, JSON.parse(result.stdout)]).toEqual([
      0,
      {
        file: "wordmark.dxn",
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
    const result = run("check", "wordmark.dxn");
    expect([result.code, result.stderr, result.stdout]).toEqual([
      1,
      [
        'wordmark.dxn:1:6: enum-name: enum names start with a capital letter: "hover"',
        'wordmark.dxn:2:20: duplicate-value: "none" appears twice in Ring',
        "",
      ].join("\n"),
      "",
    ]);
  });

  it("needs a file that exists, and no project", () => {
    const run = file("");
    expect([run("check", "nope.dxn").stderr, run("check").code]).toEqual([
      'dimensions: file not found: "nope.dxn"\n',
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
    const result = file(wordmark)("states", "wordmark.dxn", "Wordmark", "--table");
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
      JSON.parse(file(wordmark)("states", "wordmark.dxn", "Wordmark").stdout).rows,
    ).toHaveLength(4);
  });

  it("refuses a type the file does not declare, and a file with problems", () => {
    expect([
      file(wordmark)("states", "wordmark.dxn", "Wordmrk").stderr,
      file("enum hover = rest\n")("states", "wordmark.dxn", "Wordmark").stderr,
    ]).toEqual([
      'dimensions: no type "Wordmrk" in wordmark.dxn (Wordmark)\n',
      'wordmark.dxn:1:6: enum-name: enum names start with a capital letter: "hover"\n',
    ]);
  });

  it("names the profile of each row when there are profiles", () => {
    const withProfiles = `dimension Breakpoint = base | lg
${wordmark}environment Device = Breakpoint x Pointer x Keyboard
profile phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
`;
    expect(file(withProfiles)("states", "wordmark.dxn", "Wordmark", "--table").stdout).toBe(
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
  const project = (files: Record<string, string>, at = "evidence.dxn") => {
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
    const result = run("evidence.dxn");
    expect([result.code, result.stderr, JSON.parse(result.stdout)]).toEqual([
      0,
      "",
      {
        file: "evidence.dxn",
        stored: [{ record: "Source", folder: "source", files: 2, records: 3 }],
      },
    ]);
  });

  it("leaves out a record with no folder: it is not stored", () => {
    const result = project({})("evidence.dxn");
    expect([result.code, JSON.parse(result.stdout).stored]).toEqual([0, []]);
  });

  it("reports every problem in every file, with the file's path, and fails", () => {
    const result = project({
      "source/a.json": '[{ "tool": "figma" }]',
      "evidence/b.json": '[{ "at": "yesterday" }]',
      "evidence/c.json": '{ "at": "2026-10-31T08:50:05Z" }',
    })("evidence.dxn");
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
      "model/evidence.dxn",
    )("model/evidence.dxn");
    expect(result.stderr).toBe(
      'model/source/a.json:1:12: unknown-value: $[0].tool: "lisp" is not a value of Tool (pen-dev, code)\n',
    );
  });

  it("needs one file", () => {
    const run = project({});
    expect([run().code, run("evidence.dxn", "Source", "records.json").code]).toEqual([2, 2]);
  });
});

describe("lang rename", () => {
  const schema = `enum Actor = design-agent | reviewer
record Evidence {
  actor: Actor
}
`;
  const project = (data: string) => {
    const root = writeProject({});
    writeFileSync(join(root, "evidence.dxn"), schema);
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "page.json"), data);
    const run = (...args: string[]) => capture(["lang", "rename", ...args], root);
    const read = (path: string) => readFileSync(join(root, path), "utf8");
    return { run, read };
  };
  const stored = '[{ "actor": "design-agent" }, { "actor": "reviewer" }]\n';

  it("renames an enum value in the file and in every stored record, and says what changed", () => {
    const { run, read } = project(stored);
    const result = run("evidence.dxn", "Actor.design-agent", "designer");
    expect([
      result.code,
      JSON.parse(result.stdout),
      read("evidence.dxn"),
      read("evidence/page.json"),
    ]).toEqual([
      0,
      {
        file: "evidence.dxn",
        enum: "Actor",
        from: "design-agent",
        to: "designer",
        written: ["evidence.dxn", "evidence/page.json"],
        records: 1,
      },
      schema.replace("design-agent", "designer"),
      '[{ "actor": "designer" }, { "actor": "reviewer" }]\n',
    ]);
  });

  it("prints what it would write with --dry-run, and writes nothing", () => {
    const { read } = project(stored);
    const root = writeProject({});
    writeFileSync(join(root, "evidence.dxn"), schema);
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "page.json"), stored);
    const result = capture(
      ["--dry-run", "lang", "rename", "evidence.dxn", "Actor.design-agent", "designer"],
      root,
    );
    expect([
      result.code,
      JSON.parse(result.stdout),
      readFileSync(join(root, "evidence.dxn"), "utf8"),
    ]).toEqual([
      0,
      {
        dryRun: true,
        written: {
          "evidence.dxn": schema.replace("design-agent", "designer"),
          "evidence/page.json": '[{ "actor": "designer" }, { "actor": "reviewer" }]\n',
        },
      },
      schema,
    ]);
    expect(read("evidence.dxn")).toBe(schema);
  });

  it("refuses what it cannot rename, and writes nothing", () => {
    const { run, read } = project(stored);
    expect([
      run("evidence.dxn", "Actr.design-agent", "designer").stderr,
      run("evidence.dxn", "Evidence.design-agent", "designer").stderr,
      run("evidence.dxn", "Actor.designer", "maker").stderr,
      run("evidence.dxn", "Actor.design-agent", "reviewer").stderr,
      run("evidence.dxn", "Actor.design-agent", "design agent").stderr,
      read("evidence.dxn"),
    ]).toEqual([
      "dimensions: Actr is not an enum (Actor)\n",
      "dimensions: Evidence is a record, not an enum\n",
      'dimensions: "designer" is not a value of Actor (design-agent, reviewer)\n',
      'dimensions: "reviewer" is already a value of Actor\n',
      'dimensions: "design agent" is not a value: a letter or digit, then letters, digits and hyphens\n',
      schema,
    ]);
  });

  it("refuses while the stored records have problems, so a rename never mixes with them", () => {
    const { run, read } = project('[{ "actor": "maker" }]\n');
    const result = run("evidence.dxn", "Actor.design-agent", "designer");
    expect([result.code, result.stderr, read("evidence.dxn")]).toEqual([
      1,
      'evidence/page.json:1:13: unknown-value: $[0].actor: "maker" is not a value of Actor (design-agent, reviewer)\n',
      schema,
    ]);
  });

  it("needs a file, an enum's value and its new name", () => {
    const { run } = project(stored);
    expect([
      run("evidence.dxn", "Actor.design-agent").code,
      run("evidence.dxn", "Actor", "x").code,
    ]).toEqual([2, 2]);
  });
});
