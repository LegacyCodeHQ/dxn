import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, compileFiles, diagnose, type Files, rootFile } from "../support/project.js";

afterAll(cleanup);

const componentFile = (component: unknown) => ({ version: 1, component });
const include = (id: string) => ({ include: id });

// The article page includes the toolbar component, which holds a link.
const project: Files = {
  "types.json": {
    version: 1,
    customChecks: { visual: {} },
    types: { "toolbar-link": { states: ["normal", "hovered"], checks: ["visual"] } },
  },
  "components/toolbar.json": componentFile({
    id: "toolbar",
    title: "Toolbar",
    children: [{ id: "blog-link", title: "Blog link", type: "toolbar-link" }],
  }),
  "roots/article-page.json": rootFile({
    id: "article-page",
    title: "Article page",
    children: [include("toolbar")],
  }),
};

const k = at("components/toolbar.json");
const p = at("roots/article-page.json");
const page = (children: unknown[], extra: Files = {}) =>
  diagnose({
    ...project,
    ...extra,
    "roots/article-page.json": rootFile({ id: "article-page", title: "Article page", children }),
  });
const component = (doc: unknown) => diagnose({ ...project, "components/toolbar.json": doc });

describe("components", () => {
  it("compile and are returned beside the nodes that include them", () => {
    const snapshot: unknown[] = [];
    const result = compileFiles(project);
    snapshot.push(result.diagnostics);
    snapshot.push(result.project?.components.map(({ id }) => id));
    snapshot.push(result.project?.roots[0]?.children);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      "toolbar",
    ],
    [
      {
        "include": "toolbar",
      },
    ],
  ]
`);
  });

  it("must be an object with version and component", () => {
    const snapshot: unknown[] = [];
    snapshot.push(component([]));
    snapshot.push(component({}));
    snapshot.push(component({ ...componentFile({ id: "toolbar", title: "T" }), extra: 1 }));
    snapshot.push(component({ version: 2, component: { id: "toolbar", title: "T" } }));
    snapshot.push(component({ $schema: 1, ...componentFile({ id: "toolbar", title: "T" }) }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "components/toolbar.json",
        "path": "$",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "components/toolbar.json",
        "path": "$.version",
      },
      {
        "code": "missing-key",
        "file": "components/toolbar.json",
        "path": "$.component",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "components/toolbar.json",
        "path": "$.extra",
      },
    ],
    [
      {
        "code": "unsupported-version",
        "file": "components/toolbar.json",
        "path": "$.version",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "components/toolbar.json",
        "path": "$.$schema",
      },
    ],
  ]
`);
  });

  it("are checked like nodes", () => {
    const snapshot: unknown[] = [];
    snapshot.push(component(componentFile([])));
    snapshot.push(component(componentFile({ id: "toolbar", title: "T", children: [{ id: "x" }] })));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "components/toolbar.json",
        "path": "$.component",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "components/toolbar.json",
        "path": "$.component.children[0].title",
      },
    ],
  ]
`);
  });

  it("must be named after their id", () => {
    expect(component(componentFile({ id: "header", title: "Header" }))).toEqual([
      k("file-name-mismatch", "$.component.id"),
    ]);
  });

  it("share ids with nodes", () => {
    expect(
      diagnose({
        ...project,
        "roots/toolbar.json": rootFile({ id: "toolbar", title: "Toolbar" }),
      }),
    ).toEqual([{ file: "roots/toolbar.json", code: "duplicate-id", path: "$.root.id" }]);
  });

  it("may include other components", () => {
    expect(
      diagnose({
        ...project,
        "components/wordmark.json": componentFile({ id: "wordmark", title: "Wordmark" }),
        "components/toolbar.json": componentFile({
          id: "toolbar",
          title: "Toolbar",
          children: [include("wordmark")],
        }),
      }),
    ).toEqual([]);
  });

  it("report a folder that is a file and an unreadable file", () => {
    const snapshot: unknown[] = [];
    snapshot.push(diagnose({ "types.json": project["types.json"], components: "" }));
    snapshot.push(component(Buffer.from([0x5b, 0xff, 0x5d])));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "not-a-directory",
        "file": "components",
        "path": "$",
      },
    ],
    [
      {
        "code": "invalid-encoding",
        "file": "components/toolbar.json",
        "path": "$",
      },
    ],
  ]
`);
  });

  it("stop before dimensions when a component file does not parse", () => {
    expect(
      diagnose({
        ...project,
        "components/toolbar.json": "{",
        "dimensions/breakpoint.json": { version: 1, values: ["sm"], appliesTo: ["blog-link"] },
      }),
    ).toEqual([{ file: "components/toolbar.json", code: "unexpected-end", path: "$" }]);
  });
});

