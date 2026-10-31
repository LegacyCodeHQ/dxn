import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);
const table = (...args: string[]) =>
  json(cliProject(toolbarFiles).run("contexts", ...args, "--table", "--json"));

describe("contexts --table for one node", () => {
  it("prints one table per state group, a row per profile", () => {
    expect(table("blog-link")).toEqual({
      node: "blog-link",
      by: ["profile"],
      tables: [
        {
          group: "hover",
          rows: [
            { row: "tablet-landscape", values: { rest: true, hovered: false } },
            { row: "laptop", values: { rest: true, hovered: true } },
            { row: "desktop", values: { rest: true, hovered: true } },
          ],
        },
        {
          group: "focus",
          rows: [
            { row: "tablet-landscape", values: { blurred: true, focused: false } },
            { row: "laptop", values: { blurred: true, focused: true } },
            { row: "desktop", values: { blurred: true, focused: true } },
          ],
        },
      ],
      notPresent: ["phone", "tablet-portrait"],
    });
  });

  it("names the profiles in a cell when rows go by a dimension and they differ", () => {
    const result = table("blog-link", "--by", "breakpoint");
    expect([result.by, result.tables[0], result.notPresent]).toEqual([
      ["breakpoint"],
      {
        group: "hover",
        rows: [
          { row: "lg", values: { rest: true, hovered: ["laptop"] } },
          { row: "xl", values: { rest: true, hovered: true } },
        ],
      },
      ["base", "sm"],
    ]);
  });

  it("says when a node exists only in some states of a shared node", () => {
    const result = table("menu-link");
    expect([result.tables[0].rows, result.onlyWhen, result.notPresent]).toEqual([
      [
        { row: "phone", values: { rest: true, hovered: false } },
        { row: "tablet-portrait", values: { rest: true, hovered: false } },
      ],
      { menu: ["open"] },
      ["tablet-landscape", "laptop", "desktop"],
    ]);
  });
});

describe("contexts --subtree --table", () => {
  it("prints a presence matrix: nodes by profile", () => {
    const result = table("toolbar", "--subtree");
    expect([result.columns, result.rows]).toEqual([
      ["phone", "tablet-portrait", "tablet-landscape", "laptop", "desktop"],
      [
        { node: "toolbar", cells: [true, true, true, true, true] },
        { node: "wordmark", cells: [true, true, true, true, true] },
        { node: "toolbar-links", cells: [false, false, true, true, true] },
        { node: "blog-link", cells: [false, false, true, true, true] },
        { node: "menu", cells: [true, true, false, false, false] },
        { node: "menu-button", cells: [true, true, false, false, false] },
        {
          node: "menu-panel",
          cells: [{ menu: ["open"] }, { menu: ["open"] }, false, false, false],
        },
        { node: "menu-link", cells: [{ menu: ["open"] }, { menu: ["open"] }, false, false, false] },
      ],
    ]);
  });

  it("goes by a dimension when asked", () => {
    const result = table("toolbar", "--subtree", "--by", "breakpoint");
    expect([result.columns, result.rows[2], result.rows[4]]).toEqual([
      ["base", "sm", "lg", "xl"],
      { node: "toolbar-links", cells: [false, false, true, true] },
      { node: "menu", cells: [true, true, false, false] },
    ]);
  });
});

describe("tables as Markdown", () => {
  it("print each state group under a heading, padded for reading", () => {
    const { run } = cliProject(toolbarFiles);
    expect(run("contexts", "blog-link", "--table").stdout).toBe(
      [
        "### blog-link · hover",
        "",
        "| profile          | rest | hovered |",
        "| ---------------- | ---- | ------- |",
        "| tablet-landscape | ✓    | —       |",
        "| laptop           | ✓    | ✓       |",
        "| desktop          | ✓    | ✓       |",
        "",
        "### blog-link · focus",
        "",
        "| profile          | blurred | focused |",
        "| ---------------- | ------- | ------- |",
        "| tablet-landscape | ✓       | —       |",
        "| laptop           | ✓       | ✓       |",
        "| desktop          | ✓       | ✓       |",
        "",
        "Not present: phone, tablet-portrait",
        "",
      ].join("\n"),
    );
  });

  it("print the presence matrix with shared states and profile names in cells", () => {
    const { run } = cliProject(toolbarFiles);
    const lines = run(
      "contexts",
      "toolbar",
      "--subtree",
      "--table",
      "--by",
      "breakpoint",
    ).stdout.split("\n");
    expect([lines[0], lines[2], lines[6], lines[10], lines[11]]).toEqual([
      "### toolbar",
      "| node          | base      | sm        | lg | xl |",
      "| toolbar-links | —         | —         | ✓  | ✓  |",
      "| menu-panel    | menu=open | menu=open | —  | —  |",
      "| menu-link     | menu=open | menu=open | —  | —  |",
    ]);
  });

  it("refuse a --by that is neither profile nor a dimension", () => {
    const { run } = cliProject(toolbarFiles);
    expect(run("contexts", "blog-link", "--table", "--by", "colour").stderr).toBe(
      'dimensions: "colour" is not profile or a dimension of blog-link (breakpoint, keyboard, pointer)\n',
    );
  });
});
