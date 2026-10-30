import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

describe("check commands", () => {
  it("declare checks and make types require them", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject({ "types.json": { version: 1, types: { link: {} } } });
    snapshot.push(run("check", "add", "visual").code);
    snapshot.push(run("check", "add", "behavior").code);
    snapshot.push(run("type", "require", "link", "visual").code);
    snapshot.push(read("types.json"));
    snapshot.push(run("type", "unrequire", "link", "visual").code);
    snapshot.push(run("check", "remove", "behavior").code);
    snapshot.push(read("types.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    0,
    0,
    {
      "customChecks": {
        "behavior": {},
        "visual": {},
      },
      "types": {
        "link": {
          "checks": [
            "visual",
          ],
        },
      },
      "version": 1,
    },
    0,
    0,
    {
      "customChecks": {
        "visual": {},
      },
      "types": {
        "link": {
          "checks": [],
        },
      },
      "version": 1,
    },
  ]
`);
  });

  it("refuse existing, unknown and required checks", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({ "types.json": { version: 1, types: { link: {} } } });
    run("check", "add", "visual");
    snapshot.push(run("check", "add", "visual"));
    snapshot.push(run("check", "remove", "speed"));
    snapshot.push(run("type", "require", "link", "speed").stderr);
    run("type", "require", "link", "visual");
    snapshot.push(run("check", "remove", "visual").stderr);
    snapshot.push(run("type", "unrequire", "link", "speed"));
    snapshot.push(run("check").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "task-tree: check "visual" already exists
  ",
      "stdout": "",
    },
    {
      "code": 1,
      "stderr": "task-tree: check not found: speed
  ",
      "stdout": "",
    },
    "<tmp>/.task-tree/types.json:8:18: undeclared-check: check "speed" is not declared
  ",
    "<tmp>/.task-tree/types.json:6:18: undeclared-check: check "visual" is not declared
  ",
    {
      "code": 1,
      "stderr": "task-tree: type "link" does not require "speed"
  ",
      "stdout": "",
    },
    2,
  ]
`);
  });
});
