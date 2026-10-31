import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const record = (node: string, context: Record<string, string>, result: string) => ({
  node,
  context,
  check: "visual",
  result,
  actor: "agent",
  at: "2026-10-30T19:20:00Z",
});

// Links live in desktop links (lg only) and the menu (base only). On touch,
// links lose hovered and their normal design is missing, except at lg where
// a combination makes it available again.
const files = {
  "types.json": {
    version: 1,
    attributes: { design: { values: ["available", "missing"] } },
    checks: { visual: {} },
    types: {
      link: {
        states: ["normal", "hovered"],
        checks: ["visual"],
        attributes: { design: { normal: "available", hovered: "available" } },
      },
    },
  },
  "roots/page.json": rootFile({
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
            attributes: { design: { hovered: "missing" } },
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
            attributes: { design: { normal: "missing" } },
          },
        },
      },
    },
  },
  "overrides/breakpoint+pointer.json": {
    version: 1,
    overrides: {
      lg: { touch: { types: { link: { attributes: { design: { normal: "available" } } } } } },
    },
  },
  "actors.json": { version: 1, actors: { agent: { checks: ["visual"] } } },
  "verification/page.json": {
    version: 1,
    records: [
      record("blog-link", { state: "normal", pointer: "mouse" }, "passed"),
      record("blog-link", { state: "normal", breakpoint: "lg", pointer: "touch" }, "failed"),
    ],
  },
};

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

describe("show", () => {
  it("resolves states and values in a context, applying precedence", () => {
    const { run } = cliProject(files);
    expect(json(run("show", "blog-link", "breakpoint=lg", "pointer=touch"))).toEqual({
      id: "blog-link",
      title: "Blog link",
      type: "link",
      context: { breakpoint: "lg", pointer: "touch" },
      present: true,
      states: ["normal"],
      attributes: { design: { normal: "available" } },
    });
  });

  it("fills in defaults and leaves dimensions without one unapplied", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(json(run("show", "blog-link", "pointer=mouse")));
    snapshot.push(json(run("show", "blog-link")));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "attributes": {
            "design": {
              "hovered": "missing",
              "normal": "available",
            },
          },
          "context": {
            "breakpoint": "lg",
            "pointer": "mouse",
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
          "attributes": {
            "design": {
              "hovered": "missing",
              "normal": "available",
            },
          },
          "context": {
            "breakpoint": "lg",
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

  it("says when a node does not exist in the context", () => {
    const { run } = cliProject(files);
    expect(json(run("show", "menu-link", "breakpoint=lg"))).toMatchObject({ present: false });
  });

  it("rejects dimensions the node does not have and unknown values", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("show", "blog-link", "theme=dark"));
    snapshot.push(run("show", "blog-link", "pointer=pen"));
    snapshot.push(run("show", "blog-link", "pointer").code);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "code": 1,
          "stderr": "dimensions: "theme" is not a dimension of blog-link (breakpoint, pointer)
      ",
          "stdout": "",
        },
        {
          "code": 1,
          "stderr": "dimensions: "pen" is not a value of pointer (mouse, touch)
      ",
          "stdout": "",
        },
        2,
      ]
    `);
  });
});

describe("contexts", () => {
  it("lists every context a node exists in, per root", () => {
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
          "root": "page",
        },
        {
          "context": {
            "breakpoint": "lg",
            "pointer": "mouse",
            "state": "hovered",
          },
          "root": "page",
        },
        {
          "context": {
            "breakpoint": "lg",
            "pointer": "touch",
            "state": "normal",
          },
          "root": "page",
        },
      ],
      "node": "blog-link",
    },
    [
      {
        "context": {
          "breakpoint": "base",
          "pointer": "mouse",
          "state": "normal",
        },
        "root": "page",
      },
      {
        "context": {
          "breakpoint": "base",
          "pointer": "mouse",
          "state": "hovered",
        },
        "root": "page",
      },
      {
        "context": {
          "breakpoint": "base",
          "pointer": "touch",
          "state": "normal",
        },
        "root": "page",
      },
    ],
    [
      {
        "context": {
          "breakpoint": "lg",
          "pointer": "mouse",
        },
        "root": "page",
      },
      {
        "context": {
          "breakpoint": "lg",
          "pointer": "touch",
        },
        "root": "page",
      },
    ],
  ]
`);
  });

  it("reports unknown nodes", () => {
    const { run } = cliProject(files);
    expect(run("contexts", "nope")).toMatchObject({
      code: 1,
      stderr: "dimensions: node not found: nope\n",
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
          root: "page",
          node: "blog-link",
          context: { state: "normal", breakpoint: "lg", pointer: "mouse" },
          check: "visual",
          result: "passed",
        },
        {
          root: "page",
          node: "blog-link",
          context: { state: "hovered", breakpoint: "lg", pointer: "mouse" },
          check: "visual",
          result: "missing",
        },
        {
          root: "page",
          node: "blog-link",
          context: { state: "normal", breakpoint: "lg", pointer: "touch" },
          check: "visual",
          result: "failed",
        },
      ],
    });
  });

  it("covers every typed node with checks when no node is given", () => {
    const { run } = cliProject(files);
    expect(json(run("status")).summary).toEqual({ passed: 1, failed: 1, missing: 4 });
  });
});

describe("nodes no root includes", () => {
  it("resolve within their own fragment and have no contexts", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({
      ...files,
      "fragments/footer.json": {
        version: 1,
        fragment: {
          id: "footer",
          title: "Footer",
          children: [{ id: "footer-link", title: "Footer link", type: "link" }],
        },
      },
    });
    snapshot.push(json(run("show", "footer-link")));
    snapshot.push(json(run("contexts", "footer-link")).contexts);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "attributes": {
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
  it("prints the roots and fragments", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({
      ...files,
      "fragments/footer.json": { version: 1, fragment: { id: "footer", title: "Footer" } },
    });
    const result = json(run("tree"));
    snapshot.push(result.roots.map((root: { id: string }) => root.id));
    snapshot.push(result.fragments);

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
    "<tmp>/.dimensions/types.json:2:14: unsupported-version: unsupported version 2
  ",
    1,
    1,
  ]
`);
  });
});
