import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// The toolbar of the neo-website example: desktop links at lg and up; a menu
// at base and sm whose panel exists only when it is open.
const files = {
  "types.json": {
    version: 1,
    customChecks: { visual: {} },
    types: {
      menu: { states: ["closed", "open"], shared: true },
      "toolbar-link": { states: ["normal", "hovered"], checks: ["visual"] },
    },
  },
  "components/toolbar.json": {
    version: 1,
    component: {
      id: "toolbar",
      title: "Toolbar",
      children: [
        { id: "wordmark", title: "Wordmark" },
        {
          id: "toolbar-links",
          title: "Links",
          children: [{ id: "blog-link", title: "Blog link", type: "toolbar-link" }],
        },
        {
          id: "menu",
          title: "Menu",
          type: "menu",
          children: [
            { id: "menu-button", title: "Menu button" },
            {
              id: "menu-panel",
              title: "Menu panel",
              onlyWhen: { menu: ["open"] },
              children: [{ id: "menu-link", title: "Menu link", type: "toolbar-link" }],
            },
          ],
        },
      ],
    },
  },
  "tasks/article-page.json": taskFile({
    id: "article-page",
    title: "Article page",
    children: [{ include: "toolbar" }],
  }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["base", "sm", "lg", "xl"],
    default: "xl",
    appliesTo: ["toolbar"],
  },
  "overrides/breakpoint.json": {
    version: 1,
    only: { "toolbar-links": ["lg", "xl"], menu: ["base", "sm"] },
    overrides: {},
  },
};

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

describe("views", () => {
  it("lists every distinct view of a component, with shared states only where they exist", () => {
    const { run } = cliProject(files);
    expect(json(run("views", "toolbar"))).toEqual({
      task: "toolbar",
      views: [
        { breakpoint: "base", menu: "closed" },
        { breakpoint: "base", menu: "open" },
        { breakpoint: "sm", menu: "closed" },
        { breakpoint: "sm", menu: "open" },
        { breakpoint: "lg" },
        { breakpoint: "xl" },
      ],
    });
  });

  it("works for a page, a task inside a component, and a task that does not vary", () => {
    const { run } = cliProject(files);
    expect(json(run("views", "article-page")).views).toHaveLength(6);
    expect(json(run("views", "menu")).views).toEqual([
      { breakpoint: "base", menu: "closed" },
      { breakpoint: "base", menu: "open" },
      { breakpoint: "sm", menu: "closed" },
      { breakpoint: "sm", menu: "open" },
    ]);
    expect(json(run("views", "menu-panel")).views).toEqual([
      { breakpoint: "base", menu: "open" },
      { breakpoint: "sm", menu: "open" },
    ]);
  });

  it("reports unknown tasks", () => {
    const { run } = cliProject(files);
    expect(run("views", "nope")).toMatchObject({
      code: 1,
      stderr: "task-tree: task not found: nope\n",
    });
  });
});

describe("view", () => {
  it("prints the tree present in one view, with states and shared states", () => {
    const { run } = cliProject(files);
    expect(json(run("view", "toolbar", "breakpoint=sm", "menu=open"))).toEqual({
      task: "toolbar",
      context: { breakpoint: "sm", menu: "open" },
      tree: {
        id: "toolbar",
        title: "Toolbar",
        children: [
          { id: "wordmark", title: "Wordmark" },
          {
            id: "menu",
            title: "Menu",
            type: "menu",
            state: "open",
            children: [
              { id: "menu-button", title: "Menu button" },
              {
                id: "menu-panel",
                title: "Menu panel",
                children: [
                  {
                    id: "menu-link",
                    title: "Menu link",
                    type: "toolbar-link",
                    states: ["normal", "hovered"],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("leaves out what the view does not have, and uses defaults", () => {
    const { run } = cliProject(files);
    const closed = json(run("view", "toolbar", "breakpoint=sm", "menu=closed")).tree;
    expect(closed.children[1].children.map((child: { id: string }) => child.id)).toEqual([
      "menu-button",
    ]);
    const desktop = json(run("view", "toolbar"));
    expect(desktop.context).toEqual({ breakpoint: "xl" });
    expect(desktop.tree.children.map((child: { id: string }) => child.id)).toEqual([
      "wordmark",
      "toolbar-links",
    ]);
  });

  it("expands included components in a page", () => {
    const { run } = cliProject(files);
    expect(json(run("view", "article-page")).tree.children[0].id).toBe("toolbar");
  });

  it("needs the state of each shared task in the view, and known values", () => {
    const { run } = cliProject(files);
    expect(run("view", "toolbar", "breakpoint=sm")).toMatchObject({
      code: 1,
      stderr: "task-tree: give menu=<closed|open> for this view\n",
    });
    expect(run("view", "toolbar", "breakpoint=md")).toMatchObject({
      code: 1,
      stderr: 'task-tree: "md" is not a value of breakpoint\n',
    });
    expect(run("view", "toolbar", "menu=ajar", "breakpoint=sm")).toMatchObject({
      code: 1,
      stderr: 'task-tree: "ajar" is not a state of menu\n',
    });
    expect(run("view", "toolbar", "theme=dark")).toMatchObject({
      code: 1,
      stderr: 'task-tree: "theme" is not a dimension or shared task in this view\n',
    });
  });
});

describe("shared states in the other reading commands", () => {
  it("are part of a task's contexts", () => {
    const { run } = cliProject(files);
    expect(json(run("contexts", "menu-button")).contexts).toEqual([
      { page: "article-page", context: { breakpoint: "base", menu: "closed" } },
      { page: "article-page", context: { breakpoint: "base", menu: "open" } },
      { page: "article-page", context: { breakpoint: "sm", menu: "closed" } },
      { page: "article-page", context: { breakpoint: "sm", menu: "open" } },
    ]);
    expect(json(run("contexts", "menu-link")).contexts).toHaveLength(4);
  });

  it("decide presence in query", () => {
    const { run } = cliProject(files);
    expect(json(run("query", "menu-link", "breakpoint=sm", "menu=closed"))).toMatchObject({
      context: { breakpoint: "sm", menu: "closed" },
      present: false,
    });
    expect(json(run("query", "menu-link", "breakpoint=sm", "menu=open")).present).toBe(true);
  });

  it("are matched in status", () => {
    const { run } = cliProject({
      ...files,
      "verification/article-page.json": {
        version: 1,
        records: [
          {
            task: "menu-link",
            context: { state: "normal", breakpoint: "sm", menu: "open" },
            check: "visual",
            result: "passed",
            by: "agent",
            at: "2026-10-30T19:20:00Z",
          },
        ],
      },
    });
    expect(json(run("status", "menu-link")).summary).toEqual({ passed: 1, failed: 0, missing: 3 });
  });
});
