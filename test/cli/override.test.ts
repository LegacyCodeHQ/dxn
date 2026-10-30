import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const files = {
  "types.json": {
    version: 1,
    customAttributes: { design: { values: ["available", "missing"] } },
    types: { link: { states: ["normal", "hovered", "selected"] } },
  },
  "tasks/page.json": taskFile({
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

describe("only", () => {
  it("says where a task exists, creating the override file", () => {
    const { run, read } = cliProject(files);
    expect(run("only", "breakpoint", "links", "lg", "xl").code).toBe(0);
    expect(run("only", "breakpoint", "menu", "base", "sm").code).toBe(0);
    expect(read("overrides/breakpoint.json")).toEqual({
      version: 1,
      only: { links: ["lg", "xl"], menu: ["base", "sm"] },
      overrides: {},
    });
    expect(run("only", "breakpoint", "links", "--everywhere").code).toBe(0);
    expect(run("only", "breakpoint", "menu", "--everywhere").code).toBe(0);
    expect(read("overrides/breakpoint.json")).toEqual({ version: 1, overrides: {} });
  });

  it("refuses invalid values and usage errors", () => {
    const { run } = cliProject(files);
    expect(run("only", "breakpoint", "links", "md").stderr).toContain("unknown-dimension-value");
    expect(run("only", "theme", "links", "dark").stderr).toContain("undeclared-dimension");
    expect(run("only", "breakpoint", "links").code).toBe(2);
    expect(run("only", "breakpoint", "links", "lg", "--everywhere").code).toBe(2);
  });
});

describe("override states", () => {
  it("removes and adds a type's states for one value", () => {
    const { run, read } = cliProject(files);
    expect(
      run("override", "states", "pointer=touch", "--type", "link", "--remove", "hovered").code,
    ).toBe(0);
    expect(read("overrides/pointer.json")).toEqual({
      version: 1,
      overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
    });
    expect(
      run("override", "states", "pointer=touch", "--task", "blog-link", "--add", "hovered").code,
    ).toBe(0);
    expect(read("overrides/pointer.json")).toEqual({
      version: 1,
      overrides: {
        touch: {
          types: { link: { states: { remove: ["hovered"] } } },
          tasks: { "blog-link": { states: { add: ["hovered"] } } },
        },
      },
    });
  });

  it("writes combinations to the combination file, nested in dimension order", () => {
    const { run, read } = cliProject(files);
    expect(
      run(
        "override",
        "states",
        "pointer=touch,breakpoint=sm",
        "--type",
        "link",
        "--remove",
        "selected",
      ).code,
    ).toBe(0);
    expect(read("overrides/breakpoint+pointer.json")).toEqual({
      version: 1,
      overrides: { sm: { touch: { types: { link: { states: { remove: ["selected"] } } } } } },
    });
  });

  it("refuses what the compiler rejects and usage errors", () => {
    const { run } = cliProject(files);
    expect(
      run("override", "states", "pointer=touch", "--type", "link", "--remove", "pressed").stderr,
    ).toContain("unknown-state");
    expect(run("override", "states", "pointer=touch", "--remove", "hovered").code).toBe(2);
    expect(
      run(
        "override",
        "states",
        "pointer=touch",
        "--type",
        "link",
        "--task",
        "blog-link",
        "--add",
        "x",
      ).code,
    ).toBe(2);
    expect(run("override", "states", "pointer", "--type", "link", "--add", "x").code).toBe(2);
    expect(
      run("override", "states", "pointer=touch,pointer=mouse", "--type", "link", "--add", "x").code,
    ).toBe(2);
    expect(run("override", "states", "pointer=touch", "--type", "link").code).toBe(2);
    expect(run("override").code).toBe(2);
  });
});

describe("override set and unset", () => {
  it("set values and clear them, pruning empty levels", () => {
    const { run, read } = cliProject(files);
    expect(
      run("override", "set", "breakpoint=sm", "--task", "blog-link", "design", "normal=missing")
        .code,
    ).toBe(0);
    expect(read("overrides/breakpoint.json")).toEqual({
      version: 1,
      overrides: {
        sm: { tasks: { "blog-link": { customAttributes: { design: { normal: "missing" } } } } },
      },
    });
    expect(
      run("override", "unset", "breakpoint=sm", "--task", "blog-link", "design", "normal").code,
    ).toBe(0);
    expect(read("overrides/breakpoint.json")).toEqual({ version: 1, overrides: {} });
  });

  it("unset a whole override", () => {
    const { run, read } = cliProject(files);
    run("override", "states", "pointer=touch", "--type", "link", "--remove", "hovered");
    run("override", "set", "pointer=touch", "--type", "link", "design", "normal=missing");
    expect(run("override", "unset", "pointer=touch", "--type", "link").code).toBe(0);
    expect(read("overrides/pointer.json")).toEqual({ version: 1, overrides: {} });
  });

  it("refuse unknown values and overrides that do not exist", () => {
    const { run } = cliProject(files);
    expect(
      run("override", "set", "pointer=touch", "--type", "link", "design", "normal=maybe").stderr,
    ).toContain("unknown-value");
    expect(run("override", "unset", "pointer=touch", "--type", "link")).toMatchObject({
      code: 1,
      stderr: "task-tree: no override for type link at pointer=touch\n",
    });
  });
});
