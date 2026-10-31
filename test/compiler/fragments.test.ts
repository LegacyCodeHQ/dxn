import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, compileFiles, diagnose, type Files, rootFile } from "../support/project.js";

afterAll(cleanup);

const fragmentFile = (fragment: unknown) => ({ version: 1, fragment });
const include = (id: string) => ({ include: id });

// The article page includes the toolbar fragment, which holds a link.
const project: Files = {
  "types.json": {
    version: 1,
    checks: { visual: {} },
    types: { "toolbar-link": { states: ["normal", "hovered"], checks: ["visual"] } },
  },
  "fragments/toolbar.json": fragmentFile({
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

const k = at("fragments/toolbar.json");
const p = at("roots/article-page.json");
const page = (children: unknown[], extra: Files = {}) =>
  diagnose({
    ...project,
    ...extra,
    "roots/article-page.json": rootFile({ id: "article-page", title: "Article page", children }),
  });
const fragment = (doc: unknown) => diagnose({ ...project, "fragments/toolbar.json": doc });

describe("fragments", () => {
  it("compile and are returned beside the nodes that include them", () => {
    const snapshot: unknown[] = [];
    const result = compileFiles(project);
    snapshot.push(result.diagnostics);
    snapshot.push(result.project?.fragments.map(({ id }) => id));
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

  it("must be an object with version and fragment", () => {
    const snapshot: unknown[] = [];
    snapshot.push(fragment([]));
    snapshot.push(fragment({}));
    snapshot.push(fragment({ ...fragmentFile({ id: "toolbar", title: "T" }), extra: 1 }));
    snapshot.push(fragment({ version: 2, fragment: { id: "toolbar", title: "T" } }));
    snapshot.push(fragment({ $schema: 1, ...fragmentFile({ id: "toolbar", title: "T" }) }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "fragments/toolbar.json",
        "path": "$",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "fragments/toolbar.json",
        "path": "$.version",
      },
      {
        "code": "missing-key",
        "file": "fragments/toolbar.json",
        "path": "$.fragment",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "fragments/toolbar.json",
        "path": "$.extra",
      },
    ],
    [
      {
        "code": "unsupported-version",
        "file": "fragments/toolbar.json",
        "path": "$.version",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "fragments/toolbar.json",
        "path": "$.$schema",
      },
    ],
  ]
`);
  });

  it("are checked like nodes", () => {
    const snapshot: unknown[] = [];
    snapshot.push(fragment(fragmentFile([])));
    snapshot.push(fragment(fragmentFile({ id: "toolbar", title: "T", children: [{ id: "x" }] })));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "fragments/toolbar.json",
        "path": "$.fragment",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].title",
      },
    ],
  ]
`);
  });

  it("must be named after their id", () => {
    expect(fragment(fragmentFile({ id: "header", title: "Header" }))).toEqual([
      k("file-name-mismatch", "$.fragment.id"),
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

  it("may include other fragments", () => {
    expect(
      diagnose({
        ...project,
        "fragments/wordmark.json": fragmentFile({ id: "wordmark", title: "Wordmark" }),
        "fragments/toolbar.json": fragmentFile({
          id: "toolbar",
          title: "Toolbar",
          children: [include("wordmark")],
        }),
      }),
    ).toEqual([]);
  });

  it("report a folder that is a file and an unreadable file", () => {
    const snapshot: unknown[] = [];
    snapshot.push(diagnose({ "types.json": project["types.json"], fragments: "" }));
    snapshot.push(fragment(Buffer.from([0x5b, 0xff, 0x5d])));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "not-a-directory",
        "file": "fragments",
        "path": "$",
      },
    ],
    [
      {
        "code": "invalid-encoding",
        "file": "fragments/toolbar.json",
        "path": "$",
      },
    ],
  ]
`);
  });

  it("stop before dimensions when a fragment file does not parse", () => {
    expect(
      diagnose({
        ...project,
        "fragments/toolbar.json": "{",
        "dimensions/breakpoint.json": { version: 1, values: ["sm"], appliesTo: ["blog-link"] },
      }),
    ).toEqual([{ file: "fragments/toolbar.json", code: "unexpected-end", path: "$" }]);
  });
});

describe("include", () => {
  it("names a fragment", () => {
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
        "code": "unknown-fragment",
        "file": "roots/article-page.json",
        "path": "$.root.children[0].include",
      },
    ],
  ]
`);
  });

  it("does not name a node that is not a fragment", () => {
    expect(
      page([include("other")], { "roots/other.json": rootFile({ id: "other", title: "Other" }) }),
    ).toEqual([p("unknown-fragment", "$.root.children[0].include")]);
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

  it("does not bring the same fragment into a page twice", () => {
    const snapshot: unknown[] = [];
    snapshot.push(page([include("toolbar"), include("toolbar")]));
    snapshot.push(
      page([include("header"), include("footer")], {
        "fragments/header.json": fragmentFile({
          id: "header",
          title: "Header",
          children: [include("toolbar")],
        }),
        "fragments/footer.json": fragmentFile({
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
      fragment(fragmentFile({ id: "toolbar", title: "Toolbar", children: [include("toolbar")] })),
    );
    snapshot.push(
      diagnose({
        ...project,
        "fragments/menu.json": fragmentFile({
          id: "menu",
          title: "Menu",
          children: [include("toolbar")],
        }),
        "fragments/toolbar.json": fragmentFile({
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
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].include",
      },
    ],
    [
      {
        "code": "include-cycle",
        "file": "fragments/menu.json",
        "path": "$.fragment.children[0].include",
      },
      {
        "code": "include-cycle",
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].include",
      },
    ],
  ]
`);
  });
});

describe("included fragments", () => {
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
          actor: "agent",
          at: "2026-10-30T19:20:00Z",
        },
      ],
    });
    snapshot.push(
      diagnose({
        ...project,
        "dimensions/breakpoint.json": breakpoint,
        "actors.json": { version: 1, actors: { agent: {} } },
        "verification/article-page.json": record("blog-link"),
      }),
    );
    snapshot.push(
      diagnose({
        ...project,
        "actors.json": { version: 1, actors: { agent: {} } },
        "verification/toolbar.json": record("blog-link"),
      }),
    );

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
