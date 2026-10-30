import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// The neo-website toolbar with breakpoint, pointer and keyboard dimensions.
const files = {
  "types.json": {
    version: 1,
    stateGroups: {
      hover: ["rest", "hovered"],
      focus: ["blurred", "focused"],
    },
    types: {
      wordmark: { stateGroups: ["hover", "focus"] },
      "toolbar-link": { stateGroups: ["hover", "focus"] },
      menu: { states: ["closed", "open"], shared: true },
    },
  },
  "components/toolbar.json": {
    version: 1,
    component: {
      id: "toolbar",
      title: "Toolbar",
      children: [
        { id: "wordmark", title: "Wordmark", type: "wordmark" },
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
  "dimensions/pointer.json": {
    version: 1,
    values: ["mouse", "touch"],
    default: "mouse",
    appliesTo: ["toolbar"],
  },
  "dimensions/keyboard.json": {
    version: 1,
    values: ["keyboard", "no-keyboard"],
    default: "keyboard",
    appliesTo: ["toolbar"],
  },
  "overrides/breakpoint.json": {
    version: 1,
    only: { "toolbar-links": ["lg", "xl"], menu: ["base", "sm"] },
    overrides: {},
  },
  "overrides/pointer.json": {
    version: 1,
    overrides: {
      touch: {
        types: {
          wordmark: { states: { remove: ["hovered"] } },
          "toolbar-link": { states: { remove: ["hovered"] } },
        },
      },
    },
  },
  "overrides/keyboard.json": {
    version: 1,
    overrides: {
      "no-keyboard": {
        types: {
          wordmark: { states: { remove: ["focused"] } },
          "toolbar-link": { states: { remove: ["focused"] } },
        },
      },
    },
  },
};

const tree = (...args: string[]) => cliProject(files).run("contexts", ...args).stdout;

describe("collapsing dimensions that change nothing", () => {
  it("drops a dimension level when every value leads to the same subtree", () => {
    expect(tree("toolbar", "--subtree", "--tree")).toMatchInlineSnapshot(`
      "toolbar (16 combinations)
      wordmark (36 combinations)
      ├── keyboard=keyboard
      │   ├── pointer=mouse
      │   │   └── hover=rest, hovered
      │   │       └── focus=blurred, focused
      │   └── pointer=touch
      │       └── hover=rest
      │           └── focus=blurred, focused
      └── keyboard=no-keyboard
          ├── pointer=mouse
          │   └── hover=rest, hovered
          │       └── focus=blurred
          └── pointer=touch
              └── hover=rest
                  └── focus=blurred
      toolbar-links (8 combinations)
      └── breakpoint=lg, xl
      blog-link (18 combinations)
      └── breakpoint=lg, xl
          ├── keyboard=keyboard
          │   ├── pointer=mouse
          │   │   └── hover=rest, hovered
          │   │       └── focus=blurred, focused
          │   └── pointer=touch
          │       └── hover=rest
          │           └── focus=blurred, focused
          └── keyboard=no-keyboard
              ├── pointer=mouse
              │   └── hover=rest, hovered
              │       └── focus=blurred
              └── pointer=touch
                  └── hover=rest
                      └── focus=blurred
      menu (16 combinations)
      └── breakpoint=base, sm
          └── menu=closed, open
      menu-panel (8 combinations)
      └── breakpoint=base, sm
          └── menu=open
      menu-link (18 combinations)
      └── breakpoint=base, sm
          ├── keyboard=keyboard
          │   ├── pointer=mouse
          │   │   └── menu=open
          │   │       └── hover=rest, hovered
          │   │           └── focus=blurred, focused
          │   └── pointer=touch
          │       └── menu=open
          │           └── hover=rest
          │               └── focus=blurred, focused
          └── keyboard=no-keyboard
              ├── pointer=mouse
              │   └── menu=open
              │       └── hover=rest, hovered
              │           └── focus=blurred
              └── pointer=touch
                  └── menu=open
                      └── hover=rest
                          └── focus=blurred
      "
    `);
  });
});

describe("--by", () => {
  it("puts the named levels first, above the parts", () => {
    expect(tree("toolbar", "--subtree", "--tree", "--by", "breakpoint")).toMatchInlineSnapshot(`
      "breakpoint=base, sm
      ├── toolbar (8 combinations)
      ├── wordmark (18 combinations)
      │   ├── keyboard=keyboard
      │   │   ├── pointer=mouse
      │   │   │   └── hover=rest, hovered
      │   │   │       └── focus=blurred, focused
      │   │   └── pointer=touch
      │   │       └── hover=rest
      │   │           └── focus=blurred, focused
      │   └── keyboard=no-keyboard
      │       ├── pointer=mouse
      │       │   └── hover=rest, hovered
      │       │       └── focus=blurred
      │       └── pointer=touch
      │           └── hover=rest
      │               └── focus=blurred
      ├── menu (16 combinations)
      │   └── menu=closed, open
      ├── menu-panel (8 combinations)
      │   └── menu=open
      └── menu-link (18 combinations)
          ├── keyboard=keyboard
          │   ├── pointer=mouse
          │   │   └── menu=open
          │   │       └── hover=rest, hovered
          │   │           └── focus=blurred, focused
          │   └── pointer=touch
          │       └── menu=open
          │           └── hover=rest
          │               └── focus=blurred, focused
          └── keyboard=no-keyboard
              ├── pointer=mouse
              │   └── menu=open
              │       └── hover=rest, hovered
              │           └── focus=blurred
              └── pointer=touch
                  └── menu=open
                      └── hover=rest
                          └── focus=blurred
      breakpoint=lg, xl
      ├── toolbar (8 combinations)
      ├── wordmark (18 combinations)
      │   ├── keyboard=keyboard
      │   │   ├── pointer=mouse
      │   │   │   └── hover=rest, hovered
      │   │   │       └── focus=blurred, focused
      │   │   └── pointer=touch
      │   │       └── hover=rest
      │   │           └── focus=blurred, focused
      │   └── keyboard=no-keyboard
      │       ├── pointer=mouse
      │       │   └── hover=rest, hovered
      │       │       └── focus=blurred
      │       └── pointer=touch
      │           └── hover=rest
      │               └── focus=blurred
      ├── toolbar-links (8 combinations)
      └── blog-link (18 combinations)
          ├── keyboard=keyboard
          │   ├── pointer=mouse
          │   │   └── hover=rest, hovered
          │   │       └── focus=blurred, focused
          │   └── pointer=touch
          │       └── hover=rest
          │           └── focus=blurred, focused
          └── keyboard=no-keyboard
              ├── pointer=mouse
              │   └── hover=rest, hovered
              │       └── focus=blurred
              └── pointer=touch
                  └── hover=rest
                      └── focus=blurred
      "
    `);
  });

  it("orders several levels as given", () => {
    expect(tree("blog-link", "--tree", "--by", "pointer,keyboard")).toMatchInlineSnapshot(`
      "pointer=mouse
      ├── keyboard=keyboard
      │   └── blog-link (8 combinations)
      │       └── breakpoint=lg, xl
      │           └── hover=rest, hovered
      │               └── focus=blurred, focused
      └── keyboard=no-keyboard
          └── blog-link (4 combinations)
              └── breakpoint=lg, xl
                  └── hover=rest, hovered
                      └── focus=blurred
      pointer=touch
      ├── keyboard=keyboard
      │   └── blog-link (4 combinations)
      │       └── breakpoint=lg, xl
      │           └── hover=rest
      │               └── focus=blurred, focused
      └── keyboard=no-keyboard
          └── blog-link (2 combinations)
              └── breakpoint=lg, xl
                  └── hover=rest
                      └── focus=blurred
      "
    `);
  });
});

describe("--only", () => {
  it("keeps only the named levels and merges the rest away", () => {
    const snapshot: unknown[] = [];
    snapshot.push(tree("toolbar", "--subtree", "--tree", "--only", "breakpoint"));
    snapshot.push(tree("blog-link", "--tree", "--only", "pointer,hover"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "toolbar (4 combinations)
      wordmark (4 combinations)
      toolbar-links (2 combinations)
      └── breakpoint=lg, xl
      blog-link (2 combinations)
      └── breakpoint=lg, xl
      menu (2 combinations)
      └── breakpoint=base, sm
      menu-panel (2 combinations)
      └── breakpoint=base, sm
      menu-link (2 combinations)
      └── breakpoint=base, sm
      ",
        "blog-link (3 combinations)
      ├── pointer=mouse
      │   └── hover=rest, hovered
      └── pointer=touch
          └── hover=rest
      ",
      ]
    `);
  });
});

describe("--json", () => {
  it("returns the merged tree as JSON, for tools", () => {
    expect(
      JSON.parse(tree("blog-link", "--tree", "--json", "--only", "pointer,hover")),
    ).toMatchInlineSnapshot(`
      {
        "node": "blog-link",
        "tree": [
          {
            "children": [
              {
                "children": [
                  {
                    "count": 2,
                    "name": "hover",
                    "values": [
                      "rest",
                      "hovered",
                    ],
                  },
                ],
                "count": 2,
                "name": "pointer",
                "values": [
                  "mouse",
                ],
              },
              {
                "children": [
                  {
                    "count": 1,
                    "name": "hover",
                    "values": [
                      "rest",
                    ],
                  },
                ],
                "count": 1,
                "name": "pointer",
                "values": [
                  "touch",
                ],
              },
            ],
            "count": 3,
            "node": "blog-link",
          },
        ],
      }
    `);
  });
});

describe("tree query errors", () => {
  it("reject unknown levels and options without --tree", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("contexts", "toolbar", "--subtree", "--tree", "--by", "theme").stderr);
    snapshot.push(run("contexts", "toolbar", "--subtree", "--tree", "--only", "theme").stderr);
    snapshot.push(run("contexts", "toolbar", "--by", "breakpoint").code);
    snapshot.push(run("contexts", "toolbar", "--json").code);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "task-tree: "theme" is not a level here (breakpoint, focus, hover, keyboard, menu, pointer)
      ",
        "task-tree: "theme" is not a level here (breakpoint, focus, hover, keyboard, menu, pointer)
      ",
        2,
        2,
      ]
    `);
  });
});
