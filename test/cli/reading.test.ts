import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const record = (task: string, context: Record<string, string>, result: string) => ({
  task,
  context,
  check: "visual",
  result,
  by: "agent",
  at: "2026-10-30T19:20:00Z",
});

// Links live in desktop links (lg only) and the menu (base only). On touch,
// links lose hovered and their normal design is missing, except at lg where
// a combination makes it available again.
const files = {
  "types.json": {
    version: 1,
    customAttributes: { design: { values: ["available", "missing"] } },
    customChecks: { visual: {} },
    types: {
      link: {
        states: ["normal", "hovered"],
        checks: ["visual"],
        customAttributes: { design: { normal: "available", hovered: "available" } },
      },
    },
  },
  "tasks/page.json": taskFile({
    id: "page",
    title: "Page",
    children: [
      {
        id: "links",
        title: "Links",
        children: [
          {
            id: "blog-link",
            title: "Blog link",
            type: "link",
            customAttributes: { design: { hovered: "missing" } },
          },
        ],
      },
      {
        id: "menu",
        title: "Menu",
        children: [{ id: "menu-link", title: "Menu link", type: "link" }],
      },
    ],
  }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["base", "lg"],
    default: "lg",
    appliesTo: ["page"],
  },
  "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["page"] },
  "overrides/breakpoint.json": {
    version: 1,
    only: { links: ["lg"], menu: ["base"] },
    overrides: {},
  },
  "overrides/pointer.json": {
    version: 1,
    overrides: {
      touch: {
        types: {
          link: {
            states: { remove: ["hovered"] },
            customAttributes: { design: { normal: "missing" } },
          },
        },
      },
    },
  },
  "overrides/breakpoint+pointer.json": {
    version: 1,
    overrides: {
      lg: { touch: { types: { link: { customAttributes: { design: { normal: "available" } } } } } },
    },
  },
  "verification/page.json": {
    version: 1,
    records: [
      record("blog-link", { state: "normal", pointer: "mouse" }, "passed"),
      record("blog-link", { state: "normal", breakpoint: "lg", pointer: "touch" }, "failed"),
    ],
  },
};

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

describe("query", () => {
  it("resolves states and values in a context, applying precedence", () => {
    const { run } = cliProject(files);
    expect(json(run("query", "blog-link", "breakpoint=lg", "pointer=touch"))).toEqual({
      id: "blog-link",
      title: "Blog link",
      type: "link",
      context: { breakpoint: "lg", pointer: "touch" },
      present: true,
      states: ["normal"],
      customAttributes: { design: { normal: "available" } },
    });
  });

  it("fills in defaults and leaves dimensions without one unapplied", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(json(run("query", "blog-link", "pointer=mouse")));
    snapshot.push(json(run("query", "blog-link")));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "context": {
        "breakpoint": "lg",
        "pointer": "mouse",
      },
      "customAttributes": {
        "design": {
          "hovered": "missing",
          "normal": "available",
        },
      },
      "id": "blog-link",
      "present": true,
      "states": [
        "normal",
        "hovered",
      ],
      "title": "Blog link",
      "type": "link",
    },
    {
      "context": {
        "breakpoint": "lg",
      },
      "customAttributes": {
        "design": {
          "hovered": "missing",
          "normal": "available",
        },
      },
      "id": "blog-link",
      "present": true,
      "states": [
        "normal",
        "hovered",
      ],
      "title": "Blog link",
      "type": "link",
    },
  ]
`);
  });

  it("says when a task does not exist in the context", () => {
    const { run } = cliProject(files);
    expect(json(run("query", "menu-link", "breakpoint=lg"))).toMatchObject({ present: false });
  });

  it("rejects dimensions the task does not have and unknown values", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("query", "blog-link", "theme=dark"));
    snapshot.push(run("query", "blog-link", "pointer=pen"));
    snapshot.push(run("query", "blog-link", "pointer").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "task-tree: "theme" is not a dimension of blog-link
  ",
      "stdout": "",
    },
    {
      "code": 1,
      "stderr": "task-tree: "pen" is not a value of pointer
  ",
      "stdout": "",
    },
    2,
  ]
`);
  });
});

