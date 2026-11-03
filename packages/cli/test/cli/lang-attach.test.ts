import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Fingerprints } from "@legacycodehq/dxn-language";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

const schema = `dimension Pointer = mouse | touch
enum Hover = rest | hovered

type Toolbar {
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

  has menu: Menu
}

environment Device = Pointer
profile Phone: Device { Pointer = touch }
profile Laptop: Device { Pointer = mouse }

record Evidence {
  at: Timestamp
  source: PenNode
}
actor DesignAgent records Evidence
actor Reviewer records Evidence
`;
const at = "2026-10-31T12:00:00Z";
const hash = (content: string) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0${content}`)
    .digest("hex");

// A pen.dev file: a frame holding the toggle's two states, and a frame
// beside it.
const pen = JSON.stringify({
  version: "2.21",
  children: [
    {
      id: "states",
      type: "frame",
      x: 0,
      y: 0,
      name: "Toggle states",
      children: [
        { id: "closed", type: "frame", name: "closed", fill: "#FFFFFF" },
        { id: "open", type: "frame", name: "open", fill: "#000000" },
      ],
    },
    { id: "other", type: "frame", x: 400, y: 0, name: "Other" },
  ],
});

// A repository with the model in spec/, and design files.
function project() {
  const root = writeProject({
    "spec/toolbar.dxn": schema,
    "design/toolbar.png": "drawn",
    "design/toolbar.pen": pen,
  });
  mkdirSync(join(root, ".git"));
  const run = (...args: string[]) => capture(["attach", ...args], root);
  const stored = () =>
    JSON.parse(readFileSync(join(root, "spec", "evidence", "toolbar.json"), "utf8")) as {
      context: { states: Record<string, string>; parents: Record<string, string> };
      actor: string;
      at: string;
      source: { file: string; frame: string; node?: string; fingerprint: string };
    }[];
  return { root, run, stored };
}
// Attaching, as an actor, a source, and a context.
const attachAs = (actor: string, source: object, ...context: string[]) => [
  "spec/toolbar.dxn",
  "Toolbar.menu.toggle",
  "--actor",
  actor,
  "--data",
  JSON.stringify({ at, source }),
  ...context,
];
const attach = (...context: string[]) =>
  attachAs("DesignAgent", { file: "design/toolbar.png", frame: "phone-toggle" }, ...context);
const closed = ["profile=Phone", "menu.menu=closed", "hover=rest", "expanded=closed"];

describe("dxn attach", () => {
  it("records, as an actor, an entry for each listed combination that exists in place", () => {
    const { run, stored } = project();
    const result = run(
      ...attach("profile=Phone", "menu.menu=closed|open", "hover=rest", "expanded=closed|open"),
    );
    expect([result.code, result.stdout, result.stderr]).toEqual([
      0,
      "Attached 2 records to spec/evidence/toolbar.json\n",
      "",
    ]);
    const source = {
      file: "design/toolbar.png",
      frame: "phone-toggle",
      fingerprint: hash("drawn"),
    };
    expect(stored()).toEqual([
      {
        context: {
          path: "Toolbar.menu.toggle",
          profile: "Phone",
          dimensions: {},
          parents: { "menu.menu": "closed" },
          states: { hover: "rest", expanded: "closed" },
        },
        actor: "DesignAgent",
        at,
        source,
      },
      {
        context: {
          path: "Toolbar.menu.toggle",
          profile: "Phone",
          dimensions: {},
          parents: { "menu.menu": "open" },
          states: { hover: "rest", expanded: "open" },
        },
        actor: "DesignAgent",
        at,
        source,
      },
    ]);
  });

  it("fingerprints a pen.dev file's node, or its frame without one, and any other file whole", () => {
    const { root, run, stored } = project();
    const file = join(root, "design", "toolbar.pen");
    run(
      ...attachAs(
        "DesignAgent",
        { file: "design/toolbar.pen", frame: "states", node: "closed" },
        ...closed,
      ),
    );
    run(...attachAs("Reviewer", { file: "design/toolbar.pen", frame: "states" }, ...closed));
    run(...attachAs("DesignAgent", { file: "design/toolbar.png", frame: "drawing" }, ...closed));
    const prints = new Fingerprints();
    expect(stored().map(({ source }) => source.fingerprint)).toEqual([
      prints.of(file, "closed"),
      prints.of(file, "states"),
      hash("drawn"),
    ]);
  });

  it("replaces an entry recorded again for the same combination, actor and data", () => {
    const { root, run, stored } = project();
    run(...attach(...closed));
    writeFileSync(join(root, "design", "toolbar.png"), "redrawn");
    const result = run(...attach(...closed));
    expect([result.stdout, stored().map(({ source }) => source.fingerprint)]).toEqual([
      "Attached 1 record to spec/evidence/toolbar.json, replacing 1\n",
      [hash("redrawn")],
    ]);
  });

  it("keeps an entry recorded by another actor, or with other data, beside it", () => {
    const { run, stored } = project();
    run(...attach(...closed));
    run(...attachAs("Reviewer", { file: "design/toolbar.png", frame: "phone-toggle" }, ...closed));
    run(...attachAs("DesignAgent", { file: "design/toolbar.png", frame: "another" }, ...closed));
    expect(stored().map(({ actor, source }) => `${actor} ${source.frame}`)).toEqual([
      "DesignAgent phone-toggle",
      "Reviewer phone-toggle",
      "DesignAgent another",
    ]);
  });

  it("replaces an entry written by hand with its keys in another order", () => {
    const { root, run, stored } = project();
    run(...attach(...closed));
    // The same entry, its keys and its context's keys written in reverse.
    const path = join(root, "spec", "evidence", "toolbar.json");
    const reversed = (value: unknown): unknown =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, inner]) => [key, reversed(inner)]),
          )
        : value;
    writeFileSync(path, `${JSON.stringify(stored().map(reversed), null, 2)}\n`);
    writeFileSync(join(root, "design", "toolbar.png"), "redrawn");
    const result = run(...attach(...closed));
    expect([result.stdout, stored().map(({ source }) => source.fingerprint)]).toEqual([
      "Attached 1 record to spec/evidence/toolbar.json, replacing 1\n",
      [hash("redrawn")],
    ]);
  });

  it("replaces an entry where it is stored, in whichever of the record's files", () => {
    const { root, run } = project();
    const evidence = join(root, "spec", "evidence");
    run(...attach(...closed));
    renameSync(join(evidence, "toolbar.json"), join(evidence, "menus.json"));
    writeFileSync(join(root, "design", "toolbar.png"), "redrawn");
    const result = run(...attach(...closed));
    const moved = JSON.parse(readFileSync(join(evidence, "menus.json"), "utf8")) as {
      source: { fingerprint: string };
    }[];
    expect([
      result.stdout,
      moved.map(({ source }) => source.fingerprint),
      existsSync(join(evidence, "toolbar.json")),
    ]).toEqual([
      "Attached 1 record to spec/evidence/menus.json, replacing 1\n",
      [hash("redrawn")],
      false,
    ]);
  });

  it("refuses a context it cannot record, and writes nothing", () => {
    const { root, run } = project();
    const refusal = (...args: string[]) => run(...args).stderr;
    expect([
      refusal(...attach("profile=Phone", "menu.menu=closed", "hover=rest")),
      refusal(...attach(...closed, "colour=red")),
      refusal(...attach("profile=Phone", "menu.menu=shut", "hover=rest", "expanded=closed")),
      refusal(...attach("profile=Phone", "menu.menu=closed", "hover=hovered", "expanded=closed")),
      existsSync(join(root, "spec", "evidence")),
    ]).toEqual([
      "dxn: give `expanded`, as `expanded=<value>`, or several as `expanded=<a>|<b>`\n",
      "dxn: `colour` is not part of a context of `Toolbar.menu.toggle` (`profile`, `menu.menu`, `hover`, `expanded`)\n",
      "dxn: `shut` is not a value of `menu.menu` (`closed`, `open`)\n",
      "dxn: no combination given exists for `Toolbar.menu.toggle`; `dxn states spec/toolbar.dxn Toolbar.menu.toggle` lists them\n",
      false,
    ]);
  });

  it("refuses an actor that is not one, and what its design file does not have", () => {
    const { root, run } = project();
    const refusal = (...args: string[]) => run(...args).stderr;
    expect([
      refusal(...attachAs("DesignAgnt", { file: "design/toolbar.png", frame: "x" }, ...closed)),
      refusal(...attachAs("DesignAgent", { file: "design/missing.png", frame: "x" }, ...closed)),
      refusal(...attachAs("DesignAgent", { file: "design/toolbar.pen", frame: "gone" }, ...closed)),
      refusal(
        ...attachAs(
          "DesignAgent",
          { file: "design/toolbar.pen", frame: "other", node: "closed" },
          ...closed,
        ),
      ),
      refusal(
        ...attach(...closed).map((arg) =>
          arg === "Toolbar.menu.toggle" ? "Toolbar.menu.togle" : arg,
        ),
      ),
      existsSync(join(root, "spec", "evidence")),
    ]).toEqual([
      "dxn: `DesignAgnt` is not an actor; did you mean `DesignAgent`?\n",
      'dxn: "design/missing.png" does not exist in the repository\n',
      'dxn: frame "gone" is not in design/toolbar.pen\n',
      'dxn: node "closed" is not in frame other of design/toolbar.pen\n',
      "dxn: `togle` is not a child of `Toolbar.Menu`; did you mean `toggle`?\n",
      false,
    ]);
  });

  it("checks the data against the record it writes, and writes nothing when it does not fit", () => {
    const { root, run } = project();
    const data = (fields: object) => [
      "spec/toolbar.dxn",
      "Toolbar.menu.toggle",
      "--actor",
      "DesignAgent",
      "--data",
      JSON.stringify(fields),
      ...closed,
    ];
    const problem = (fields: object) => {
      const result = run(...data(fields));
      return [result.code, result.stderr.replace(/:\d+:\d+:/, ":L:C:")];
    };
    expect([
      problem({ at, source: { file: "design/toolbar.png", frame: "x" }, colour: "red" }),
      problem({ source: { file: "design/toolbar.png", frame: "x" } }),
      existsSync(join(root, "spec", "evidence")),
    ]).toEqual([
      [
        1,
        "spec/evidence/toolbar.json:L:C: error: unknown-field: $[0].colour: `Evidence` has no field `colour` (`at`, `source`)\n",
      ],
      [
        1,
        "spec/evidence/toolbar.json:L:C: error: missing-field: $[0]: `Evidence` is missing `at`\n",
      ],
      false,
    ]);
  });

  it("reads its options strictly", () => {
    const { run } = project();
    const misuse = (result: { code: number; stderr: string }) => [
      result.code,
      result.stderr.split("\n")[0],
    ];
    expect([
      misuse(run(...attach(...closed), "--actor", "Reviewer")),
      misuse(
        run(...attach(...closed).map((arg) => (arg === "--actor" ? "--actor=DesignAgent" : arg))),
      ),
      misuse(
        run(
          "spec/toolbar.dxn",
          "Toolbar.menu.toggle",
          "--actor",
          "DesignAgent",
          "--data",
          "{",
          ...closed,
        ),
      ),
      misuse(
        run(
          "spec/toolbar.dxn",
          "Toolbar.menu.toggle",
          "--actor",
          "DesignAgent",
          "--data",
          "[]",
          ...closed,
        ),
      ),
    ]).toMatchInlineSnapshot(`
      [
        [
          2,
          "dxn: give \`--actor\` once",
        ],
        [
          2,
          "dxn: write \`--actor DesignAgent\`, with a space, not \`--actor=DesignAgent\`",
        ],
        [
          2,
          "dxn: \`--data\` takes the record's fields as JSON, found \`{\`",
        ],
        [
          2,
          "dxn: \`--data\` takes the record's fields as a JSON object",
        ],
      ]
    `);
  });

  it("shows what it would write with --dry-run, and writes nothing", () => {
    const { root } = project();
    const result = capture(["--dry-run", "attach", ...attach(...closed)], root);
    expect([result.code, result.stdout, existsSync(join(root, "spec", "evidence"))]).toEqual([
      0,
      "Would attach 1 record to spec/evidence/toolbar.json\n",
      false,
    ]);
  });

  it("needs a file, a path, --actor and --data", () => {
    const { run } = project();
    expect([
      run("spec/toolbar.dxn").code,
      run("spec/toolbar.dxn", "Toolbar.menu.toggle", "--actor", "DesignAgent", ...closed).code,
    ]).toEqual([2, 2]);
  });

  it("says, with --json, why it needs more, as a refusal does", () => {
    const { run } = project();
    const result = run("spec/toolbar.dxn", "--json");
    expect([result.code, JSON.parse(result.stdout)]).toEqual([
      2,
      { error: "give a file, a path, `--actor`, `--data` and the context" },
    ]);
  });
});

describe("dxn status, with fingerprints", () => {
  const recorded = () => {
    const { root, run } = project();
    run(...attach("profile=Phone", "menu.menu=closed|open", "hover=rest", "expanded=closed|open"));
    const status = (...args: string[]) => capture(["status", "spec/toolbar.dxn", ...args], root);
    return { root, run, status };
  };

  it("gives, with --json, each count as a number, and lists what is not present", () => {
    const { root, status } = recorded();
    rmSync(join(root, "design", "toolbar.png"));
    const [record] = JSON.parse(status("--json").stdout).records;
    const toggle = record.paths.find(
      ({ path }: { path: string }) => path === "Toolbar.menu.toggle",
    );
    expect([
      [record.combinations, record.present, record.stale, record.gone, record.missing],
      [toggle.combinations, toggle.present, toggle.stale, toggle.gone, toggle.missing],
      [toggle.listed.gone.length, toggle.listed.stale.length, toggle.listed.missing.length],
    ]).toEqual([
      [9, 0, 0, 2, 7],
      [6, 0, 0, 2, 4],
      [2, 0, 4],
    ]);
  });

  it("counts an entry as present while what it points at is as it was recorded", () => {
    const { status } = recorded();
    expect(status().stdout.split("\n")[0]).toBe(
      "spec/toolbar.dxn: Evidence 2 of 9 combinations drawn",
    );
  });

  it("counts an entry as stale once its file has changed, and lists it with --missing", () => {
    const { root, status } = recorded();
    writeFileSync(join(root, "design", "toolbar.png"), "redrawn");
    const lines = status("--missing").stdout.split("\n");
    expect([
      lines[0],
      lines.find((line) => line.startsWith("| Toolbar.menu.toggle")),
      lines.slice(lines.indexOf("Stale:"), lines.indexOf("Stale:") + 3),
    ]).toEqual([
      "spec/toolbar.dxn: Evidence 0 of 9 combinations drawn, 2 stale",
      "| Toolbar.menu.toggle | 6            | 0     | 2     | 0    | 4       |",
      [
        "Stale:",
        "  Toolbar.menu.toggle on Phone: hover = rest, expanded = closed",
        "  Toolbar.menu.toggle on Phone: hover = rest, expanded = open",
      ],
    ]);
  });

  it("counts an entry as gone once its file is", () => {
    const { root, status } = recorded();
    rmSync(join(root, "design", "toolbar.png"));
    expect(status().stdout.split("\n")[0]).toBe(
      "spec/toolbar.dxn: Evidence 0 of 9 combinations drawn, 2 gone",
    );
  });

  it("judges a pen.dev entry by its node: stale once it changes, gone once its frame lacks it", () => {
    const { root, run } = project();
    const status = () => capture(["status", "spec/toolbar.dxn"], root).stdout.split("\n")[0] ?? "";
    const node = (state: string) =>
      attachAs(
        "DesignAgent",
        { file: "design/toolbar.pen", frame: "states", node: state },
        "profile=Phone",
        `menu.menu=${state}`,
        "hover=rest",
        `expanded=${state}`,
      );
    run(...node("closed"));
    run(...node("open"));
    const file = join(root, "design", "toolbar.pen");
    const edit = (change: (states: { id: string; fill?: string }[]) => unknown) => {
      const document = JSON.parse(readFileSync(file, "utf8"));
      change(document.children[0].children);
      writeFileSync(file, JSON.stringify(document));
    };
    const snapshot: string[] = [status()];
    edit((states) => {
      (states[1] as { fill: string }).fill = "#333333";
    });
    snapshot.push(status());
    edit((states) => states.splice(0, 1));
    snapshot.push(status());
    expect(snapshot).toEqual([
      "spec/toolbar.dxn: Evidence 2 of 9 combinations drawn",
      "spec/toolbar.dxn: Evidence 1 of 9 combinations drawn, 1 stale",
      "spec/toolbar.dxn: Evidence 0 of 9 combinations drawn, 1 stale, 1 gone",
    ]);
  });

  it("says when a record has no PenNode to check", () => {
    const root = writeProject({});
    writeFileSync(
      join(root, "plain.dxn"),
      "type Card {}\nrecord Note {}\nactor NoteRecorder records Note\n",
    );
    mkdirSync(join(root, "note"));
    writeFileSync(
      join(root, "note", "a.json"),
      '[{ "context": { "type": "Card", "dimensions": {}, "states": {} }, "actor": "NoteRecorder" }]',
    );
    expect(capture(["status", "plain.dxn"], root).stdout.split("\n")[0]).toBe(
      "plain.dxn: Note 1 of 1 combination recorded; Note has no PenNode, so staleness is not checked",
    );
  });
});

describe("duplicate records", () => {
  // Two records attached, then the file's entries as written.
  const twice = () => {
    const { root, run } = project();
    run(...attach("profile=Phone", "menu.menu=closed|open", "hover=rest", "expanded=closed|open"));
    const path = join(root, "spec", "evidence", "toolbar.json");
    const entries = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>[];
    const validate = () => capture(["validate", "spec/toolbar.dxn"], root);
    return { root, path, entries, validate };
  };

  it("are reported: the same in everything but their fingerprints", () => {
    const { path, entries, validate } = twice();
    const first = entries[0] as { source: object };
    const again = { ...first, source: { ...first.source, fingerprint: "other" } };
    writeFileSync(path, JSON.stringify([...entries, again], null, 2));
    const result = validate();
    expect([result.code, result.stderr.replace(/:\d+:\d+:/, ":L:C:")]).toEqual([
      1,
      "spec/evidence/toolbar.json:L:C: error: duplicate-record: $[2]: the same `Evidence` as $[0] in spec/evidence/toolbar.json, apart from their fingerprints\n",
    ]);
  });

  it("are found across the record's files", () => {
    const { root, entries, validate } = twice();
    writeFileSync(join(root, "spec", "evidence", "more.json"), JSON.stringify([entries[1]]));
    expect(validate().stderr.replace(/:\d+:\d+:/, ":L:C:")).toBe(
      "spec/evidence/toolbar.json:L:C: error: duplicate-record: $[1]: the same `Evidence` as $[0] in spec/evidence/more.json, apart from their fingerprints\n",
    );
  });

  it("are not records that differ in anything else, such as when they were recorded", () => {
    const { path, entries, validate } = twice();
    const other = { ...entries[0], at: "2026-11-01T09:00:00Z" };
    writeFileSync(path, JSON.stringify([...entries, other], null, 2));
    expect(validate().code).toBe(0);
  });
});
