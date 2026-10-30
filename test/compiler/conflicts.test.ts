import { afterAll, describe, expect, it } from "vitest";
import {
  cleanup,
  compileFiles,
  diagnose,
  type Files,
  pointer,
  rootFile,
  tree,
} from "../support/project.js";

afterAll(cleanup);

// breakpoint and pointer both apply to the page; blog-link is the only link
// in both scopes. footer-link is outside both.
const project: Files = {
  ...tree,
  "types.json": {
    version: 1,
    attributes: { design: { values: ["available", "missing"] } },
    types: { link: { states: ["normal", "hovered", "selected"] } },
  },
  "dimensions/breakpoint.json": { version: 1, values: ["sm", "lg"], appliesTo: ["page"] },
  "dimensions/pointer.json": pointer,
};

const overrides = (byValue: unknown) => ({ version: 1, overrides: byValue });
const design = (values: Record<string, string>) => ({ attributes: { design: values } });
const conflicts = (breakpoint: unknown, touch: unknown, extra: Files = {}) =>
  diagnose({
    ...project,
    "overrides/breakpoint.json": overrides({ sm: breakpoint }),
    "overrides/pointer.json": overrides({ touch }),
    ...extra,
  });
const conflict = (path: string) => ({
  file: "overrides/pointer.json",
  code: "conflicting-override",
  path: `$.overrides.touch.${path}`,
});

describe("conflicting overrides", () => {
  it("report two dimensions setting a type's value differently", () => {
    expect(
      conflicts(
        { types: { link: design({ normal: "missing" }) } },
        { types: { link: design({ normal: "available" }) } },
      ),
    ).toEqual([conflict("types.link.attributes.design.normal")]);
  });

  it("report two dimensions setting a node's value differently", () => {
    expect(
      conflicts(
        { nodes: { "blog-link": design({ normal: "missing" }) } },
        { nodes: { "blog-link": design({ normal: "available" }) } },
      ),
    ).toEqual([conflict("nodes.blog-link.attributes.design.normal")]);
  });

  it("report one dimension removing a node's state that another adds", () => {
    expect(
      conflicts(
        { nodes: { "blog-link": { states: { remove: ["hovered"] } } } },
        {
          types: { link: { states: { remove: ["hovered"] } } },
          nodes: { "blog-link": { states: { add: ["hovered"] } } },
        },
      ),
    ).toEqual([conflict("nodes.blog-link.states.add[0]")]);
  });

  it("explain which override it conflicts with and where they meet", () => {
    const result = compileFiles({
      ...project,
      "overrides/breakpoint.json": overrides({
        sm: { types: { link: design({ normal: "missing" }) } },
      }),
      "overrides/pointer.json": overrides({
        touch: { types: { link: design({ normal: "available" }) } },
      }),
    });
    expect(result.diagnostics.map(({ message }) => message)).toEqual([
      'conflicts with breakpoint=sm, which sets "missing" (overrides/breakpoint.json); both apply when breakpoint=sm and pointer=touch',
    ]);
  });

  it("do not report the same value set twice", () => {
    expect(
      conflicts(
        { types: { link: design({ normal: "missing" }) } },
        { types: { link: design({ normal: "missing" }) } },
      ),
    ).toEqual([]);
  });

  it("do not report different states, attributes or values of one dimension", () => {
    const snapshot: unknown[] = [];
    snapshot.push(
      conflicts(
        { types: { link: design({ normal: "missing" }) } },
        {
          types: {
            link: { ...design({ selected: "available" }), states: { remove: ["hovered"] } },
          },
        },
      ),
    );
    snapshot.push(
      diagnose({
        ...project,
        "overrides/pointer.json": overrides({
          mouse: { types: { link: design({ normal: "missing" }) } },
          touch: { types: { link: design({ normal: "available" }) } },
        }),
      }),
    );

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [],
  ]
`);
  });

  it("let an instance override beat type overrides from other dimensions", () => {
    expect(
      conflicts(
        { types: { link: design({ normal: "missing" }) } },
        { nodes: { "blog-link": design({ normal: "available" }) } },
      ),
    ).toEqual([]);
  });

  it("do not report a type conflict every affected instance overrides", () => {
    const typeConflict = [
      { types: { link: design({ normal: "missing" }) } },
      { types: { link: design({ normal: "available" }) } },
    ] as const;
    const snapshot: unknown[] = [];
    // blog-link sets the value itself in its node file...
    snapshot.push(
      conflicts(...typeConflict, {
        "roots/page.json": rootFile({
          id: "page",
          title: "Page",
          children: [
            {
              id: "blog-link",
              title: "Blog link",
              type: "link",
              ...design({ normal: "available" }),
            },
          ],
        }),
      }),
    );
    // ...or in an override for one of the two values.
    snapshot.push(
      conflicts(typeConflict[0], {
        ...typeConflict[1],
        nodes: { "blog-link": design({ normal: "missing" }) },
      }),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [],
      ]
    `);
  });

  it("do not report dimensions whose scopes share no instance", () => {
    expect(
      conflicts(
        { types: { link: design({ normal: "missing" }) } },
        { types: { link: design({ normal: "available" }) } },
        {
          "dimensions/breakpoint.json": { version: 1, values: ["sm"], appliesTo: ["footer-link"] },
        },
      ),
    ).toEqual([]);
  });
});
