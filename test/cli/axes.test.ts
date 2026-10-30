import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// The neo-website toolbar: desktop links at lg and up, a menu below lg whose
// panel exists only when it is open; plus a pointer dimension on the page.
const files = {
  "types.json": {
    version: 1,
    types: {
      menu: { states: ["closed", "open"], shared: true },
      "toolbar-link": { states: ["normal", "hovered"] },
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
  "roots/article-page.json": rootFile({
    id: "article-page",
    title: "Article page",
    children: [{ include: "toolbar" }, { id: "body", title: "Body" }],
  }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["base", "sm", "lg", "xl"],
    default: "xl",
    appliesTo: ["toolbar"],
  },
  "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["body"] },
  "overrides/breakpoint.json": {
    version: 1,
    only: { "toolbar-links": ["lg", "xl"], menu: ["base", "sm"] },
    overrides: {},
  },
};

describe("dimensions", () => {
  it("lists every dimension with its values, default and scope", () => {
    const { run } = cliProject(files);
    expect(run("dimension", "list")).toMatchInlineSnapshot(`
      {
        "code": 0,
        "stderr": "",
        "stdout": "{
        "dimensions": [
          {
            "name": "breakpoint",
            "values": [
              "base",
              "sm",
              "lg",
              "xl"
            ],
            "default": "xl",
            "appliesTo": [
              "toolbar"
            ]
          },
          {
            "name": "pointer",
            "values": [
              "mouse",
              "touch"
            ],
            "appliesTo": [
              "body"
            ]
          }
        ]
      }
      ",
      }
    `);
  });
});

describe("axes", () => {
  it("lists what a view or query of a node accepts", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(JSON.parse(run("axes", "toolbar").stdout));
    snapshot.push(JSON.parse(run("axes", "article-page").stdout));
    snapshot.push(JSON.parse(run("axes", "menu-link").stdout));
    snapshot.push(JSON.parse(run("axes", "wordmark").stdout));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "dimensions": [
            {
              "default": "xl",
              "name": "breakpoint",
              "values": [
                "base",
                "sm",
                "lg",
                "xl",
              ],
            },
          ],
          "node": "toolbar",
          "shared": [
            {
              "existsWhen": {
                "breakpoint": [
                  "base",
                  "sm",
                ],
              },
              "node": "menu",
              "states": [
                "closed",
                "open",
              ],
            },
          ],
        },
        {
          "dimensions": [
            {
              "default": "xl",
              "name": "breakpoint",
              "values": [
                "base",
                "sm",
                "lg",
                "xl",
              ],
            },
            {
              "name": "pointer",
              "values": [
                "mouse",
                "touch",
              ],
            },
          ],
          "node": "article-page",
          "shared": [
            {
              "existsWhen": {
                "breakpoint": [
                  "base",
                  "sm",
                ],
              },
              "node": "menu",
              "states": [
                "closed",
                "open",
              ],
            },
          ],
        },
        {
          "dimensions": [
            {
              "default": "xl",
              "name": "breakpoint",
              "values": [
                "base",
                "sm",
                "lg",
                "xl",
              ],
            },
          ],
          "node": "menu-link",
          "shared": [
            {
              "existsWhen": {
                "breakpoint": [
                  "base",
                  "sm",
                ],
              },
              "node": "menu",
              "states": [
                "closed",
                "open",
              ],
            },
          ],
        },
        {
          "dimensions": [
            {
              "default": "xl",
              "name": "breakpoint",
              "values": [
                "base",
                "sm",
                "lg",
                "xl",
              ],
            },
          ],
          "node": "wordmark",
          "shared": [],
        },
      ]
    `);
  });

  it("reports unknown nodes and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("axes", "nope"));
    snapshot.push(run("axes").code);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "code": 1,
          "stderr": "dimensions: node not found: nope
      ",
          "stdout": "",
        },
        2,
      ]
    `);
  });
});

describe("errors for wrong names and values", () => {
  it("list the valid choices", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("view", "toolbar", "breakpoint=md").stderr);
    snapshot.push(run("view", "toolbar", "breakpoint=sm", "menu=ajar").stderr);
    snapshot.push(run("view", "toolbar", "theme=dark").stderr);
    snapshot.push(run("show", "blog-link", "theme=dark").stderr);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "dimensions: "md" is not a value of breakpoint (base, sm, lg, xl)
      ",
        "dimensions: "ajar" is not a state of menu (closed, open)
      ",
        "dimensions: "theme" is not a dimension or shared node in this view (breakpoint, menu)
      ",
        "dimensions: "theme" is not a dimension of blog-link (breakpoint)
      ",
      ]
    `);
  });
});
