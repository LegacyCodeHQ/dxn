import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

describe("check commands", () => {
  it("declare checks and make types require them", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject({ "types.json": { version: 1, types: { link: {} } } });
    snapshot.push(run("prototype", "check", "add", "visual").code);
    snapshot.push(run("prototype", "check", "add", "behavior").code);
    snapshot.push(run("prototype", "type", "require", "link", "visual").code);
    snapshot.push(read("types.json"));
    snapshot.push(run("prototype", "type", "unrequire", "link", "visual").code);
    snapshot.push(run("prototype", "check", "remove", "behavior").code);
    snapshot.push(read("types.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    0,
    0,
    {
      "checks": {
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
      "checks": {
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
    run("prototype", "check", "add", "visual");
    snapshot.push(run("prototype", "check", "add", "visual"));
    snapshot.push(run("prototype", "check", "remove", "speed"));
    snapshot.push(run("prototype", "type", "require", "link", "speed").stderr);
    run("prototype", "type", "require", "link", "visual");
    snapshot.push(run("prototype", "check", "remove", "visual").stderr);
    snapshot.push(run("prototype", "type", "unrequire", "link", "speed"));
    snapshot.push(run("prototype", "check").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "dxn: check "visual" already exists
  ",
      "stdout": "",
    },
    {
      "code": 1,
      "stderr": "dxn: check not found: speed
  ",
      "stdout": "",
    },
    "<tmp>/.dxn/types.json:8:18: undeclared-check: check "speed" is not declared
  ",
    "<tmp>/.dxn/types.json:6:18: undeclared-check: check "visual" is not declared
  ",
    {
      "code": 1,
      "stderr": "dxn: type "link" does not require "speed"
  ",
      "stdout": "",
    },
    2,
  ]
`);
  });
});
