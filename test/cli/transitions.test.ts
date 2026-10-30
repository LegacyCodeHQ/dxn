import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const files = {
  "types.json": {
    version: 1,
    customChecks: { behavior: {} },
    types: { menu: { states: ["closed", "open"], shared: true, checks: ["behavior"] } },
  },
  "components/toolbar.json": {
    version: 1,
    component: {
      id: "toolbar",
      title: "Toolbar",
      children: [
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
              children: [{ id: "menu-link", title: "Menu link" }],
            },
          ],
        },
      ],
    },
  },
  "tasks/article-page.json": taskFile({
    id: "article-page",
    title: "Article page",
    children: [{ include: "toolbar" }],
  }),
};

describe("task transition add and remove", () => {
  it("add transitions to a shared task and remove them", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    const add = (...args: string[]) => run("task", "transition", "add", "menu", ...args).code;
    snapshot.push(
      add("open", "--from", "closed", "--to", "open", "--on", "click", "--target", "menu-button"),
    );
    snapshot.push(
      add(
        "escape",
        "--from",
        "open",
        "--to",
        "closed",
        "--on",
        "keydown",
        "--key",
        "Escape",
        "--focus",
        "menu-button",
      ),
    );
    snapshot.push(
      add(
        "outside",
        "--from",
        "open",
        "--to",
        "closed",
        "--on",
        "pointerdown",
        "--outside",
        "toolbar",
      ),
    );
    snapshot.push(read("components/toolbar.json"));
    snapshot.push(run("task", "transition", "remove", "menu", "outside").code);
    snapshot.push(run("transitions", "menu").stdout);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        0,
        0,
        {
          "component": {
            "children": [
              {
                "children": [
                  {
                    "id": "menu-button",
                    "title": "Menu button",
                  },
                  {
                    "children": [
                      {
                        "id": "menu-link",
                        "title": "Menu link",
                      },
                    ],
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
                "transitions": [
                  {
                    "from": "closed",
                    "id": "open",
                    "on": "click",
                    "target": "menu-button",
                    "to": "open",
                  },
                  {
                    "focus": "menu-button",
                    "from": "open",
                    "id": "escape",
                    "key": "Escape",
                    "on": "keydown",
                    "to": "closed",
                  },
                  {
                    "from": "open",
                    "id": "outside",
                    "on": "pointerdown",
                    "outside": "toolbar",
                    "to": "closed",
                  },
                ],
                "type": "menu",
              },
            ],
            "id": "toolbar",
            "title": "Toolbar",
          },
          "version": 1,
        },
        0,
        "{
        "task": "menu",
        "transitions": [
          {
            "id": "open",
            "from": "closed",
            "to": "open",
            "on": "click",
            "target": "menu-button"
          },
          {
            "id": "escape",
            "from": "open",
            "to": "closed",
            "on": "keydown",
            "key": "Escape",
            "focus": "menu-button"
          }
        ]
      }
      ",
      ]
    `);
  });

  it("refuse what the compiler rejects, duplicates and unknown ones", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    const add = (...args: string[]) => run("task", "transition", "add", "menu", ...args);
    snapshot.push(
      add("open", "--from", "closed", "--to", "open", "--on", "click", "--target", "menu-link")
        .stderr,
    );
    add("open", "--from", "closed", "--to", "open", "--on", "click", "--target", "menu-button");
    snapshot.push(
      add("open", "--from", "open", "--to", "closed", "--on", "click", "--target", "menu-button"),
    );
    snapshot.push(run("task", "transition", "remove", "menu", "nope"));
    snapshot.push(add("x", "--to", "open", "--on", "click").code);
    snapshot.push(
      add("x", "--from", "closed", "--to", "open", "--on", "resize", "--when", "breakpoint").code,
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "<tmp>/.task-tree/components/toolbar.json:17:23: target-absent: "menu-link" does not exist while "menu" is closed
      ",
        {
          "code": 1,
          "stderr": "task-tree: task "menu" already has a transition "open"
      ",
          "stdout": "",
        },
        {
          "code": 1,
          "stderr": "task-tree: task "menu" has no transition "nope"
      ",
          "stdout": "",
        },
        2,
        2,
      ]
    `);
  });
});

describe("transitions in status and verify", () => {
  it("are listed, verified and unverified by id", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    run(
      "task",
      "transition",
      "add",
      "menu",
      "open",
      "--from",
      "closed",
      "--to",
      "open",
      "--on",
      "click",
      "--target",
      "menu-button",
    );
    run(
      "task",
      "transition",
      "add",
      "menu",
      "close",
      "--from",
      "open",
      "--to",
      "closed",
      "--on",
      "click",
      "--target",
      "menu-button",
    );
    const verify = (...args: string[]) =>
      run(
        "verify",
        "menu",
        "--check",
        "behavior",
        "--result",
        "passed",
        "--by",
        "agent",
        "--at",
        "2026-10-30T19:20:00Z",
        ...args,
      );
    snapshot.push(verify("--transition", "open").code);
    snapshot.push(read("verification/article-page.json"));
    snapshot.push(JSON.parse(run("status", "menu").stdout));
    snapshot.push(verify("--transition", "nope").stderr);
    snapshot.push(verify("--transition", "open", "menu=open").code);
    snapshot.push(run("unverify", "menu", "--check", "behavior", "--transition", "open").code);
    snapshot.push(JSON.parse(run("status", "menu").stdout).summary);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "records": [
            {
              "at": "2026-10-30T19:20:00Z",
              "by": "agent",
              "check": "behavior",
              "result": "passed",
              "task": "menu",
              "transition": "open",
            },
          ],
          "version": 1,
        },
        {
          "items": [
            {
              "check": "behavior",
              "context": {
                "menu": "closed",
              },
              "page": "article-page",
              "result": "missing",
              "task": "menu",
            },
            {
              "check": "behavior",
              "context": {
                "menu": "open",
              },
              "page": "article-page",
              "result": "missing",
              "task": "menu",
            },
            {
              "check": "behavior",
              "page": "article-page",
              "result": "passed",
              "task": "menu",
              "transition": "open",
            },
            {
              "check": "behavior",
              "page": "article-page",
              "result": "missing",
              "task": "menu",
              "transition": "close",
            },
          ],
          "summary": {
            "failed": 0,
            "missing": 3,
            "passed": 1,
          },
        },
        "<tmp>/.task-tree/verification/article-page.json:14:21: unknown-transition: task "menu" has no transition "nope"
      ",
        2,
        0,
        {
          "failed": 0,
          "missing": 4,
          "passed": 0,
        },
      ]
    `);
  });
});
