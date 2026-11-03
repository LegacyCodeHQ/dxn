import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture, inProject } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

// Runs dxn beside wordmark.dxn, holding this source.
const file = (source: string) => inProject({ "wordmark.dxn": source });

describe("dxn check", () => {
  it("says what a file declares, in one line, counting each kind it has", () => {
    const run = file(
      "enum Hover = rest | hovered\nenum Focus = blurred | focused\ndimension Pointer = mouse | touch\ntype Wordmark needs Pointer {\n  state hover: Hover\n  state focus: Focus\n  hover = hovered only when Pointer = mouse\n}\nenvironment Device = Pointer\nprofile Tablet: Device { Pointer = touch }\nmodifier Trackpad on Tablet { Pointer = mouse }\nrecord Note {\n  hover: Hover\n}\n",
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
      "wordmark.dxn:3:21: warning: unused-need: `Wordmark` needs `Breakpoint`, but nothing in it uses it, and it is alike throughout\n",
    ]);
  });

  it("reports every problem with its file, line and column, and fails", () => {
    const run = file("enum hover = rest\nenum Ring = none | none\n");
    const result = run("check", "wordmark.dxn");
    expect([result.code, result.stderr, result.stdout]).toEqual([
      1,
      [
        "wordmark.dxn:1:6: error: enum-name: enum names start with a capital letter: `hover`",
        "wordmark.dxn:1:6: warning: unused-enum: `hover` is not used: no state or record field takes its values",
        "wordmark.dxn:2:6: warning: unused-enum: `Ring` is not used: no state or record field takes its values",
        "wordmark.dxn:2:20: error: duplicate-value: `none` appears twice in `Ring`",
        "",
      ].join("\n"),
      "",
    ]);
  });

  describe("with --expect", () => {
    const expectations = `enum State = closed | open
type Menu {
  state menu: State
}
expect "The menu can be open" {
  in Menu
  some menu = open
}
expect "The menu is always closed" {
  in Menu
  then menu = closed
}
`;

    it("runs one expectation by its title, and says it holds", () => {
      const result = file(expectations)(
        "check",
        "wordmark.dxn",
        "--expect",
        "The menu can be open",
      );
      expect([result.code, result.stdout, result.stderr]).toEqual([
        0,
        "wordmark.dxn: The menu can be open holds\n",
        "",
      ]);
    });

    it("takes a title as it is written in the file, quotes and all", () => {
      const result = file(expectations)(
        "check",
        "wordmark.dxn",
        "--expect",
        '"The menu can be open"',
      );
      expect([result.code, result.stdout]).toEqual([
        0,
        "wordmark.dxn: The menu can be open holds\n",
      ]);
    });

    it("reports only that expectation when it fails, and fails", () => {
      const result = file(expectations)(
        "check",
        "wordmark.dxn",
        "--expect",
        "The menu is always closed",
      );
      expect([result.code, result.stdout, result.stderr.split("\n")[0]]).toEqual([
        1,
        "",
        "wordmark.dxn:9:8: error: expectation-failed: The menu is always closed: `Menu` has `menu = open`",
      ]);
    });

    it("still fails a file with other problems, which no expectation can hold in", () => {
      const result = file(`${expectations}enum Broken = a | a\n`)(
        "check",
        "wordmark.dxn",
        "--expect",
        "The menu can be open",
      );
      expect([result.code, result.stderr]).toEqual([
        1,
        "wordmark.dxn:13:6: warning: unused-enum: `Broken` is not used: no state or record field takes its values\nwordmark.dxn:13:19: error: duplicate-value: `a` appears twice in `Broken`\n",
      ]);
    });

    it("refuses a title no expectation has, with the titles close to it", () => {
      const result = file(expectations)("check", "wordmark.dxn", "--expect", "The menu can be opn");
      expect([result.code, result.stderr]).toEqual([
        1,
        'dxn: no expectation is titled "The menu can be opn"; did you mean "The menu can be open"?\n',
      ]);
    });

    it("prints whether it holds with --json", () => {
      const result = file(expectations)(
        "check",
        "wordmark.dxn",
        "--expect",
        "The menu can be open",
        "--json",
      );
      expect(JSON.parse(result.stdout)).toEqual({
        file: "wordmark.dxn",
        expectation: "The menu can be open",
        holds: true,
        problems: [],
      });
    });

    it("needs a title", () => {
      expect(file(expectations)("check", "wordmark.dxn", "--expect").code).toBe(2);
    });
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
        "enum Hover = rest | hovered\nenum Size = 19px | 20px | 22px\ndimension Breakpoint = base | lg\ndimension Pointer = mouse | touch\ntype Wordmark needs Pointer {\n  state hover: Hover\n  state size: Size\n  hover = hovered only when Pointer = mouse\n}\n",
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
              states: [
                { name: "hover", enum: "Hover" },
                { name: "size", enum: "Size" },
              ],
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
        "enum Tool = pen-dev | code\ndimension Pointer = mouse | touch\nenvironment Device = Pointer\nprofile Tablet: Device { Pointer = touch }\nmodifier Trackpad on Tablet { Pointer = mouse }\nrecord Source {\n  tool: Tool\n}\n",
      );
      const output = JSON.parse(run("check", "wordmark.dxn", "--json").stdout);
      expect([output.modifiers, output.records]).toEqual([
        [{ name: "Trackpad", on: ["Tablet"], values: { Pointer: "mouse" } }],
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
              "`Wordmark` needs `Breakpoint`, but nothing in it uses it, and it is alike throughout",
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
              message: "enum names start with a capital letter: `hover`",
            },
            {
              file: "wordmark.dxn",
              line: 1,
              column: 6,
              severity: "warning",
              code: "unused-enum",
              message: "`hover` is not used: no state or record field takes its values",
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

describe("dxn states", () => {
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
profile Phone: Device { Breakpoint = base, Pointer = touch }
profile Laptop: Device { Breakpoint = lg, Pointer = mouse }
`);
    expect([
      run("states", "wordmark.dxn", "Toolbar.menu.toggle").stdout,
      run("states", "wordmark.dxn", "Toolbar.menu.togle").stderr,
    ]).toEqual([
      [
        "In every row: Phone, Breakpoint = base, Pointer = touch, layout = compact",
        "",
        "| menu.menu | hover | expanded |",
        "| --------- | ----- | -------- |",
        "| closed    | rest  | closed   |",
        "| open      | rest  | open     |",
        "",
      ].join("\n"),
      "dxn: `togle` is not a child of `Menu`; did you mean `toggle`?\n",
    ]);
  });

  it("names the profiles of each row when there are profiles", () => {
    const withProfiles = `dimension Breakpoint = base | lg
${wordmark}environment Device = Breakpoint x Pointer x Keyboard
profile Phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile Laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
profile Studio: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
`;
    expect(file(withProfiles)("states", "wordmark.dxn", "Wordmark").stdout).toBe(
      [
        "| profiles       | Pointer | Keyboard    | hover         | focus            |",
        "| -------------- | ------- | ----------- | ------------- | ---------------- |",
        "| Phone          | touch   | no-keyboard | rest          | blurred          |",
        "| Laptop, Studio | mouse   | keyboard    | rest, hovered | blurred, focused |",
        "",
      ].join("\n"),
    );
  });

  it("shows one row for rows that read the same, and no profiles where none differ", () => {
    const devices = `dimension Breakpoint = base | lg
${wordmark}environment Device = Breakpoint x Pointer x Keyboard
profile Phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile Tablet: Device { Breakpoint = lg, Pointer = touch, Keyboard = no-keyboard }
profile Laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
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
        "| Phone, Tablet | touch   | no-keyboard | rest          | blurred          |",
        "| Laptop        | mouse   | keyboard    | rest, hovered | blurred, focused |",
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
      "dxn: no type `Wordmrk` in wordmark.dxn (`Wordmark`)\n",
      "wordmark.dxn:1:6: error: enum-name: enum names start with a capital letter: `hover`\nwordmark.dxn:1:6: warning: unused-enum: `hover` is not used: no state or record field takes its values\n",
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
        { error: "no type `Wordmrk` in wordmark.dxn (`Wordmark`)" },
        1,
        "",
        ["enum-name", "unused-enum"],
      ]);
    });
  });
});