describe("include", () => {
  it("names a component", () => {
    const snapshot: unknown[] = [];
    snapshot.push(page([1]));
    snapshot.push(page([include("")]));
    snapshot.push(page([{ include: 1 }]));
    snapshot.push(page([include("footer")]));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "roots/article-page.json",
        "path": "$.root.children[0]",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "roots/article-page.json",
        "path": "$.root.children[0].include",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "roots/article-page.json",
        "path": "$.root.children[0].include",
      },
    ],
    [
      {
        "code": "unknown-component",
        "file": "roots/article-page.json",
        "path": "$.root.children[0].include",
      },
    ],
  ]
`);
  });

  it("does not name a node that is not a component", () => {
    expect(
      page([include("other")], { "roots/other.json": rootFile({ id: "other", title: "Other" }) }),
    ).toEqual([p("unknown-component", "$.root.children[0].include")]);
  });

  it("has no other keys", () => {
    expect(page([{ include: "toolbar", title: "Toolbar" }])).toEqual([
      p("unknown-key", "$.root.children[0].title"),
    ]);
  });

  it("is not a file's root", () => {
    expect(
      diagnose({ ...project, "roots/article-page.json": rootFile(include("toolbar")) }),
    ).toEqual([p("include-at-root", "$.root")]);
  });

  it("does not bring the same component into a page twice", () => {
    const snapshot: unknown[] = [];
    snapshot.push(page([include("toolbar"), include("toolbar")]));
    snapshot.push(
      page([include("header"), include("footer")], {
        "components/header.json": componentFile({
          id: "header",
          title: "Header",
          children: [include("toolbar")],
        }),
        "components/footer.json": componentFile({
          id: "footer",
          title: "Footer",
          children: [include("toolbar")],
        }),
      }),
    );

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "duplicate-include",
        "file": "roots/article-page.json",
        "path": "$.root.children[1].include",
      },
    ],
    [
      {
        "code": "duplicate-include",
        "file": "roots/article-page.json",
        "path": "$.root.children[1].include",
      },
    ],
  ]
`);
  });

  it("does not form a cycle", () => {
    const snapshot: unknown[] = [];
    snapshot.push(
      component(componentFile({ id: "toolbar", title: "Toolbar", children: [include("toolbar")] })),
    );
    snapshot.push(
      diagnose({
        ...project,
        "components/menu.json": componentFile({
          id: "menu",
          title: "Menu",
          children: [include("toolbar")],
        }),
        "components/toolbar.json": componentFile({
          id: "toolbar",
          title: "Toolbar",
          children: [include("menu")],
        }),
      }),
    );

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "include-cycle",
        "file": "components/toolbar.json",
        "path": "$.component.children[0].include",
      },
    ],
    [
      {
        "code": "include-cycle",
        "file": "components/menu.json",
        "path": "$.component.children[0].include",
      },
      {
        "code": "include-cycle",
        "file": "components/toolbar.json",
        "path": "$.component.children[0].include",
      },
    ],
  ]
`);
  });
});

describe("included components", () => {
  const breakpoint = { version: 1, values: ["sm", "lg"], appliesTo: ["article-page"] };

  it("are in the scope of dimensions that apply to the page", () => {
    expect(
      diagnose({
        ...project,
        "dimensions/breakpoint.json": breakpoint,
        "overrides/breakpoint.json": {
          version: 1,
          overrides: { sm: { nodes: { "blog-link": { states: { remove: ["hovered"] } } } } },
        },
      }),
    ).toEqual([]);
  });

  it("are verified as part of the page", () => {
    const snapshot: unknown[] = [];
    const record = (node: string) => ({
      version: 1,
      records: [
        {
          node,
          context: { state: "hovered", breakpoint: "lg" },
          check: "visual",
          result: "passed",
          by: "agent",
          at: "2026-10-30T19:20:00Z",
        },
      ],
    });
    snapshot.push(
      diagnose({
        ...project,
        "dimensions/breakpoint.json": breakpoint,
        "verification/article-page.json": record("blog-link"),
      }),
    );
    snapshot.push(diagnose({ ...project, "verification/toolbar.json": record("blog-link") }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      {
        "code": "unknown-root",
        "file": "verification/toolbar.json",
        "path": "$",
      },
    ],
  ]
`);
  });

  it("can be the target of a dimension directly", () => {
    expect(
      diagnose({
        ...project,
        "dimensions/breakpoint.json": { ...breakpoint, appliesTo: ["toolbar"] },
      }),
    ).toEqual([]);
  });
});
