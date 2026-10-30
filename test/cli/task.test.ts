import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, type Files, taskFile, types, writeProject } from "../support/project.js";

afterAll(cleanup);

const typed = {
  version: 1,
  customAttributes: { design: { values: ["available", "missing"] } },
  types: { link: { states: ["normal", "hovered"] } },
};

function project(files: Files = {}) {
  const root = writeProject(
    Object.fromEntries(
      Object.entries({ "types.json": typed, ...files }).map(([name, content]) => [
        `.task-tree/${name}`,
        content,
      ]),
    ),
  );
  const run = (...argv: string[]) => capture(argv, root);
  const read = (name: string) =>
    JSON.parse(readFileSync(join(root, ".task-tree", name), "utf8")) as unknown;
  const exists = (name: string) => existsSync(join(root, ".task-tree", name));
  return { root, run, read, exists };
}

const page = (children: unknown[] = []) => taskFile({ id: "page", title: "Page", children });

describe("task add", () => {
  it("creates a page when there is no parent", () => {
    const { run, read } = project();
    const result = run("task", "add", "home", "--title", "Home page");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ written: ["tasks/home.json"], removed: [] });
    expect(read("tasks/home.json")).toEqual(taskFile({ id: "home", title: "Home page" }));
  });

  it("adds a child, with a type, under a parent in any file", () => {
    const { run, read } = project({
      "tasks/page.json": page([{ id: "toolbar", title: "Toolbar" }]),
    });
    expect(
      run(
        "task",
        "add",
        "blog-link",
        "--title",
        "Blog link",
        "--parent",
        "toolbar",
        "--type",
        "link",
      ).code,
    ).toBe(0);
    expect(read("tasks/page.json")).toEqual(
      page([
        {
          id: "toolbar",
          title: "Toolbar",
          children: [{ id: "blog-link", title: "Blog link", type: "link" }],
        },
      ]),
    );
  });

  it("adds into components", () => {
    const { run, read } = project({
      "components/toolbar.json": { version: 1, component: { id: "toolbar", title: "Toolbar" } },
    });
    expect(run("task", "add", "wordmark", "--title", "Wordmark", "--parent", "toolbar").code).toBe(
      0,
    );
    expect(read("components/toolbar.json")).toEqual({
      version: 1,
      component: {
        id: "toolbar",
        title: "Toolbar",
        children: [{ id: "wordmark", title: "Wordmark" }],
      },
    });
  });

  it("refuses changes the compiler rejects, and writes nothing", () => {
    const { root, run, exists } = project({ "tasks/page.json": page() });
    const duplicate = run("task", "add", "page", "--title", "Again", "--parent", "page");
    expect(duplicate.code).toBe(1);
    expect(duplicate.stderr).toContain(`${join(root, ".task-tree", "tasks", "page.json")}:`);
    expect(duplicate.stderr).toContain("duplicate-id");
    expect(run("task", "add", "x", "--title", "X", "--type", "button").stderr).toContain(
      "undefined-type",
    );
    expect(exists("tasks/x.json")).toBe(false);
  });

  it("reports an unknown parent and usage errors", () => {
    const { run } = project();
    expect(run("task", "add", "x", "--title", "X", "--parent", "nope")).toMatchObject({
      code: 1,
      stderr: "task-tree: task not found: nope\n",
    });
    expect(run("task", "add", "x").code).toBe(2);
    expect(run("task", "add", "--title", "X").code).toBe(2);
    expect(run("task", "frobnicate").code).toBe(2);
  });

  it("prints the files with --dry-run and writes nothing", () => {
    const { run, exists } = project();
    const result = run("task", "add", "home", "--title", "Home", "--dry-run");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      dryRun: true,
      written: {
        "tasks/home.json": `${JSON.stringify(taskFile({ id: "home", title: "Home" }), null, 2)}\n`,
      },
      removed: [],
    });
    expect(exists("tasks/home.json")).toBe(false);
  });
});