describe("dxn validate", () => {
  const schema = `enum Tool = pen-dev | code
type Card {}
record Source {
  tool: Tool
}
record Evidence {
  at: Timestamp
}
record Part {
  tool: Tool
}
actor SourceRecorder records Source
actor EvidenceRecorder records Evidence
`;
  // A stored record of Card, which has one combination.
  const card = '"context": { "type": "Card", "dimensions": {}, "states": {} }';
  // A folder with the schema in it, and these files, by path from it.
  const project = (files: Record<string, string>, at = "evidence.dxn") =>
    inProject({ [at]: schema, ...files }, "validate");
  const valid = {
    "source/designs.json": `[{ ${card}, "tool": "pen-dev", "actor": "SourceRecorder" }]`,
    "source/code.json": `[{ ${card}, "tool": "code", "actor": "SourceRecorder" }]`,
    "source/notes.md": "not data",
    "source/old/ignored.json": "not checked",
    "evidence/a.json": `[{ ${card}, "at": "2026-10-31T08:50:05Z", "actor": "EvidenceRecorder" }]`,
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
      "dxn: `Part` is stored in part/, but no actor records it; declare `actor <name> records Part`\n",
      "",
    ]);
  });

  it("reports every problem in every file, with the file's path, and fails", () => {
    const result = project({
      "source/a.json": `[{ ${card}, "tool": "figma", "actor": "SourceRecorder" }]`,
      "evidence/b.json": `[{ ${card}, "at": "yesterday", "actor": "EvidenceRecorder" }]`,
      "evidence/c.json": `{ ${card}, "at": "2026-10-31T08:50:05Z", "actor": "EvidenceRecorder" }`,
    })("evidence.dxn");
    expect([result.code, result.stderr.split("\n"), result.stdout]).toEqual([
      1,
      [
        "source/a.json:1:75: error: unknown-value: $[0].tool: `figma` is not a value of `Tool` (`pen-dev`, `code`)",
        'evidence/b.json:1:73: error: invalid-value: $[0].at: "yesterday" is not a `Timestamp`: an ISO 8601 date and time with a time zone, e.g. 2026-10-31T08:50:05Z',
        "evidence/c.json:1:1: error: wrong-kind: $: expected a list of `Evidence` records, found an object",
        "",
      ],
      "",
    ]);
  });

  it("looks for the folders next to the file", () => {
    const result = project(
      {
        "model/source/a.json": `[{ ${card}, "tool": "lisp", "actor": "SourceRecorder" }]`,
        "source/b.json": `[{ ${card}, "tool": "lisp", "actor": "SourceRecorder" }]`,
      },
      "model/evidence.dxn",
    )("model/evidence.dxn");
    expect(result.stderr).toBe(
      "model/source/a.json:1:75: error: unknown-value: $[0].tool: `lisp` is not a value of `Tool` (`pen-dev`, `code`)\n",
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
      const result = project({
        "source/a.json": `[{ ${card}, "tool": "figma", "actor": "SourceRecorder" }]`,
      })("evidence.dxn", "--json");
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
              message: "`figma` is not a value of `Tool` (`pen-dev`, `code`)",
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
          error:
            "`Part` is stored in part/, but no actor records it; declare `actor <name> records Part`",
        },
      ]);
    });
  });
});

