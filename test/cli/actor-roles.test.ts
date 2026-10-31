import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);
const design = "design/website.png";

const actors = {
  "design-agent": { evidence: "design" },
  "visual-reviewer": { checks: ["visual"] },
};

const evidenceBy = (actor: string) => ({
  version: 1,
  evidence: [
    {
      node: "wordmark",
      context: {
        breakpoint: "base",
        keyboard: "no-keyboard",
        pointer: "touch",
        hover: "rest",
        focus: "blurred",
      },
      actor,
      at: "2026-10-31T12:00:00Z",
      source: { file: design, frame: "x" },
      fingerprint: createHash("sha1").update("blob 5\0drawn").digest("hex"),
    },
  ],
});

const recordBy = (actor: string) => ({
  version: 1,
  records: [
    {
      node: "wordmark",
      context: {
        breakpoint: "base",
        keyboard: "no-keyboard",
        pointer: "touch",
        hover: "rest",
        focus: "blurred",
      },
      check: "visual",
      result: "passed",
      actor,
      at: "2026-10-31T12:00:00Z",
    },
  ],
});

function project(files: Record<string, unknown>) {
  const result = cliProject({ ...toolbarFiles, ...files });
  mkdirSync(join(result.root, "design"), { recursive: true });
  writeFileSync(join(result.root, design), "drawn");
  return result;
}

const problems = (files: Record<string, unknown>) =>
  project(files)
    .run("validate")
    .stderr.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.replace(/^.*?:\d+:\d+: /, ""));

describe("an actor declares what it records", () => {
  it("evidence of one kind, and the checks it may record", () => {
    const actorsFile = { "actors.json": { version: 1, actors } };
    expect([
      problems({ ...actorsFile, "evidence/page.json": evidenceBy("design-agent") }),
      problems({ ...actorsFile, "evidence/page.json": evidenceBy("visual-reviewer") }),
      problems({ ...actorsFile, "verification/page.json": recordBy("visual-reviewer") }),
      problems({ ...actorsFile, "verification/page.json": recordBy("design-agent") }),
    ]).toEqual([
      [],
      ['actor-without-evidence: actor "visual-reviewer" records no evidence'],
      [],
      ['actor-cannot-check: actor "design-agent" does not record check "visual"'],
    ]);
  });

  it("names declared checks and a kind of evidence", () => {
    const with_ = (actor: unknown) =>
      problems({ "actors.json": { version: 1, actors: { a: actor } } });
    expect([
      with_({ checks: ["a11y"] }),
      with_({ evidence: " " }),
      with_({ checks: "visual" }),
    ]).toEqual([
      ['undeclared-check: check "a11y" is not declared'],
      ["empty-string: must not be empty or blank"],
      ["wrong-type: expected an array, found a string"],
    ]);
  });
});

describe("actor commands", () => {
  it("add and set what an actor records, and list it", () => {
    const { run, read } = project({});
    expect([
      run("actor", "add", "design-agent", "--evidence", "design").code,
      run("actor", "add", "visual-reviewer", "--checks", "visual").code,
      run("actor", "set", "design-agent", "--checks", "visual").code,
    ]).toEqual([0, 0, 0]);
    expect(read("actors.json").actors).toEqual({
      "design-agent": { evidence: "design", checks: ["visual"] },
      "visual-reviewer": { checks: ["visual"] },
    });
    expect(json(run("actor", "list")).actors).toEqual([
      { name: "design-agent", evidence: "design", checks: ["visual"] },
      { name: "visual-reviewer", checks: ["visual"] },
    ]);
    expect(run("actor", "set", "nobody", "--evidence", "design").stderr).toBe(
      "dimensions: actor not found: nobody\n",
    );
  });
});

describe("evidence queries", () => {
  it("say what kind of evidence the actor records", () => {
    const { run } = project({
      "actors.json": { version: 1, actors },
      "evidence/page.json": evidenceBy("design-agent"),
    });
    expect(json(run("evidence", "wordmark", "--actor", "design-agent")).kind).toBe("design");
    expect(json(run("status", "--actor", "design-agent")).kind).toBe("design");
    expect(run("evidence", "wordmark", "--actor", "visual-reviewer").stderr).toBe(
      'dimensions: actor "visual-reviewer" records no evidence\n',
    );
  });
});
