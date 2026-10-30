import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { cleanup, taskFile, types, writeProject } from "./support/project.js";

afterAll(cleanup);

const website = fileURLToPath(new URL("../examples/website", import.meta.url));

function capture(argv: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(argv, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

describe("task-tree query", () => {
  it("reports the states blog-link gets from its type", () => {
    const result = capture(["query", website, "blog-link"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      id: "blog-link",
      title: "Blog link",
      type: "link",
      states: ["normal", "hovered", "selected"],
    });
    expect(result.stderr).toBe("");
  });

  it("reports no states for a task without a type", () => {
    const result = capture(["query", website, "logo-mark"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ id: "logo-mark", title: "Logo mark", states: [] });
  });

  it("fails with exit code 1 when the task does not exist", () => {
    const result = capture(["query", website, "missing-link"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("task not found: missing-link");
    expect(result.stdout).toBe("");
  });

  it("fails with exit code 2 when arguments are missing", () => {
    const result = capture(["query", website]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage: task-tree query <directory> <task-id>");
  });

  it("reports a directory without types.json", () => {
    const directory = writeProject({});
    const result = capture(["query", directory, "x"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      `${join(directory, "types.json")}:1:1: missing-file: types.json not found\n`,
    );
  });

  it("reports compiler diagnostics instead of answering from an invalid project", () => {
    const directory = writeProject({
      "types.json": types,
      "tasks/x.json": '{"version":1,"task":{"id":"x","title":"X","type":"nope"}}',
    });
    const result = capture(["query", directory, "x"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      `${join(directory, "tasks/x.json")}:1:50: undefined-type: type "nope" is not defined\n`,
    );
    expect(result.stdout).toBe("");
  });

  it("finds tasks inside components", () => {
    const directory = writeProject({
      "types.json": types,
      "components/toolbar.json": {
        version: 1,
        component: { id: "toolbar", title: "Toolbar", children: [{ id: "c", title: "C" }] },
      },
      "tasks/a.json": taskFile({ id: "a", title: "A", children: [{ include: "toolbar" }] }),
    });
    const result = capture(["query", directory, "c"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ id: "c", title: "C", states: [] });
  });

  it("finds tasks in any task file", () => {
    const directory = writeProject({
      "types.json": types,
      "tasks/a.json": taskFile({ id: "a", title: "A" }),
      "tasks/b.json": taskFile({ id: "b", title: "B", children: [{ id: "c", title: "C" }] }),
    });
    const result = capture(["query", directory, "c"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ id: "c", title: "C", states: [] });
  });
});
