import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const types = { version: 1 };
const page = (children: unknown[] = []) => rootFile({ id: "page", title: "Page", children });

describe("fragment add and remove", () => {
  it("add a fragment file and remove an unused one", () => {
    const snapshot: unknown[] = [];
    const { run, read, exists } = cliProject({ "types.json": types });
    snapshot.push(run("fragment", "add", "toolbar", "--title", "Toolbar").code);
    snapshot.push(read("fragments/toolbar.json"));
    snapshot.push(run("fragment", "add", "toolbar", "--title", "Again"));
    snapshot.push(run("fragment", "remove", "toolbar").code);
    snapshot.push(exists("fragments/toolbar.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "fragment": {
        "id": "toolbar",
        "title": "Toolbar",
      },
      "version": 1,
    },
    {
      "code": 1,
      "stderr": "dimensions: fragment "toolbar" already exists
  ",
      "stdout": "",
    },
    0,
    false,
  ]
`);
  });

  it("refuse to remove an included fragment and unknown ones", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({
      "types.json": types,
      "fragments/toolbar.json": { version: 1, fragment: { id: "toolbar", title: "Toolbar" } },
      "roots/page.json": page([{ include: "toolbar" }]),
    });
    snapshot.push(run("fragment", "remove", "toolbar").stderr);
    snapshot.push(run("fragment", "remove", "nope"));
    snapshot.push(run("fragment", "add", "x").code);
    snapshot.push(run("fragment").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.dimensions/roots/page.json:8:20: unknown-fragment: no fragments/toolbar.json defines this fragment
  ",
    {
      "code": 1,
      "stderr": "dimensions: fragment not found: nope
  ",
      "stdout": "",
    },
    2,
    2,
  ]
`);
  });
});

describe("fragment extract", () => {
  it("moves a subtree into a fragment and includes it in its place", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject({
      "types.json": types,
      "roots/page.json": page([
        { id: "toolbar", title: "Toolbar", children: [{ id: "wordmark", title: "Wordmark" }] },
        { id: "body", title: "Body" },
      ]),
    });
    const result = run("fragment", "extract", "toolbar");
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(read("fragments/toolbar.json"));
    snapshot.push(read("roots/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "removed": [],
          "written": [
            "fragments/toolbar.json",
            "roots/page.json",
          ],
        },
        {
          "fragment": {
            "children": [
              {
                "id": "wordmark",
                "title": "Wordmark",
              },
            ],
            "id": "toolbar",
            "title": "Toolbar",
          },
          "version": 1,
        },
        {
          "root": {
            "children": [
              {
                "include": "toolbar",
              },
              {
                "id": "body",
                "title": "Body",
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

  it("refuses a file's root", () => {
    const { run } = cliProject({ "types.json": types, "roots/page.json": page() });
    expect(run("fragment", "extract", "page")).toMatchObject({
      code: 1,
      stderr:
        'dimensions: "page" is the top node of its file; only a node inside one can be extracted\n',
    });
  });
});

describe("node include and uninclude", () => {
  it("add and remove an include under a node", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject({
      "types.json": types,
      "fragments/toolbar.json": { version: 1, fragment: { id: "toolbar", title: "Toolbar" } },
      "roots/page.json": page(),
    });
    snapshot.push(run("node", "include", "page", "toolbar").code);
    snapshot.push(read("roots/page.json"));
    snapshot.push(run("node", "include", "page", "toolbar").stderr);
    snapshot.push(run("node", "uninclude", "page", "toolbar").code);
    snapshot.push(read("roots/page.json"));
    snapshot.push(run("node", "uninclude", "page", "toolbar"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "root": {
            "children": [
              {
                "include": "toolbar",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
        "<tmp>/.dimensions/roots/page.json:11:20: duplicate-include: "toolbar" is already part of "page"; its nodes would appear twice
      ",
        0,
        {
          "root": {
            "children": [],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
        {
          "code": 1,
          "stderr": "dimensions: "page" does not include "toolbar"
      ",
          "stdout": "",
        },
      ]
    `);
  });

  it("refuse unknown fragments", () => {
    const { run } = cliProject({ "types.json": types, "roots/page.json": page() });
    expect(run("node", "include", "page", "nope").stderr).toContain("unknown-fragment");
  });
});
