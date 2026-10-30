import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const files = {
  "types.json": {
    version: 1,
    stateGroups: { hover: ["rest", "hovered"], selection: ["unselected", "selected"] },
    customChecks: { visual: {} },
    types: { link: { stateGroups: ["hover", "selection"], checks: ["visual"] } },
  },
  "components/toolbar.json": {
    version: 1,
    component: {
      id: "toolbar",
      title: "Toolbar",
      children: [{ id: "blog-link", title: "Blog link", type: "link" }],
    },
  },
  "roots/article-page.json": rootFile({
    id: "article-page",
    title: "Article page",
    children: [{ include: "toolbar", states: { "blog-link": { selection: ["selected"] } } }],
  }),
  "roots/home.json": rootFile({ id: "home", title: "Home", children: [{ include: "toolbar" }] }),
};

describe("per-include states in reading commands", () => {
  it("limit contexts, views and status on the including page only", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("contexts", "blog-link", "--tree").stdout);
    snapshot.push(JSON.parse(run("view", "toolbar", "--root", "article-page").stdout).tree);
    snapshot.push(JSON.parse(run("view", "toolbar", "--root", "home").stdout).tree);
    snapshot.push(JSON.parse(run("status", "blog-link").stdout).summary);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "blog-link (6 combinations)
      ├── root=article-page
      │   └── hover=rest, hovered
      │       └── selection=selected
      └── root=home
          └── hover=rest, hovered
              └── selection=unselected, selected
      ",
        {
          "children": [
            {
              "id": "blog-link",
              "stateGroups": {
                "hover": [
                  "rest",
                  "hovered",
                ],
                "selection": [
                  "selected",
                ],
              },
              "title": "Blog link",
              "type": "link",
            },
          ],
          "id": "toolbar",
          "title": "Toolbar",
        },
        {
          "children": [
            {
              "id": "blog-link",
              "stateGroups": {
                "hover": [
                  "rest",
                  "hovered",
                ],
                "selection": [
                  "unselected",
                  "selected",
                ],
              },
              "title": "Blog link",
              "type": "link",
            },
          ],
          "id": "toolbar",
          "title": "Toolbar",
        },
        {
          "failed": 0,
          "missing": 6,
          "passed": 0,
        },
      ]
    `);
  });
});

describe("node include-states", () => {
  it("sets and clears an include's states", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject({
      ...files,
      "roots/article-page.json": rootFile({
        id: "article-page",
        title: "Article page",
        children: [{ include: "toolbar" }],
      }),
    });
    snapshot.push(
      run("node", "include-states", "article-page", "toolbar", "blog-link", "selection", "selected")
        .code,
    );
    snapshot.push(read("roots/article-page.json"));
    snapshot.push(
      run("node", "include-states", "article-page", "toolbar", "blog-link", "selection", "--any")
        .code,
    );
    snapshot.push(read("roots/article-page.json"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "root": {
            "children": [
              {
                "include": "toolbar",
                "states": {
                  "blog-link": {
                    "selection": [
                      "selected",
                    ],
                  },
                },
              },
            ],
            "id": "article-page",
            "title": "Article page",
          },
          "version": 1,
        },
        0,
        {
          "root": {
            "children": [
              {
                "include": "toolbar",
              },
            ],
            "id": "article-page",
            "title": "Article page",
          },
          "version": 1,
        },
      ]
    `);
  });

  it("refuses what the compiler rejects and missing includes", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(
      run("node", "include-states", "article-page", "toolbar", "blog-link", "selection", "current")
        .stderr,
    );
    snapshot.push(
      run("node", "include-states", "home", "footer", "blog-link", "selection", "selected"),
    );
    snapshot.push(run("node", "include-states", "home", "toolbar", "blog-link", "selection").code);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "<tmp>/.dimensions/roots/article-page.json:11:27: unknown-state: "current" is not in node "blog-link"'s "selection" group
      ",
        {
          "code": 1,
          "stderr": "dimensions: "home" does not include "footer"
      ",
          "stdout": "",
        },
        2,
      ]
    `);
  });
});
