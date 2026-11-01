import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

const withActor = {
  ...toolbarFiles,
  "actors.json": { version: 1, actors: { "design-agent": { evidence: "design" } } },
};

function problems(actors: unknown): string[] {
  return cliProject({ ...toolbarFiles, "actors.json": actors })
    .run("prototype", "validate")
    .stderr.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.replace(/^.*?:\d+:\d+: /, ""));
}

describe("actors", () => {
  it("are added as roles in actors.json and listed", () => {
    const { run, read } = cliProject(toolbarFiles);
    expect(run("prototype", "actor", "add", "design-agent").code).toBe(0);
    expect(run("prototype", "actor", "add", "visual-reviewer").code).toBe(0);
    expect(read("actors.json")).toEqual({
      version: 1,
      actors: { "design-agent": {}, "visual-reviewer": {} },
    });
    expect(json(run("prototype", "actor", "list"))).toEqual({
      actors: [{ name: "design-agent" }, { name: "visual-reviewer" }],
    });
  });

  it("are removed by name", () => {
    const { run, read } = cliProject(withActor);
    run("prototype", "actor", "add", "visual-reviewer");
    expect(run("prototype", "actor", "remove", "visual-reviewer").code).toBe(0);
    expect(read("actors.json").actors).toEqual({ "design-agent": { evidence: "design" } });
    expect(run("prototype", "actor", "remove", "nobody").stderr).toBe(
      "dxn: actor not found: nobody\n",
    );
  });

  it("are added once", () => {
    const { run } = cliProject(withActor);
    expect(run("prototype", "actor", "add", "design-agent").stderr).toBe(
      'dxn: actor "design-agent" already exists\n',
    );
  });

  it("are checked in actors.json", () => {
    expect([
      problems({ version: 1, actors: { "design-agent": {} } }),
      problems({ version: 1, actors: { "design-agent": { draws: true } } }),
      problems({ version: 1, actors: [] }),
      problems({ version: 1 }),
    ]).toEqual([
      [],
      ['unknown-key: unknown key "draws"'],
      ["wrong-type: expected an object, found an array"],
      ['missing-key: missing required key "actors"'],
    ]);
  });
});

describe("evidence", () => {
  it("has a row for every context of the node, empty before anything is recorded", () => {
    const { run } = cliProject(withActor);
    const result = run("prototype", "evidence", "toolbar", "--actor", "design-agent", "--table");
    expect(result.stdout).toBe(
      [
        "| profile          | breakpoint | keyboard    | pointer | design-agent |",
        "| ---------------- | ---------- | ----------- | ------- | ------------ |",
        "| phone            | base       | no-keyboard | touch   | —            |",
        "| tablet-portrait  | sm         | no-keyboard | touch   | —            |",
        "| tablet-landscape | lg         | no-keyboard | touch   | —            |",
        "| laptop           | lg         | keyboard    | mouse   | —            |",
        "| desktop          | xl         | keyboard    | mouse   | —            |",
        "",
      ].join("\n"),
    );
  });

  it("prints JSON for tools: each context, its profile and the evidence for it", () => {
    const { run } = cliProject(withActor);
    const result = json(run("prototype", "evidence", "menu-button", "--actor", "design-agent"));
    expect(result.node).toBe("menu-button");
    expect(result.actor).toBe("design-agent");
    expect(result.contexts).toHaveLength(4);
    expect(result.contexts[0]).toEqual({
      root: "page",
      profiles: ["phone"],
      context: {
        breakpoint: "base",
        keyboard: "no-keyboard",
        pointer: "touch",
        menu: "closed",
        hover: "rest",
        focus: "blurred",
      },
      evidence: [],
    });
  });

  it("refuses an actor that is not declared, or a project without actors", () => {
    expect([
      cliProject(withActor).run("prototype", "evidence", "toolbar", "--actor", "designer").stderr,
      cliProject(toolbarFiles).run("prototype", "evidence", "toolbar", "--actor", "design-agent")
        .stderr,
      cliProject(withActor).run("prototype", "evidence", "toolbar").code,
    ]).toEqual([
      'dxn: actor not found: "designer" (design-agent)\n',
      'dxn: no actors; add one with "dxn prototype actor add <name>"\n',
      0,
    ]);
  });
});
