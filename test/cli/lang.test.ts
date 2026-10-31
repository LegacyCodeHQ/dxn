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
  it("says what a file declares, in one line, counting each kind it has", () => {
    const run = file(
      "enum Hover = rest | hovered\nenum Focus = blurred | focused\ndimension Pointer = mouse | touch\ntype Wordmark needs Pointer {\n  state hover: Hover\n  hover = hovered only when Pointer = mouse\n}\nenvironment Device = Pointer\nprofile tablet: Device { Pointer = touch }\nmodifier trackpad on tablet { Pointer = mouse }\nrecord Note {\n  hover: Hover\n}\n",
    );
    const result = run("check", "wordmark.dxn");
    expect([result.code, result.stdout, result.stderr]).toEqual([
      0,
      "wordmark.dxn: 2 enums, 1 dimension, 1 type, 1 environment, 1 profile, 1 modifier, 1 record\n",
      "",
    ]);
    expect(file("# nothing yet\n")("check", "wordmark.dxn").stdout).toBe(
      "wordmark.dxn: nothing declared\n",
    );
  });

  it("prints warnings, and still succeeds", () => {
    const run = file(
      "dimension Breakpoint = base | lg\nenum Hover = rest | hovered\ntype Wordmark needs Breakpoint {\n  state hover: Hover\n}\n",
    );
    const result = run("check", "wordmark.dxn");
    expect([result.code, result.stdout, result.stderr]).toEqual([
      0,
      "wordmark.dxn: 1 enum, 1 dimension, 1 type\n",
      "wordmark.dxn:3:21: warning: unused-need: Wordmark needs Breakpoint, but no rule uses it\n",
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
      'dxn: file not found: "nope.dxn"\n',
      2,
    ]);
  });

  describe("with --json", () => {
    it("prints what the file declares, and no problems", () => {
      const run = file(
        "enum Hover = rest | hovered\nenum Size = 19px | 20px | 22px\ndimension Breakpoint = base | lg\ndimension Pointer = mouse | touch\ntype Wordmark needs Pointer {\n  state hover: Hover\n  hover = hovered only when Pointer = mouse\n}\n",
      );
      const result = run("check", "wordmark.dxn", "--json");
      expect([result.code, result.stderr, JSON.parse(result.stdout)]).toEqual([
        0,
        "",
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
          modifiers: [],
          records: [],
          problems: [],
        },
      ]);
    });

    it("prints the modifiers and records a file declares", () => {
      const run = file(
        "enum Tool = pen-dev | code\ndimension Pointer = mouse | touch\nenvironment Device = Pointer\nprofile tablet: Device { Pointer = touch }\nmodifier trackpad on tablet { Pointer = mouse }\nrecord Source {\n  tool: Tool\n}\n",
      );
      const output = JSON.parse(run("check", "wordmark.dxn", "--json").stdout);
      expect([output.modifiers, output.records]).toEqual([
        [{ name: "trackpad", on: ["tablet"], values: { Pointer: "mouse" } }],
        [{ name: "Source", context: false, fields: [{ name: "tool", type: "Tool" }] }],
      ]);
    });

    it("puts warnings among the problems, and nothing on stderr", () => {
      const run = file(
        "dimension Breakpoint = base | lg\nenum Hover = rest | hovered\ntype Wordmark needs Breakpoint {\n  state hover: Hover\n}\n",
      );
      const result = run("check", "wordmark.dxn", "--json");
      expect([result.code, result.stderr, JSON.parse(result.stdout).problems]).toEqual([
        0,
        "",
        [
          {
            file: "wordmark.dxn",
            line: 3,
            column: 21,
            severity: "warning",
            code: "unused-need",
            message: "Wordmark needs Breakpoint, but no rule uses it",
          },
        ],
      ]);
    });

    it("prints only the file and its problems when it fails", () => {
      const result = file("enum hover = rest\n")("check", "wordmark.dxn", "--json");
      expect([result.code, result.stderr, JSON.parse(result.stdout)]).toEqual([
        1,
        "",
        {
          file: "wordmark.dxn",
          problems: [
            {
              file: "wordmark.dxn",
              line: 1,
              column: 6,
              severity: "error",
              code: "enum-name",
              message: 'enum names start with a capital letter: "hover"',
            },
          ],
        },
      ]);
    });

    it("prints a refusal as an error", () => {
      const result = file("")("check", "nope.dxn", "--json");
      expect([result.code, result.stderr, JSON.parse(result.stdout)]).toEqual([
        1,
        "",
        { error: 'file not found: "nope.dxn"' },
      ]);
    });
  });
});