describe("contexts", () => {
  it("lists every context a task exists in, per page", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(json(run("contexts", "blog-link")));
    snapshot.push(json(run("contexts", "menu-link")).contexts);
    snapshot.push(json(run("contexts", "links")).contexts);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "contexts": [
        {
          "context": {
            "breakpoint": "lg",
            "pointer": "mouse",
            "state": "normal",
          },
          "page": "page",
        },
        {
          "context": {
            "breakpoint": "lg",
            "pointer": "mouse",
            "state": "hovered",
          },
          "page": "page",
        },
        {
          "context": {
            "breakpoint": "lg",
            "pointer": "touch",
            "state": "normal",
          },
          "page": "page",
        },
      ],
      "task": "blog-link",
    },
    [
      {
        "context": {
          "breakpoint": "base",
          "pointer": "mouse",
          "state": "normal",
        },
        "page": "page",
      },
      {
        "context": {
          "breakpoint": "base",
          "pointer": "mouse",
          "state": "hovered",
        },
        "page": "page",
      },
      {
        "context": {
          "breakpoint": "base",
          "pointer": "touch",
          "state": "normal",
        },
        "page": "page",
      },
    ],
    [
      {
        "context": {
          "breakpoint": "lg",
          "pointer": "mouse",
        },
        "page": "page",
      },
      {
        "context": {
          "breakpoint": "lg",
          "pointer": "touch",
        },
        "page": "page",
      },
    ],
  ]
`);
  });

  it("reports unknown tasks", () => {
    const { run } = cliProject(files);
    expect(run("contexts", "nope")).toMatchObject({
      code: 1,
      stderr: "task-tree: task not found: nope\n",
    });
  });
});

describe("status", () => {
  it("reports each required check in each context as passed, failed or missing", () => {
    const { run } = cliProject(files);
    const result = json(run("status", "blog-link"));
    expect(result).toEqual({
      summary: { passed: 1, failed: 1, missing: 1 },
      items: [
        {
          page: "page",
          task: "blog-link",
          context: { state: "normal", breakpoint: "lg", pointer: "mouse" },
          check: "visual",
          result: "passed",
        },
        {
          page: "page",
          task: "blog-link",
          context: { state: "hovered", breakpoint: "lg", pointer: "mouse" },
          check: "visual",
          result: "missing",
        },
        {
          page: "page",
          task: "blog-link",
          context: { state: "normal", breakpoint: "lg", pointer: "touch" },
          check: "visual",
          result: "failed",
        },
      ],
    });
  });

  it("covers every typed task with checks when no task is given", () => {
    const { run } = cliProject(files);
    expect(json(run("status")).summary).toEqual({ passed: 1, failed: 1, missing: 4 });
  });
});

describe("tasks no page includes", () => {
  it("resolve within their own component and have no contexts", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({
      ...files,
      "components/footer.json": {
        version: 1,
        component: {
          id: "footer",
          title: "Footer",
          children: [{ id: "footer-link", title: "Footer link", type: "link" }],
        },
      },
    });
    snapshot.push(json(run("query", "footer-link")));
    snapshot.push(json(run("contexts", "footer-link")).contexts);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "customAttributes": {
        "design": {
          "hovered": "available",
          "normal": "available",
        },
      },
      "id": "footer-link",
      "present": true,
      "states": [
        "normal",
        "hovered",
      ],
      "title": "Footer link",
      "type": "link",
    },
    [],
  ]
`);
  });
});

describe("tree", () => {
  it("prints the pages and components", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({
      ...files,
      "components/footer.json": { version: 1, component: { id: "footer", title: "Footer" } },
    });
    const result = json(run("tree"));
    snapshot.push(result.pages.map((page: { id: string }) => page.id));
    snapshot.push(result.components);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      "page",
    ],
    [
      {
        "id": "footer",
        "title": "Footer",
      },
    ],
  ]
`);
  });

  it("reports an invalid project", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({ "types.json": { version: 2 } });
    snapshot.push(run("tree").stderr);
    snapshot.push(run("status").code);
    snapshot.push(run("contexts", "x").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.task-tree/types.json:2:14: unsupported-version: unsupported version 2
  ",
    1,
    1,
  ]
`);
  });
});
