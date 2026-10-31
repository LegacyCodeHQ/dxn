import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Fingerprints } from "../../src/compiler/fingerprint.js";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

const schema = `dimension Pointer = mouse | touch
enum Hover = rest | hovered

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

type Toolbar {
  has menu: Menu
}

environment Device = Pointer
profile phone: Device { Pointer = touch }
profile laptop: Device { Pointer = mouse }

enum Actor = design-agent
record Source {
  file: RelativePath
  frame: NonEmptyString
}
record Evidence with context {
  actor: Actor
  at: Timestamp
  source: Source
  fingerprint: NonEmptyString
}
`;
const at = "2026-10-31T12:00:00Z";
const hash = (content: string) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0${content}`)
    .digest("hex");

// A repository with the model in spec/ and a design file.
function project() {
  const root = writeProject({});
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "spec"));
  mkdirSync(join(root, "design"));
  writeFileSync(join(root, "spec", "toolbar.dxn"), schema);
  writeFileSync(join(root, "design", "toolbar.png"), "drawn");
  const run = (...args: string[]) => capture(["lang", "attach", ...args], root);
  const stored = () =>
    JSON.parse(readFileSync(join(root, "spec", "evidence", "toolbar.json"), "utf8")) as {
      context: { states: Record<string, string>; parents: Record<string, string> };
      fingerprint: string;
      at: string;
    }[];
  return { root, run, stored };
}
const attach = (...context: string[]) => [
  "spec/toolbar.dxn",
  "Toolbar.menu.toggle",
  "--file",
  "design/toolbar.png",
  "--frame",
  "phone-toggle",
  "--field",
  "actor=design-agent",
  "--at",
  at,
  ...context,
];

describe("lang attach", () => {
  it("records an entry for each listed combination that exists in place, with its fingerprint", () => {
    const { run, stored } = project();
    const result = run(
      ...attach("profile=phone", "menu.menu=closed|open", "hover=rest", "expanded=closed|open"),
    );
    expect([result.code, result.stdout, result.stderr]).toEqual([
      0,
      "Attached 2 records to spec/evidence/toolbar.json\n",
      "",
    ]);
    expect(stored()).toEqual([
      {
        context: {
          path: "Toolbar.menu.toggle",
          profile: "phone",
          dimensions: {},
          parents: { "menu.menu": "closed" },
          states: { hover: "rest", expanded: "closed" },
        },
        actor: "design-agent",
        at,
        source: { file: "design/toolbar.png", frame: "phone-toggle" },
        fingerprint: hash("drawn"),
      },
      {
        context: {
          path: "Toolbar.menu.toggle",
          profile: "phone",
          dimensions: {},
          parents: { "menu.menu": "open" },
          states: { hover: "rest", expanded: "open" },
        },
        actor: "design-agent",
        at,
        source: { file: "design/toolbar.png", frame: "phone-toggle" },
        fingerprint: hash("drawn"),
      },
    ]);
  });

  it("replaces an entry recorded again for the same combination, frame and fields", () => {
    const { root, run, stored } = project();
    run(...attach("profile=phone", "menu.menu=closed", "hover=rest", "expanded=closed"));
    writeFileSync(join(root, "design", "toolbar.png"), "redrawn");
    const result = run(
      ...attach("profile=phone", "menu.menu=closed", "hover=rest", "expanded=closed"),
    );
    expect([result.stdout, stored().map(({ fingerprint }) => fingerprint)]).toEqual([
      "Attached 1 record to spec/evidence/toolbar.json, replacing 1\n",
      [hash("redrawn")],
    ]);
  });

  it("replaces an entry where it is stored, in whichever of the record's files", () => {
    const { root, run } = project();
    const evidence = join(root, "spec", "evidence");
    run(...attach("profile=phone", "menu.menu=closed", "hover=rest", "expanded=closed"));
    renameSync(join(evidence, "toolbar.json"), join(evidence, "menus.json"));
    writeFileSync(join(root, "design", "toolbar.png"), "redrawn");
    const result = run(
      ...attach("profile=phone", "menu.menu=closed", "hover=rest", "expanded=closed"),
    );
    const moved = JSON.parse(readFileSync(join(evidence, "menus.json"), "utf8")) as {
      fingerprint: string;
    }[];
    expect([
      result.stdout,
      moved.map(({ fingerprint }) => fingerprint),
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
      refusal(...attach("profile=phone", "menu.menu=closed", "hover=rest")),
      refusal(
        ...attach(
          "profile=phone",
          "menu.menu=closed",
          "hover=rest",
          "expanded=closed",
          "colour=red",
        ),
      ),
      refusal(...attach("profile=phone", "menu.menu=shut", "hover=rest", "expanded=closed")),
      refusal(...attach("profile=phone", "menu.menu=closed", "hover=hovered", "expanded=closed")),
      refusal(
        "spec/toolbar.dxn",
        "Toolbar.menu.toggle",
        "--file",
        "design/missing.png",
        "--frame",
        "x",
        "--field",
        "actor=design-agent",
        "profile=phone",
        "menu.menu=closed",
        "hover=rest",
        "expanded=closed",
      ),
      refusal(
        "spec/toolbar.dxn",
        "Toolbar.menu.toggle",
        "--file",
        "design/toolbar.png",
        "--frame",
        "x",
        "profile=phone",
        "menu.menu=closed",
        "hover=rest",
        "expanded=closed",
      ),
      existsSync(join(root, "spec", "evidence")),
    ]).toEqual([
      "dxn: give expanded, as expanded=<value>, or several as expanded=<a>|<b>\n",
      'dxn: "colour" is not part of a context of Toolbar.menu.toggle (profile, menu.menu, hover, expanded)\n',
      'dxn: "shut" is not a value of menu.menu (closed, open)\n',
      "dxn: no combination given exists for Toolbar.menu.toggle; dxn lang states spec/toolbar.dxn Toolbar.menu.toggle lists them\n",
      'dxn: "design/missing.png" does not exist in the repository\n',
      "dxn: give actor, as --field actor=<value>\n",
      false,
    ]);
  });

  it("refuses a field the record does not have, a path that is not one, and a frame a pen.dev file lacks", () => {
    const { root, run } = project();
    writeFileSync(
      join(root, "design", "toolbar.pen"),
      JSON.stringify({ version: "2.6", children: [] }),
    );
    const context = ["profile=phone", "menu.menu=closed", "hover=rest", "expanded=closed"];
    expect([
      run(...attach(...context), "--field", "colour=red").stderr,
      run(
        ...attach(...context).map((arg) =>
          arg === "Toolbar.menu.toggle" ? "Toolbar.menu.togle" : arg,
        ),
      ).stderr,
      run(
        ...attach(...context).map((arg) =>
          arg === "design/toolbar.png" ? "design/toolbar.pen" : arg,
        ),
      ).stderr,
    ]).toEqual([
      'dxn: Evidence has no field "colour" (actor, at, source, fingerprint)\n',
      "dxn: togle is not a child of Menu (toggle)\n",
      'dxn: frame "phone-toggle" is not in design/toolbar.pen\n',
    ]);
  });

  it("shows what it would write with --dry-run, and writes nothing", () => {
    const { root } = project();
    const result = capture(
      [
        "--dry-run",
        "lang",
        "attach",
        ...attach("profile=phone", "menu.menu=closed", "hover=rest", "expanded=closed"),
      ],
      root,
    );
    expect([result.code, result.stdout, existsSync(join(root, "spec", "evidence"))]).toEqual([
      0,
      "Would attach 1 record to spec/evidence/toolbar.json\n",
      false,
    ]);
  });

  it("needs a file, a path, --file and --frame", () => {
    const { run } = project();
    expect([
      run("spec/toolbar.dxn").code,
      run("spec/toolbar.dxn", "Toolbar.menu.toggle", "profile=phone").code,
    ]).toEqual([2, 2]);
  });

  it("says, with --json, why it needs more, as a refusal does", () => {
    const { run } = project();
    const result = run("spec/toolbar.dxn", "--json");
    expect([result.code, JSON.parse(result.stdout)]).toEqual([
      2,
      { error: "give a file, a path, --file and --frame, and the context" },
    ]);
  });
});

describe("lang status, with fingerprints", () => {
  const recorded = () => {
    const { root, run } = project();
    run(...attach("profile=phone", "menu.menu=closed|open", "hover=rest", "expanded=closed|open"));
    const status = (...args: string[]) =>
      capture(["lang", "status", "spec/toolbar.dxn", ...args], root);
    return { root, status };
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
      [12, 0, 0, 2, 10],
      [6, 0, 0, 2, 4],
      [2, 0, 4],
    ]);
  });

  it("counts an entry as present while its frame is as it was recorded", () => {
    const { status } = recorded();
    expect(status().stdout.split("\n")[0]).toBe(
      "spec/toolbar.dxn: Evidence for 2 of 12 combinations",
    );
  });

  it("counts an entry as stale once its frame has changed, and lists it with --missing", () => {
    const { root, status } = recorded();
    writeFileSync(join(root, "design", "toolbar.png"), "redrawn");
    const lines = status("--missing").stdout.split("\n");
    expect([
      lines[0],
      lines.find((line) => line.startsWith("| Toolbar.menu.toggle")),
      lines.slice(lines.indexOf("Stale:"), lines.indexOf("Stale:") + 3),
    ]).toEqual([
      "spec/toolbar.dxn: Evidence for 0 of 12 combinations; 2 stale",
      "| Toolbar.menu.toggle | 6            | 0       | 2     | 0    | 4       |",
      [
        "Stale:",
        "  Toolbar.menu.toggle on phone with menu.menu = closed: hover = rest, expanded = closed",
        "  Toolbar.menu.toggle on phone with menu.menu = open: hover = rest, expanded = open",
      ],
    ]);
  });

  it("counts an entry as gone once its file is", () => {
    const { root, status } = recorded();
    rmSync(join(root, "design", "toolbar.png"));
    expect(status().stdout.split("\n")[0]).toBe(
      "spec/toolbar.dxn: Evidence for 0 of 12 combinations; 2 gone",
    );
  });

  it("says when a record has no fingerprint to check", () => {
    const root = writeProject({});
    writeFileSync(join(root, "plain.dxn"), "type Card {}\nrecord Note with context {}\n");
    mkdirSync(join(root, "note"));
    writeFileSync(
      join(root, "note", "a.json"),
      '[{ "context": { "type": "Card", "dimensions": {}, "states": {} } }]',
    );
    expect(capture(["lang", "status", "plain.dxn"], root).stdout.split("\n")[0]).toBe(
      "plain.dxn: Note for 1 of 1 combination; Note has no fingerprint field next to a source { file, frame }, so staleness is not checked",
    );
  });
});

describe("the tool convention", () => {
  // The model, with two actors: a design agent drawing in pen.dev, and a
  // reviewer whose evidence is a whole file.
  const withTools = schema
    .replace(
      "enum Actor = design-agent",
      "enum Actor = design-agent | reviewer\nenum Tool = pen-dev | file",
    )
    .replace(
      "  actor: Actor\n",
      "  actor: Actor\n  tool: Tool = when actor {\n    design-agent -> pen-dev\n    reviewer -> file\n  }\n",
    );
  const pen = JSON.stringify({
    children: [{ id: "toggle", type: "frame", x: 0, y: 0, name: "Toggle" }],
  });
  const tooled = () => {
    const result = project();
    writeFileSync(join(result.root, "spec", "toolbar.dxn"), withTools);
    writeFileSync(join(result.root, "design", "toolbar.pen"), pen);
    return result;
  };
  const record = (actor: string, file: string, frame: string) => [
    "spec/toolbar.dxn",
    "Toolbar.menu.toggle",
    "--file",
    file,
    "--frame",
    frame,
    "--field",
    `actor=${actor}`,
    "--at",
    at,
    "profile=phone",
    "menu.menu=closed",
    "hover=rest",
    "expanded=closed",
  ];

  it("fingerprints a pen-dev actor's frame, and a file actor's whole file", () => {
    const { root, run, stored } = tooled();
    run(...record("design-agent", "design/toolbar.pen", "toggle"));
    run(...record("reviewer", "design/toolbar.pen", "toggle"));
    const frame = new Fingerprints().of(join(root, "design", "toolbar.pen"), "toggle");
    expect(stored().map(({ fingerprint }) => fingerprint)).toEqual([frame, hash(pen)]);
    expect(frame).not.toBe(hash(pen));
    expect(Object.keys(stored()[0] ?? {})).not.toContain("tool");
  });

  it("refuses a pen-dev actor's frame in a file that is not a pen.dev file", () => {
    const { run } = tooled();
    expect(run(...record("design-agent", "design/toolbar.png", "toggle")).stderr).toBe(
      'dxn: design-agent records with pen-dev; "design/toolbar.png" is not a pen.dev file\n',
    );
  });

  it("counts a pen-dev entry as gone once its file is, rather than its tool's", () => {
    const { root, run } = tooled();
    run(...record("design-agent", "design/toolbar.pen", "toggle"));
    rmSync(join(root, "design", "toolbar.pen"));
    const result = capture(["lang", "status", "spec/toolbar.dxn"], root);
    expect([result.code, result.stderr, result.stdout.split("\n")[0]]).toEqual([
      0,
      "",
      "spec/toolbar.dxn: Evidence for 0 of 12 combinations; 1 gone",
    ]);
  });

  it("reports, in lang status, a stored entry whose file is not its tool's", () => {
    const { root, run } = tooled();
    run(...record("reviewer", "design/toolbar.png", "toggle"));
    const path = join(root, "spec", "evidence", "toolbar.json");
    writeFileSync(path, readFileSync(path, "utf8").replace('"reviewer"', '"design-agent"'));
    const result = capture(["lang", "status", "spec/toolbar.dxn"], root);
    expect([result.code, result.stderr.replace(/:\d+:\d+:/, ":L:C:")]).toEqual([
      1,
      'spec/evidence/toolbar.json:L:C: wrong-tool: $[0].source.file: design-agent records with pen-dev; "design/toolbar.png" is not a pen.dev file\n',
    ]);
  });
});

describe("duplicate records", () => {
  // Two records attached, then the file's entries as written.
  const twice = () => {
    const { root, run } = project();
    run(...attach("profile=phone", "menu.menu=closed|open", "hover=rest", "expanded=closed|open"));
    const path = join(root, "spec", "evidence", "toolbar.json");
    const entries = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>[];
    const validate = () => capture(["lang", "validate", "spec/toolbar.dxn"], root);
    return { root, path, entries, validate };
  };

  it("are reported: the same in everything but when they were recorded", () => {
    const { path, entries, validate } = twice();
    const again = { ...entries[0], at: "2026-11-01T09:00:00Z", fingerprint: "other" };
    writeFileSync(path, JSON.stringify([...entries, again], null, 2));
    const result = validate();
    expect([result.code, result.stderr.replace(/:\d+:\d+:/, ":L:C:")]).toEqual([
      1,
      "spec/evidence/toolbar.json:L:C: duplicate-record: $[2]: the same Evidence as $[0] in spec/evidence/toolbar.json, apart from at and fingerprint\n",
    ]);
  });

  it("are found across the record's files", () => {
    const { root, entries, validate } = twice();
    writeFileSync(join(root, "spec", "evidence", "more.json"), JSON.stringify([entries[1]]));
    expect(validate().stderr.replace(/:\d+:\d+:/, ":L:C:")).toBe(
      "spec/evidence/toolbar.json:L:C: duplicate-record: $[1]: the same Evidence as $[0] in spec/evidence/more.json, apart from at and fingerprint\n",
    );
  });

  it("are not records that differ in anything else, such as their frame", () => {
    const { path, entries, validate } = twice();
    const other = { ...entries[0], source: { file: "design/toolbar.png", frame: "another" } };
    writeFileSync(path, JSON.stringify([...entries, other], null, 2));
    expect(validate().code).toBe(0);
  });
});
