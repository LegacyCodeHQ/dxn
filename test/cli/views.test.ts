import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// The toolbar of the neo-website example: desktop links at lg and up; a menu
// at base and sm whose panel exists only when it is open.
const files = {
  "types.json": {
    version: 1,
    checks: { visual: {} },
    types: {
      menu: { states: ["closed", "open"], shared: true },
      "toolbar-link": { states: ["normal", "hovered"], checks: ["visual"] },
    },
  },
  "fragments/toolbar.json": {
    version: 1,
    fragment: {
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
  "roots/article-page.json": rootFile({
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
  it("lists every distinct view of a fragment, with shared states only where they exist", () => {
    const { run } = cliProject(files);
    expect(json(run("views", "toolbar"))).toEqual({
      node: "toolbar",
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

  it("works for a root, a node inside a fragment, and a node that does not vary", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(json(run("views", "article-page")).views);
    snapshot.push(json(run("views", "menu")).views);
    snapshot.push(json(run("views", "menu-panel")).views);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "breakpoint": "base",
        "menu": "closed",
      },
      {
        "breakpoint": "base",
        "menu": "open",
      },
      {
        "breakpoint": "sm",
        "menu": "closed",
      },
      {
        "breakpoint": "sm",
        "menu": "open",
      },
      {
        "breakpoint": "lg",
      },
      {
        "breakpoint": "xl",
      },
    ],
    [
      {
        "breakpoint": "base",
        "menu": "closed",
      },
      {
        "breakpoint": "base",
        "menu": "open",
      },
      {
        "breakpoint": "sm",
        "menu": "closed",
      },
      {
        "breakpoint": "sm",
        "menu": "open",
      },
    ],
    [
      {
        "breakpoint": "base",
        "menu": "open",
      },
      {
        "breakpoint": "sm",
        "menu": "open",
      },
    ],
  ]
`);
  });

  it("reports unknown nodes", () => {
    const { run } = cliProject(files);
    expect(run("views", "nope")).toMatchObject({
      code: 1,
      stderr: "dxn: node not found: nope\n",
    });
  });
});

describe("view", () => {
  it("prints the tree present in one view, with states and shared states", () => {
    const { run } = cliProject(files);
    expect(json(run("view", "toolbar", "breakpoint=sm", "menu=open"))).toEqual({
      node: "toolbar",
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
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    const closed = json(run("view", "toolbar", "breakpoint=sm", "menu=closed")).tree;
    snapshot.push(closed.children[1].children.map((child: { id: string }) => child.id));
    const desktop = json(run("view", "toolbar"));
    snapshot.push(desktop.context);
    snapshot.push(desktop.tree.children.map((child: { id: string }) => child.id));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      "menu-button",
    ],
    {
      "breakpoint": "xl",
    },
    [
      "wordmark",
      "toolbar-links",
    ],
  ]
`);
  });

  it("expands included fragments in a root", () => {
    const { run } = cliProject(files);
    expect(json(run("view", "article-page")).tree.children[0].id).toBe("toolbar");
  });

  it("needs the state of each shared node in the view, and known values", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("view", "toolbar", "breakpoint=sm"));
    snapshot.push(run("view", "toolbar", "breakpoint=md"));
    snapshot.push(run("view", "toolbar", "menu=ajar", "breakpoint=sm"));
    snapshot.push(run("view", "toolbar", "theme=dark"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "code": 1,
          "stderr": "dxn: give menu=<closed|open> for this view
      ",
          "stdout": "",
        },
        {
          "code": 1,
          "stderr": "dxn: "md" is not a value of breakpoint (base, sm, lg, xl)
      ",
          "stdout": "",
        },
        {
          "code": 1,
          "stderr": "dxn: "ajar" is not a state of menu (closed, open)
      ",
          "stdout": "",
        },
        {
          "code": 1,
          "stderr": "dxn: "theme" is not a dimension or shared node in this view (breakpoint, menu)
      ",
          "stdout": "",
        },
      ]
    `);
  });
});

describe("view configurations that cannot exist", () => {
  it("reject a shared node's state where that node does not exist", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("view", "toolbar", "breakpoint=lg", "menu=open"));
    snapshot.push(run("view", "toolbar", "breakpoint=xl", "menu=closed").code);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "code": 1,
          "stderr": "dxn: "menu" does not exist when breakpoint=lg; leave out menu=open
      ",
          "stdout": "",
        },
        1,
      ]
    `);
  });

  it("reject viewing a node where it does not exist", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("view", "menu", "breakpoint=lg"));
    snapshot.push(run("view", "menu-panel", "breakpoint=sm", "menu=closed"));
    snapshot.push(run("view", "menu-panel", "breakpoint=sm", "menu=open").code);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "code": 1,
          "stderr": "dxn: "menu" does not exist when breakpoint=lg
      ",
          "stdout": "",
        },
        {
          "code": 1,
          "stderr": "dxn: "menu-panel" does not exist when breakpoint=sm and menu=closed
      ",
          "stdout": "",
        },
        0,
      ]
    `);
  });
});

describe("shared states in the other reading commands", () => {
  it("are part of a node's contexts", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(json(run("contexts", "menu-button")).contexts);
    snapshot.push(json(run("contexts", "menu-link")).contexts);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "context": {
          "breakpoint": "base",
          "menu": "closed",
        },
        "root": "article-page",
      },
      {
        "context": {
          "breakpoint": "base",
          "menu": "open",
        },
        "root": "article-page",
      },
      {
        "context": {
          "breakpoint": "sm",
          "menu": "closed",
        },
        "root": "article-page",
      },
      {
        "context": {
          "breakpoint": "sm",
          "menu": "open",
        },
        "root": "article-page",
      },
    ],
    [
      {
        "context": {
          "breakpoint": "base",
          "menu": "open",
          "state": "normal",
        },
        "root": "article-page",
      },
      {
        "context": {
          "breakpoint": "base",
          "menu": "open",
          "state": "hovered",
        },
        "root": "article-page",
      },
      {
        "context": {
          "breakpoint": "sm",
          "menu": "open",
          "state": "normal",
        },
        "root": "article-page",
      },
      {
        "context": {
          "breakpoint": "sm",
          "menu": "open",
          "state": "hovered",
        },
        "root": "article-page",
      },
    ],
  ]
`);
  });

  it("decide presence in query", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(json(run("show", "menu-link", "breakpoint=sm", "menu=closed")));
    snapshot.push(json(run("show", "menu-link", "breakpoint=sm", "menu=open")).present);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "context": {
        "breakpoint": "sm",
        "menu": "closed",
      },
      "id": "menu-link",
      "present": false,
      "states": [
        "normal",
        "hovered",
      ],
      "title": "Menu link",
      "type": "toolbar-link",
    },
    true,
  ]
