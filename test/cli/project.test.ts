import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, taskFile, types, writeProject } from "../support/project.js";

afterAll(cleanup);

describe("finding the project", () => {
  it("uses the nearest .task-tree directory above the working directory", () => {
    const root = writeProject({ ".task-tree/types.json": types });
    const deep = join(root, "src", "components");
    mkdirSync(deep, { recursive: true });
    const result = capture(["validate"], deep);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ project: join(root, ".task-tree"), errors: 0 });
  });

  it("uses --dir when given, wherever it appears", () => {
    const root = writeProject({ "elsewhere/types.json": types });
    for (const argv of [
      ["--dir", join(root, "elsewhere"), "validate"],
      ["validate", "--dir", join(root, "elsewhere")],
    ]) {
      const result = capture(argv, root);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout).project).toBe(join(root, "elsewhere"));
    }
  });

  it("reports when there is no project", () => {
    const root = writeProject({});
    const result = capture(["validate"], root);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      `task-tree: no .task-tree directory in ${root} or above; run task-tree init\n`,
    );
    expect(result.stdout).toBe("");
  });

  it("rejects --dir without a value", () => {
    const result = capture(["validate", "--dir"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--dir needs a directory");
  });
});

describe("task-tree init", () => {
  it("creates .task-tree with types.json in the working directory", () => {
    const root = writeProject({});
    const result = capture(["init"], root);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ created: join(root, ".task-tree") });
    expect(JSON.parse(readFileSync(join(root, ".task-tree", "types.json"), "utf8"))).toEqual({
      version: 1,
    });
    expect(capture(["validate"], root).code).toBe(0);
  });

  it("creates the project at --dir", () => {
    const root = writeProject({});
    const result = capture(["init", "--dir", join(root, "plans")], root);
    expect(result.code).toBe(0);
    expect(existsSync(join(root, "plans", "types.json"))).toBe(true);
  });

  it("refuses to overwrite an existing project", () => {
    const root = writeProject({ ".task-tree/types.json": "keep" });
    const result = capture(["init"], root);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(`task-tree: ${join(root, ".task-tree")} already exists\n`);
    expect(readFileSync(join(root, ".task-tree", "types.json"), "utf8")).toBe("keep");
  });

  it("takes no arguments", () => {
    expect(capture(["init", "extra"], writeProject({})).code).toBe(2);
  });
});

describe("task-tree validate", () => {
  it("prints each diagnostic with its file, line and column, and exits 1", () => {
    const root = writeProject({
      ".task-tree/types.json": types,
      ".task-tree/tasks/a.json": '{"version":1,"task":{"id":"a","title":"A","type":"nope"}}',
      ".task-tree/tasks/b.json": taskFile({ id: "b", title: "B", extra: 1 }),
    });
    const result = capture(["validate"], root);
    const tasks = join(root, ".task-tree", "tasks");
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      [
        `${join(tasks, "a.json")}:1:50: undefined-type: type "nope" is not defined`,
        `${join(tasks, "b.json")}:6:5: unknown-key: unknown key "extra"`,
        "",
      ].join("\n"),
    );
    expect(JSON.parse(result.stdout)).toEqual({ project: join(root, ".task-tree"), errors: 2 });
  });

  it("takes no arguments", () => {
    expect(capture(["validate", "extra"], writeProject({})).code).toBe(2);
  });
});
