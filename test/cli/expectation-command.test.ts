import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

describe("expectation commands", () => {
  it("add rules of every kind, written as expectations.json", () => {
    const { run, read } = cliProject(toolbarFiles);
    const add = (...args: string[]) => run("expectation", "add", ...args).code;
    expect([
      add(
        "Touch never hovers",
        "--node",
        "toolbar",
        "--subtree",
        "--when",
        "pointer=touch",
        "--then",
        "hover=rest",
      ),
      add(
        "A laptop link can be hovered",
        "--node",
        "blog-link",
        "--when",
        "profile=laptop",
        "--some",
        "hover=hovered",
      ),
      add(
        "The panel is only there while open",
        "--node",
        "menu-panel",
        "--when",
        "menu=closed",
        "--absent",
      ),
      add(
        "The links are there on wide screens",
        "--node",
        "toolbar-links",
        "--when",
        "breakpoint=lg|xl",
        "--exists",
      ),
    ]).toEqual([0, 0, 0, 0]);
    expect(read("expectations.json")).toEqual({
      version: 1,
      expectations: [
        {
          title: "Touch never hovers",
          node: "toolbar",
          subtree: true,
          when: { pointer: "touch" },
          then: { hover: "rest" },
        },
        {
          title: "A laptop link can be hovered",
          node: "blog-link",
          when: { profile: "laptop" },
          some: { hover: "hovered" },
        },
        {
          title: "The panel is only there while open",
          node: "menu-panel",
          when: { menu: "closed" },
          exists: false,
        },
        {
          title: "The links are there on wide screens",
          node: "toolbar-links",
          when: { breakpoint: ["lg", "xl"] },
          exists: true,
        },
      ],
    });
  });

  it("add transition and attribute rules", () => {
    const { run, read } = cliProject({
      ...toolbarFiles,
      "fragments/toolbar.json": withEscape(),
    });
    expect(
      run(
        "expectation",
        "add",
        "Escape closes the menu",
        "--node",
        "menu",
        "--when",
        "menu=open",
        "--on",
        "keydown",
        "--key",
        "Escape",
        "--then",
        "menu=closed",
        "--then",
        "focus=menu-button",
      ).code,
    ).toBe(0);
    expect((read("expectations.json").expectations as unknown[])[0]).toEqual({
      title: "Escape closes the menu",
      node: "menu",
      when: { menu: "open" },
      on: { event: "keydown", key: "Escape" },
      then: { menu: "closed", focus: "menu-button" },
    });
  });

  it("refuse a rule that fails or tests nothing, and write nothing", () => {
    const { run, exists } = cliProject(toolbarFiles);
    const failing = run(
      "expectation",
      "add",
      "Touch hovers",
      "--node",
      "blog-link",
      "--when",
      "pointer=touch",
      "--some",
      "hover=hovered",
    );
    expect([
      failing.code,
      failing.stderr.includes("expectation-failed"),
      exists("expectations.json"),
    ]).toEqual([1, true, false]);
  });

  it("need one assertion and a unique title", () => {
    const { run } = cliProject(toolbarFiles);
    run("expectation", "add", "Once", "--node", "wordmark", "--exists");
    expect([
      run("expectation", "add", "None", "--node", "wordmark").stderr,
      run("expectation", "add", "Two", "--node", "wordmark", "--exists", "--absent").stderr.split(
        "\n",
      )[0],
      run("expectation", "add", "Once", "--node", "wordmark", "--exists").stderr,
    ]).toEqual([
      expect.stringContaining("give one of --then, --some, --exists and --absent"),
      "dimensions: give one of --then, --some, --exists and --absent",
      'dimensions: expectation "Once" already exists\n',
    ]);
  });

  it("list and remove rules by title", () => {
    const { run } = cliProject(toolbarFiles);
    run("expectation", "add", "Once", "--node", "wordmark", "--exists");
    run("expectation", "add", "Twice", "--node", "wordmark", "--when", "profile=phone", "--exists");
    expect(
      json(run("expectation", "list")).expectations.map(({ title }: { title: string }) => title),
    ).toEqual(["Once", "Twice"]);
    expect(run("expectation", "remove", "Once").code).toBe(0);
    expect(
      json(run("expectation", "list")).expectations.map(({ title }: { title: string }) => title),
    ).toEqual(["Twice"]);
    expect(run("expectation", "remove", "Nope").stderr).toBe(
      'dimensions: expectation not found: "Nope"\n',
    );
  });
});

function withEscape() {
  const fragment = structuredClone(toolbarFiles["fragments/toolbar.json"]);
  const menu = fragment.fragment.children[2] as Record<string, unknown>;
  menu.transitions = [
    {
      id: "escape",
      from: "open",
      to: "closed",
      on: "keydown",
      key: "Escape",
      focus: "menu-button",
    },
  ];
  return fragment;
}
