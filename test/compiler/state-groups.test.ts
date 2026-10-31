import { afterAll, describe, expect, it } from "vitest";
import { cleanup, diagnose, type Files, rootFile } from "../support/project.js";

afterAll(cleanup);

const stateGroups = {
  interaction: ["normal", "hovered", "focused"],
  selection: ["unselected", "selected"],
};

const withTypes = (types: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  diagnose({ "types.json": { version: 1, stateGroups, types, ...extra } });

describe("state group declarations", () => {
  it("declare named groups of values", () => {
    expect(withTypes({})).toEqual([]);
  });

  it("must be valid, with valid unique values, and not named state", () => {
    const declare = (groups: unknown) =>
      diagnose({ "types.json": { version: 1, stateGroups: groups } });
    const snapshot: unknown[] = [];
    snapshot.push(declare([]));
    snapshot.push(declare({ interaction: "normal" }));
    snapshot.push(declare({ interaction: [] }));
    snapshot.push(declare({ interaction: ["normal", "normal"] }));
    snapshot.push(declare({ " interaction": ["normal"] }));
    snapshot.push(declare({ state: ["normal"] }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "wrong-type",
            "file": "types.json",
            "path": "$.stateGroups",
          },
        ],
        [
          {
            "code": "wrong-type",
            "file": "types.json",
            "path": "$.stateGroups.interaction",
          },
        ],
        [
          {
            "code": "empty-values",
            "file": "types.json",
            "path": "$.stateGroups.interaction",
          },
        ],
        [
          {
            "code": "duplicate-value",
            "file": "types.json",
            "path": "$.stateGroups.interaction[1]",
          },
        ],
        [
          {
            "code": "surrounding-whitespace",
            "file": "types.json",
            "path": "$.stateGroups[" interaction"]",
          },
        ],
        [
          {
            "code": "reserved-name",
            "file": "types.json",
            "path": "$.stateGroups.state",
          },
        ],
      ]
    `);
  });
});

describe("types using state groups", () => {
  it("use whole groups or part of one", () => {
    expect(
      withTypes({
        "toolbar-link": { stateGroups: ["interaction", "selection"] },
        wordmark: { stateGroups: { interaction: ["normal", "focused"] } },
      }),
    ).toEqual([]);
  });

  it("report undeclared groups, values outside the group and repeats", () => {
    const snapshot: unknown[] = [];
    snapshot.push(withTypes({ link: { stateGroups: ["size"] } }));
    snapshot.push(withTypes({ link: { stateGroups: ["interaction", "interaction"] } }));
    snapshot.push(withTypes({ link: { stateGroups: { interaction: ["pressed"] } } }));
    snapshot.push(withTypes({ link: { stateGroups: { interaction: [] } } }));
    snapshot.push(withTypes({ link: { stateGroups: "interaction" } }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "undeclared-state-group",
            "file": "types.json",
            "path": "$.types.link.stateGroups[0]",
          },
        ],
        [
          {
            "code": "duplicate-state-group",
            "file": "types.json",
            "path": "$.types.link.stateGroups[1]",
          },
        ],
        [
          {
            "code": "unknown-state",
            "file": "types.json",
            "path": "$.types.link.stateGroups.interaction[0]",
          },
        ],
        [
          {
            "code": "empty-values",
            "file": "types.json",
            "path": "$.types.link.stateGroups.interaction",
          },
        ],
        [
          {
            "code": "wrong-type",
            "file": "types.json",
            "path": "$.types.link.stateGroups",
          },
        ],
      ]
    `);
  });

  it("cannot also list plain states, or use groups that share a value", () => {
    const snapshot: unknown[] = [];
    snapshot.push(withTypes({ link: { states: ["normal"], stateGroups: ["selection"] } }));
    snapshot.push(
      withTypes(
        { link: { stateGroups: ["interaction", "other"] } },
        {
          stateGroups: { ...stateGroups, other: ["normal", "pressed"] },
        },
      ),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "states-and-groups",
            "file": "types.json",
            "path": "$.types.link.stateGroups",
          },
        ],
        [
          {
            "code": "ambiguous-state",
            "file": "types.json",
            "path": "$.types.link.stateGroups[1]",
          },
        ],
      ]
    `);
  });

  it("make shared types use a single group", () => {
    const snapshot: unknown[] = [];
    snapshot.push(withTypes({ menu: { stateGroups: ["selection"], shared: true } }));
    snapshot.push(withTypes({ menu: { stateGroups: ["interaction", "selection"], shared: true } }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [
          {
            "code": "shared-with-several-groups",
            "file": "types.json",
            "path": "$.types.menu.shared",
          },
        ],
      ]
    `);
  });
});

