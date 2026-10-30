import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const types = { version: 1 };
const page = (children: unknown[] = []) => taskFile({ id: "page", title: "Page", children });

describe("component add and remove", () => {
  it("add a component file and remove an unused one", () => {
    const { run, read, exists } = cliProject({ "types.json": types });
    expect(run("component", "add", "toolbar", "--title", "Toolbar").code).toBe(0);
    expect(read("components/toolbar.json")).toEqual({
      version: 1,
      component: { id: "toolbar", title: "Toolbar" },
    });
    expect(run("component", "add", "toolbar", "--title", "Again")).toMatchObject({
      code: 1,
      stderr: 'task-tree: component "toolbar" already exists\n',
    });
    expect(run("component", "remove", "toolbar").code).toBe(0);
    expect(exists("components/toolbar.json")).toBe(false);
  });

  it("refuse to remove an included component and unknown ones", () => {
    const { run } = cliProject({
      "types.json": types,
      "components/toolbar.json": { version: 1, component: { id: "toolbar", title: "Toolbar" } },
      "tasks/page.json": page([{ include: "toolbar" }]),
    });
    expect(run("component", "remove", "toolbar").stderr).toContain("unknown-component");
    expect(run("component", "remove", "nope")).toMatchObject({
      code: 1,
      stderr: "task-tree: component not found: nope\n",
    });
    expect(run("component", "add", "x").code).toBe(2);
    expect(run("component").code).toBe(2);
  });
});

describe("component extract", () => {
  it("moves a subtree into a component and includes it in its place", () => {
    const { run, read } = cliProject({
      "types.json": types,
      "tasks/page.json": page([
        { id: "toolbar", title: "Toolbar", children: [{ id: "wordmark", title: "Wordmark" }] },
        { id: "body", title: "Body" },
      ]),
    });
    const result = run("component", "extract", "toolbar");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      written: ["components/toolbar.json", "tasks/page.json"],
      removed: [],
    });
    expect(read("components/toolbar.json")).toEqual({
      version: 1,
      component: {
        id: "toolbar",
        title: "Toolbar",
        children: [{ id: "wordmark", title: "Wordmark" }],
      },
    });
    expect(read("tasks/page.json")).toEqual(
      page([{ include: "toolbar" }, { id: "body", title: "Body" }]),
    );
  });

  it("refuses a file's root task", () => {
    const { run } = cliProject({ "types.json": types, "tasks/page.json": page() });
    expect(run("component", "extract", "page")).toMatchObject({
      code: 1,
      stderr: 'task-tree: "page" is a file\'s root task; only a task inside one can be extracted\n',
    });
  });
});

describe("task include and uninclude", () => {
  it("add and remove an include under a task", () => {
    const { run, read } = cliProject({
      "types.json": types,
      "components/toolbar.json": { version: 1, component: { id: "toolbar", title: "Toolbar" } },
      "tasks/page.json": page(),
    });
    expect(run("task", "include", "page", "toolbar").code).toBe(0);
    expect(read("tasks/page.json")).toEqual(page([{ include: "toolbar" }]));
    expect(run("task", "include", "page", "toolbar").stderr).toContain("duplicate-include");
    expect(run("task", "uninclude", "page", "toolbar").code).toBe(0);
    expect(read("tasks/page.json")).toEqual(page([]));
    expect(run("task", "uninclude", "page", "toolbar")).toMatchObject({
      code: 1,
      stderr: 'task-tree: "page" does not include "toolbar"\n',
    });
  });

  it("refuse unknown components", () => {
    const { run } = cliProject({ "types.json": types, "tasks/page.json": page() });
    expect(run("task", "include", "page", "nope").stderr).toContain("unknown-component");
  });
});
