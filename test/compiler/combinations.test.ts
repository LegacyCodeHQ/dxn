import { afterAll, describe, expect, it } from "vitest";
import {
  at,
  cleanup,
  compileFiles,
  diagnose,
  type Files,
  pointer,
  tree,
} from "../support/project.js";

afterAll(cleanup);

// Three dimensions over the page; blog-link is the only link inside all of them.
const project: Files = {
  ...tree,
  "types.json": {
    version: 1,
    attributes: { design: { values: ["available", "missing"] } },
    types: { link: { states: ["normal", "hovered", "selected"] } },
  },
  "dimensions/breakpoint.json": { version: 1, values: ["sm", "lg"], appliesTo: ["page"] },
  "dimensions/pointer.json": pointer,
  "dimensions/theme.json": { version: 1, values: ["light", "dark"], appliesTo: ["page"] },
};

const file = (byValue: unknown) => ({ version: 1, overrides: byValue });
const design = (values: Record<string, string>) => ({ attributes: { design: values } });
const smTouch = (body: unknown) => file({ sm: { touch: body } });
const c = at("overrides/breakpoint+pointer.json");
const combination = (doc: unknown, extra: Files = {}) =>
  diagnose({ ...project, ...extra, "overrides/breakpoint+pointer.json": doc });

describe("combination files", () => {
  it("override types and nodes for a combination of values", () => {
    const snapshot: unknown[] = [];
    const files = {
      ...project,
      "overrides/breakpoint+pointer.json": smTouch({
        types: { link: design({ normal: "missing" }) },
        nodes: { "blog-link": design({ selected: "missing" }) },
      }),
    };
    snapshot.push(diagnose(files));
    snapshot.push(compileFiles(files).project?.combinations["breakpoint+pointer"]?.overrides);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    {
      "sm": {
        "touch": {
          "nodes": {
            "blog-link": {
              "attributes": {
                "design": {
                  "selected": "missing",
                },
              },
            },
          },
          "types": {
            "link": {
              "attributes": {
                "design": {
                  "normal": "missing",
                },
              },
            },
          },
        },
      },
    },
  ]
`);
  });

  it("are named after declared dimensions, sorted and without repeats", () => {
    for (const [name, code] of [
      ["breakpoint+size", "undeclared-dimension"],
      ["pointer+breakpoint", "unsorted-dimensions"],
      ["pointer+pointer", "duplicate-dimension"],
      ["breakpoint+ pointer", "invalid-file-name"],
    ]) {
      const path = `overrides/${name}.json`;
      expect(diagnose({ ...project, [path]: file({}) })).toEqual([{ file: path, code, path: "$" }]);
    }
  });

  it("mean dimension names cannot contain +", () => {
    expect(diagnose({ ...project, "dimensions/a+b.json": pointer })).toEqual([
      { file: "dimensions/a+b.json", code: "invalid-file-name", path: "$" },
    ]);
  });

  it("report an unreadable file", () => {
    expect(combination(Buffer.from([0x5b, 0xff, 0x5d]))).toEqual([c("invalid-encoding", "$")]);
  });

  it("must be an object with version and overrides", () => {
    const snapshot: unknown[] = [];
    snapshot.push(combination([]));
    snapshot.push(combination({}));
    snapshot.push(combination({ ...file({}), extra: 1 }));
    snapshot.push(combination({ $schema: "x", ...file({}) }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "overrides/breakpoint+pointer.json",
        "path": "$",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "overrides/breakpoint+pointer.json",
        "path": "$.version",
      },
      {
        "code": "missing-key",
        "file": "overrides/breakpoint+pointer.json",
        "path": "$.overrides",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "overrides/breakpoint+pointer.json",
        "path": "$.extra",
      },
    ],
    [],
  ]
`);
  });

  it("nest one level per dimension, keyed by its values", () => {
    const snapshot: unknown[] = [];
    snapshot.push(combination(file([])));
    snapshot.push(combination(file({ xs: {} })));
    snapshot.push(combination(file({ sm: [] })));
    snapshot.push(combination(file({ sm: { pen: {} } })));
    snapshot.push(combination(smTouch({ screens: {} })));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "overrides/breakpoint+pointer.json",
        "path": "$.overrides",
      },
    ],
    [
      {
        "code": "unknown-dimension-value",
        "file": "overrides/breakpoint+pointer.json",
        "path": "$.overrides.xs",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "overrides/breakpoint+pointer.json",
        "path": "$.overrides.sm",
      },
    ],
    [
      {
        "code": "unknown-dimension-value",
        "file": "overrides/breakpoint+pointer.json",
        "path": "$.overrides.sm.pen",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "overrides/breakpoint+pointer.json",
        "path": "$.overrides.sm.touch.screens",
      },
    ],
  ]
