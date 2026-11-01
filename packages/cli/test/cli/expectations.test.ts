import { afterAll, describe, expect, it } from "vitest";
import { cleanup, compileFiles, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// A toolbar with two links: the blog link exists only with a mouse, and
// touch removes hover from every link.
const files = {
  "types.json": {
    version: 1,
    stateGroups: { hover: ["rest", "hovered"], focus: ["blurred", "focused"] },
    types: { link: { stateGroups: ["hover", "focus"] } },
  },
  "fragments/toolbar.json": {
    version: 1,
    fragment: {
      id: "toolbar",
      title: "Toolbar",
      children: [
        { id: "blog-link", title: "Blog link", type: "link" },
        { id: "home-link", title: "Home link", type: "link" },
      ],
    },
  },
  "roots/article-page.json": rootFile({
    id: "article-page",
    title: "Article page",
    children: [{ include: "toolbar" }],
  }),
  "dimensions/pointer.json": {
    version: 1,
    values: ["mouse", "touch"],
    default: "mouse",
    appliesTo: ["toolbar"],
  },
  "overrides/pointer.json": {
    version: 1,
    only: { "blog-link": ["mouse"] },
    overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
  },
};

const expectations = (list: unknown[]) => ({ version: 1, expectations: list });
const noHoverOnTouch = {
  title: "Touch screens never show hover",
  node: "toolbar",
  subtree: true,
  when: { pointer: "touch" },
  then: { hover: "rest" },
};

// Each problem validate reports, without its file position.
function problems(extra: Record<string, unknown>, list: unknown[]): string[] {
  const { run } = cliProject({ ...files, ...extra, "expectations.json": expectations(list) });
  return run("prototype", "validate")
    .stderr.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.replace(/^.*?:\d+:\d+: /, ""));
}

describe("then: every selected context has these values", () => {
  it("passes when the rule holds", () => {
    expect(problems({}, [noHoverOnTouch])).toEqual([]);
  });

  it("fails with one context that breaks it", () => {
    expect(
      problems(
        {
          "overrides/pointer.json": { version: 1, only: { "blog-link": ["mouse"] }, overrides: {} },
        },
        [noHoverOnTouch],
      ),
    ).toEqual([
      "expectation-failed: Touch screens never show hover: home-link (hover=hovered, focus=blurred, pointer=touch) breaks hover=rest",
    ]);
  });
});

describe("then with a list", () => {
  it("allows any of the listed values", () => {
    const rule = (allowed: string[]) => ({ ...noHoverOnTouch, then: { focus: allowed } });
    expect(problems({}, [rule(["blurred", "focused"])])).toEqual([]);
    expect(problems({}, [rule(["blurred"])])).toEqual([
      "expectation-failed: Touch screens never show hover: home-link (hover=rest, focus=focused, pointer=touch) breaks focus=blurred",
    ]);
    expect(problems({}, [rule(["blurred", "pressed"])])).toEqual([
      'unknown-value: "pressed" is not a value of focus (blurred, focused)',
    ]);
  });
});

describe("some: at least one selected context has these values", () => {
  const atOnce = (pointer: string) => ({
    title: "A link can be hovered and focused at once",
    node: "home-link",
    when: { pointer },
    some: { hover: "hovered", focus: "focused" },
  });

  it("passes when one does, and fails naming what none has", () => {
    expect(problems({}, [atOnce("mouse")])).toEqual([]);
    expect(problems({}, [atOnce("touch")])).toEqual([
      "expectation-failed: A link can be hovered and focused at once: no context of home-link (pointer=touch) has hover=hovered, focus=focused",
    ]);
  });
});

describe("exists: whether the node is there", () => {
  const blogLink = (pointer: string, exists: boolean) => ({
    title: `The blog link ${exists ? "is" : "is not"} there with ${pointer}`,
    node: "blog-link",
    when: { pointer },
    exists,
  });

  it("passes when it holds in every matching combination", () => {
    expect(problems({}, [blogLink("touch", false), blogLink("mouse", true)])).toEqual([]);
  });

  it("fails naming a combination where it does not", () => {
    expect(problems({}, [blogLink("touch", true), blogLink("mouse", false)])).toEqual([
      "expectation-failed: The blog link is there with touch: blog-link does not exist (pointer=touch)",
      "expectation-failed: The blog link is not there with mouse: blog-link exists (pointer=mouse)",
    ]);
  });
});

