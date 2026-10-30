import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, diagnose, type Files, rootFile } from "../support/project.js";

afterAll(cleanup);

const transitions = [
  { id: "open", from: "closed", to: "open", on: "click", target: "menu-button" },
  { id: "close", from: "open", to: "closed", on: "click", target: "menu-button" },
  { id: "escape", from: "open", to: "closed", on: "keydown", key: "Escape", focus: "menu-button" },
  { id: "outside", from: "open", to: "closed", on: "pointerdown", outside: "toolbar" },
  {
    id: "follow-link",
    from: "open",
    to: "closed",
    on: "click",
    target: "menu-link",
    focus: "menu-button",
  },
  { id: "go-home", from: "open", to: "closed", on: "click", target: "wordmark" },
  {
    id: "widen",
    from: "open",
    to: "closed",
    on: "resize",
    when: { breakpoint: ["lg", "xl"] },
    focus: "blog-link",
  },
];

// The neo-website toolbar: desktop links at lg and up, a menu below lg whose
// panel exists only when it is open.
const project = (menu: Record<string, unknown> = {}, extra: Files = {}): Files => ({
  "types.json": {
    version: 1,
    checks: { behavior: {} },
    types: { menu: { states: ["closed", "open"], shared: true, checks: ["behavior"] } },
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
          children: [{ id: "blog-link", title: "Blog link" }],
        },
        {
          id: "menu",
          title: "Menu",
          type: "menu",
          transitions,
          children: [
            { id: "menu-button", title: "Menu button" },
            {
              id: "menu-panel",
              title: "Menu panel",
              onlyWhen: { menu: ["open"] },
              children: [{ id: "menu-link", title: "Menu link" }],
            },
          ],
          ...menu,
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
    appliesTo: ["toolbar"],
  },
  "overrides/breakpoint.json": {
    version: 1,
    only: { "toolbar-links": ["lg", "xl"], menu: ["base", "sm"] },
    overrides: {},
  },
  ...extra,
});

const k = at("fragments/toolbar.json");
const path = "$.fragment.children[2].transitions";
const withTransition = (transition: Record<string, unknown>) =>
  diagnose(project({ transitions: [transition] }));
const base = { id: "t", from: "open", to: "closed" };