`);
  });

  it("apply only to nodes every dimension applies to", () => {
    expect(
      combination(smTouch({ nodes: { "footer-link": {} } }), {
        "dimensions/breakpoint.json": {
          version: 1,
          values: ["sm", "lg"],
          appliesTo: ["page", "footer-link"],
        },
      }),
    ).toEqual([c("node-out-of-scope", "$.overrides.sm.touch.nodes.footer-link")]);
  });
});

describe("combination states", () => {
  const noHoverOnTouch = {
    "overrides/pointer.json": file({
      touch: { types: { link: { states: { remove: ["hovered"] } } } },
    }),
  };

  it("start from the states the single-dimension overrides leave", () => {
    const snapshot: unknown[] = [];
    snapshot.push(
      combination(smTouch({ types: { link: design({ hovered: "missing" }) } }), noHoverOnTouch),
    );
    snapshot.push(
      combination(smTouch({ types: { link: { states: { add: ["hovered"] } } } }), noHoverOnTouch),
    );

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "removed-state",
        "file": "overrides/breakpoint+pointer.json",
        "path": "$.overrides.sm.touch.types.link.attributes.design.hovered",
      },
    ],
    [],
  ]
`);
  });

  it("start nodes from their own single-dimension overrides", () => {
    expect(
      combination(smTouch({ nodes: { "blog-link": design({ selected: "missing" }) } }), {
        "overrides/pointer.json": file({
          touch: { nodes: { "blog-link": { states: { remove: ["selected"] } } } },
        }),
      }),
    ).toEqual([
      c("removed-state", "$.overrides.sm.touch.nodes.blog-link.attributes.design.selected"),
    ]);
  });

  it("start nodes from states their own single-dimension overrides restore", () => {
    expect(
      combination(smTouch({ nodes: { "blog-link": design({ hovered: "missing" }) } }), {
        "overrides/pointer.json": file({
          touch: {
            types: { link: { states: { remove: ["hovered"] } } },
            nodes: { "blog-link": { states: { add: ["hovered"] } } },
          },
        }),
      }),
    ).toEqual([]);
  });

  it("are used for verification contexts", () => {
    const snapshot: unknown[] = [];
    const files = {
      ...project,
      "types.json": {
        version: 1,
        checks: { visual: {} },
        types: { link: { states: ["normal", "hovered", "selected"], checks: ["visual"] } },
      },
      ...noHoverOnTouch,
      "overrides/breakpoint+pointer.json": smTouch({
        types: { link: { states: { add: ["hovered"] } } },
      }),
    };
    const record = (breakpoint: string) => ({
      version: 1,
      records: [
        {
          node: "blog-link",
          context: { state: "hovered", breakpoint, pointer: "touch", theme: "light" },
          check: "visual",
          result: "passed",
          by: "agent",
          at: "2026-10-30T19:20:00Z",
        },
      ],
    });
    snapshot.push(diagnose({ ...files, "verification/page.json": record("sm") }));
    snapshot.push(diagnose({ ...files, "verification/page.json": record("lg") }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      {
        "code": "removed-state",
        "file": "verification/page.json",
        "path": "$.records[0].context.state",
      },
    ],
  ]
`);
  });
});

describe("combinations and conflicts", () => {
  const typeConflict = {
    "overrides/breakpoint.json": file({ sm: { types: { link: design({ normal: "missing" }) } } }),
    "overrides/pointer.json": file({ touch: { types: { link: design({ normal: "available" }) } } }),
  };
  const conflict = { file: "overrides/pointer.json", code: "conflicting-override" };

  it("resolve a type conflict by setting the value for the combination", () => {
    expect(
      combination(smTouch({ types: { link: design({ normal: "available" }) } }), typeConflict),
    ).toEqual([]);
  });

  it("resolve a node conflict with a node combination override", () => {
    expect(
      combination(smTouch({ nodes: { "blog-link": design({ normal: "missing" }) } }), {
        "overrides/breakpoint.json": file({
          sm: { nodes: { "blog-link": design({ normal: "missing" }) } },
        }),
        "overrides/pointer.json": file({
          touch: { nodes: { "blog-link": design({ normal: "available" }) } },
        }),
      }),
    ).toEqual([]);
  });

  it("resolve a contested state by adding or removing it", () => {
    const contested = {
      "overrides/breakpoint.json": file({
        sm: { nodes: { "blog-link": { states: { remove: ["hovered"] } } } },
      }),
      "overrides/pointer.json": file({
        touch: {
          types: { link: { states: { remove: ["hovered"] } } },
          nodes: { "blog-link": { states: { add: ["hovered"] } } },
        },
      }),
    };
    for (const change of [{ add: ["hovered"] }, { remove: ["hovered"] }]) {
      expect(
        combination(smTouch({ nodes: { "blog-link": { states: change } } }), contested),
      ).toEqual([]);
    }
  });

  it("do not resolve a conflict for only some of its contexts", () => {
    expect(
      diagnose({
        ...project,
        ...typeConflict,
        "overrides/pointer+theme.json": file({
          touch: { dark: { types: { link: design({ normal: "available" }) } } },
        }),
      }),
    ).toEqual([{ ...conflict, path: "$.overrides.touch.types.link.attributes.design.normal" }]);
  });

  it("beat single-dimension overrides from other dimensions", () => {
    expect(
      combination(smTouch({ types: { link: design({ normal: "available" }) } }), {
        "overrides/theme.json": file({ dark: { types: { link: design({ normal: "missing" }) } } }),
      }),
    ).toEqual([]);
  });

  it("conflict with each other when equally specific", () => {
    const result = compileFiles({
      ...project,
      "overrides/breakpoint+pointer.json": smTouch({
        types: { link: design({ normal: "missing" }) },
      }),
      "overrides/pointer+theme.json": file({
        touch: { dark: { types: { link: design({ normal: "available" }) } } },
      }),
    });
    expect(result.diagnostics).toMatchObject([
      {
        file: "overrides/pointer+theme.json",
        code: "conflicting-override",
        path: "$.overrides.touch.dark.types.link.attributes.design.normal",
        message:
          'conflicts with breakpoint=sm and pointer=touch, which sets "missing" (overrides/breakpoint+pointer.json); both apply when breakpoint=sm and pointer=touch and theme=dark',
      },
    ]);
  });
});
