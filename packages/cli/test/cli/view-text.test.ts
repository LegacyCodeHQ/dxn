import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

describe("view --tree", () => {
  it("prints the tree present in one view as text", () => {
    const { run } = cliProject(toolbarFiles);
    expect(run("prototype", "view", "toolbar", "profile=phone", "menu=open", "--tree").stdout).toBe(
      [
        "toolbar",
        "├── wordmark  hover: rest · focus: blurred",
        "└── menu  menu=open",
        "    ├── menu-button  hover: rest · focus: blurred",
        "    └── menu-panel",
        "        └── menu-link  hover: rest · focus: blurred",
        "",
      ].join("\n"),
    );
  });
});

describe("views --table", () => {
  it("prints every view as a Markdown row", () => {
    const { run } = cliProject(toolbarFiles);
    expect(run("prototype", "views", "toolbar", "--table").stdout).toBe(
      [
        "| profile          | breakpoint | keyboard    | pointer | menu   |",
        "| ---------------- | ---------- | ----------- | ------- | ------ |",
        "| phone            | base       | no-keyboard | touch   | closed |",
        "| phone            | base       | no-keyboard | touch   | open   |",
        "| tablet-portrait  | sm         | no-keyboard | touch   | closed |",
        "| tablet-portrait  | sm         | no-keyboard | touch   | open   |",
        "| laptop           | lg         | keyboard    | mouse   | —      |",
        "| tablet-landscape | lg         | no-keyboard | touch   | —      |",
        "| desktop          | xl         | keyboard    | mouse   | —      |",
        "",
      ].join("\n"),
    );
  });

  it("leaves out the profile column when there are no profiles", () => {
    const { "profiles.json": _, ...withoutProfiles } = toolbarFiles;
    const lines = cliProject(withoutProfiles)
      .run("prototype", "views", "toolbar", "breakpoint=xl", "--table")
      .stdout.split("\n");
    expect(lines.slice(0, 3)).toEqual([
      "| breakpoint | keyboard    | pointer |",
      "| ---------- | ----------- | ------- |",
      "| xl         | keyboard    | mouse   |",
    ]);
  });
});