describe("dxn cases", () => {
  const button = `dimension Pointer = mouse | touch
enum Enabled = enabled | disabled
enum Hover = rest | hovered
type Button needs Pointer {
  state enabled: Enabled
  state hover: Hover
  hover = hovered only when Pointer = mouse and enabled = enabled
  alike Pointer
}
environment Device = Pointer
profile Phone: Device { Pointer = touch }
profile Laptop: Device { Pointer = mouse }
type Page {
  has button: Button
}
`;

  it("lists each case, and nothing more when each is one combination", () => {
    const run = file(
      "enum Enabled = enabled | disabled\ntype Button {\n  state enabled: Enabled\n}\n",
    );
    expect(run("cases", "wordmark.dxn", "Button").stdout).toBe(
      [
        "Button: 2 cases",
        "",
        "| enabled  |",
        "| -------- |",
        "| enabled  |",
        "| disabled |",
        "",
      ].join("\n"),
    );
  });

  it("lists, without profiles, each combination a case covers, by the values it does not show", () => {
    const run = file(
      "dimension Pointer = mouse | touch\nenum Hover = rest | hovered\ntype Link needs Pointer {\n  state hover: Hover\n  hover = hovered only when Pointer = mouse\n  alike Pointer\n}\n",
    );
    expect(run("cases", "wordmark.dxn", "Link").stdout).toBe(
      [
        "Link: 2 cases of 3 combinations",
        "",
        "| hover   | combinations                     |",
        "| ------- | -------------------------------- |",
        "| rest    | Pointer = mouse; Pointer = touch |",
        "| hovered | Pointer = mouse                  |",
        "",
      ].join("\n"),
    );
  });

  it("groups the combinations that are alike, each case with the profiles it covers", () => {
    const run = file(button);
    expect([
      run("cases", "wordmark.dxn", "Button").stdout,
      run("cases", "wordmark.dxn", "Page.button").stdout.split("\n")[0],
      JSON.parse(run("cases", "wordmark.dxn", "Button", "--json").stdout).cases.length,
    ]).toEqual([
      [
        "Button: 3 cases of 5 combinations",
        "",
        "| enabled  | hover   | profiles      |",
        "| -------- | ------- | ------------- |",
        "| enabled  | rest    | Phone, Laptop |",
        "| disabled | rest    | Phone, Laptop |",
        "| enabled  | hovered | Laptop        |",
        "",
      ].join("\n"),
      "Page.button: 3 cases of 5 combinations",
      3,
    ]);
  });

  it("lists every combination, with --combinations, as if nothing were alike", () => {
    const run = file(button);
    expect(run("cases", "wordmark.dxn", "Button", "--combinations").stdout).toBe(
      [
        "Button: 5 combinations",
        "",
        "| profiles | Pointer | enabled  | hover   |",
        "| -------- | ------- | -------- | ------- |",
        "| Phone    | touch   | enabled  | rest    |",
        "| Phone    | touch   | disabled | rest    |",
        "| Laptop   | mouse   | enabled  | rest    |",
        "| Laptop   | mouse   | enabled  | hovered |",
        "| Laptop   | mouse   | disabled | rest    |",
        "",
      ].join("\n"),
    );
  });

  it("refuses what it cannot list, and needs a file and a type", () => {
    const run = file(button);
    expect([
      run("cases", "wordmark.dxn", "Buton").stderr,
      run("cases", "wordmark.dxn").code,
      run("states", "wordmark.dxn", "Button", "--distinct").code,
    ]).toEqual(["dxn: no type `Buton`\n", 2, 2]);
  });
});

