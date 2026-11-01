import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);
const pen = {
  version: "2.21",
  children: [
    { type: "frame", id: "cell", name: "Cell", x: 0, y: 0, children: [] },
    { type: "frame", id: "other", name: "Other", x: 400, y: 0, children: [] },
  ],
};

function project(actor: Record<string, unknown>) {
  const result = cliProject({
    ...toolbarFiles,
    "actors.json": { version: 1, actors: { agent: actor } },
  });
  writeFileSync(join(result.root, "design.pen"), JSON.stringify(pen));
  writeFileSync(join(result.root, "shot.png"), "pixels");
  const attach = (file: string, frame: string) =>
    result.run(
      "prototype",
      "attach",
      "wordmark",
      "--file",
      file,
      "--frame",
      frame,
      "profile=phone",
      "hover=rest",
      "focus=blurred",
    );
  return { ...result, attach };
}

const problems = (actor: unknown) =>
  cliProject({ ...toolbarFiles, "actors.json": { version: 1, actors: { agent: actor } } })
    .run("prototype", "validate")
    .stderr.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.replace(/^.*?:\d+:\d+: /, ""));

describe("an actor's source", () => {
  it("is pen.dev or file, and only for an actor that records evidence", () => {
    expect([
      problems({ evidence: "design", source: "pen.dev" }),
      problems({ evidence: "design", source: "figma" }),
      problems({ checks: [], source: "file" }),
    ]).toEqual([
      [],
      ['unknown-source: "figma" is not a source (pen.dev, file)'],
      ['source-without-evidence: actor "agent" declares a source but records no evidence'],
    ]);
  });

  it("pen.dev: refuses evidence that is not a frame in a pen.dev file", () => {
    const { attach } = project({ evidence: "design", source: "pen.dev" });
    expect([attach("design.pen", "cell").code, attach("shot.png", "cell").stderr]).toEqual([
      0,
      'dxn: actor "agent" records pen.dev frames; "shot.png" is not a pen.dev file\n',
    ]);
  });

  it("pen.dev: an entry written by hand that is not a pen.dev frame is an error", () => {
    const { attach, run, root } = project({ evidence: "design", source: "file" });
    attach("shot.png", "cell");
    const actors = join(root, ".dxn", "actors.json");
    writeFileSync(
      actors,
      JSON.stringify({ version: 1, actors: { agent: { evidence: "design", source: "pen.dev" } } }),
    );
    expect(run("prototype", "validate").stderr.replace(/^.*?:\d+:\d+: /, "")).toBe(
      'wrong-source: actor "agent" records pen.dev frames; "shot.png" is not a pen.dev file\n',
    );
  });

  it("file: fingerprints the whole file, even a pen.dev one", () => {
    const { attach, run, root } = project({ evidence: "design", source: "file" });
    expect(attach("design.pen", "cell").code).toBe(0);
    const document = JSON.parse(readFileSync(join(root, "design.pen"), "utf8"));
    document.children[1].name = "Renamed";
    writeFileSync(join(root, "design.pen"), JSON.stringify(document));
    expect(json(run("prototype", "status", "--actor", "agent")).summary.stale).toBe(1);
  });

  it("pen.dev: an edit to another frame leaves the entry present", () => {
    const { attach, run, root } = project({ evidence: "design", source: "pen.dev" });
    attach("design.pen", "cell");
    const document = JSON.parse(readFileSync(join(root, "design.pen"), "utf8"));
    document.children[1].name = "Renamed";
    writeFileSync(join(root, "design.pen"), JSON.stringify(document));
    expect(json(run("prototype", "status", "--actor", "agent")).summary.present).toBe(1);
  });
});

describe("actor commands", () => {
  it("declare and list an actor's source", () => {
    const { run, read } = project({ evidence: "design" });
    expect(run("prototype", "actor", "set", "agent", "--source", "pen.dev").code).toBe(0);
    expect(read("actors.json").actors).toEqual({
      agent: { evidence: "design", source: "pen.dev" },
    });
    expect(json(run("prototype", "actor", "list")).actors).toEqual([
      { name: "agent", evidence: "design", source: "pen.dev" },
    ]);
  });
});
