import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const types = {
  version: 1,
  checks: { visual: {} },
  types: { link: { states: ["normal", "hovered"], checks: ["visual"] } },
};
const page = rootFile({
  id: "page",
  title: "Page",
  children: [
    { id: "a", title: "A", type: "link" },
    { id: "b", title: "B" },
  ],
});

describe("dimension add and remove", () => {
  it("add a dimension file, with or without a default", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject({ "types.json": types, "roots/page.json": page });
    snapshot.push(
      run(
        "dimension",
        "add",
        "breakpoint",
        "--values",
        "base,sm,lg",
        "--applies-to",
        "page",
        "--default",
        "lg",
      ).code,
    );
    snapshot.push(read("dimensions/breakpoint.json"));
    snapshot.push(
      run("dimension", "add", "pointer", "--values", "mouse,touch", "--applies-to", "a,b").code,
    );
    snapshot.push(read("dimensions/pointer.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "appliesTo": [
        "page",
      ],
      "default": "lg",
      "values": [
        "base",
        "sm",
        "lg",
      ],
      "version": 1,
    },
    0,
    {
      "appliesTo": [
        "a",
        "b",
      ],
      "values": [
        "mouse",
        "touch",
      ],
      "version": 1,
    },
  ]
`);
  });

  it("refuse existing dimensions, invalid ones and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({ "types.json": types, "roots/page.json": page });
    run("dimension", "add", "pointer", "--values", "mouse", "--applies-to", "page");
    snapshot.push(run("dimension", "add", "pointer", "--values", "x", "--applies-to", "page"));
    snapshot.push(
      run("dimension", "add", "theme", "--values", "dark", "--applies-to", "nope").stderr,
    );
    snapshot.push(run("dimension", "add", "theme", "--applies-to", "page").code);
    snapshot.push(run("dimension", "add", "theme", "--values", "dark").code);
    snapshot.push(run("dimension").code);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "code": 1,
          "stderr": "dimensions: dimension "pointer" already exists
      ",
          "stdout": "",
        },
        "<tmp>/.dimensions/dimensions/theme.json:4:17: unknown-node: node "nope" does not exist
      ",
        2,
        0,
        2,
      ]
    `);
  });

  it("remove a dimension unless its overrides remain", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = cliProject({
      "types.json": types,
      "roots/page.json": page,
      "dimensions/pointer.json": { version: 1, values: ["mouse"], appliesTo: ["page"] },
      "dimensions/theme.json": { version: 1, values: ["dark"], appliesTo: ["page"] },
      "overrides/theme.json": { version: 1, overrides: {} },
    });
    snapshot.push(run("dimension", "remove", "pointer").code);
    snapshot.push(exists("dimensions/pointer.json"));
    snapshot.push(run("dimension", "remove", "theme").stderr);
    snapshot.push(run("dimension", "remove", "size"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    false,
    "<tmp>/.dimensions/overrides/theme.json:1:1: undeclared-dimension: no dimensions/theme.json declares this dimension
  ",
    {
      "code": 1,
      "stderr": "dimensions: dimension not found: size
  ",
      "stdout": "",
    },
  ]
`);
  });
});

describe("dimension values, default and scope", () => {
  const project = () =>
    cliProject({
      "types.json": types,
      "roots/page.json": page,
      "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["a"] },
    });

  it("add and remove values, set and clear the default", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project();
    snapshot.push(run("dimension", "add-value", "pointer", "pen").code);
    snapshot.push(run("dimension", "remove-value", "pointer", "touch").code);
    snapshot.push(run("dimension", "set-default", "pointer", "mouse").code);
    snapshot.push(read("dimensions/pointer.json"));
    snapshot.push(run("dimension", "set-default", "pointer", "--none").code);
    snapshot.push(read("dimensions/pointer.json"));
    snapshot.push(run("dimension", "set-default", "pointer", "nope").stderr);
    snapshot.push(run("dimension", "set-default", "pointer").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    0,
    0,
    {
      "appliesTo": [
        "a",
      ],
      "default": "mouse",
      "values": [
        "mouse",
        "pen",
      ],
      "version": 1,
    },
    0,
    {
      "appliesTo": [
        "a",
      ],
      "values": [
        "mouse",
        "pen",
      ],
      "version": 1,
    },
    "<tmp>/.dimensions/dimensions/pointer.json:4:14: unknown-dimension-value: default "nope" is not one of the values
  ",
    2,
  ]
`);
  });

  it("apply to and unapply from nodes", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project();
    snapshot.push(run("dimension", "apply", "pointer", "b").code);
    snapshot.push(run("dimension", "unapply", "pointer", "a").code);
    snapshot.push(read("dimensions/pointer.json"));
    snapshot.push(run("dimension", "unapply", "pointer", "a"));
    snapshot.push(run("dimension", "unapply", "pointer", "b").stderr);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        0,
        {
          "appliesTo": [
            "b",
          ],
          "values": [
            "mouse",
            "touch",
          ],
          "version": 1,
        },
        {
          "code": 1,
          "stderr": "dimensions: dimension "pointer" does not apply to "a"
      ",
          "stdout": "",
        },
        "",
      ]
    `);
  });

  it("refuse to remove a value still in use", () => {
    const { run } = cliProject({
      "types.json": types,
      "roots/page.json": page,
      "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["a"] },
      "overrides/pointer.json": { version: 1, overrides: { touch: {} } },
    });
    expect(run("dimension", "remove-value", "pointer", "touch").stderr).toContain(
      "unknown-dimension-value",
    );
  });
});

describe("dimension rename-value", () => {
  it("renames the value everywhere it is used", () => {
    const snapshot: unknown[] = [];
    const record = {
      node: "a",
      context: { state: "normal", breakpoint: "0", pointer: "mouse" },
      check: "visual",
      result: "passed",
      by: "agent",
      at: "2026-10-30T19:20:00Z",
    };
    const { run, read } = cliProject({
      "types.json": { ...types, attributes: { design: { values: ["missing"] } } },
      "roots/page.json": page,
      "dimensions/breakpoint.json": {
        version: 1,
        values: ["0", "960"],
        default: "0",
        appliesTo: ["page"],
      },
      "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["page"] },
      "overrides/breakpoint.json": {
        version: 1,
        only: { b: ["0"] },
        overrides: {
          "0": { nodes: { a: { attributes: { design: { normal: "missing" } } } } },
        },
      },
      "overrides/breakpoint+pointer.json": {
        version: 1,
        overrides: { "0": { mouse: { types: { link: { states: { remove: ["hovered"] } } } } } },
      },
      "verification/page.json": { version: 1, records: [record] },
    });
    snapshot.push(run("dimension", "rename-value", "breakpoint", "0", "base").code);
    snapshot.push(read("dimensions/breakpoint.json"));
    snapshot.push(read("overrides/breakpoint.json"));
    snapshot.push(read("overrides/breakpoint+pointer.json"));
    snapshot.push(read("verification/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "appliesTo": [
            "page",
          ],
          "default": "base",
          "values": [
            "base",
            "960",
          ],
          "version": 1,
        },
        {
          "only": {
            "b": [
              "base",
            ],
          },
          "overrides": {
            "base": {
              "nodes": {
                "a": {
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
        {
          "overrides": {
            "base": {
              "mouse": {
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
          },
          "version": 1,
        },
        {
          "records": [
            {
              "at": "2026-10-30T19:20:00Z",
              "by": "agent",
              "check": "visual",
              "context": {
                "breakpoint": "base",
                "pointer": "mouse",
                "state": "normal",
              },
              "node": "a",
              "result": "passed",
            },
          ],
          "version": 1,
        },
      ]
    `);
  });

  it("renames the second dimension of a combination at its own level", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject({
      "types.json": types,
      "roots/page.json": page,
      "dimensions/breakpoint.json": { version: 1, values: ["sm"], appliesTo: ["page"] },
      "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["page"] },
      "overrides/breakpoint+pointer.json": {
        version: 1,
        overrides: { sm: { touch: { types: { link: { states: { remove: ["hovered"] } } } } } },
      },
    });
    snapshot.push(run("dimension", "rename-value", "pointer", "touch", "finger").code);
    snapshot.push(read("overrides/breakpoint+pointer.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "overrides": {
        "sm": {
          "finger": {
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
      },
      "version": 1,
    },
  ]
`);
  });

  it("refuses an unknown value", () => {
    const { run } = cliProject({
      "types.json": types,
      "roots/page.json": page,
      "dimensions/pointer.json": { version: 1, values: ["mouse"], appliesTo: ["page"] },
    });
    expect(run("dimension", "rename-value", "pointer", "pen", "stylus")).toMatchObject({
      code: 1,
      stderr: 'dimensions: dimension "pointer" has no value "pen"\n',
    });
  });
});

describe("a dimension before any node", () => {
  it("can be added, used by profiles, and applied once nodes exist", () => {
    const { run, read, exists } = cliProject({ "types.json": { version: 1 } });
    const snapshot: unknown[] = [];
    snapshot.push(run("dimension", "add", "breakpoint", "--values", "base,lg").code);
    snapshot.push(read("dimensions/breakpoint.json"));
    snapshot.push(
      run("profile", "add", "phone", "breakpoint=base", "desktop", "breakpoint=lg").code,
    );
    snapshot.push(run("node", "add", "page", "--title", "Page").code);
    snapshot.push(run("dimension", "apply", "breakpoint", "page").code);
    snapshot.push(read("dimensions/breakpoint.json").appliesTo);
    snapshot.push(JSON.parse(run("contexts", "page", "--count").stdout).count);
    snapshot.push(run("dimension", "unapply", "breakpoint", "page").code);
    snapshot.push("appliesTo" in read("dimensions/breakpoint.json"));
    snapshot.push(JSON.parse(run("dimension", "list").stdout).dimensions[0].appliesTo);
    snapshot.push(exists("profiles.json"));
    expect(snapshot).toEqual([
      0,
      { version: 1, values: ["base", "lg"] },
      0,
      0,
      0,
      ["page"],
      2,
      0,
      false,
      [],
      true,
    ]);
  });
});
