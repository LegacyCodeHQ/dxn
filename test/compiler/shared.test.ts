import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, diagnose, type Files } from "../support/project.js";

afterAll(cleanup);

const types = {
  version: 1,
  checks: { visual: {} },
  types: {
    menu: { states: ["closed", "open"], shared: true },
    "menu-link": { states: ["normal", "hovered"], checks: ["visual"] },
    "plain-link": { states: ["normal"], checks: ["visual"] },
  },
};

// The menu holds a button (varies with the menu's state) and a panel that
// exists only when the menu is open.
const toolbar = (panel: Record<string, unknown> = {}, extra: unknown[] = []) => ({
  version: 1,
  fragment: {
    id: "toolbar",
    title: "Toolbar",
    children: [
      {
        id: "menu",
        title: "Menu",
        type: "menu",
        children: [
          { id: "menu-button", title: "Menu button", type: "plain-link" },
          {
            id: "menu-panel",
            title: "Menu panel",
            onlyWhen: { menu: ["open"] },
            children: [{ id: "menu-link", title: "Menu link", type: "menu-link" }],
            ...panel,
          },
        ],
      },
      ...extra,
    ],
  },
});

const project = (overrides: Files = {}): Files => ({
  "types.json": types,
  "fragments/toolbar.json": toolbar(),
  "roots/page.json": {
    version: 1,
    root: { id: "page", title: "Page", children: [{ include: "toolbar" }] },
  },
  "dimensions/breakpoint.json": { version: 1, values: ["sm", "lg"], appliesTo: ["toolbar"] },
  ...overrides,
});

const _t = at("types.json");
const k = at("fragments/toolbar.json");
const panelPath = "$.fragment.children[0].children[1]";

describe("shared types", () => {
  it("let a node's subtree vary with its states", () => {
    expect(diagnose(project())).toEqual([]);
  });

  it("must be a boolean on a type with states", () => {
    const snapshot: unknown[] = [];
    snapshot.push(
      diagnose(
        project({
          "types.json": {
            ...types,
            types: { ...types.types, menu: { states: ["a"], shared: "yes" } },
          },
        }),
      ),
    );
    snapshot.push(diagnose({ "types.json": { version: 1, types: { menu: { shared: true } } } }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "types.json",
        "path": "$.types.menu.shared",
      },
      {
        "code": "ancestor-not-shared",
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].children[1].onlyWhen.menu",
      },
    ],
    [
      {
        "code": "shared-without-states",
        "file": "types.json",
        "path": "$.types.menu.shared",
      },
    ],
  ]
`);
  });
});

describe("onlyWhen", () => {
  const withPanel = (onlyWhen: unknown) =>
    diagnose(project({ "fragments/toolbar.json": toolbar({ onlyWhen }) }));

  it("maps ancestors to non-empty lists of their states", () => {
    const snapshot: unknown[] = [];
    snapshot.push(withPanel([]));
    snapshot.push(withPanel({ menu: "open" }));
    snapshot.push(withPanel({ menu: [] }));
    snapshot.push(withPanel({ menu: ["open", "open"] }));
    snapshot.push(withPanel({ menu: ["ajar"] }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].children[1].onlyWhen",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].children[1].onlyWhen.menu",
      },
    ],
    [
      {
        "code": "empty-only",
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].children[1].onlyWhen.menu",
      },
    ],
    [
      {
        "code": "duplicate-state",
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].children[1].onlyWhen.menu[1]",
      },
    ],
    [
      {
        "code": "unknown-state",
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].children[1].onlyWhen.menu[0]",
      },
    ],
  ]
`);
  });

  it("names an ancestor in the same file", () => {
    const snapshot: unknown[] = [];
    snapshot.push(withPanel({ "menu-button": ["normal"] }));
    snapshot.push(withPanel({ page: ["open"] }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "not-an-ancestor",
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].children[1].onlyWhen.menu-button",
      },
    ],
    [
      {
        "code": "not-an-ancestor",
        "file": "fragments/toolbar.json",
        "path": "$.fragment.children[0].children[1].onlyWhen.page",
      },
    ],
  ]
`);
  });

  it("names an ancestor whose type is shared", () => {
    expect(withPanel({ toolbar: ["open"] })).toEqual([
      k("ancestor-not-shared", `${panelPath}.onlyWhen.toolbar`),
    ]);
  });

  it("is a key the schema and the compiler know on nodes", () => {
    expect(withPanel({ menu: ["open"] })).toEqual([]);
  });
});

describe("dimension names", () => {
  it("cannot be the id of a shared node", () => {
    expect(
      diagnose(
        project({ "dimensions/menu.json": { version: 1, values: ["x"], appliesTo: ["toolbar"] } }),
      ),
    ).toEqual([{ file: "dimensions/menu.json", code: "reserved-name", path: "$" }]);
  });
});

describe("verification under a shared ancestor", () => {
  const record = (node: string, context: Record<string, string>) => ({
    node,
    context,
    check: "visual",
    result: "passed",
    actor: "agent",
    at: "2026-10-30T19:20:00Z",
  });
  const verify = (...records: unknown[]) =>
    diagnose(
      project({
        "actors.json": { version: 1, actors: { agent: {} } },
        "verification/page.json": { version: 1, records },
      }),
    );
  const v = at("verification/page.json");

  it("names the ancestor's state in the context", () => {
    const snapshot: unknown[] = [];
    snapshot.push(
      verify(record("menu-button", { state: "normal", breakpoint: "sm", menu: "closed" })),
    );
    snapshot.push(
      verify(record("menu-link", { state: "hovered", breakpoint: "sm", menu: "open" })),
    );

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [],
  ]
`);
  });

  it("requires it, with one of the ancestor's states", () => {
    const snapshot: unknown[] = [];
    snapshot.push(verify(record("menu-button", { state: "normal", breakpoint: "sm" })));
    snapshot.push(
      verify(record("menu-button", { state: "normal", breakpoint: "sm", menu: "ajar" })),
    );

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "missing-key",
        "file": "verification/page.json",
        "path": "$.records[0].context.menu",
      },
    ],
    [
      {
        "code": "unknown-state",
        "file": "verification/page.json",
        "path": "$.records[0].context.menu",
      },
    ],
  ]
`);
  });

  it("has no record where onlyWhen leaves the node out", () => {
    expect(
      verify(record("menu-link", { state: "normal", breakpoint: "sm", menu: "closed" })),
    ).toEqual([v("absent-in-context", "$.records[0].context")]);
  });
});