describe("dxn states, with a child on several states", () => {
  it("shows where the child is by its condition", () => {
    const root = writeProject({});
    writeFileSync(
      join(root, "menu.dxn"),
      "dimension Breakpoint = base | lg\nenum State = closed | open\nenum Size = small | big\ntype Panel {}\ntype Menu needs Breakpoint {\n  state menu: State, size: Size\n  has panel: Panel only when menu = open and (size = big or Breakpoint = lg)\n}\n",
    );
    const lines = capture(["states", "menu.dxn", "Menu"], root).stdout.split("\n");
    expect(lines.slice(2, 4).map((line) => line.split("|").at(-2)?.trim())).toEqual([
      "menu = open and (size = big or Breakpoint = lg)",
      "menu = open",
    ]);
  });
});

describe("dxn rename", () => {
  const schema = `enum Actor = design-agent | reviewer
type Card {
  state owner: Actor
}
record Evidence {
}
actor DesignAgent records Evidence
actor Reviewer records Evidence
`;
  const card = (owner: string) =>
    `"context": { "type": "Card", "dimensions": {}, "states": { "owner": "${owner}" } }`;
  const stored = `[{ ${card("design-agent")}, "actor": "DesignAgent" }, { ${card("reviewer")}, "actor": "Reviewer" }]\n`;
  // The owner renamed; the actor, who recorded it, is not the owner's value.
  const renamed = `[{ ${card("designer")}, "actor": "DesignAgent" }, { ${card("reviewer")}, "actor": "Reviewer" }]\n`;
  const project = (data: string) => {
    const root = writeProject({ "evidence.dxn": schema, "evidence/page.json": data });
    const run = (...args: string[]) => capture(["rename", ...args], root);
    const dryRun = (...args: string[]) => capture(["--dry-run", "rename", ...args], root);
    const read = (path: string) => readFileSync(join(root, path), "utf8");
    return { run, dryRun, read };
  };

  it("renames an enum value in the file and in every stored record, and says what changed", () => {
    const { run, read } = project(stored);
    const result = run("evidence.dxn", "Actor.design-agent", "designer");
    expect([result.code, result.stdout, read("evidence.dxn"), read("evidence/page.json")]).toEqual([
      0,
      "Renamed value Actor.design-agent to designer in evidence.dxn, evidence/page.json (1 change in stored records)\n",
      schema.replace("design-agent", "designer"),
      renamed,
    ]);
  });

  it("says what it would rename with --dry-run, and writes nothing", () => {
    const { dryRun, read } = project(stored);
    const result = dryRun("evidence.dxn", "Actor.design-agent", "designer");
    expect([result.code, result.stdout, read("evidence.dxn")]).toEqual([
      0,
      "Would rename value Actor.design-agent to designer in evidence.dxn, evidence/page.json (1 change in stored records)\n",
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
      "dxn: nothing is declared as `Actr.design-agent`; did you mean `Actor.design-agent`?\n",
      "dxn: nothing is declared as `Evidence.design-agent` (`Actor`, `Actor.design-agent`, `Actor.reviewer`, `Card`, `Card.owner`, `Evidence`, `DesignAgent`, `Reviewer`)\n",
      "dxn: nothing is declared as `Actor.designer` (`Actor.design-agent`, `Actor.reviewer`)\n",
      "evidence.dxn:1:25: error: duplicate-value: `reviewer` appears twice in `Actor`\ndxn: the rename would leave problems; nothing was written\n",
      "dxn: `design agent` is not a value name: lowercase letters and digits, with single hyphens between them, and not `when` or `else`\n",
      schema,
    ]);
  });

  it("renames an actor, and every stored record it recorded", () => {
    const { run, read } = project(stored);
    const result = run("evidence.dxn", "DesignAgent", "Designer");
    expect([result.code, result.stdout, read("evidence.dxn"), read("evidence/page.json")]).toEqual([
      0,
      "Renamed actor DesignAgent to Designer in evidence.dxn, evidence/page.json (1 change in stored records)\n",
      schema.replace("actor DesignAgent", "actor Designer"),
      stored.replace('"actor": "DesignAgent"', '"actor": "Designer"'),
    ]);
  });

  it("refuses while the stored records have problems, so a rename never mixes with them", () => {
    const { run, read } = project(`[{ ${card("reviewer")}, "actor": "maker" }]\n`);
    const result = run("evidence.dxn", "Actor.design-agent", "designer");
    expect([result.code, result.stderr, read("evidence.dxn")]).toEqual([
      1,
      "evidence/page.json:1:97: error: unknown-actor: $[0].actor: `maker` is not an actor who records `Evidence` (`DesignAgent`, `Reviewer`)\n",
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
    const result = capture(["rename", "page.dxn", "State.open", "shown"], root);
    expect([
      result.code,
      result.stdout,
      result.stderr,
      readFileSync(join(root, "page.dxn"), "utf8"),
    ]).toEqual([
      1,
      "",
      "page.dxn:13:8: error: expectation-failed: Each m can be open: no combination of `Page.b` has `m = shown`\ndxn: the rename would leave problems; nothing was written\n",
      source,
    ]);
  });

  it("keeps, with --json, the problems a refusal found beside its error", () => {
    const root = writeProject({});
    writeFileSync(
      join(root, "page.dxn"),
      'enum State = closed | open\nenum Other = open | shut\ntype A {\n  state m: State\n}\ntype B {\n  state m: Other\n}\ntype Page {\n  has a: A\n  has b: B\n}\nexpect "Each m can be open" {\n  in Page and below\n  some m = open\n}\n',
    );
    const result = capture(["rename", "page.dxn", "State.open", "shown", "--json"], root);
    const output = JSON.parse(result.stdout);
    expect([
      result.code,
      output.error,
      output.problems.map(({ code }: { code: string }) => code),
    ]).toEqual([1, "the rename would leave problems; nothing was written", ["expectation-failed"]]);
  });

  it("renames a value of an enum inside a type, by its full name", () => {
    const root = writeProject({});
    const source = "type Menu {\n  enum State = closed | open\n  state menu: State\n}\n";
    writeFileSync(join(root, "menu.dxn"), source);
    const result = capture(["rename", "menu.dxn", "Menu.State.open", "shown"], root);
    expect([result.code, readFileSync(join(root, "menu.dxn"), "utf8")]).toEqual([
      0,
      source.replace("closed | open", "closed | shown"),
    ]);
  });

  it("needs a file, a name and its new name, or a file's line and column and the new name", () => {
    const { run } = project(stored);
    expect([
      run("evidence.dxn", "Actor.design-agent").code,
      run("evidence.dxn").code,
      run("evidence.dxn:1", "x").code,
    ]).toEqual([2, 2, 2]);
  });

  it("renames any declaration by its name, and the stored records that name it", () => {
    const { run, read } = project(stored);
    const result = run("evidence.dxn", "Card.owner", "maker");
    expect([result.code, result.stdout, read("evidence.dxn"), read("evidence/page.json")]).toEqual([
      0,
      "Renamed state Card.owner to maker in evidence.dxn, evidence/page.json (2 changes in stored records)\n",
      schema.replace("state owner", "state maker"),
      stored.replaceAll('"owner"', '"maker"'),
    ]);
  });

  it("renames the declaration at a line and a column, as an editor does", () => {
    const { run, read } = project(stored);
    const result = run("evidence.dxn:3:10", "maker");
    expect([result.code, result.stdout, read("evidence.dxn")]).toEqual([
      0,
      "Renamed state Card.owner to maker in evidence.dxn, evidence/page.json (2 changes in stored records)\n",
      schema.replace("state owner", "state maker"),
    ]);
  });

  it("moves a record's stored records to the folder named after its new name", () => {
    const { run, dryRun, read } = project(stored);
    const planned = dryRun("evidence.dxn", "Evidence", "Proof", "--json");
    const result = run("evidence.dxn", "Evidence", "Proof");
    expect([
      JSON.parse(planned.stdout).moved,
      result.code,
      result.stdout,
      read("evidence.dxn"),
      read("proof/page.json"),
    ]).toEqual([
      { from: "evidence", to: "proof" },
      0,
      "Renamed record Evidence to Proof in evidence.dxn, and moved evidence/ to proof/\n",
      schema
        .replace("record Evidence", "record Proof")
        .replaceAll("records Evidence", "records Proof"),
      stored,
    ]);
  });

  it("refuses a name that names two declarations, until it says which", () => {
    const root = writeProject({});
    const source =
      "enum State = closed | open\ntype Menu {\n  state menu: State\n  event close\n  action close: menu open -> closed\n}\n";
    writeFileSync(join(root, "menu.dxn"), source);
    const ambiguous = capture(["rename", "menu.dxn", "Menu.close", "shut"], root);
    const chosen = capture(["rename", "menu.dxn", "event:Menu.close", "shut"], root);
    expect([
      ambiguous.code,
      ambiguous.stderr,
      chosen.code,
      readFileSync(join(root, "menu.dxn"), "utf8"),
    ]).toEqual([
      1,
      "dxn: `Menu.close` names an action and an event; say which: `action:Menu.close` or `event:Menu.close`\n",
      0,
      source.replace("event close", "event shut"),
    ]);
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
          kind: "value",
          name: "Actor.design-agent",
          to: "designer",
          written: ["evidence.dxn", "evidence/page.json"],
          records: 1,
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
        {
          error: "nothing is declared as `Actr.design-agent`; did you mean `Actor.design-agent`?",
        },
        1,
        "",
        [["evidence/page.json", "unknown-actor", "$[0].actor"]],
      ]);
    });
  });
});

