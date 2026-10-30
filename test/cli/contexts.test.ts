import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// The neo-website toolbar with hover, focus and selection state groups.
const files = {
  "types.json": {
    version: 1,
    stateGroups: {
      hover: ["unhovered", "hovered"],
      focus: ["unfocused", "focused"],
      selection: ["unselected", "selected"],
    },
    types: {
      wordmark: { stateGroups: ["hover", "focus"] },
      "toolbar-link": { stateGroups: ["hover", "focus", "selection"] },
      menu: { states: ["closed", "open"], shared: true },
      "menu-button": { stateGroups: ["hover", "focus"] },
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
            { id: "menu-button", title: "Menu button", type: "menu-button" },
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

describe("contexts --subtree", () => {
  it("leaves out a root's include states unless --root names the root", () => {
    const { run } = cliProject({
      ...files,
      "roots/article-page.json": rootFile({
        id: "article-page",
        title: "Article page",
        children: [{ include: "toolbar", states: { "blog-link": { selection: ["selected"] } } }],
      }),
    });
    const snapshot: unknown[] = [];
    for (const root of [[], ["--root", "article-page"]]) {
      const result = json(run("contexts", "toolbar", "--subtree", "--count", ...root));
      snapshot.push(result.counts["blog-link"]);
      const selected = json(
        run("contexts", "toolbar", "--subtree", "selection=unselected", "--count", ...root),
      );
      snapshot.push(selected.counts["blog-link"]);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        16,
        8,
        8,
        0,
      ]
    `);
  });

  it("lists every part's combinations, the component on its own by default", () => {
    const { run } = cliProject(files);
    const result = json(run("contexts", "toolbar", "--subtree"));
    expect(
      result.nodes.map(({ id, contexts }: { id: string; contexts: unknown[] }) => [
        id,
        contexts.length,
      ]),
    ).toMatchInlineSnapshot(`
      [
        [
          "toolbar",
          4,
        ],
        [
          "wordmark",
          16,
        ],
        [
          "toolbar-links",
          2,
        ],
        [
          "blog-link",
          16,
        ],
        [
          "menu",
          4,
        ],
        [
          "menu-button",
          16,
        ],
        [
          "menu-panel",
          2,
        ],
        [
          "menu-link",
          16,
        ],
      ]
    `);
  });

  it("lists every combination of a small subtree", () => {
    const { run } = cliProject(files);
    expect(json(run("contexts", "menu-panel", "--subtree"))).toMatchInlineSnapshot(`
      {
        "node": "menu-panel",
        "nodes": [
          {
            "contexts": [
              {
                "breakpoint": "base",
                "menu": "open",
              },
              {
                "breakpoint": "sm",
                "menu": "open",
              },
            ],
            "id": "menu-panel",
          },
          {
            "contexts": [
              {
                "breakpoint": "base",
                "focus": "unfocused",
                "hover": "unhovered",
                "menu": "open",
                "selection": "unselected",
              },
              {
                "breakpoint": "base",
                "focus": "unfocused",
                "hover": "unhovered",
                "menu": "open",
                "selection": "selected",
              },
              {
                "breakpoint": "base",
                "focus": "focused",
                "hover": "unhovered",
                "menu": "open",
                "selection": "unselected",
              },
              {
                "breakpoint": "base",
                "focus": "focused",
                "hover": "unhovered",
                "menu": "open",
                "selection": "selected",
              },
              {
                "breakpoint": "base",
                "focus": "unfocused",
                "hover": "hovered",
                "menu": "open",
                "selection": "unselected",
              },
              {
                "breakpoint": "base",
                "focus": "unfocused",
                "hover": "hovered",
                "menu": "open",
                "selection": "selected",
              },
              {
                "breakpoint": "base",
                "focus": "focused",
                "hover": "hovered",
                "menu": "open",
                "selection": "unselected",
              },
              {
                "breakpoint": "base",
                "focus": "focused",
                "hover": "hovered",
                "menu": "open",
                "selection": "selected",
              },
              {
                "breakpoint": "sm",
                "focus": "unfocused",
                "hover": "unhovered",
                "menu": "open",
                "selection": "unselected",
              },
              {
                "breakpoint": "sm",
                "focus": "unfocused",
                "hover": "unhovered",
                "menu": "open",
                "selection": "selected",
              },
              {
                "breakpoint": "sm",
                "focus": "focused",
                "hover": "unhovered",
                "menu": "open",
                "selection": "unselected",
              },
              {
                "breakpoint": "sm",
                "focus": "focused",
                "hover": "unhovered",
                "menu": "open",
                "selection": "selected",
              },
              {
                "breakpoint": "sm",
                "focus": "unfocused",
                "hover": "hovered",
                "menu": "open",
                "selection": "unselected",
              },
              {
                "breakpoint": "sm",
                "focus": "unfocused",
                "hover": "hovered",
                "menu": "open",
                "selection": "selected",
              },
              {
                "breakpoint": "sm",
                "focus": "focused",
                "hover": "hovered",
                "menu": "open",
                "selection": "unselected",
              },
              {
                "breakpoint": "sm",
                "focus": "focused",
                "hover": "hovered",
                "menu": "open",
                "selection": "selected",
              },
            ],
            "id": "menu-link",
          },
        ],
      }
    `);
  });

  it("shows the component as included in a root with --root", () => {
    const { run } = cliProject(files);
    expect(
      json(run("contexts", "toolbar", "--subtree", "--root", "article-page", "--count")),
    ).toMatchInlineSnapshot(`
      {
        "counts": {
          "blog-link": 16,
          "menu": 4,
          "menu-button": 16,
          "menu-link": 16,
          "menu-panel": 2,
          "toolbar": 4,
          "toolbar-links": 2,
          "wordmark": 16,
        },
        "node": "toolbar",
        "root": "article-page",
        "total": 76,
      }
    `);
  });
});

describe("contexts filters", () => {
  it("keep only the combinations with every given value", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(json(run("contexts", "toolbar", "--subtree", "breakpoint=sm", "--count")));
    snapshot.push(
      json(run("contexts", "toolbar", "--subtree", "hover=hovered", "focus=focused", "--count")),
    );
    snapshot.push(json(run("contexts", "toolbar", "--subtree", "menu=open", "selection=selected")));
    snapshot.push(json(run("contexts", "blog-link", "selection=selected", "hover=hovered")));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "counts": {
            "blog-link": 0,
            "menu": 2,
            "menu-button": 8,
            "menu-link": 8,
            "menu-panel": 1,
            "toolbar": 1,
            "toolbar-links": 0,
            "wordmark": 4,
          },
          "node": "toolbar",
          "total": 24,
        },
        {
          "counts": {
            "blog-link": 4,
            "menu": 0,
            "menu-button": 4,
            "menu-link": 4,
            "menu-panel": 0,
            "toolbar": 0,
            "toolbar-links": 0,
            "wordmark": 4,
          },
          "node": "toolbar",
          "total": 16,
        },
        {
          "node": "toolbar",
          "nodes": [
            {
              "contexts": [
                {
                  "breakpoint": "base",
                  "focus": "unfocused",
                  "hover": "unhovered",
                  "menu": "open",
                  "selection": "selected",
                },
                {
                  "breakpoint": "base",
                  "focus": "focused",
                  "hover": "unhovered",
                  "menu": "open",
                  "selection": "selected",
                },
                {
                  "breakpoint": "base",
                  "focus": "unfocused",
                  "hover": "hovered",
                  "menu": "open",
                  "selection": "selected",
                },
                {
                  "breakpoint": "base",
                  "focus": "focused",
                  "hover": "hovered",
                  "menu": "open",
                  "selection": "selected",
                },
                {
                  "breakpoint": "sm",
                  "focus": "unfocused",
                  "hover": "unhovered",
                  "menu": "open",
                  "selection": "selected",
                },
                {
                  "breakpoint": "sm",
                  "focus": "focused",
                  "hover": "unhovered",
                  "menu": "open",
                  "selection": "selected",
                },
                {
                  "breakpoint": "sm",
                  "focus": "unfocused",
                  "hover": "hovered",
                  "menu": "open",
                  "selection": "selected",
                },
                {
                  "breakpoint": "sm",
                  "focus": "focused",
                  "hover": "hovered",
                  "menu": "open",
                  "selection": "selected",
                },
              ],
              "id": "menu-link",
            },
          ],
        },
        {
          "contexts": [
            {
              "context": {
                "breakpoint": "lg",
                "focus": "unfocused",
                "hover": "hovered",
                "selection": "selected",
              },
              "root": "article-page",
            },
            {
              "context": {
                "breakpoint": "lg",
                "focus": "focused",
                "hover": "hovered",
                "selection": "selected",
              },
              "root": "article-page",
            },
            {
              "context": {
                "breakpoint": "xl",
                "focus": "unfocused",
                "hover": "hovered",
                "selection": "selected",
              },
              "root": "article-page",
            },
            {
              "context": {
                "breakpoint": "xl",
                "focus": "focused",
                "hover": "hovered",
                "selection": "selected",
              },
              "root": "article-page",
            },
          ],
          "node": "blog-link",
        },
      ]
    `);
  });

  it("keep parts a shared state does not apply to, where that shared node exists", () => {
    const { run } = cliProject(files);
    expect(
      json(run("contexts", "toolbar", "--subtree", "breakpoint=sm", "menu=open", "--count")),
    ).toMatchInlineSnapshot(`
      {
        "counts": {
          "blog-link": 0,
          "menu": 1,
          "menu-button": 4,
          "menu-link": 8,
          "menu-panel": 1,
          "toolbar": 1,
          "toolbar-links": 0,
          "wordmark": 4,
        },
        "node": "toolbar",
        "total": 19,
      }
    `);
  });

  it("reject unknown names and values, listing the valid ones", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("contexts", "toolbar", "--subtree", "theme=dark"));
    snapshot.push(run("contexts", "toolbar", "--subtree", "breakpoint=md").stderr);
    snapshot.push(run("contexts", "toolbar", "--subtree", "hover=yes").stderr);
    snapshot.push(run("contexts", "toolbar", "--subtree", "menu=ajar").stderr);
    snapshot.push(run("contexts", "toolbar", "--subtree", "hover").code);
    snapshot.push(run("contexts", "toolbar", "--subtree", "--root", "nope").stderr);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "code": 1,
          "stderr": "dimensions: "theme" is not a dimension, state group or shared node here (breakpoint, focus, hover, menu, selection)
      ",
          "stdout": "",
        },
        "dimensions: "md" is not a value of breakpoint (base, sm, lg, xl)
      ",
        "dimensions: "yes" is not a value of hover (unhovered, hovered)
      ",
        "dimensions: "ajar" is not a state of menu (closed, open)
      ",
        2,
        "dimensions: "toolbar" is not in root "nope"
      ",
      ]
    `);
  });
});

describe("contexts --count", () => {
  it("counts a single node's combinations", () => {
    const { run } = cliProject(files);
    expect(json(run("contexts", "wordmark", "--count"))).toMatchInlineSnapshot(`
      {
        "count": 16,
        "node": "wordmark",
      }
    `);
  });
});

describe("contexts --tree", () => {
  it("prints one node's contexts as a tree, merging identical branches", () => {
    const { run } = cliProject(files);
    expect(run("contexts", "wordmark", "--tree").stdout).toMatchInlineSnapshot(`
      "wordmark (16 combinations)
      └── hover=unhovered, hovered
          └── focus=unfocused, focused
      "
    `);
  });

  it("prints every part of a subtree, splitting only where they differ", () => {
    const { run } = cliProject(files);
    expect(run("contexts", "menu", "--subtree", "--tree").stdout).toMatchInlineSnapshot(`
      "menu (4 combinations)
      └── breakpoint=base, sm
          └── menu=closed, open
      menu-button (16 combinations)
      └── breakpoint=base, sm
          └── menu=closed, open
              └── hover=unhovered, hovered
                  └── focus=unfocused, focused
      menu-panel (2 combinations)
      └── breakpoint=base, sm
          └── menu=open
      menu-link (16 combinations)
      └── breakpoint=base, sm
          └── menu=open
              └── hover=unhovered, hovered
                  └── focus=unfocused, focused
                      └── selection=unselected, selected
      "
    `);
  });

  it("applies filters first", () => {
    const { run } = cliProject(files);
    expect(
      run("contexts", "toolbar", "--subtree", "--tree", "breakpoint=lg", "focus=focused").stdout,
    ).toMatchInlineSnapshot(`
      "wordmark (2 combinations)
      └── breakpoint=lg
          └── hover=unhovered, hovered
              └── focus=focused
      blog-link (4 combinations)
      └── breakpoint=lg
          └── hover=unhovered, hovered
              └── focus=focused
                  └── selection=unselected, selected
      "
    `);
  });

  it("cannot be combined with --count", () => {
    const { run } = cliProject(files);
    expect(run("contexts", "wordmark", "--tree", "--count").code).toBe(2);
  });
});
