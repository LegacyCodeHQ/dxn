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
    customAttributes: { design: { values: ["available", "missing"] } },
    types: { link: { states: ["normal", "hovered", "selected"] } },
  },
  "dimensions/breakpoint.json": { version: 1, values: ["sm", "lg"], appliesTo: ["page"] },
  "dimensions/pointer.json": pointer,
  "dimensions/theme.json": { version: 1, values: ["light", "dark"], appliesTo: ["page"] },
};

const file = (byValue: unknown) => ({ version: 1, overrides: byValue });
const design = (values: Record<string, string>) => ({ customAttributes: { design: values } });
const smTouch = (body: unknown) => file({ sm: { touch: body } });
const c = at("overrides/breakpoint+pointer.json");
const combination = (doc: unknown, extra: Files = {}) =>
  diagnose({ ...project, ...extra, "overrides/breakpoint+pointer.json": doc });

describe("combination files", () => {
  it("override types and tasks for a combination of values", () => {
    const files = {
      ...project,
      "overrides/breakpoint+pointer.json": smTouch({
        types: { link: design({ normal: "missing" }) },
        tasks: { "blog-link": design({ selected: "missing" }) },
      }),
    };
    expect(diagnose(files)).toEqual([]);
    expect(compileFiles(files).project?.combinations["breakpoint+pointer"]?.overrides).toEqual({
      sm: {
        touch: {
          types: { link: design({ normal: "missing" }) },
          tasks: { "blog-link": design({ selected: "missing" }) },
        },
      },
    });
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
    expect(combination([])).toEqual([c("wrong-type", "$")]);
    expect(combination({})).toEqual([
      c("missing-key", "$.version"),
      c("missing-key", "$.overrides"),
    ]);
    expect(combination({ ...file({}), extra: 1 })).toEqual([c("unknown-key", "$.extra")]);
    expect(combination({ $schema: "x", ...file({}) })).toEqual([]);
  });

  it("nest one level per dimension, keyed by its values", () => {
    expect(combination(file([]))).toEqual([c("wrong-type", "$.overrides")]);
    expect(combination(file({ xs: {} }))).toEqual([c("unknown-dimension-value", "$.overrides.xs")]);
    expect(combination(file({ sm: [] }))).toEqual([c("wrong-type", "$.overrides.sm")]);
    expect(combination(file({ sm: { pen: {} } }))).toEqual([
      c("unknown-dimension-value", "$.overrides.sm.pen"),
    ]);
    expect(combination(smTouch({ screens: {} }))).toEqual([
      c("unknown-key", "$.overrides.sm.touch.screens"),
    ]);
  });

  it("apply only to tasks every dimension applies to", () => {
    expect(
      combination(smTouch({ tasks: { "footer-link": {} } }), {
        "dimensions/breakpoint.json": {
          version: 1,
          values: ["sm", "lg"],
          appliesTo: ["page", "footer-link"],
        },
      }),
    ).toEqual([c("task-out-of-scope", "$.overrides.sm.touch.tasks.footer-link")]);
  });
});

describe("combination states", () => {
  const noHoverOnTouch = {
    "overrides/pointer.json": file({
      touch: { types: { link: { states: { remove: ["hovered"] } } } },
    }),
  };

  it("start from the states the single-dimension overrides leave", () => {
    expect(
      combination(smTouch({ types: { link: design({ hovered: "missing" }) } }), noHoverOnTouch),
    ).toEqual([
      c("removed-state", "$.overrides.sm.touch.types.link.customAttributes.design.hovered"),
    ]);
    expect(
      combination(smTouch({ types: { link: { states: { add: ["hovered"] } } } }), noHoverOnTouch),
    ).toEqual([]);
  });

  it("start tasks from their own single-dimension overrides", () => {
    expect(
      combination(smTouch({ tasks: { "blog-link": design({ selected: "missing" }) } }), {
        "overrides/pointer.json": file({
          touch: { tasks: { "blog-link": { states: { remove: ["selected"] } } } },
        }),
      }),
    ).toEqual([
      c("removed-state", "$.overrides.sm.touch.tasks.blog-link.customAttributes.design.selected"),
    ]);
  });

  it("start tasks from states their own single-dimension overrides restore", () => {
    expect(
      combination(smTouch({ tasks: { "blog-link": design({ hovered: "missing" }) } }), {
        "overrides/pointer.json": file({
          touch: {
            types: { link: { states: { remove: ["hovered"] } } },
            tasks: { "blog-link": { states: { add: ["hovered"] } } },
          },
        }),
      }),
    ).toEqual([]);
  });

  it("are used for verification contexts", () => {
    const files = {
      ...project,
      "types.json": {
        version: 1,
        customChecks: { visual: {} },
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
          task: "blog-link",
          context: { state: "hovered", breakpoint, pointer: "touch", theme: "light" },
          check: "visual",
          result: "passed",
          by: "agent",
          at: "2026-10-30T19:20:00Z",
        },
      ],
    });
    expect(diagnose({ ...files, "verification/page.json": record("sm") })).toEqual([]);
    expect(diagnose({ ...files, "verification/page.json": record("lg") })).toEqual([
      { file: "verification/page.json", code: "removed-state", path: "$.records[0].context.state" },
    ]);
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

  it("resolve a task conflict with a task combination override", () => {
    expect(
      combination(smTouch({ tasks: { "blog-link": design({ normal: "missing" }) } }), {
        "overrides/breakpoint.json": file({
          sm: { tasks: { "blog-link": design({ normal: "missing" }) } },
        }),
        "overrides/pointer.json": file({
          touch: { tasks: { "blog-link": design({ normal: "available" }) } },
        }),
      }),
    ).toEqual([]);
  });

  it("resolve a contested state by adding or removing it", () => {
    const contested = {
      "overrides/breakpoint.json": file({
        sm: { tasks: { "blog-link": { states: { remove: ["hovered"] } } } },
      }),
      "overrides/pointer.json": file({
        touch: {
          types: { link: { states: { remove: ["hovered"] } } },
          tasks: { "blog-link": { states: { add: ["hovered"] } } },
        },
      }),
    };
    for (const change of [{ add: ["hovered"] }, { remove: ["hovered"] }]) {
      expect(
        combination(smTouch({ tasks: { "blog-link": { states: change } } }), contested),
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
    ).toEqual([
      { ...conflict, path: "$.overrides.touch.types.link.customAttributes.design.normal" },
    ]);
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
        path: "$.overrides.touch.dark.types.link.customAttributes.design.normal",
        message:
          'conflicts with breakpoint=sm and pointer=touch, which sets "missing" (overrides/breakpoint+pointer.json); both apply when breakpoint=sm and pointer=touch and theme=dark',
      },
    ]);
  });
});
