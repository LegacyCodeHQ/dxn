import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const files = {
  "types.json": {
    version: 1,
    checks: { visual: {} },
    types: { link: { states: ["normal", "hovered"], checks: ["visual"] } },
  },
  "fragments/toolbar.json": {
    version: 1,
    fragment: {
      id: "toolbar",
      title: "Toolbar",
      children: [{ id: "blog-link", title: "Blog link", type: "link" }],
    },
  },
  "roots/page.json": rootFile({ id: "page", title: "Page", children: [{ include: "toolbar" }] }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["base", "lg"],
    default: "lg",
    appliesTo: ["toolbar"],
  },
  "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["toolbar"] },
  "overrides/pointer.json": {
    version: 1,
    overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
  },
  "actors.json": {
    version: 1,
    actors: { agent: { checks: ["visual"] }, "visual-reviewer": { checks: ["visual"] } },
  },
};

const at = "2026-10-30T19:20:00Z";
const verify = (...extra: string[]) => [
  "verify",
  "blog-link",
  "--check",
  "visual",
  "--result",
  "passed",
  "--actor",
  "agent",
  "--at",
  at,
  ...extra,
];

describe("verify", () => {
  it("records a result in the page's verification file", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    const result = run(...verify("state=hovered", "pointer=mouse"));
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(read("verification/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "removed": [],
          "written": [
            "verification/page.json",
          ],
        },
        {
          "records": [
            {
              "actor": "agent",
              "at": "2026-10-30T19:20:00Z",
              "check": "visual",
              "context": {
                "pointer": "mouse",
                "state": "hovered",
              },
              "node": "blog-link",
              "result": "passed",
            },
          ],
          "version": 1,
        },
      ]
    `);
  });

  it("replaces the record for the same node, context and check", () => {
    const { run, read } = cliProject(files);
    run(...verify("state=normal", "pointer=mouse"));
    run(
      "verify",
      "blog-link",
      "--check",
      "visual",
      "--result",
      "failed",
      "--actor",
      "visual-reviewer",
      "--at",
      at,
      "state=normal",
      "pointer=mouse",
      "breakpoint=lg",
    );
    expect(read("verification/page.json").records).toEqual([
      {
        node: "blog-link",
        context: { state: "normal", breakpoint: "lg", pointer: "mouse" },
        check: "visual",
        result: "failed",
        actor: "visual-reviewer",
        at,
      },
    ]);
  });

  it("defaults the time to now", () => {
    const { run, read } = cliProject(files);
    const before = Date.now();
    run(
      "verify",
      "blog-link",
      "--check",
      "visual",
      "--result",
      "passed",
      "--actor",
      "agent",
      "state=normal",
      "pointer=mouse",
    );
    const records = read("verification/page.json").records as { at: string }[];
    expect(Date.parse(records[0]?.at ?? "")).toBeGreaterThanOrEqual(before - 1000);
  });

  it("refuses contexts the compiler rejects", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = cliProject(files);
    snapshot.push(run(...verify("state=hovered", "pointer=touch")).stderr);
    snapshot.push(run(...verify("state=normal")).stderr);
    snapshot.push(exists("verification/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.dxn/verification/page.json:7:18: removed-state: state "hovered" is removed in this context
  ",
    "<tmp>/.dxn/verification/page.json:6:18: missing-key: missing required key "pointer"
  ",
    false,
  ]
`);
  });

  it("needs --root when several roots contain the node, and a root to be in", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = cliProject({
      ...files,
      "roots/home.json": rootFile({
        id: "home",
        title: "Home",
        children: [{ include: "toolbar" }],
      }),
    });
    snapshot.push(run(...verify("state=normal", "pointer=mouse")));
    snapshot.push(run(...verify("state=normal", "pointer=mouse", "--root", "home")).code);
    snapshot.push(exists("verification/home.json"));
    snapshot.push(run(...verify("state=normal", "pointer=mouse", "--root", "nope")));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "dxn: "blog-link" is in several roots (home, page); choose one with --root
  ",
      "stdout": "",
    },
    0,
    true,
    {
      "code": 1,
      "stderr": "dxn: "blog-link" is not in root "nope"
  ",
      "stdout": "",
    },
  ]
`);
  });

  it("reports nodes on no page and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({
      ...files,
      "roots/page.json": rootFile({ id: "page", title: "Page" }),
    });
    snapshot.push(run(...verify("state=normal")));
    snapshot.push(run("verify", "blog-link", "--check", "visual", "--actor", "agent").code);
    snapshot.push(run(...verify("pointer")).code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "dxn: "blog-link" is not in any root
  ",
      "stdout": "",
    },
    2,
    2,
  ]
`);
  });
});

describe("unverify", () => {
  it("removes the matching record", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    run(...verify("state=normal", "pointer=mouse"));
    run(...verify("state=hovered", "pointer=mouse"));
    snapshot.push(
      run(
        "unverify",
        "blog-link",
        "--check",
        "visual",
        "state=normal",
        "pointer=mouse",
        "breakpoint=lg",
      ).code,
    );
    snapshot.push(read("verification/page.json").records);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        [
          {
            "actor": "agent",
            "at": "2026-10-30T19:20:00Z",
            "check": "visual",
            "context": {
              "pointer": "mouse",
              "state": "hovered",
            },
            "node": "blog-link",
            "result": "passed",
          },
        ],
      ]
    `);
  });

  it("refuses when there is no such record", () => {
    const { run } = cliProject(files);
    expect(
      run("unverify", "blog-link", "--check", "visual", "state=normal", "pointer=mouse"),
    ).toMatchObject({
      code: 1,
      stderr: 'dxn: no visual record for blog-link in {"state":"normal","pointer":"mouse"}\n',
    });
  });

  it("records who checked as a declared actor, and nothing free-text", () => {
    const { run } = cliProject(files);
    const undeclared = run(
      ...verify("state=normal", "pointer=mouse").map((arg) => (arg === "agent" ? "nobody" : arg)),
    );
    expect([
      undeclared.code,
      undeclared.stderr.replace(/^.*?:\d+:\d+: /, ""),
      run(...verify("state=normal", "pointer=mouse", "--evidence", "shots/a.png")).code,
      run(
        "verify",
        "blog-link",
        "--check",
        "visual",
        "--result",
        "passed",
        "--by",
        "agent",
      ).stderr.split("\n")[0],
    ]).toEqual([
      1,
      'undeclared-actor: actor "nobody" is not declared in actors.json\n',
      2,
      "dxn: Unknown option '--by'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"--by\"",
    ]);
  });
});