describe("dxn fmt", () => {
  const messy = "enum   Hover=rest|hovered\ntype Link {\nstate hover: Hover\n}\n";
  const tidy = "enum Hover = rest | hovered\ntype Link {\n  state hover: Hover\n}\n";

  it("writes each file the one way, and names the files it changed", () => {
    const root = writeProject({ "messy.dxn": messy, "tidy.dxn": tidy });
    const result = capture(["fmt", "messy.dxn", "tidy.dxn"], root);
    expect([
      result.code,
      result.stdout,
      readFileSync(join(root, "messy.dxn"), "utf8"),
      readFileSync(join(root, "tidy.dxn"), "utf8"),
    ]).toEqual([0, "messy.dxn\n", tidy, tidy]);
  });

  it("with --check, writes nothing, names the files it would change, and fails if any", () => {
    const root = writeProject({ "messy.dxn": messy, "tidy.dxn": tidy });
    const unformatted = capture(["fmt", "--check", "messy.dxn", "tidy.dxn"], root);
    const formatted = capture(["fmt", "--check", "tidy.dxn"], root);
    expect([
      unformatted.code,
      unformatted.stdout,
      readFileSync(join(root, "messy.dxn"), "utf8"),
      formatted.code,
      formatted.stdout,
    ]).toEqual([1, "messy.dxn\n", messy, 0, ""]);
  });

  it("leaves a file that does not parse alone, reports why, and still formats the others", () => {
    const broken = "enum Hover = rest hovered\n";
    const root = writeProject({ "broken.dxn": broken, "messy.dxn": messy });
    const result = capture(["fmt", "broken.dxn", "messy.dxn"], root);
    expect([
      result.code,
      result.stdout,
      result.stderr,
      readFileSync(join(root, "broken.dxn"), "utf8"),
      readFileSync(join(root, "messy.dxn"), "utf8"),
    ]).toEqual([
      1,
      "messy.dxn\n",
      "broken.dxn:1:19: error: syntax-error: expected `|` or the end of the line after `rest`, found `hovered`\n",
      broken,
      tidy,
    ]);
  });

  it("prints what it changed, or would, with --json", () => {
    const root = writeProject({ "messy.dxn": messy, "tidy.dxn": tidy });
    const checked = capture(["fmt", "--check", "messy.dxn", "tidy.dxn", "--json"], root);
    const written = capture(["fmt", "messy.dxn", "tidy.dxn", "--json"], root);
    expect([JSON.parse(checked.stdout), JSON.parse(written.stdout)]).toEqual([
      { unformatted: ["messy.dxn"], problems: [] },
      { formatted: ["messy.dxn"], problems: [] },
    ]);
  });

  it("needs a file, and refuses one that is not there", () => {
    const root = writeProject({});
    expect([
      capture(["fmt"], root).code,
      capture(["fmt", "--check"], root).code,
      capture(["fmt", "missing.dxn"], root).stderr,
    ]).toEqual([2, 2, 'dxn: file not found: "missing.dxn"\n']);
  });
});

