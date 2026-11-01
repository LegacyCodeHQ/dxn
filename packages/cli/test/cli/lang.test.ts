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
      "dimension Breakpoint = base | lg\nenum Hover = rest | hovered\ntype Wordmark needs Breakpoint {\n  state hover: Hover\n  alike Breakpoint\n}\n",
    );
    const result = run("check", "wordmark.dxn");
    expect([result.code, result.stdout, result.stderr]).toEqual([
      0,
      "wordmark.dxn: 1 enum, 1 dimension, 1 type\n",
      "wordmark.dxn:3:21: warning: unused-need: Wordmark needs Breakpoint, but nothing in it uses it, and it is alike throughout\n",
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
                  when: { kind: "compare", subject: "Pointer", values: ["mouse"] },
                },
              ],
            },
          ],
          environments: [],
          profiles: [],
          modifiers: [],
          records: [],
          expectations: [],
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
        "dimension Breakpoint = base | lg\nenum Hover = rest | hovered\ntype Wordmark needs Breakpoint {\n  state hover: Hover\n  alike Breakpoint\n}\n",
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
            message:
              "Wordmark needs Breakpoint, but nothing in it uses it, and it is alike throughout",
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
        "| Pointer | Keyboard    | hover         | focus            |",
        "| ------- | ----------- | ------------- | ---------------- |",
        "| mouse   | keyboard    | rest, hovered | blurred, focused |",
        "| mouse   | no-keyboard | rest, hovered | blurred          |",
        "| touch   | keyboard    | rest          | blurred, focused |",
        "| touch   | no-keyboard | rest          | blurred          |",
        "",
      ].join("\n"),
    ]);
  });

  it("says when a type, or a child in place, has one combination with nothing in it", () => {
    const run = file("type Card {}\ntype Page {\n  has card: Card\n}\n");
    expect([
      run("states", "wordmark.dxn", "Card").stdout,
      run("states", "wordmark.dxn", "Page.card").stdout,
    ]).toEqual([
      "Card: one combination, with no states\n",
      "Page.card: one combination, with no states\n",
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
        "| Breakpoint | layout  | has links | has menu |",
        "| ---------- | ------- | --------- | -------- |",
        "| base       | compact | —         | ✓        |",
        "| lg         | inline  | ✓         | —        |",
        "",
      ].join("\n"),
      [
        "| menu         | has panel   |",
        "| ------------ | ----------- |",
        "| closed, open | menu = open |",
        "",
      ].join("\n"),
    ]);
  });

  it("evaluates a child in place, by its path from a type", () => {
    const run = file(`dimension Breakpoint = base | lg
dimension Pointer = mouse | touch
enum Hover = rest | hovered
enum Layout = compact | inline
type Menu {
  enum State = closed | open
  state menu: State
  type Toggle needs Pointer {
    state hover: Hover
    state expanded: State
    hover = hovered only when Pointer = mouse
  }
  has toggle: Toggle { expanded = menu }
}
type Toolbar needs Breakpoint {
  state layout: Layout = when Breakpoint {
    base -> compact
    lg -> inline
  }
  has menu: Menu only when layout = compact
}
environment Device = Breakpoint x Pointer
profile phone: Device { Breakpoint = base, Pointer = touch }
profile laptop: Device { Breakpoint = lg, Pointer = mouse }
`);
    expect([
      run("states", "wordmark.dxn", "Toolbar.menu.toggle").stdout,
      run("states", "wordmark.dxn", "Toolbar.menu.togle").stderr,
    ]).toEqual([
      [
        "In every row: phone, Breakpoint = base, Pointer = touch, layout = compact",
        "",
        "| menu.menu | hover | expanded |",
        "| --------- | ----- | -------- |",
        "| closed    | rest  | closed   |",
        "| open      | rest  | open     |",
        "",
      ].join("\n"),
      "dxn: togle is not a child of Menu (toggle)\n",
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
        "| profiles       | Pointer | Keyboard    | hover         | focus            |",
        "| -------------- | ------- | ----------- | ------------- | ---------------- |",
        "| phone          | touch   | no-keyboard | rest          | blurred          |",
        "| laptop, studio | mouse   | keyboard    | rest, hovered | blurred, focused |",
        "",
      ].join("\n"),
    );
  });

  it("shows one row for rows that read the same, and no profiles where none differ", () => {
    const devices = `dimension Breakpoint = base | lg
${wordmark}environment Device = Breakpoint x Pointer x Keyboard
profile phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile tablet: Device { Breakpoint = lg, Pointer = touch, Keyboard = no-keyboard }
profile laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
type Menu {
  enum State = closed | open
  state menu: State
}
`;
    const run = file(devices);
    expect([
      run("states", "wordmark.dxn", "Wordmark").stdout,
      run("states", "wordmark.dxn", "Menu").stdout,
    ]).toEqual([
      [
        "| profiles      | Pointer | Keyboard    | hover         | focus            |",
        "| ------------- | ------- | ----------- | ------------- | ---------------- |",
        "| phone, tablet | touch   | no-keyboard | rest          | blurred          |",
        "| laptop        | mouse   | keyboard    | rest, hovered | blurred, focused |",
        "",
      ].join("\n"),
      ["| menu         |", "| ------------ |", "| closed, open |", ""].join("\n"),
    ]);
  });

  it("shows a state another depends on next to the dimensions, as where a row is", () => {
    const button = `dimension Pointer = mouse | touch
enum Enabled = enabled | disabled
enum Hover = rest | hovered
type Button needs Pointer {
  state hover: Hover
  state enabled: Enabled
  hover = hovered only when Pointer = mouse and enabled = enabled
}
`;
    expect(file(button)("states", "wordmark.dxn", "Button").stdout).toBe(
      [
        "| Pointer | enabled  | hover         |",
        "| ------- | -------- | ------------- |",
        "| mouse   | enabled  | rest, hovered |",
        "| mouse   | disabled | rest          |",
        "| touch   | enabled  | rest          |",
        "| touch   | disabled | rest          |",
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
    "source/designs.json": `[{ ${card}, "tool": "pen-dev" }]`,
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
        "evidence.dxn: Source, 2 records in 2 files in source/",
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
            { record: "Source", folder: "source", files: 2, records: 2 },
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

describe("lang states --distinct", () => {
  it("lists, without profiles, each combination a case covers, by the values it does not show", () => {
    const run = file(
      "dimension Pointer = mouse | touch\nenum Hover = rest | hovered\ntype Link needs Pointer {\n  state hover: Hover\n  hover = hovered only when Pointer = mouse\n  alike Pointer\n}\n",
    );
    expect(run("states", "wordmark.dxn", "Link", "--distinct").stdout).toBe(
      [
        "Link: 2 distinct of 3 combinations",
        "",
        "| hover   | combinations                     |",
        "| ------- | -------------------------------- |",
        "| rest    | Pointer = mouse; Pointer = touch |",
        "| hovered | Pointer = mouse                  |",
        "",
      ].join("\n"),
    );
  });

  it("groups the combinations that are alike, each distinct case with the profiles it covers", () => {
    const run = file(`dimension Pointer = mouse | touch
enum Enabled = enabled | disabled
enum Hover = rest | hovered
type Button needs Pointer {
  state enabled: Enabled
  state hover: Hover
  hover = hovered only when Pointer = mouse and enabled = enabled
  alike Pointer
}
environment Device = Pointer
profile phone: Device { Pointer = touch }
profile laptop: Device { Pointer = mouse }
type Page {
  has button: Button
}
`);
    expect([
      run("states", "wordmark.dxn", "Button", "--distinct").stdout,
      run("states", "wordmark.dxn", "Page.button", "--distinct").stdout.split("\n")[0],
      JSON.parse(run("states", "wordmark.dxn", "Button", "--distinct", "--json").stdout).distinct
        .length,
    ]).toEqual([
      [
        "Button: 3 distinct of 5 combinations",
        "",
        "| enabled  | hover   | profiles      |",
        "| -------- | ------- | ------------- |",
        "| enabled  | rest    | phone, laptop |",
        "| disabled | rest    | phone, laptop |",
        "| enabled  | hovered | laptop        |",
        "",
      ].join("\n"),
      "Page.button: 3 distinct of 5 combinations",
      3,
    ]);
  });
});

describe("lang states, with a child on several states", () => {
  it("shows where the child is by its condition", () => {
    const root = writeProject({});
    writeFileSync(
      join(root, "menu.dxn"),
      "dimension Breakpoint = base | lg\nenum State = closed | open\nenum Size = small | big\ntype Panel {}\ntype Menu needs Breakpoint {\n  state menu: State, size: Size\n  has panel: Panel only when menu = open and (size = big or Breakpoint = lg)\n}\n",
    );
    const lines = capture(["lang", "states", "menu.dxn", "Menu"], root).stdout.split("\n");
    expect(lines.slice(2, 4).map((line) => line.split("|").at(-2)?.trim())).toEqual([
      "menu = open and (size = big or Breakpoint = lg)",
      "menu = open",
    ]);
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

  it("refuses a rename that would leave problems, saying which", () => {
    const root = writeProject({});
    const source = `enum State = closed | open
enum Other = open | shut
type A {
  state m: State
}
type B {
  state m: Other
}
type Page {
  has a: A
  has b: B
}
expect "Each m can be open" {
  in Page and below
  some m = open
}
`;
    writeFileSync(join(root, "page.dxn"), source);
    const result = capture(["lang", "rename", "page.dxn", "State.open", "shown"], root);
    expect([
      result.code,
      result.stdout,
      result.stderr,
      readFileSync(join(root, "page.dxn"), "utf8"),
    ]).toEqual([
      1,
      "",
      "page.dxn:13:8: expectation-failed: Each m can be open: no combination of Page.b has m = shown\ndxn: the rename would leave problems; nothing was written\n",
      source,
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

describe("lang status", () => {
  const schema = `dimension Pointer = mouse | touch
enum Hover = rest | hovered
type Toolbar {
  has link: Link
}
type Link needs Pointer {
  state hover: Hover
  hover = hovered only when Pointer = mouse
}
environment Device = Pointer
profile phone: Device { Pointer = touch }
profile laptop: Device { Pointer = mouse }
record Evidence with context {}
`;
  const project = (data: string) => {
    const root = writeProject({});
    writeFileSync(join(root, "toolbar.dxn"), schema);
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "toolbar.json"), data);
    return (...args: string[]) => capture(["lang", "status", ...args], root);
  };
  const link = (profile: string, hover: string) =>
    `{ "context": { "path": "Toolbar.link", "profile": "${profile}", "dimensions": {}, "parents": {}, "states": { "hover": "${hover}" } } }`;

  it("says how many combinations of each element have evidence", () => {
    const result = project(`[${link("phone", "rest")}, ${link("laptop", "hovered")}]`)(
      "toolbar.dxn",
    );
    expect([result.code, result.stdout]).toEqual([
      0,
      [
        "toolbar.dxn: Evidence for 2 of 5 combinations; Evidence has no fingerprint field next to a source { file, frame }, so staleness is not checked",
        "",
        "| path         | combinations | present | stale | gone | missing |",
        "| ------------ | ------------ | ------- | ----- | ---- | ------- |",
        "| Toolbar      | 2            | 0       | 0     | 0    | 2       |",
        "| Toolbar.link | 3            | 2       | 0     | 0    | 1       |",
        "",
      ].join("\n"),
    ]);
  });

  it("lists what is missing with --missing, and gives it all as JSON with --json", () => {
    const run = project(`[${link("phone", "rest")}, ${link("laptop", "hovered")}]`);
    const missing = run("toolbar.dxn", "--missing").stdout.split("\n");
    expect(missing.slice(-5)).toEqual([
      "Missing:",
      "  Toolbar on phone",
      "  Toolbar on laptop",
      "  Toolbar.link on laptop: hover = rest",
      "",
    ]);
    const json = JSON.parse(run("toolbar.dxn", "--json").stdout);
    expect([json.records[0].record, json.records[0].combinations, json.records[0].present]).toEqual(
      ["Evidence", 5, 2],
    );
  });

  it("reports the stored records' problems first, and counts nothing", () => {
    const result = project(`[${link("phone", "hovered")}]`)("toolbar.dxn");
    expect([result.code, result.stdout]).toEqual([1, ""]);
  });
});

describe("lang status, with a received state", () => {
  it("refuses a tree where a received state has no provider above it", () => {
    const root = writeProject({});
    writeFileSync(
      join(root, "site.dxn"),
      "enum Section = home | blog\ntype Links receives current: Section {}\ntype Toolbar {\n  has links: Links\n}\nrecord Evidence with context {}\n",
    );
    expect(capture(["lang", "status", "site.dxn"], root).stderr).toBe(
      "dxn: Toolbar.links: current is received by Links, but nothing above it provides it\n",
    );
  });
});
