import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const types = {
  version: 1,
  customChecks: { visual: {} },
  types: { link: { states: ["normal", "hovered"], checks: ["visual"] } },
};
const page = taskFile({
  id: "page",
  title: "Page",
  children: [
    { id: "a", title: "A", type: "link" },
    { id: "b", title: "B" },
  ],
});

describe("dimension add and remove", () => {
  it("add a dimension file, with or without a default", () => {
    const { run, read } = cliProject({ "types.json": types, "tasks/page.json": page });
    expect(
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
    ).toBe(0);
    expect(read("dimensions/breakpoint.json")).toEqual({
      version: 1,
      values: ["base", "sm", "lg"],
      default: "lg",
      appliesTo: ["page"],
    });
    expect(
      run("dimension", "add", "pointer", "--values", "mouse,touch", "--applies-to", "a,b").code,
    ).toBe(0);
    expect(read("dimensions/pointer.json")).toEqual({
      version: 1,
      values: ["mouse", "touch"],
      appliesTo: ["a", "b"],
    });
  });

  it("refuse existing dimensions, invalid ones and usage errors", () => {
    const { run } = cliProject({ "types.json": types, "tasks/page.json": page });
    run("dimension", "add", "pointer", "--values", "mouse", "--applies-to", "page");
    expect(
      run("dimension", "add", "pointer", "--values", "x", "--applies-to", "page"),
    ).toMatchObject({
      code: 1,
      stderr: 'task-tree: dimension "pointer" already exists\n',
    });
    expect(
      run("dimension", "add", "theme", "--values", "dark", "--applies-to", "nope").stderr,
    ).toContain("unknown-task");
    expect(run("dimension", "add", "theme", "--applies-to", "page").code).toBe(2);
    expect(run("dimension", "add", "theme", "--values", "dark").code).toBe(2);
    expect(run("dimension").code).toBe(2);
  });

  it("remove a dimension unless its overrides remain", () => {
    const { run, exists } = cliProject({
      "types.json": types,
      "tasks/page.json": page,
      "dimensions/pointer.json": { version: 1, values: ["mouse"], appliesTo: ["page"] },
      "dimensions/theme.json": { version: 1, values: ["dark"], appliesTo: ["page"] },
      "overrides/theme.json": { version: 1, overrides: {} },
    });
    expect(run("dimension", "remove", "pointer").code).toBe(0);
    expect(exists("dimensions/pointer.json")).toBe(false);
    expect(run("dimension", "remove", "theme").stderr).toContain("undeclared-dimension");
    expect(run("dimension", "remove", "size")).toMatchObject({
      code: 1,
      stderr: "task-tree: dimension not found: size\n",
    });
  });
});

describe("dimension values, default and scope", () => {
  const project = () =>
    cliProject({
      "types.json": types,
      "tasks/page.json": page,
      "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["a"] },
    });

  it("add and remove values, set and clear the default", () => {
    const { run, read } = project();
    expect(run("dimension", "add-value", "pointer", "pen").code).toBe(0);
    expect(run("dimension", "remove-value", "pointer", "touch").code).toBe(0);
    expect(run("dimension", "set-default", "pointer", "mouse").code).toBe(0);
    expect(read("dimensions/pointer.json")).toEqual({
      version: 1,
      values: ["mouse", "pen"],
      default: "mouse",
      appliesTo: ["a"],
    });
    expect(run("dimension", "set-default", "pointer", "--none").code).toBe(0);
    expect(read("dimensions/pointer.json")).toEqual({
      version: 1,
      values: ["mouse", "pen"],
      appliesTo: ["a"],
    });
    expect(run("dimension", "set-default", "pointer", "nope").stderr).toContain(
      "unknown-dimension-value",
    );
    expect(run("dimension", "set-default", "pointer").code).toBe(2);
  });

  it("apply to and unapply from tasks", () => {
    const { run, read } = project();
    expect(run("dimension", "apply", "pointer", "b").code).toBe(0);
    expect(run("dimension", "unapply", "pointer", "a").code).toBe(0);
    expect(read("dimensions/pointer.json")).toMatchObject({ appliesTo: ["b"] });
    expect(run("dimension", "unapply", "pointer", "a")).toMatchObject({
      code: 1,
      stderr: 'task-tree: dimension "pointer" does not apply to "a"\n',
    });
    expect(run("dimension", "unapply", "pointer", "b").stderr).toContain("empty-applies-to");
  });

  it("refuse to remove a value still in use", () => {
    const { run } = cliProject({
      "types.json": types,
      "tasks/page.json": page,
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
    const record = {
      task: "a",
      context: { state: "normal", breakpoint: "0", pointer: "mouse" },
      check: "visual",
      result: "passed",
      by: "agent",
      at: "2026-10-30T19:20:00Z",
    };
    const { run, read } = cliProject({
      "types.json": { ...types, customAttributes: { design: { values: ["missing"] } } },
      "tasks/page.json": page,
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
          "0": { tasks: { a: { customAttributes: { design: { normal: "missing" } } } } },
        },
      },
      "overrides/breakpoint+pointer.json": {
        version: 1,
        overrides: { "0": { mouse: { types: { link: { states: { remove: ["hovered"] } } } } } },
      },
      "verification/page.json": { version: 1, records: [record] },
    });
    expect(run("dimension", "rename-value", "breakpoint", "0", "base").code).toBe(0);
    expect(read("dimensions/breakpoint.json")).toEqual({
      version: 1,
      values: ["base", "960"],
      default: "base",
      appliesTo: ["page"],
    });
    expect(read("overrides/breakpoint.json")).toEqual({
      version: 1,
      only: { b: ["base"] },
      overrides: {
        base: { tasks: { a: { customAttributes: { design: { normal: "missing" } } } } },
      },
    });
    expect(read("overrides/breakpoint+pointer.json")).toEqual({
      version: 1,
      overrides: { base: { mouse: { types: { link: { states: { remove: ["hovered"] } } } } } },
    });
    expect(read("verification/page.json")).toEqual({
      version: 1,
      records: [{ ...record, context: { ...record.context, breakpoint: "base" } }],
    });
  });

  it("renames the second dimension of a combination at its own level", () => {
    const { run, read } = cliProject({
      "types.json": types,
      "tasks/page.json": page,
      "dimensions/breakpoint.json": { version: 1, values: ["sm"], appliesTo: ["page"] },
      "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["page"] },
      "overrides/breakpoint+pointer.json": {
        version: 1,
        overrides: { sm: { touch: { types: { link: { states: { remove: ["hovered"] } } } } } },
      },
    });
    expect(run("dimension", "rename-value", "pointer", "touch", "finger").code).toBe(0);
    expect(read("overrides/breakpoint+pointer.json")).toEqual({
      version: 1,
      overrides: { sm: { finger: { types: { link: { states: { remove: ["hovered"] } } } } } },
    });
  });

  it("refuses an unknown value", () => {
    const { run } = cliProject({
      "types.json": types,
      "tasks/page.json": page,
      "dimensions/pointer.json": { version: 1, values: ["mouse"], appliesTo: ["page"] },
    });
    expect(run("dimension", "rename-value", "pointer", "pen", "stylus")).toMatchObject({
      code: 1,
      stderr: 'task-tree: dimension "pointer" has no value "pen"\n',
    });
  });
});
