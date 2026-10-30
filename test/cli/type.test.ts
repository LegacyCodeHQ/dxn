import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, type Files, taskFile, writeProject } from "../support/project.js";

afterAll(cleanup);

function project(files: Files = {}) {
  const root = writeProject(
    Object.fromEntries(
      Object.entries({
        "types.json": {
          version: 1,
          customAttributes: { design: { values: ["available", "missing"] } },
        },
        ...files,
      }).map(([name, content]) => [`.task-tree/${name}`, content]),
    ),
  );
  return {
    run: (...argv: string[]) => capture(argv, root),
    read: (name: string) =>
      JSON.parse(readFileSync(join(root, ".task-tree", name), "utf8")) as Record<string, unknown>,
  };
}

const types = (read: (name: string) => Record<string, unknown>) => read("types.json").types;

describe("type add", () => {
  it("adds a type, with or without states", () => {
    const { run, read } = project();
    expect(run("type", "add", "link", "--states", "normal,hovered,selected").code).toBe(0);
    expect(run("type", "add", "button").code).toBe(0);
    expect(types(read)).toEqual({
      link: { states: ["normal", "hovered", "selected"] },
      button: {},
    });
  });

  it("refuses an existing type and usage errors", () => {
    const { run } = project();
    run("type", "add", "link");
    expect(run("type", "add", "link")).toMatchObject({
      code: 1,
      stderr: 'task-tree: type "link" already exists\n',
    });
    expect(run("type", "add").code).toBe(2);
    expect(run("type", "frobnicate").code).toBe(2);
  });

  it("refuses names the compiler rejects", () => {
    const { run } = project();
    expect(run("type", "add", "link", "--states", "a,a").stderr).toContain("duplicate-state");
  });
});

describe("type add-state and remove-state", () => {
  it("add and remove states", () => {
    const { run, read } = project();
    run("type", "add", "link", "--states", "normal");
    expect(run("type", "add-state", "link", "hovered").code).toBe(0);
    expect(run("type", "remove-state", "link", "normal").code).toBe(0);
    expect(types(read)).toEqual({ link: { states: ["hovered"] } });
  });

  it("refuse to remove a state that has values, and unknown types", () => {
    const { run } = project();
    run("type", "add", "link", "--states", "normal");
    run("type", "set", "link", "design", "normal=missing");
    expect(run("type", "remove-state", "link", "normal").stderr).toContain("unknown-state");
    expect(run("type", "add-state", "button", "x")).toMatchObject({
      code: 1,
      stderr: "task-tree: type not found: button\n",
    });
  });
});

describe("type set and unset", () => {
  it("set and clear a type's attribute values", () => {
    const { run, read } = project();
    run("type", "add", "link", "--states", "normal,hovered");
    expect(run("type", "set", "link", "design", "normal=available", "hovered=missing").code).toBe(
      0,
    );
    expect(types(read)).toEqual({
      link: {
        states: ["normal", "hovered"],
        customAttributes: { design: { normal: "available", hovered: "missing" } },
      },
    });
    expect(run("type", "unset", "link", "design").code).toBe(0);
    expect(types(read)).toEqual({ link: { states: ["normal", "hovered"] } });
  });
});

describe("type rename", () => {
  it("updates the tasks and overrides that use it", () => {
    const { run, read } = project({
      "tasks/page.json": taskFile({
        id: "page",
        title: "Page",
        children: [{ id: "a", title: "A", type: "link" }],
      }),
      "dimensions/pointer.json": { version: 1, values: ["touch"], appliesTo: ["page"] },
      "overrides/pointer.json": {
        version: 1,
        overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
      },
    });
    run("type", "add", "link", "--states", "normal,hovered");
    expect(run("type", "rename", "link", "toolbar-link").code).toBe(0);
    expect(types(read)).toEqual({ "toolbar-link": { states: ["normal", "hovered"] } });
    expect(read("tasks/page.json")).toEqual(
      taskFile({
        id: "page",
        title: "Page",
        children: [{ id: "a", title: "A", type: "toolbar-link" }],
      }),
    );
    expect(read("overrides/pointer.json")).toEqual({
      version: 1,
      overrides: { touch: { types: { "toolbar-link": { states: { remove: ["hovered"] } } } } },
    });
  });
});

describe("type remove", () => {
  it("removes an unused type and refuses one in use", () => {
    const { run, read } = project({
      "tasks/page.json": taskFile({
        id: "page",
        title: "Page",
        children: [{ id: "a", title: "A", type: "link" }],
      }),
    });
    run("type", "add", "link");
    run("type", "add", "button");
    expect(run("type", "remove", "button").code).toBe(0);
    expect(run("type", "remove", "link").stderr).toContain("undefined-type");
    expect(types(read)).toEqual({ link: {} });
  });
});