describe("transitions", () => {
  it("describe how a shared state changes", () => {
    expect(diagnose(project())).toEqual([]);
  });

  it("only go on nodes with a shared type", () => {
    expect(
      diagnose(project({ type: undefined, transitions })).filter(
        (diagnostic) => diagnostic.code === "transitions-without-shared-state",
      ),
    ).toEqual([k("transitions-without-shared-state", path)]);
  });

  it("have the expected shape", () => {
    const snapshot: unknown[] = [];
    snapshot.push(diagnose(project({ transitions: {} })));
    snapshot.push(withTransition({ id: "t" }));
    snapshot.push(withTransition({ ...base, on: "click", target: "menu-button", extra: 1 }));
    snapshot.push(
      diagnose(
        project({
          transitions: [
            { ...base, on: "click", target: "menu-button" },
            { ...base, on: "click", target: "wordmark" },
          ],
        }),
      ),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "wrong-type",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions",
          },
        ],
        [
          {
            "code": "missing-key",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].from",
          },
          {
            "code": "missing-key",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].to",
          },
          {
            "code": "missing-key",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].on",
          },
        ],
        [
          {
            "code": "unknown-key",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].extra",
          },
        ],
        [
          {
            "code": "duplicate-id",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[1].id",
          },
        ],
      ]
    `);
  });

  it("use the node's states, known DOM events and what each event needs", () => {
    const snapshot: unknown[] = [];
    snapshot.push(withTransition({ ...base, from: "ajar", on: "click", target: "menu-button" }));
    snapshot.push(withTransition({ ...base, on: "hover", target: "menu-button" }));
    snapshot.push(withTransition({ ...base, on: "keydown" }));
    snapshot.push(withTransition({ ...base, on: "click" }));
    snapshot.push(withTransition({ ...base, on: "pointerdown" }));
    snapshot.push(withTransition({ ...base, on: "resize" }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "unknown-state",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].from",
          },
        ],
        [
          {
            "code": "unknown-event",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].on",
          },
        ],
        [
          {
            "code": "missing-key",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].key",
          },
        ],
        [
          {
            "code": "missing-key",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].target",
          },
        ],
        [
          {
            "code": "missing-key",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].target",
          },
        ],
        [
          {
            "code": "missing-key",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].when",
          },
        ],
      ]
    `);
  });

  it("name nodes that exist where the transition needs them", () => {
    const snapshot: unknown[] = [];
    snapshot.push(withTransition({ ...base, on: "click", target: "nope" }));
    snapshot.push(withTransition({ ...base, on: "pointerdown", outside: "nope" }));
    snapshot.push(
      withTransition({ ...base, from: "closed", to: "open", on: "click", target: "menu-link" }),
    );
    snapshot.push(withTransition({ ...base, on: "keydown", key: "Escape", focus: "menu-link" }));
    snapshot.push(
      withTransition({ ...base, on: "resize", when: { breakpoint: ["base"] }, focus: "blog-link" }),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "unknown-node",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].target",
          },
        ],
        [
          {
            "code": "unknown-node",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].outside",
          },
        ],
        [
          {
            "code": "target-absent",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].target",
          },
        ],
        [
          {
            "code": "focus-absent",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].focus",
          },
        ],
        [
          {
            "code": "focus-absent",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].focus",
          },
        ],
      ]
    `);
  });

  it("change to declared dimension values", () => {
    const snapshot: unknown[] = [];
    snapshot.push(withTransition({ ...base, on: "resize", when: { theme: ["dark"] } }));
    snapshot.push(withTransition({ ...base, on: "resize", when: { breakpoint: ["md"] } }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "undeclared-dimension",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].when.theme",
          },
        ],
        [
          {
            "code": "unknown-dimension-value",
            "file": "fragments/toolbar.json",
            "path": "$.fragment.children[2].transitions[0].when.breakpoint[0]",
          },
        ],
      ]
    `);
  });

  it("are not repeated", () => {
    expect(
      diagnose(
        project({
          transitions: [
            { id: "a", from: "open", to: "closed", on: "keydown", key: "Escape" },
            { id: "b", from: "open", to: "closed", on: "keydown", key: "Escape" },
          ],
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "code": "duplicate-transition",
          "file": "fragments/toolbar.json",
          "path": "$.fragment.children[2].transitions[1]",
        },
      ]
    `);
  });
});

describe("verifying transitions", () => {
  const record = (fields: Record<string, unknown>) => ({
    node: "menu",
    check: "behavior",
    result: "passed",
    by: "agent",
    at: "2026-10-30T19:20:00Z",
    ...fields,
  });
  const verify = (...records: unknown[]) =>
    diagnose(project({}, { "verification/article-page.json": { version: 1, records } }));

  it("name a transition instead of a context", () => {
    const snapshot: unknown[] = [];
    snapshot.push(verify(record({ transition: "escape" })));
    snapshot.push(verify(record({ transition: "nope" })));
    snapshot.push(
      verify(record({ transition: "escape", context: { breakpoint: "sm", menu: "open" } })),
    );
    snapshot.push(verify(record({ transition: "escape" }), record({ transition: "escape" })));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [
          {
            "code": "unknown-transition",
            "file": "verification/article-page.json",
            "path": "$.records[0].transition",
          },
        ],
        [
          {
            "code": "context-and-transition",
            "file": "verification/article-page.json",
            "path": "$.records[0]",
          },
        ],
        [
          {
            "code": "duplicate-record",
            "file": "verification/article-page.json",
            "path": "$.records[1]",
          },
        ],
      ]
    `);
  });
});

describe("transition fields", () => {
  const t = (field: string) => k("unknown-key", `${path}[0].${field}`);

  it("are only the ones their event uses", () => {
    expect([
      withTransition({ ...base, on: "click", target: "menu-button", key: "Enter" }),
      withTransition({ ...base, on: "click", target: "menu-button", when: { breakpoint: ["lg"] } }),
      withTransition({ ...base, on: "click", target: "menu-button", outside: "toolbar" }),
      withTransition({ ...base, on: "keydown", key: "Escape", target: "menu-button" }),
      withTransition({
        ...base,
        on: "resize",
        when: { breakpoint: ["lg"] },
        target: "menu-button",
      }),
      withTransition({ ...base, on: "resize", when: { breakpoint: ["lg"] }, key: "Escape" }),
      withTransition({
        ...base,
        on: "pointerdown",
        outside: "toolbar",
        when: { breakpoint: ["lg"] },
      }),
    ]).toEqual([
      [t("key")],
      [t("when")],
      [t("outside")],
      [t("target")],
      [t("target")],
      [t("key")],
      [t("when")],
    ]);
  });

  it("give a pointerdown a target or an outside, not both", () => {
    expect(
      withTransition({ ...base, on: "pointerdown", target: "menu-button", outside: "toolbar" }),
    ).toEqual([k("target-and-outside", `${path}[0]`)]);
  });

  it("let focus go with any event", () => {
    expect(
      withTransition({ ...base, on: "pointerdown", outside: "toolbar", focus: "menu-button" }),
    ).toEqual([]);
  });
});

describe("same-state transitions", () => {
  it("are an error: a transition must change the state", () => {
    expect(
      withTransition({ id: "t", from: "open", to: "open", on: "click", target: "menu-link" }),
    ).toEqual([k("same-state-transition", `${path}[0].to`)]);
  });
});
