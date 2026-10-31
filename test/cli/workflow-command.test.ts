import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { workflow } from "../../src/generated/workflow.js";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

const guide = readFileSync(new URL("../../docs/workflow.md", import.meta.url), "utf8");

describe("dimensions workflow", () => {
  it("prints the step-by-step guide as Markdown, with no project needed", () => {
    const result = capture(["workflow"], writeProject({}));
    expect([result.code, result.stderr, result.stdout === guide]).toEqual([0, "", true]);
  });

  it("carries the guide inside the program, the same as docs/workflow.md", () => {
    // Regenerate with: make embed-docs
    expect(workflow).toBe(guide);
  });

  it("is where the overview tells an agent to start", () => {
    expect(capture(["--help"]).stdout).toContain("dimensions workflow");
  });
});

describe("the workflow guide", () => {
  it("lists every key a rule can have", () => {
    for (const key of [
      "title",
      "node",
      "subtree",
      "root",
      "when",
      "then",
      "some",
      "exists",
      "on",
    ]) {
      expect(guide).toContain(`| \`${key}\``);
    }
  });
});
