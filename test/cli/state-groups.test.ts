import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const files = {
  "types.json": {
    version: 1,
    stateGroups: {
      interaction: ["normal", "hovered", "focused"],
      selection: ["unselected", "selected"],
    },
    customChecks: { visual: {} },
    types: {
      link: { stateGroups: ["interaction", "selection"], checks: ["visual"] },
      wordmark: { stateGroups: { interaction: ["normal", "focused"] }, checks: ["visual"] },
    },
  },
  "tasks/page.json": taskFile({
    id: "page",
    title: "Page",
    children: [
      { id: "wordmark", title: "Wordmark", type: "wordmark" },
      { id: "blog-link", title: "Blog link", type: "link" },
    ],
  }),
  "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["page"] },
  "overrides/pointer.json": {
    version: 1,
    overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
  },
};

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

describe("state groups in reading commands", () => {
  it("make contexts the matrix of a type's groups, after overrides", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(
      json(run("contexts", "blog-link")).contexts.map(
        ({ context }: { context: unknown }) => context,
      ),
    );
    snapshot.push(json(run("contexts", "wordmark")).contexts.length);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "interaction": "normal",
            "pointer": "mouse",
            "selection": "unselected",
          },
          {
            "interaction": "normal",
            "pointer": "mouse",
            "selection": "selected",
          },
          {
            "interaction": "hovered",
            "pointer": "mouse",
            "selection": "unselected",
          },
          {
            "interaction": "hovered",
            "pointer": "mouse",
            "selection": "selected",
          },
          {
            "interaction": "focused",
            "pointer": "mouse",
            "selection": "unselected",
          },
          {
            "interaction": "focused",
            "pointer": "mouse",
            "selection": "selected",
          },
          {
            "interaction": "normal",
            "pointer": "touch",
            "selection": "unselected",
          },
          {
            "interaction": "normal",
            "pointer": "touch",
            "selection": "selected",
          },
          {
            "interaction": "focused",
            "pointer": "touch",
            "selection": "unselected",
          },
          {
            "interaction": "focused",
            "pointer": "touch",
            "selection": "selected",
          },
        ],
        4,
      ]
    `);
  });

  it("show each group's values in query and view", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(json(run("query", "blog-link", "pointer=touch")));
    snapshot.push(json(run("view", "page", "pointer=mouse")).tree);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "context": {
            "pointer": "touch",
          },
          "id": "blog-link",
          "present": true,
          "stateGroups": {
            "interaction": [
              "normal",
              "focused",
            ],
            "selection": [
              "unselected",
              "selected",
            ],
          },
          "states": [
            "normal",
            "focused",
            "unselected",
            "selected",
          ],
          "title": "Blog link",
          "type": "link",
        },
        {
          "children": [
            {
              "id": "wordmark",
              "stateGroups": {
                "interaction": [
                  "normal",
                  "focused",
                ],
              },
              "title": "Wordmark",
              "type": "wordmark",
            },
            {
              "id": "blog-link",
              "stateGroups": {
                "interaction": [
                  "normal",
                  "hovered",
                  "focused",
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
          "id": "page",
          "title": "Page",
        },
      ]
    `);
  });

  it("are matched by status and written by verify", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    snapshot.push(
      run(
        "verify",
        "blog-link",
        "--check",
        "visual",
        "--result",
        "passed",
        "--by",
        "agent",
        "--at",
        "2026-10-30T19:20:00Z",
        "interaction=hovered",
        "selection=selected",
        "pointer=mouse",
      ).code,
    );
    snapshot.push(read("verification/page.json"));
    snapshot.push(json(run("status", "blog-link")).summary);
    snapshot.push(
      run(
        "verify",
        "blog-link",
        "--check",
        "visual",
        "--result",
        "passed",
        "--by",
        "agent",
        "interaction=hovered",
        "selection=selected",
        "pointer=touch",
      ).stderr,
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "records": [
            {
              "at": "2026-10-30T19:20:00Z",
              "by": "agent",
              "check": "visual",
              "context": {
                "interaction": "hovered",
                "pointer": "mouse",
                "selection": "selected",
              },
              "result": "passed",
              "task": "blog-link",
            },
          ],
          "version": 1,
        },
        {
          "failed": 0,
          "missing": 9,
          "passed": 1,
        },
        "<tmp>/.task-tree/verification/page.json:19:24: removed-state: state "hovered" is removed in this context
      ",
      ]
    `);
  });
});

describe("state group commands", () => {
  it("declare groups and have types use them", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject({ "types.json": { version: 1 } });
    snapshot.push(run("state-group", "add", "interaction", "--values", "normal,hovered").code);
    snapshot.push(run("state-group", "add-value", "interaction", "focused").code);
    snapshot.push(run("state-group", "add", "selection", "--values", "unselected,selected").code);
    snapshot.push(run("type", "add", "link", "--groups", "interaction,selection").code);
    snapshot.push(run("type", "add", "wordmark").code);
    snapshot.push(
      run("type", "use-group", "wordmark", "interaction", "--values", "normal,focused").code,
    );
    snapshot.push(read("types.json"));
    snapshot.push(run("type", "drop-group", "link", "selection").code);
    snapshot.push(run("state-group", "remove", "selection").code);
    snapshot.push(run("state-group", "remove-value", "interaction", "hovered").code);
    snapshot.push(read("types.json"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        0,
        0,
        0,
        0,
        0,
        {
          "stateGroups": {
            "interaction": [
              "normal",
              "hovered",
              "focused",
            ],
            "selection": [
              "unselected",
              "selected",
            ],
          },
          "types": {
            "link": {
              "stateGroups": [
                "interaction",
                "selection",
              ],
            },
            "wordmark": {
              "stateGroups": {
                "interaction": [
                  "normal",
                  "focused",
                ],
              },
            },
          },
          "version": 1,
        },
        0,
        0,
        0,
        {
          "stateGroups": {
            "interaction": [
              "normal",
              "focused",
            ],
          },
          "types": {
            "link": {
              "stateGroups": [
                "interaction",
              ],
            },
            "wordmark": {
              "stateGroups": {
                "interaction": [
                  "normal",
                  "focused",
                ],
              },
            },
          },
          "version": 1,
        },
      ]
    `);
  });

  it("refuse what the compiler rejects and unknown names", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({ "types.json": { version: 1 } });
    run("state-group", "add", "interaction", "--values", "normal,focused");
    run("type", "add", "wordmark", "--groups", "interaction");
    snapshot.push(run("state-group", "add", "interaction", "--values", "x"));
    snapshot.push(run("state-group", "remove", "interaction").stderr);
    snapshot.push(run("type", "use-group", "wordmark", "size").stderr);
    snapshot.push(run("type", "drop-group", "wordmark", "size"));
    snapshot.push(run("state-group", "add", "x").code);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "code": 1,
          "stderr": "task-tree: state group "interaction" already exists
      ",
          "stdout": "",
        },
        "<tmp>/.task-tree/types.json:6:23: undeclared-state-group: state group "interaction" is not declared
      ",
        "<tmp>/.task-tree/types.json:8:38: undeclared-state-group: state group "size" is not declared
      ",
        {
          "code": 1,
          "stderr": "task-tree: type "wordmark" does not use state group "size"
      ",
          "stdout": "",
        },
        2,
      ]
    `);
  });
});
