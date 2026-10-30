import { afterAll, describe, expect, it } from "vitest";
import { cleanup, diagnose, type Files, rootFile } from "../support/project.js";

afterAll(cleanup);

const types = {
  version: 1,
  stateGroups: {
    hover: ["rest", "hovered"],
    selection: ["unselected", "selected"],
  },
  customChecks: { visual: {} },
  types: {
    link: { stateGroups: ["hover", "selection"], checks: ["visual"] },
    logo: { stateGroups: ["hover"] },
  },
};

const toolbar = {
  version: 1,
  fragment: {
    id: "toolbar",
    title: "Toolbar",
    children: [
      { id: "logo", title: "Logo", type: "logo" },
      { id: "blog-link", title: "Blog link", type: "link" },
    ],
  },
};

const project = (include: Record<string, unknown>, extra: Files = {}): Files => ({
  "types.json": types,
  "fragments/toolbar.json": toolbar,
  "roots/article-page.json": rootFile({
    id: "article-page",
    title: "Article page",
    children: [
      { include: "toolbar", ...include },
      { id: "body", title: "Body" },
    ],
  }),
  ...extra,
});

describe("states on an include", () => {
  it("fix a node's group values on the including page", () => {
    expect(diagnose(project({ states: { "blog-link": { selection: ["selected"] } } }))).toEqual([]);
  });

  it("have the shape node -> group -> non-empty list of values", () => {
    const snapshot: unknown[] = [];
    snapshot.push(diagnose(project({ states: [] })));
    snapshot.push(diagnose(project({ states: { "blog-link": [] } })));
    snapshot.push(diagnose(project({ states: { "blog-link": { selection: [] } } })));
    snapshot.push(
      diagnose(project({ states: { "blog-link": { selection: ["selected", "selected"] } } })),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "wrong-type",
            "file": "roots/article-page.json",
            "path": "$.root.children[0].states",
          },
        ],
        [
          {
            "code": "wrong-type",
            "file": "roots/article-page.json",
            "path": "$.root.children[0].states.blog-link",
          },
        ],
        [
          {
            "code": "empty-values",
            "file": "roots/article-page.json",
            "path": "$.root.children[0].states.blog-link.selection",
          },
        ],
        [
          {
            "code": "duplicate-value",
            "file": "roots/article-page.json",
            "path": "$.root.children[0].states.blog-link.selection[1]",
          },
        ],
      ]
    `);
  });

  it("name a node in the fragment, a group its type uses, and values of the group", () => {
    const snapshot: unknown[] = [];
    snapshot.push(diagnose(project({ states: { body: { selection: ["selected"] } } })));
    snapshot.push(diagnose(project({ states: { logo: { selection: ["selected"] } } })));
    snapshot.push(diagnose(project({ states: { "blog-link": { selection: ["current"] } } })));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "node-outside-include",
            "file": "roots/article-page.json",
            "path": "$.root.children[0].states.body",
          },
        ],
        [
          {
            "code": "unknown-state-group",
            "file": "roots/article-page.json",
            "path": "$.root.children[0].states.logo.selection",
          },
        ],
        [
          {
            "code": "unknown-state",
            "file": "roots/article-page.json",
            "path": "$.root.children[0].states.blog-link.selection[0]",
          },
        ],
      ]
    `);
  });

  it("exclude other values from verification on that page", () => {
    const record = (selection: string) => ({
      node: "blog-link",
      context: { hover: "rest", selection },
      check: "visual",
      result: "passed",
      by: "agent",
      at: "2026-10-30T19:20:00Z",
    });
    const verify = (selection: string) =>
      diagnose(
        project(
          { states: { "blog-link": { selection: ["selected"] } } },
          { "verification/article-page.json": { version: 1, records: [record(selection)] } },
        ),
      );
    const snapshot: unknown[] = [];
    snapshot.push(verify("selected"));
    snapshot.push(verify("unselected"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [
          {
            "code": "excluded-state",
            "file": "verification/article-page.json",
            "path": "$.records[0].context.selection",
          },
        ],
      ]
    `);
  });
});