describe("an expectation", () => {
  it("that selects nothing tests nothing, so it is an error", () => {
    expect(
      problems({}, [
        {
          title: "Blog link at rest on touch",
          node: "blog-link",
          when: { pointer: "touch" },
          then: { hover: "rest" },
        },
      ]),
    ).toEqual([
      "empty-expectation: Blog link at rest on touch: selects no contexts of blog-link (pointer=touch)",
    ]);
  });

  it("makes exactly one assertion", () => {
    expect(
      problems({}, [
        { title: "None", node: "home-link" },
        { title: "Two", node: "home-link", then: { hover: "rest" }, exists: true },
      ]),
    ).toEqual([
      'missing-key: give one assertion: "then", "some" or "exists"',
      'several-assertions: an expectation makes one assertion: "then", "some" or "exists", not "then" and "exists"',
    ]);
  });

  it("names dimensions, state groups, shared nodes and profiles it can test", () => {
    expect(
      problems({}, [
        {
          title: "Unknown name",
          node: "home-link",
          when: { keyboard: "none" },
          then: { hover: "rest" },
        },
        { title: "Unknown value", node: "home-link", then: { hover: "pressed" } },
        { title: "A state in exists", node: "home-link", when: { hover: "rest" }, exists: true },
      ]),
    ).toEqual([
      'unknown-name: "keyboard" is not a dimension, state group or shared node here (focus, hover, pointer)',
      'unknown-value: "pressed" is not a value of hover (rest, hovered)',
      'unknown-name: "hover" is a state group; exists looks only at dimensions, profiles and shared nodes',
    ]);
  });

  it("no longer takes count or where", () => {
    expect(
      problems({}, [{ title: "Old", node: "home-link", where: { pointer: "touch" }, count: 2 }]),
    ).toEqual([
      'unknown-key: unknown key "where"',
      'unknown-key: unknown key "count"',
      'missing-key: give one assertion: "then", "some" or "exists"',
    ]);
  });

  it("reports unknown nodes and roots where they are written", () => {
    expect(
      problems({}, [
        { title: "Unknown node", node: "nope", exists: true },
        { title: "Unknown root", node: "home-link", root: "home", exists: true },
      ]),
    ).toEqual([
      'unknown-node: node "nope" does not exist',
      'node-outside-root: node "home-link" is not in root "home"',
    ]);
  });

  it("checks the file's shape", () => {
    expect(
      problems({}, [
        { title: "", node: "home-link", then: [], extra: 1 },
        { title: "Exists", node: "home-link", exists: "yes" },
      ]),
    ).toEqual([
      'unknown-key: unknown key "extra"',
      "empty-string: must not be empty or blank",
      "wrong-type: expected an object, found an array",
      "wrong-type: expected a boolean, found a string",
    ]);
  });
});

describe("expectations in the compiler", () => {
  const passing = expectations([
    {
      title: "Touch screens never show hover",
      node: "home-link",
      when: { pointer: "touch" },
      then: { hover: "rest" },
    },
  ]);

  it("refuse an edit that would make one fail, and write nothing", () => {
    const { run, read } = cliProject({ ...files, "expectations.json": passing });
    const result = run("prototype", "override", "unset", "pointer=touch", "--type", "link");
    expect([result.code, result.stdout, result.stderr.includes("expectation-failed")]).toEqual([
      1,
      "",
      true,
    ]);
    expect(read("overrides/pointer.json")).toEqual(files["overrides/pointer.json"]);
  });

  it("stop reading commands, as any other error does", () => {
    const { run } = cliProject({
      ...files,
      "overrides/pointer.json": { version: 1, overrides: {} },
      "expectations.json": passing,
    });
    const result = run("prototype", "show", "home-link");
    expect([result.code, result.stderr.includes("expectation-failed")]).toEqual([1, true]);
  });

  it("are part of the compiled project", () => {
    const result = compileFiles({ ...files, "expectations.json": passing });
    expect(result.project?.expectations).toEqual(passing);
    expect(compileFiles(files).project?.expectations).toBeUndefined();
  });
});
