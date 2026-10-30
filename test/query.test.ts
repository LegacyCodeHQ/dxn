import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

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
});
