import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

const declared = {
  "types.json": {
    version: 1,
    stateGroups: { selection: ["unselected", "selected"], hover: ["rest", "hovered"] },
    customAttributes: { design: { values: ["missing", "ready"] } },
    customChecks: { visual: {}, behavior: {} },
    types: {
      wordmark: { stateGroups: { selection: ["selected"] } },
      menu: { states: ["closed", "open"], shared: true, checks: ["behavior"] },
      link: {
        stateGroups: ["hover", "selection"],
        checks: ["visual"],
        customAttributes: { design: { rest: "ready" } },
      },
    },
  },
};

describe("list commands", () => {
  it("list the types, with the group values each one uses", () => {
    const { run } = cliProject(declared);
    expect(json(run("type", "list"))).toEqual({
      types: [
        {
          name: "link",
          stateGroups: { hover: ["rest", "hovered"], selection: ["unselected", "selected"] },
          checks: ["visual"],
          customAttributes: { design: { rest: "ready" } },
        },
        { name: "menu", states: ["closed", "open"], shared: true, checks: ["behavior"] },
        { name: "wordmark", stateGroups: { selection: ["selected"] } },
      ],
    });
  });

  it("list the state groups, checks and attributes, with what uses them", () => {
    const { run } = cliProject(declared);
    expect(json(run("state-group", "list"))).toEqual({
      stateGroups: [
        { name: "hover", values: ["rest", "hovered"], usedBy: ["link"] },
        { name: "selection", values: ["unselected", "selected"], usedBy: ["link", "wordmark"] },
      ],
    });
    expect(json(run("check", "list"))).toEqual({
      checks: [
        { name: "behavior", requiredBy: ["menu"] },
        { name: "visual", requiredBy: ["link"] },
      ],
    });
    expect(json(run("attribute", "list"))).toEqual({
      attributes: [{ name: "design", values: ["missing", "ready"] }],
    });
  });

  it("list nothing in a project that declares nothing", () => {
    const { run } = cliProject({ "types.json": { version: 1 } });
    expect([
      json(run("type", "list")),
      json(run("state-group", "list")),
      json(run("check", "list")),
      json(run("attribute", "list")),
    ]).toEqual([{ types: [] }, { stateGroups: [] }, { checks: [] }, { attributes: [] }]);
  });

  it("take no arguments", () => {
    const { run } = cliProject(declared);
    expect(run("check", "list", "visual").code).toBe(2);
  });
});