describe("lang states", () => {
  const wordmark = `dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
enum Hover = rest | hovered
enum Focus = blurred | focused
type Wordmark needs Pointer, Keyboard {
  state hover: Hover, focus: Focus
  hover = hovered only when Pointer = mouse
  focus = focused only when Keyboard = keyboard
}
`;

  it("prints which states a type has under which conditions, as a table", () => {
    const result = file(wordmark)("states", "wordmark.dxn", "Wordmark");
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
  });

  it("shows where each child is: there, not there, or for which values of a state", () => {
    const run = file(`dimension Breakpoint = base | lg
enum Layout = compact | inline
type Links {}
type Menu {
  enum State = closed | open
  state menu: State
  type Panel {}
  has panel: Panel only when menu in (open)
}
type Toolbar needs Breakpoint {
  state layout: Layout = when Breakpoint {
    base -> compact
    lg -> inline
  }
  has links: Links only when layout = inline
  has menu: Menu only when layout = compact
}
`);
    expect([
      run("states", "wordmark.dxn", "Toolbar").stdout,
      run("states", "wordmark.dxn", "Menu").stdout,
    ]).toEqual([
      [
        "| Breakpoint | layout: compact | layout: inline | has links | has menu |",
        "| ---------- | --------------- | -------------- | --------- | -------- |",
        "| base       | ✓               | —              | —         | ✓        |",
        "| lg         | —               | ✓              | ✓         | —        |",
        "",
      ].join("\n"),
      [
        "| menu: closed | menu: open | has panel   |",
        "| ------------ | ---------- | ----------- |",
        "| ✓            | ✓          | menu = open |",
        "",
      ].join("\n"),
    ]);
  });

  it("names the profiles of each row when there are profiles", () => {
    const withProfiles = `dimension Breakpoint = base | lg
${wordmark}environment Device = Breakpoint x Pointer x Keyboard
profile phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
profile studio: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
`;
    expect(file(withProfiles)("states", "wordmark.dxn", "Wordmark").stdout).toBe(
      [
        "| profiles       | Pointer | Keyboard    | hover: rest | hover: hovered | focus: blurred | focus: focused |",
        "| -------------- | ------- | ----------- | ----------- | -------------- | -------------- | -------------- |",
        "| phone          | touch   | no-keyboard | ✓           | —              | ✓              | —              |",
        "| laptop, studio | mouse   | keyboard    | ✓           | ✓              | ✓              | ✓              |",
        "",
      ].join("\n"),
    );
  });

  it("refuses a type the file does not declare, and a file with problems", () => {
    expect([
      file(wordmark)("states", "wordmark.dxn", "Wordmrk").stderr,
      file("enum hover = rest\n")("states", "wordmark.dxn", "Wordmark").stderr,
    ]).toEqual([
      'dxn: no type "Wordmrk" in wordmark.dxn (Wordmark)\n',
      'wordmark.dxn:1:6: enum-name: enum names start with a capital letter: "hover"\n',
    ]);
  });

  it("no longer takes --table, since the table is what it prints", () => {
    const result = file(wordmark)("states", "wordmark.dxn", "Wordmark", "--table");
    expect([result.code, result.stdout]).toEqual([2, ""]);
  });

  describe("with --json", () => {
    it("prints the matrix, and no problems", () => {
      const result = file(wordmark)("states", "wordmark.dxn", "Wordmark", "--json");
      const output = JSON.parse(result.stdout);
      expect([
        result.code,
        result.stderr,
        output.type,
        output.dimensions,
        output.rows.length,
        output.rows[0],
        output.problems,
      ]).toEqual([
        0,
        "",
        "Wordmark",
        ["Pointer", "Keyboard"],
        4,
        {
          when: { Pointer: "mouse", Keyboard: "keyboard" },
          states: { hover: ["rest", "hovered"], focus: ["blurred", "focused"] },
        },
        [],
      ]);
    });

    it("prints a refusal as an error, and a file with problems as its problems", () => {
      const refused = file(wordmark)("states", "wordmark.dxn", "Wordmrk", "--json");
      const failed = file("enum hover = rest\n")("states", "wordmark.dxn", "Wordmark", "--json");
      expect([
        refused.code,
        JSON.parse(refused.stdout),
        failed.code,
        failed.stderr,
        JSON.parse(failed.stdout).problems.map(({ code }: { code: string }) => code),
      ]).toEqual([
        1,
        { error: 'no type "Wordmrk" in wordmark.dxn (Wordmark)' },
        1,
        "",
        ["enum-name"],
      ]);
    });
  });
});

