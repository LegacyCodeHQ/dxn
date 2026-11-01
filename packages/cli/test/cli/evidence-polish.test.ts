import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);
const design = "design.pen";
const pen = {
  version: "2.21",
  children: [
    { type: "frame", id: "restCell", name: "Cell · rest", x: 0, y: 0, children: [] },
    { type: "frame", id: "hoverCell", name: "Cell · hovered", x: 400, y: 0, children: [] },
  ],
};

function project(actors: Record<string, unknown> = { "design-agent": { evidence: "design" } }) {
  const result = cliProject({ ...toolbarFiles, "actors.json": { version: 1, actors } });
  writeFileSync(join(result.root, design), JSON.stringify(pen));
  return result;
}

const attach = (...args: string[]) => [
  "prototype",
  "attach",
  "wordmark",
  "--file",
  design,
  ...args,
  "profile=laptop|desktop",
  "focus=blurred",
];

describe("--actor", () => {
  it("is filled in when exactly one actor records evidence", () => {
    const { run } = project({
      "design-agent": { evidence: "design" },
      "visual-reviewer": { checks: ["visual"] },
    });
    expect(run(...attach("--frame", "restCell", "hover=rest")).code).toBe(0);
    expect(json(run("prototype", "evidence", "wordmark")).actor).toBe("design-agent");
  });

  it("is asked for when several actors record evidence", () => {
    const { run } = project({
      "design-agent": { evidence: "design" },
      "screenshot-agent": { evidence: "screenshot" },
    });
    expect(run("prototype", "evidence", "wordmark").stderr).toBe(
      "dxn: give --actor <design-agent|screenshot-agent>\n",
    );
  });
});

describe("detach with lists", () => {
  it("removes every combination's entry, and refuses when there is none", () => {
    const { run, read } = project();
    run(...attach("--frame", "restCell", "hover=rest|hovered"));
    const detach = [
      "prototype",
      "detach",
      "wordmark",
      "--frame",
      "restCell",
      "profile=laptop|desktop",
      "hover=rest|hovered",
      "focus=blurred",
    ];
    expect(run(...detach).code).toBe(0);
    expect(read("evidence/page.json").evidence).toEqual([]);
    expect(run(...detach).stderr).toBe(
      'dxn: no evidence from design-agent for wordmark in frame "restCell" matches\n',
    );
  });
});

describe("evidence tables", () => {
  it("say so when --missing leaves nothing", () => {
    const { run } = project();
    run(...attach("--frame", "restCell", "hover=rest|hovered"));
    expect(
      run(
        "prototype",
        "evidence",
        "wordmark",
        "profile=laptop",
        "focus=blurred",
        "--missing",
        "--table",
      ).stdout,
    ).toBe("Nothing missing: every context has current evidence.\n");
  });

  it("name each frame from the pen.dev file", () => {
    const { run } = project();
    run(...attach("--frame", "restCell", "hover=rest"));
    run(...attach("--frame", "hoverCell", "hover=hovered"));
    expect(
      run("prototype", "evidence", "wordmark", "--by", "frame", "--table")
        .stdout.split("\n")
        .slice(0, 4),
    ).toEqual([
      "| frame                | name           | profiles        | hover   | focus   | contexts | stale |",
      "| -------------------- | -------------- | --------------- | ------- | ------- | -------- | ----- |",
      "| design.pen#restCell  | Cell · rest    | laptop, desktop | rest    | blurred | 2        | 0     |",
      "| design.pen#hoverCell | Cell · hovered | laptop, desktop | hovered | blurred | 2        | 0     |",
    ]);
    expect(json(run("prototype", "evidence", "wordmark", "--by", "frame")).frames[0].name).toBe(
      "Cell · rest",
    );
  });
});
