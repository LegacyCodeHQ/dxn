import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
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
});