describe("lang validate", () => {
  const schema = `enum Tool = pen-dev | code
type Card {}
record Source with context {
  tool: Tool
}
record Evidence with context {
  at: Timestamp
}
record Part {
  tool: Tool
}
`;
  // A stored record of Card, which has one combination.
  const card = '"context": { "type": "Card", "dimensions": {}, "states": {} }';
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
  const valid = {
    "source/designs.json": `[{ ${card}, "tool": "pen-dev" }, { ${card}, "tool": "code" }]`,
    "source/code.json": `[{ ${card}, "tool": "code" }]`,
    "source/notes.md": "not data",
    "source/old/ignored.json": "not checked",
    "evidence/a.json": `[{ ${card}, "at": "2026-10-31T08:50:05Z" }]`,
  };

  it("checks every JSON file in each record's folder, and says what it checked, a line a record", () => {
    const result = project(valid)("evidence.dxn");
    expect([result.code, result.stderr, result.stdout]).toEqual([
      0,
      "",
      [
        "evidence.dxn: Source, 3 records in 2 files in source/",
        "evidence.dxn: Evidence, 1 record in 1 file in evidence/",
        "",
      ].join("\n"),
    ]);
  });

  it("says so when no record is stored", () => {
    const result = project({})("evidence.dxn");
    expect([result.code, result.stdout]).toEqual([0, "evidence.dxn: no stored records\n"]);
  });

  it("refuses a stored record without a context: it would be a fact about nothing", () => {
    const result = project({ "part/a.json": '[{ "tool": "code" }]' })("evidence.dxn");
    expect([result.code, result.stderr, result.stdout]).toEqual([
      1,
      'dxn: Part is stored in part/, but has no context; declare "record Part with context"\n',
      "",
    ]);
  });

  it("reports every problem in every file, with the file's path, and fails", () => {
    const result = project({
      "source/a.json": `[{ ${card}, "tool": "figma" }]`,
      "evidence/b.json": `[{ ${card}, "at": "yesterday" }]`,
      "evidence/c.json": `{ ${card}, "at": "2026-10-31T08:50:05Z" }`,
    })("evidence.dxn");
    expect([result.code, result.stderr.split("\n"), result.stdout]).toEqual([
      1,
      [
        'source/a.json:1:75: unknown-value: $[0].tool: "figma" is not a value of Tool (pen-dev, code)',
        'evidence/b.json:1:73: invalid-value: $[0].at: "yesterday" is not a Timestamp: an ISO 8601 date and time with a time zone, e.g. 2026-10-31T08:50:05Z',
        "evidence/c.json:1:1: wrong-kind: $: expected a list of Evidence records, found an object",
        "",
      ],
      "",
    ]);
  });

  it("looks for the folders next to the file", () => {
    const result = project(
      {
        "model/source/a.json": `[{ ${card}, "tool": "lisp" }]`,
        "source/b.json": `[{ ${card}, "tool": "lisp" }]`,
      },
      "model/evidence.dxn",
    )("model/evidence.dxn");
    expect(result.stderr).toBe(
      'model/source/a.json:1:75: unknown-value: $[0].tool: "lisp" is not a value of Tool (pen-dev, code)\n',
    );
  });

  it("needs one file", () => {
    const run = project({});
    expect([run().code, run("evidence.dxn", "Source", "records.json").code]).toEqual([2, 2]);
  });

  describe("with --json", () => {
    it("prints what it checked, and no problems", () => {
      const result = project(valid)("evidence.dxn", "--json");
      expect([result.code, result.stderr, JSON.parse(result.stdout)]).toEqual([
        0,
        "",
        {
          file: "evidence.dxn",
          stored: [
            { record: "Source", folder: "source", files: 2, records: 3 },
            { record: "Evidence", folder: "evidence", files: 1, records: 1 },
          ],
          problems: [],
        },
      ]);
      expect(JSON.parse(project({})("evidence.dxn", "--json").stdout).stored).toEqual([]);
    });

    it("prints each problem in stored data with its file and JSON path", () => {
      const result = project({ "source/a.json": `[{ ${card}, "tool": "figma" }]` })(
        "evidence.dxn",
        "--json",
      );
      expect([result.code, result.stderr, JSON.parse(result.stdout)]).toEqual([
        1,
        "",
        {
          file: "evidence.dxn",
          problems: [
            {
              file: "source/a.json",
              line: 1,
              column: 75,
              severity: "error",
              code: "unknown-value",
              path: "$[0].tool",
              message: '"figma" is not a value of Tool (pen-dev, code)',
            },
          ],
        },
      ]);
    });

    it("prints a refusal as an error", () => {
      const result = project({ "part/a.json": '[{ "tool": "code" }]' })("evidence.dxn", "--json");
      expect([result.code, result.stderr, JSON.parse(result.stdout)]).toEqual([
        1,
        "",
        {
          error: 'Part is stored in part/, but has no context; declare "record Part with context"',
        },
      ]);
    });
  });
});