describe("task set-title and set-type", () => {
  it("change the title and type", () => {
    const { run, read } = project({ "tasks/page.json": page([{ id: "a", title: "A" }]) });
    expect(run("task", "set-title", "a", "Renamed").code).toBe(0);
    expect(run("task", "set-type", "a", "link").code).toBe(0);
    expect(read("tasks/page.json")).toEqual(page([{ id: "a", title: "Renamed", type: "link" }]));
    expect(run("task", "set-type", "a", "--none").code).toBe(0);
    expect(read("tasks/page.json")).toEqual(page([{ id: "a", title: "Renamed" }]));
  });

  it("refuse to leave custom attributes without a type", () => {
    const { run } = project({
      "tasks/page.json": page([
        { id: "a", title: "A", type: "link", customAttributes: { design: { normal: "missing" } } },
      ]),
    });
    const result = run("task", "set-type", "a", "--none");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("attributes-without-type");
  });
});

describe("task move", () => {
  it("moves a subtree to a new parent, across files", () => {
    const { run, read } = project({
      "tasks/page.json": page([{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }]),
      "tasks/other.json": taskFile({ id: "other", title: "Other" }),
    });
    expect(run("task", "move", "a", "--parent", "other").code).toBe(0);
    expect(read("tasks/page.json")).toEqual(page([]));
    expect(read("tasks/other.json")).toEqual(
      taskFile({
        id: "other",
        title: "Other",
        children: [{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }],
      }),
    );
  });

  it("refuses to move a task into its own subtree", () => {
    const { run } = project({
      "tasks/page.json": page([{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }]),
    });
    expect(run("task", "move", "a", "--parent", "b")).toMatchObject({
      code: 1,
      stderr: 'task-tree: cannot move "a" into its own subtree\n',
    });
  });

  it("turns a page into a child, removing its file", () => {
    const { run, exists } = project({
      "tasks/page.json": page(),
      "tasks/other.json": taskFile({ id: "other", title: "Other" }),
    });
    const result = run("task", "move", "other", "--parent", "page");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      written: ["tasks/page.json"],
      removed: ["tasks/other.json"],
    });
    expect(exists("tasks/other.json")).toBe(false);
  });
});

describe("task rename", () => {
  it("updates every reference to the task", () => {
    const { run, read } = project({
      "tasks/page.json": page([{ id: "a", title: "A", type: "link" }]),
      "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["a"] },
      "overrides/pointer.json": {
        version: 1,
        only: { a: ["mouse"] },
        overrides: { mouse: { tasks: { a: { states: { remove: ["hovered"] } } } } },
      },
      "verification/page.json": { version: 1, records: [] },
    });
    expect(run("task", "rename", "a", "b").code).toBe(0);
    expect(read("tasks/page.json")).toEqual(page([{ id: "b", title: "A", type: "link" }]));
    expect(read("dimensions/pointer.json")).toMatchObject({ appliesTo: ["b"] });
    expect(read("overrides/pointer.json")).toEqual({
      version: 1,
      only: { b: ["mouse"] },
      overrides: { mouse: { tasks: { b: { states: { remove: ["hovered"] } } } } },
    });
  });

  it("renames a page's file and its verification file", () => {
    const { run, exists } = project({
      "tasks/page.json": page(),
      "verification/page.json": { version: 1, records: [] },
    });
    expect(run("task", "rename", "page", "home").code).toBe(0);
    expect(exists("tasks/home.json")).toBe(true);
    expect(exists("verification/home.json")).toBe(true);
    expect(exists("tasks/page.json")).toBe(false);
  });

  it("renames a component's file and the includes that use it", () => {
    const { run, read, exists } = project({
      "components/toolbar.json": { version: 1, component: { id: "toolbar", title: "Toolbar" } },
      "tasks/page.json": page([{ include: "toolbar" }]),
    });
    expect(run("task", "rename", "toolbar", "header").code).toBe(0);
    expect(exists("components/toolbar.json")).toBe(false);
    expect(read("components/header.json")).toEqual({
      version: 1,
      component: { id: "header", title: "Toolbar" },
    });
    expect(read("tasks/page.json")).toEqual(page([{ include: "header" }]));
  });

  it("updates verification records", () => {
    const record = {
      task: "a",
      context: { state: "normal" },
      check: "visual",
      result: "passed",
      by: "agent",
      at: "2026-10-30T19:20:00Z",
    };
    const { run, read } = project({
      "types.json": {
        version: 1,
        customChecks: { visual: {} },
        types: { link: { states: ["normal"], checks: ["visual"] } },
      },
      "tasks/page.json": page([{ id: "a", title: "A", type: "link" }]),
      "verification/page.json": { version: 1, records: [record] },
    });
    expect(run("task", "rename", "a", "b").code).toBe(0);
    expect(read("verification/page.json")).toEqual({
      version: 1,
      records: [{ ...record, task: "b" }],
    });
  });
});

