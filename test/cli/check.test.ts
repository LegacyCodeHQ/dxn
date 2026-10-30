import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

describe("check commands", () => {
  it("declare checks and make types require them", () => {
    const { run, read } = cliProject({ "types.json": { version: 1, types: { link: {} } } });
    expect(run("check", "add", "visual").code).toBe(0);
    expect(run("check", "add", "behavior").code).toBe(0);
    expect(run("type", "require", "link", "visual").code).toBe(0);
    expect(read("types.json")).toEqual({
      version: 1,
      customChecks: { visual: {}, behavior: {} },
      types: { link: { checks: ["visual"] } },
    });
    expect(run("type", "unrequire", "link", "visual").code).toBe(0);
    expect(run("check", "remove", "behavior").code).toBe(0);
    expect(read("types.json")).toEqual({
      version: 1,
      customChecks: { visual: {} },
      types: { link: { checks: [] } },
    });
  });

  it("refuse existing, unknown and required checks", () => {
    const { run } = cliProject({ "types.json": { version: 1, types: { link: {} } } });
    run("check", "add", "visual");
    expect(run("check", "add", "visual")).toMatchObject({
      code: 1,
      stderr: 'task-tree: check "visual" already exists\n',
    });
    expect(run("check", "remove", "speed")).toMatchObject({
      code: 1,
      stderr: "task-tree: check not found: speed\n",
    });
    expect(run("type", "require", "link", "speed").stderr).toContain("undeclared-check");
    run("type", "require", "link", "visual");
    expect(run("check", "remove", "visual").stderr).toContain("undeclared-check");
    expect(run("type", "unrequire", "link", "speed")).toMatchObject({
      code: 1,
      stderr: 'task-tree: type "link" does not require "speed"\n',
    });
    expect(run("check").code).toBe(2);
  });
});
