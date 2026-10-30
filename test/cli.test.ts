import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

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

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

describe("task-tree cli", () => {
  it("prints the package version as JSON with --version", () => {
    const result = capture(["--version"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ version: pkg.version });
    expect(result.stderr).toBe("");
  });

  it("prints usage with --help", () => {
    const result = capture(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: task-tree");
  });

  it("prints usage when no arguments are given", () => {
    const result = capture([]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: task-tree");
  });

  it("rejects an unknown command with exit code 2", () => {
    const result = capture(["frobnicate"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown command: frobnicate");
    expect(result.stdout).toBe("");
  });
});
