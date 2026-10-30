import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const files = {
  "types.json": { version: 1 },
  "tasks/page.json": taskFile({
    id: "page",
    title: "Page",
    children: [
      {
        id: "menu",
        title: "Menu",
        children: [{ id: "menu-panel", title: "Menu panel" }],
      },
    ],
  }),
};

describe("shared types and onlyWhen from the command line", () => {
  it("share a type's states with its instances' subtrees, and depend on them", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    snapshot.push(run("type", "add", "menu", "--states", "closed,open", "--shared").code);
    snapshot.push(run("type", "add", "link", "--states", "normal").code);
    snapshot.push(run("type", "share", "link").code);
    snapshot.push(run("type", "unshare", "link").code);
    snapshot.push(run("task", "set-type", "menu", "menu").code);
    snapshot.push(run("task", "only-when", "menu-panel", "menu", "open").code);
    snapshot.push(read("types.json"), read("tasks/page.json"));
    snapshot.push(run("task", "only-when", "menu-panel", "menu", "--always").code);
    snapshot.push(read("tasks/page.json"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        0,
        0,
        0,
        0,
        0,
        {
          "types": {
            "link": {
              "states": [
                "normal",
              ],
            },
            "menu": {
              "shared": true,
              "states": [
                "closed",
                "open",
              ],
            },
          },
          "version": 1,
        },
        {
          "task": {
            "children": [
              {
                "children": [
                  {
                    "id": "menu-panel",
                    "onlyWhen": {
                      "menu": [
                        "open",
                      ],
                    },
                    "title": "Menu panel",
                  },
                ],
                "id": "menu",
                "title": "Menu",
                "type": "menu",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
        0,
        {
          "task": {
            "children": [
              {
                "children": [
                  {
                    "id": "menu-panel",
                    "title": "Menu panel",
                  },
                ],
                "id": "menu",
                "title": "Menu",
                "type": "menu",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
      ]
    `);
  });

  it("refuse what the compiler rejects and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    run("type", "add", "menu", "--states", "closed,open");
    run("task", "set-type", "menu", "menu");
    snapshot.push(run("task", "only-when", "menu-panel", "menu", "open"));
    snapshot.push(run("type", "share", "nope"));
    snapshot.push(run("task", "only-when", "menu-panel", "menu").code);
    snapshot.push(run("task", "only-when", "menu-panel", "menu", "open", "--always").code);
    snapshot.push(run("task", "only-when", "menu-panel", "page", "--always"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "code": 1,
          "stderr": "<tmp>/.task-tree/tasks/page.json:16:15: ancestor-not-shared: "menu" needs a shared type for its subtree to depend on its state
      ",
          "stdout": "",
        },
        {
          "code": 1,
          "stderr": "task-tree: type not found: nope
      ",
          "stdout": "",
        },
        2,
        2,
        {
          "code": 0,
          "stderr": "",
          "stdout": "{"written":["tasks/page.json"],"removed":[]}
      ",
        },
      ]
    `);
  });
});
