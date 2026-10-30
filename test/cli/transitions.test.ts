import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const files = {
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
  "roots/article-page.json": rootFile({
    id: "article-page",
    title: "Article page",
    children: [{ include: "toolbar" }],
  }),
};

describe("node transition add and remove", () => {
  it("add transitions to a shared node and remove them", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    const add = (...args: string[]) => run("node", "transition", "add", "menu", ...args).code;
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
    snapshot.push(read("fragments/toolbar.json"));
    snapshot.push(run("node", "transition", "remove", "menu", "outside").code);
    snapshot.push(run("transitions", "menu").stdout);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        0,
        0,
        {
          "fragment": {
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
        "node": "menu",
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
    const add = (...args: string[]) => run("node", "transition", "add", "menu", ...args);
    snapshot.push(
      add("open", "--from", "closed", "--to", "open", "--on", "click", "--target", "menu-link")
        .stderr,
    );
    add("open", "--from", "closed", "--to", "open", "--on", "click", "--target", "menu-button");
    snapshot.push(
      add("open", "--from", "open", "--to", "closed", "--on", "click", "--target", "menu-button"),
    );
    snapshot.push(run("node", "transition", "remove", "menu", "nope"));
    snapshot.push(add("x", "--to", "open", "--on", "click").code);
    snapshot.push(
      add("x", "--from", "closed", "--to", "open", "--on", "resize", "--when", "breakpoint").code,
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "<tmp>/.dimensions/fragments/toolbar.json:17:23: target-absent: "menu-link" does not exist while "menu" is closed
      ",
        {
          "code": 1,
          "stderr": "dimensions: node "menu" already has a transition "open"
      ",
          "stdout": "",
        },
        {
          "code": 1,
          "stderr": "dimensions: node "menu" has no transition "nope"
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
      "node",
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
      "node",
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
              "node": "menu",
              "result": "passed",
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
              "node": "menu",
              "result": "missing",
              "root": "article-page",
            },
            {
              "check": "behavior",
              "context": {
                "menu": "open",
              },
              "node": "menu",
              "result": "missing",
              "root": "article-page",
            },
            {
              "check": "behavior",
              "node": "menu",
              "result": "passed",
              "root": "article-page",
              "transition": "open",
            },
            {
              "check": "behavior",
              "node": "menu",
              "result": "missing",
              "root": "article-page",
              "transition": "close",
            },
          ],
          "summary": {
            "failed": 0,
            "missing": 3,
            "passed": 1,
          },
        },
        "<tmp>/.dimensions/verification/article-page.json:14:21: unknown-transition: node "menu" has no transition "nope"
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

describe("contexts --tree --transitions", () => {
  const withTransitions = () => {
    const project = cliProject(files);
    const add = (...args: string[]) => project.run("node", "transition", "add", "menu", ...args);
    add("open", "--from", "closed", "--to", "open", "--on", "click", "--target", "menu-button");
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
    );
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
    );
    return project;
  };

  it("lists each part's transitions under it", () => {
    const { run } = withTransitions();
    expect(
      run("contexts", "toolbar", "--subtree", "--tree", "--transitions").stdout,
    ).toMatchInlineSnapshot(`
      "toolbar (1 combination)
      menu (2 combinations)
      ├── menu=closed, open
      └── transitions
          ├── closed → open: click on menu-button  [open]
          ├── open → closed: keydown Escape, focus menu-button  [escape]
          └── open → closed: pointerdown outside toolbar  [outside]
      menu-button (2 combinations)
      └── menu=closed, open
      menu-panel (1 combination)
      └── menu=open
      menu-link (1 combination)
      └── menu=open
      "
    `);
  });

  it("adds them to the JSON tree", () => {
    const { run } = withTransitions();
    expect(
      JSON.parse(run("contexts", "menu", "--tree", "--json", "--transitions").stdout),
    ).toMatchInlineSnapshot(`
      {
        "node": "menu",
        "tree": [
          {
            "children": [
              {
                "count": 2,
                "name": "menu",
                "values": [
                  "closed",
                  "open",
                ],
              },
            ],
            "count": 2,
            "node": "menu",
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
          },
        ],
      }
    `);
  });

  it("needs --tree", () => {
    const { run } = withTransitions();
    expect(run("contexts", "menu", "--transitions").code).toBe(2);
  });
});