// A page with a grouped link, a pointer dimension and verification records.
const project = (extra: Files = {}): Files => ({
  "types.json": {
    version: 1,
    stateGroups,
    attributes: { design: { values: ["available", "missing"] } },
    checks: { visual: {} },
    types: {
      link: {
        stateGroups: ["interaction", "selection"],
        checks: ["visual"],
        attributes: { design: { hovered: "missing", selected: "available" } },
      },
    },
  },
  "roots/page.json": rootFile({
    id: "page",
    title: "Page",
    children: [{ id: "blog-link", title: "Blog link", type: "link" }],
  }),
  "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["page"] },
  ...extra,
});

describe("grouped states elsewhere", () => {
  it("are overridden by value, within the value's group", () => {
    const overrides = (states: unknown) =>
      diagnose(
        project({
          "overrides/pointer.json": {
            version: 1,
            overrides: { touch: { types: { link: { states } } } },
          },
        }),
      );
    const snapshot: unknown[] = [];
    snapshot.push(overrides({ remove: ["hovered", "focused"] }));
    snapshot.push(overrides({ remove: ["pressed"] }));
    snapshot.push(overrides({ add: ["pressed"] }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [
          {
            "code": "unknown-state",
            "file": "overrides/pointer.json",
            "path": "$.overrides.touch.types.link.states.remove[0]",
          },
        ],
        [
          {
            "code": "unknown-state",
            "file": "overrides/pointer.json",
            "path": "$.overrides.touch.types.link.states.add[0]",
          },
        ],
      ]
    `);
  });

  it("are named one value per group in verification contexts", () => {
    const record = (context: Record<string, string>) => ({
      node: "blog-link",
      context,
      check: "visual",
      result: "passed",
      actor: "agent",
      at: "2026-10-30T19:20:00Z",
    });
    const verify = (...records: unknown[]) =>
      diagnose(
        project({
          "overrides/pointer.json": {
            version: 1,
            overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
          },
          "actors.json": { version: 1, actors: { agent: { checks: ["visual"] } } },
          "verification/page.json": { version: 1, records },
        }),
      );
    const snapshot: unknown[] = [];
    snapshot.push(
      verify(record({ interaction: "hovered", selection: "selected", pointer: "mouse" })),
    );
    snapshot.push(verify(record({ interaction: "hovered", pointer: "mouse" })));
    snapshot.push(verify(record({ state: "hovered", selection: "selected", pointer: "mouse" })));
    snapshot.push(
      verify(record({ interaction: "selected", selection: "selected", pointer: "mouse" })),
    );
    snapshot.push(
      verify(record({ interaction: "hovered", selection: "selected", pointer: "touch" })),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [
          {
            "code": "missing-key",
            "file": "verification/page.json",
            "path": "$.records[0].context.selection",
          },
        ],
        [
          {
            "code": "unknown-key",
            "file": "verification/page.json",
            "path": "$.records[0].context.state",
          },
          {
            "code": "missing-key",
            "file": "verification/page.json",
            "path": "$.records[0].context.interaction",
          },
        ],
        [
          {
            "code": "unknown-state",
            "file": "verification/page.json",
            "path": "$.records[0].context.interaction",
          },
        ],
        [
          {
            "code": "removed-state",
            "file": "verification/page.json",
            "path": "$.records[0].context.interaction",
          },
        ],
      ]
    `);
  });

  it("cannot share a name with a dimension", () => {
    expect(
      diagnose(
        project({
          "dimensions/selection.json": { version: 1, values: ["x"], appliesTo: ["page"] },
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "code": "reserved-name",
          "file": "dimensions/selection.json",
          "path": "$",
        },
      ]
    `);
  });
});