describe("dxn status", () => {
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
profile Phone: Device { Pointer = touch }
profile Laptop: Device { Pointer = mouse }
record Evidence {}
actor EvidenceRecorder records Evidence
`;
  const project = (data: string) =>
    inProject({ "toolbar.dxn": schema, "evidence/toolbar.json": data }, "status");
  const link = (profile: string, hover: string) =>
    `{ "context": { "path": "Toolbar.link", "profile": "${profile}", "dimensions": {}, "parents": {}, "states": { "hover": "${hover}" } }, "actor": "EvidenceRecorder" }`;

  it("says how many combinations of each element have evidence", () => {
    const result = project(`[${link("Phone", "rest")}, ${link("Laptop", "hovered")}]`)(
      "toolbar.dxn",
    );
    expect([result.code, result.stdout]).toEqual([
      0,
      [
        "toolbar.dxn: Evidence 4 of 7 combinations recorded; Evidence has no PenNode, so staleness is not checked",
        "",
        "| path         | combinations | recorded | stale | gone | missing |",
        "| ------------ | ------------ | -------- | ----- | ---- | ------- |",
        "| Toolbar      | 1            | 0        | 0     | 0    | 1       |",
        "| Toolbar.link | 3            | 2        | 0     | 0    | 1       |",
        // Link, a component on its own, covered by the link in place.
        "| Link         | 3            | 2        | 0     | 0    | 1       |",
        "",
      ].join("\n"),
    ]);
  });

  it("lists what is missing with --missing, and gives it all as JSON with --json", () => {
    const run = project(`[${link("Phone", "rest")}, ${link("Laptop", "hovered")}]`);
    const missing = run("toolbar.dxn", "--missing").stdout.split("\n");
    expect(missing.slice(-5)).toEqual([
      "Missing:",
      "  Toolbar",
      "  Toolbar.link on Laptop: hover = rest",
      "  Link on Laptop: hover = rest",
      "",
    ]);
    const json = JSON.parse(run("toolbar.dxn", "--json").stdout);
    expect([
      json.records[0].record,
      json.records[0].combinations,
      json.records[0].recorded,
    ]).toEqual(["Evidence", 7, 4]);
  });

  it("reports the stored records' problems first, and counts nothing", () => {
    const result = project(`[${link("Phone", "hovered")}]`)("toolbar.dxn");
    expect([result.code, result.stdout]).toEqual([1, ""]);
  });
});

describe("dxn status, with a received state", () => {
  it("refuses a tree where a received state has no provider above it", () => {
    const root = writeProject({});
    writeFileSync(
      join(root, "site.dxn"),
      "enum Section = home | blog\ntype Links receives current: Section {}\ntype Toolbar {\n  has links: Links\n}\nrecord Evidence {}\nactor EvidenceRecorder records Evidence\n",
    );
    expect(capture(["status", "site.dxn"], root).stderr).toBe(
      "dxn: `Toolbar.links`: `current` is received by `Links`, but nothing above it provides it\n",
    );
  });
});
