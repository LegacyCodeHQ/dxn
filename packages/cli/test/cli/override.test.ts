import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const files = {
  "types.json": {
    version: 1,
    attributes: { design: { values: ["available", "missing"] } },
    types: { link: { states: ["normal", "hovered", "selected"] } },
  },
  "roots/page.json": rootFile({
    id: "page",
    title: "Page",
    children: [
      {
        id: "links",
        title: "Links",
        children: [{ id: "blog-link", title: "Blog link", type: "link" }],
      },
      { id: "menu", title: "Menu" },
    ],
  }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["base", "sm", "lg", "xl"],
    appliesTo: ["page"],
  },
  "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["page"] },
};

describe("node only", () => {
  it("says where a node exists, creating the override file", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    snapshot.push(run("node", "only", "links", "breakpoint", "lg", "xl").code);
    snapshot.push(run("node", "only", "menu", "breakpoint", "base", "sm").code);
    snapshot.push(read("overrides/breakpoint.json"));
    snapshot.push(run("node", "only", "links", "breakpoint", "--everywhere").code);
    snapshot.push(run("node", "only", "menu", "breakpoint", "--everywhere").code);
    snapshot.push(read("overrides/breakpoint.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    0,
    {
      "only": {
        "links": [
          "lg",
          "xl",
        ],
        "menu": [
          "base",
          "sm",
        ],
      },
      "overrides": {},
      "version": 1,
    },
    0,
    0,
    {
      "overrides": {},
      "version": 1,
    },
  ]
`);
  });

  it("refuses invalid values and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(run("node", "only", "links", "breakpoint", "md").stderr);
    snapshot.push(run("node", "only", "links", "theme", "dark").stderr);
    snapshot.push(run("node", "only", "links", "breakpoint").code);
    snapshot.push(run("node", "only", "links", "breakpoint", "lg", "--everywhere").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.dxn/overrides/breakpoint.json:4:15: unknown-dimension-value: "md" is not a value of this dimension
  ",
    "<tmp>/.dxn/overrides/theme.json:1:1: undeclared-dimension: no dimensions/theme.json declares this dimension
  ",
    2,
    2,
  ]
`);
  });
});

describe("override states", () => {
  it("removes and adds a type's states for one value", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    snapshot.push(
      run("override", "states", "pointer=touch", "--type", "link", "--remove", "hovered").code,
    );
    snapshot.push(read("overrides/pointer.json"));
    snapshot.push(
      run("override", "states", "pointer=touch", "--node", "blog-link", "--add", "hovered").code,
    );
    snapshot.push(read("overrides/pointer.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "overrides": {
        "touch": {
          "types": {
            "link": {
              "states": {
                "remove": [
                  "hovered",
                ],
              },
            },
          },
        },
      },
      "version": 1,
    },
    0,
    {
      "overrides": {
        "touch": {
          "nodes": {
            "blog-link": {
              "states": {
                "add": [
                  "hovered",
                ],
              },
            },
          },
          "types": {
            "link": {
              "states": {
                "remove": [
                  "hovered",
                ],
              },
            },
          },
        },
      },
      "version": 1,
    },
  ]
`);
  });

  it("writes combinations to the combination file, nested in dimension order", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    snapshot.push(
      run(
        "override",
        "states",
        "pointer=touch,breakpoint=sm",
        "--type",
        "link",
        "--remove",
        "selected",
      ).code,
    );
    snapshot.push(read("overrides/breakpoint+pointer.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "overrides": {
        "sm": {
          "touch": {
            "types": {
              "link": {
                "states": {
                  "remove": [
                    "selected",
                  ],
                },
              },
            },
          },
        },
      },
      "version": 1,
    },
  ]
`);
  });

  it("refuses what the compiler rejects and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(
      run("override", "states", "pointer=touch", "--type", "link", "--remove", "pressed").stderr,
    );
    snapshot.push(run("override", "states", "pointer=touch", "--remove", "hovered").code);
    snapshot.push(
      run(
        "override",
        "states",
        "pointer=touch",
        "--type",
        "link",
        "--node",
        "blog-link",
        "--add",
        "x",
      ).code,
    );
    snapshot.push(run("override", "states", "pointer", "--type", "link", "--add", "x").code);
    snapshot.push(
      run("override", "states", "pointer=touch,pointer=mouse", "--type", "link", "--add", "x").code,
    );
    snapshot.push(run("override", "states", "pointer=touch", "--type", "link").code);
    snapshot.push(run("override").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.dxn/overrides/pointer.json:8:24: unknown-state: "pressed" is not a state of this type
  ",
    2,
    2,
    2,
    2,
    2,
    2,
  ]
`);
  });
});

describe("override set and unset", () => {
  it("set values and clear them, pruning empty levels", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    snapshot.push(
      run("override", "set", "breakpoint=sm", "--node", "blog-link", "design", "normal=missing")
        .code,
    );
    snapshot.push(read("overrides/breakpoint.json"));
    snapshot.push(
      run("override", "unset", "breakpoint=sm", "--node", "blog-link", "design", "normal").code,
    );
    snapshot.push(read("overrides/breakpoint.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "overrides": {
        "sm": {
          "nodes": {
            "blog-link": {
              "attributes": {
                "design": {
                  "normal": "missing",
                },
              },
            },
          },
        },
      },
      "version": 1,
    },
    0,
    {
      "overrides": {},
      "version": 1,
    },
  ]
`);
  });

  it("unset a whole override", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject(files);
    run("override", "states", "pointer=touch", "--type", "link", "--remove", "hovered");
    run("override", "set", "pointer=touch", "--type", "link", "design", "normal=missing");
    snapshot.push(run("override", "unset", "pointer=touch", "--type", "link").code);
    snapshot.push(read("overrides/pointer.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "overrides": {},
      "version": 1,
    },
  ]
`);
  });

  it("refuse unknown values and overrides that do not exist", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject(files);
    snapshot.push(
      run("override", "set", "pointer=touch", "--type", "link", "design", "normal=maybe").stderr,
    );
    snapshot.push(run("override", "unset", "pointer=touch", "--type", "link"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.dxn/overrides/pointer.json:9:25: unknown-value: "maybe" is not a declared value of "design"
  ",
    {
      "code": 1,
      "stderr": "dxn: no override for type link at pointer=touch
  ",
      "stdout": "",
    },
  ]
`);
  });
});
