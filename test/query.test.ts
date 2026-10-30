import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

const scratch = mkdtempSync(join(tmpdir(), "task-tree-query-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function file(name: string, content: string): string {
  const path = join(scratch, name);
  writeFileSync(path, content);
  return path;
}

const tree = fileURLToPath(new URL("../examples/article-page/tree.json", import.meta.url));

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
    const result = capture(["query", tree, "blog-link"]);
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
    const result = capture(["query", tree, "logo-mark"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      id: "logo-mark",
      title: "Logo mark",
      states: [],
    });
  });

  it("fails with exit code 1 when the task does not exist", () => {
    const result = capture(["query", tree, "missing-link"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("task not found: missing-link");
    expect(result.stdout).toBe("");
  });

  it("fails with exit code 2 when arguments are missing", () => {
    const result = capture(["query", tree]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage: task-tree query <tree.json> <task-id>");
  });

  it("reports a missing file instead of crashing", () => {
    const result = capture(["query", join(scratch, "missing.json"), "blog-link"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      `${join(scratch, "missing.json")}:1:1: missing-file: file not found\n`,
    );
    expect(result.stdout).toBe("");
  });

  it("reports a directory instead of crashing", () => {
    const result = capture(["query", scratch, "blog-link"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(`${scratch}:1:1: not-a-file: not a file\n`);
  });

  it("reports syntax errors instead of crashing", () => {
    const path = file("syntax.json", "{");
    const result = capture(["query", path, "blog-link"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(`${path}:1:2: unexpected-end: unexpected end of input\n`);
  });

  it("reports compiler diagnostics instead of answering from an invalid tree", () => {
    const path = file(
      "invalid.json",
      JSON.stringify({ version: 1, tasks: [{ id: "x", title: "X", type: "nope" }] }),
    );
    const result = capture(["query", path, "x"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(`${path}:1:52: undefined-type: type "nope" is not defined\n`);
    expect(result.stdout).toBe("");
  });
});