`);
  });

  it("are matched in status", () => {
    const { run } = cliProject({
      ...files,
      "actors.json": { version: 1, actors: { agent: { checks: ["visual"] } } },
      "verification/article-page.json": {
        version: 1,
        records: [
          {
            node: "menu-link",
            context: { state: "normal", breakpoint: "sm", menu: "open" },
            check: "visual",
            result: "passed",
            actor: "agent",
            at: "2026-10-30T19:20:00Z",
          },
        ],
      },
    });
    expect(json(run("status", "menu-link")).summary).toEqual({ passed: 1, failed: 0, missing: 3 });
  });
});

describe("show, like view", () => {
  it("needs the state of each shared node above the node, where it exists", () => {
    const { run } = cliProject(files);
    const snapshot: unknown[] = [];
    snapshot.push(run("show", "menu-link", "breakpoint=sm"));
    snapshot.push(run("show", "menu-link", "breakpoint=lg", "menu=open"));
    snapshot.push(json(run("show", "menu-link", "breakpoint=lg")).present);
    snapshot.push(json(run("show", "menu-link", "breakpoint=sm", "menu=open")).present);
    expect(snapshot).toEqual([
      {
        code: 1,
        stdout: "",
        stderr: "dxn: give menu=<closed|open> for this node\n",
      },
      {
        code: 1,
        stdout: "",
        stderr: 'dxn: "menu" does not exist when breakpoint=lg; leave out menu=open\n',
      },
      false,
      true,
    ]);
  });

  it("shows a fragment's node on its own unless --root names a root", () => {
    const { run } = cliProject({
      ...files,
      "types.json": {
        version: 1,
        stateGroups: { selection: ["unselected", "selected"] },
        types: {
          menu: { states: ["closed", "open"], shared: true },
          "toolbar-link": { stateGroups: ["selection"] },
        },
      },
      "roots/article-page.json": rootFile({
        id: "article-page",
        title: "Article page",
        children: [{ include: "toolbar", states: { "blog-link": { selection: ["selected"] } } }],
      }),
    });
    expect([
      json(run("show", "blog-link")).stateGroups,
      json(run("show", "blog-link", "--root", "article-page")).stateGroups,
      run("show", "blog-link", "--root", "nope").stderr,
    ]).toEqual([
      { selection: ["unselected", "selected"] },
      { selection: ["selected"] },
      'dxn: "blog-link" is not in root "nope"\n',
    ]);
  });
});

describe("records for a shared node", () => {
  it("name its own state by its id, as contexts and status do", () => {
    const { run } = cliProject({
      ...files,
      "actors.json": { version: 1, actors: { agent: { checks: ["behavior"] } } },
      "types.json": {
        version: 1,
        checks: { behavior: {} },
        types: {
          menu: { states: ["closed", "open"], shared: true, checks: ["behavior"] },
          "toolbar-link": { states: ["normal", "hovered"] },
        },
      },
    });
    const verify = (...context: string[]) =>
      run(
        "verify",
        "menu",
        "--check",
        "behavior",
        "--result",
        "passed",
        "--actor",
        "agent",
        ...context,
      );
    const snapshot: unknown[] = [];
    snapshot.push(verify("breakpoint=base", "state=closed").code);
    snapshot.push(verify("breakpoint=base", "menu=closed").code);
    snapshot.push(json(run("status", "menu")).summary);
    expect(snapshot).toEqual([1, 0, { passed: 1, failed: 0, missing: 3 }]);
  });
});

describe("a shared type that uses a state group", () => {
  it("has that group's values as its states everywhere", () => {
    const { run } = cliProject({
      ...files,
      "types.json": {
        version: 1,
        stateGroups: { openness: ["closed", "open"] },
        types: {
          menu: { stateGroups: ["openness"], shared: true },
          "toolbar-link": { states: ["normal", "hovered"] },
        },
      },
    });
    expect([
      json(run("axes", "toolbar")).shared,
      json(run("contexts", "menu-link", "menu=open", "--count")).count,
      run("view", "toolbar", "breakpoint=sm").stderr,
      json(run("view", "toolbar", "breakpoint=sm", "menu=open")).context,
    ]).toEqual([
      [{ node: "menu", states: ["closed", "open"], existsWhen: { breakpoint: ["base", "sm"] } }],
      4,
      "dxn: give menu=<closed|open> for this view\n",
      { breakpoint: "sm", menu: "open" },
    ]);
  });
});