describe("lang rename", () => {
  const schema = `enum Actor = design-agent | reviewer
type Card {
  state owner: Actor
}
record Evidence with context {
  actor: Actor
}
`;
  const card = (owner: string) =>
    `"context": { "type": "Card", "dimensions": {}, "states": { "owner": "${owner}" } }`;
  const stored = `[{ ${card("design-agent")}, "actor": "design-agent" }, { ${card("reviewer")}, "actor": "reviewer" }]\n`;
  const renamed = `[{ ${card("designer")}, "actor": "designer" }, { ${card("reviewer")}, "actor": "reviewer" }]\n`;
  const project = (data: string) => {
    const root = writeProject({});
    writeFileSync(join(root, "evidence.dxn"), schema);
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "page.json"), data);
    const run = (...args: string[]) => capture(["lang", "rename", ...args], root);
    const dryRun = (...args: string[]) => capture(["--dry-run", "lang", "rename", ...args], root);
    const read = (path: string) => readFileSync(join(root, path), "utf8");
    return { run, dryRun, read };
  };

  it("renames an enum value in the file and in every stored record, and says what changed", () => {
    const { run, read } = project(stored);
    const result = run("evidence.dxn", "Actor.design-agent", "designer");
    expect([result.code, result.stdout, read("evidence.dxn"), read("evidence/page.json")]).toEqual([
      0,
      "Renamed Actor.design-agent to designer in evidence.dxn, evidence/page.json (2 values)\n",
      schema.replace("design-agent", "designer"),
      renamed,
    ]);
  });

  it("says what it would rename with --dry-run, and writes nothing", () => {
    const { dryRun, read } = project(stored);
    const result = dryRun("evidence.dxn", "Actor.design-agent", "designer");
    expect([result.code, result.stdout, read("evidence.dxn")]).toEqual([
      0,
      "Would rename Actor.design-agent to designer in evidence.dxn, evidence/page.json (2 values)\n",
      schema,
    ]);
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
      "dxn: Actr is not an enum (Actor)\n",
      "dxn: Evidence is a record, not an enum\n",
      'dxn: "designer" is not a value of Actor (design-agent, reviewer)\n',
      'dxn: "reviewer" is already a value of Actor\n',
      'dxn: "design agent" is not a value: a letter or digit, then letters, digits and hyphens\n',
      schema,
    ]);
  });

  it("refuses while the stored records have problems, so a rename never mixes with them", () => {
    const { run, read } = project(`[{ ${card("reviewer")}, "actor": "maker" }]\n`);
    const result = run("evidence.dxn", "Actor.design-agent", "designer");
    expect([result.code, result.stderr, read("evidence.dxn")]).toEqual([
      1,
      'evidence/page.json:1:97: unknown-value: $[0].actor: "maker" is not a value of Actor (design-agent, reviewer)\n',
      schema,
    ]);
  });

  it("renames a value of an enum inside a type, by its full name", () => {
    const root = writeProject({});
    const source = "type Menu {\n  enum State = closed | open\n  state menu: State\n}\n";
    writeFileSync(join(root, "menu.dxn"), source);
    const result = capture(["lang", "rename", "menu.dxn", "Menu.State.open", "shown"], root);
    expect([result.code, readFileSync(join(root, "menu.dxn"), "utf8")]).toEqual([
      0,
      source.replace("closed | open", "closed | shown"),
    ]);
  });

  it("needs a file, an enum's value and its new name", () => {
    const { run } = project(stored);
    expect([
      run("evidence.dxn", "Actor.design-agent").code,
      run("evidence.dxn", "Actor", "x").code,
    ]).toEqual([2, 2]);
  });

  describe("with --json", () => {
    it("prints what changed, and no problems", () => {
      const { run } = project(stored);
      const result = run("evidence.dxn", "Actor.design-agent", "designer", "--json");
      expect([result.code, result.stderr, JSON.parse(result.stdout)]).toEqual([
        0,
        "",
        {
          file: "evidence.dxn",
          enum: "Actor",
          from: "design-agent",
          to: "designer",
          written: ["evidence.dxn", "evidence/page.json"],
          records: 2,
          problems: [],
        },
      ]);
    });

    it("prints every file it would write with --dry-run, and writes nothing", () => {
      const { dryRun, read } = project(stored);
      const result = dryRun("evidence.dxn", "Actor.design-agent", "designer", "--json");
      expect([result.code, JSON.parse(result.stdout), read("evidence.dxn")]).toEqual([
        0,
        {
          dryRun: true,
          written: {
            "evidence.dxn": schema.replace("design-agent", "designer"),
            "evidence/page.json": renamed,
          },
          problems: [],
        },
        schema,
      ]);
    });

    it("prints a refusal as an error, and problems in stored data with their paths", () => {
      const { run } = project(stored);
      const refused = run("evidence.dxn", "Actr.design-agent", "designer", "--json");
      const broken = project(`[{ ${card("reviewer")}, "actor": "maker" }]\n`).run(
        "evidence.dxn",
        "Actor.design-agent",
        "designer",
        "--json",
      );
      expect([
        refused.code,
        JSON.parse(refused.stdout),
        broken.code,
        broken.stderr,
        JSON.parse(broken.stdout).problems.map(
          ({ file, code, path }: { file: string; code: string; path: string }) => [
            file,
            code,
            path,
          ],
        ),
      ]).toEqual([
        1,
        { error: "Actr is not an enum (Actor)" },
        1,
        "",
        [["evidence/page.json", "unknown-value", "$[0].actor"]],
      ]);
    });
  });
});