describe("task remove", () => {
  it("removes a task and its subtree", () => {
    const { run, read } = project({
      "tasks/page.json": page([{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }]),
    });
    expect(run("task", "remove", "a").code).toBe(0);
    expect(read("tasks/page.json")).toEqual(page([]));
  });

  it("removes a page's file", () => {
    const { run, exists } = project({ "tasks/page.json": page() });
    expect(run("task", "remove", "page").code).toBe(0);
    expect(exists("tasks/page.json")).toBe(false);
  });

  it("refuses while something refers to the task", () => {
    const { run, exists } = project({
      "tasks/page.json": page([{ id: "a", title: "A" }]),
      "dimensions/pointer.json": { version: 1, values: ["mouse"], appliesTo: ["a"] },
    });
    const result = run("task", "remove", "a");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown-task");
    expect(exists("tasks/page.json")).toBe(true);
  });
});

describe("task set and unset", () => {
  it("set and clear an instance's attribute values", () => {
    const { run, read } = project({
      "tasks/page.json": page([{ id: "a", title: "A", type: "link" }]),
    });
    expect(run("task", "set", "a", "design", "normal=missing", "hovered=available").code).toBe(0);
    expect(read("tasks/page.json")).toEqual(
      page([
        {
          id: "a",
          title: "A",
          type: "link",
          customAttributes: { design: { normal: "missing", hovered: "available" } },
        },
      ]),
    );
    expect(run("task", "unset", "a", "design", "hovered").code).toBe(0);
    expect(read("tasks/page.json")).toEqual(
      page([
        { id: "a", title: "A", type: "link", customAttributes: { design: { normal: "missing" } } },
      ]),
    );
    expect(run("task", "unset", "a", "design").code).toBe(0);
    expect(read("tasks/page.json")).toEqual(page([{ id: "a", title: "A", type: "link" }]));
  });

  it("refuse values the compiler rejects and malformed pairs", () => {
    const { run } = project({ "tasks/page.json": page([{ id: "a", title: "A", type: "link" }]) });
    expect(run("task", "set", "a", "design", "normal=maybe").stderr).toContain("unknown-value");
    expect(run("task", "set", "a", "design", "normal").code).toBe(2);
    expect(run("task", "set", "a", "design").code).toBe(2);
  });
});

describe("projects with unreadable files", () => {
  it("are refused before any change", () => {
    const { run } = project({ "tasks/page.json": "{" });
    expect(run("task", "add", "x", "--title", "X", "--parent", "page")).toMatchObject({
      code: 1,
      stderr: "task-tree: tasks/page.json is not a JSON object; run task-tree validate\n",
    });
    expect(
      run("task", "add", "x", "--title", "X", "--parent", "page", "--dir", "/nonexistent").code,
    ).toBe(1);
  });
});

describe("files the CLI writes", () => {
  it("are formatted as Prettier formats them", () => {
    const { root, run } = project();
    run("task", "add", "home", "--title", "Home");
    expect(readFileSync(join(root, ".task-tree", "tasks", "home.json"), "utf8")).toBe(
      [
        "{",
        '  "version": 1,',
        '  "task": {',
        '    "id": "home",',
        '    "title": "Home"',
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("start from types.json written by init", () => {
    const root = writeProject({});
    capture(["init"], root);
    expect(capture(["task", "add", "home", "--title", "Home"], root).code).toBe(0);
    expect(types).toBeDefined();
  });
});
