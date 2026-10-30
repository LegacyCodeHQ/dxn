import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// A toolbar whose link loses hover on touch.
const files = {
  "types.json": {
    version: 1,
    stateGroups: { hover: ["rest", "hovered"], focus: ["blurred", "focused"] },
    types: { link: { stateGroups: ["hover", "focus"] } },
  },
  "components/toolbar.json": {
    version: 1,
    component: {
      id: "toolbar",
      title: "Toolbar",
      children: [{ id: "blog-link", title: "Blog link", type: "link" }],
    },
  },
  "tasks/article-page.json": taskFile({
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
    overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
  },
};

const expectations = (list: unknown[]) => ({ version: 1, expectations: list });

describe("expectations checked by validate", () => {
  it("pass when each count matches the contexts the filters select", () => {
    const { run } = cliProject({
      ...files,
      "expectations.json": expectations([
        {
          title: "Touch screens never show hover",
          task: "toolbar",
          subtree: true,
          page: "article-page",
          where: { pointer: "touch", hover: "hovered" },
          count: 0,
        },
        { title: "A mouse can hover", task: "blog-link", where: { pointer: "mouse" }, count: 4 },
        { title: "Every combination", task: "toolbar", subtree: true, count: 8 },
      ]),
    });
    expect(run("validate")).toMatchInlineSnapshot(`
      {
        "code": 0,
        "stderr": "",
        "stdout": "{"project":"<tmp>/.task-tree","errors":0}
      ",
      }
    `);
  });

  it("fail with the title, the expected and the actual count", () => {
    const { run } = cliProject({
      ...files,
      "overrides/pointer.json": { version: 1, overrides: {} },
      "expectations.json": expectations([
        {
          title: "Touch screens never show hover",
          task: "blog-link",
          where: { pointer: "touch", hover: "hovered" },
          count: 0,
        },
      ]),
    });
    expect(run("validate")).toMatchInlineSnapshot(`
      {
        "code": 1,
        "stderr": "<tmp>/.task-tree/expectations.json:11:16: expectation-failed: Touch screens never show hover: expected 0 contexts, found 2
      ",
        "stdout": "{"project":"<tmp>/.task-tree","errors":1}
      ",
      }
    `);
  });

  it("report unknown tasks, pages, names and values where they are written", () => {
    const { run } = cliProject({
      ...files,
      "expectations.json": expectations([
        { title: "Unknown task", task: "nope", count: 0 },
        { title: "Unknown page", task: "blog-link", page: "home", count: 0 },
        { title: "Unknown name", task: "blog-link", where: { keyboard: "none" }, count: 0 },
        { title: "Unknown value", task: "blog-link", where: { pointer: "pen" }, count: 0 },
      ]),
    });
    expect(run("validate").stderr).toMatchInlineSnapshot(`
      "<tmp>/.task-tree/expectations.json:6:15: unknown-task: task "nope" does not exist
      <tmp>/.task-tree/expectations.json:12:15: unknown-page: task "blog-link" is not on page "home"
      <tmp>/.task-tree/expectations.json:19:9: unknown-name: "keyboard" is not a dimension, state group or shared task here (focus, hover, pointer)
      <tmp>/.task-tree/expectations.json:27:20: unknown-value: "pen" is not a value of pointer (mouse, touch)
      "
    `);
  });

  it("check the file's shape", () => {
    const snapshot: unknown[] = [];
    const shape = (doc: unknown) =>
      cliProject({ ...files, "expectations.json": doc }).run("validate").stderr;
    snapshot.push(shape([]));
    snapshot.push(shape({ version: 1 }));
    snapshot.push(shape(expectations([{ task: "blog-link" }])));
    snapshot.push(
      shape(expectations([{ title: "", task: "blog-link", count: -1, extra: 1, where: [] }])),
    );
    snapshot.push(shape("{"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "<tmp>/.task-tree/expectations.json:1:1: wrong-type: expected an object, found an array
      ",
        "<tmp>/.task-tree/expectations.json:1:1: missing-key: missing required key "expectations"
      ",
        "<tmp>/.task-tree/expectations.json:4:5: missing-key: missing required key "title"
      <tmp>/.task-tree/expectations.json:4:5: missing-key: missing required key "count"
      ",
        "<tmp>/.task-tree/expectations.json:8:7: unknown-key: unknown key "extra"
      <tmp>/.task-tree/expectations.json:5:16: empty-string: must not be empty or blank
      <tmp>/.task-tree/expectations.json:9:16: wrong-type: expected an object, found an array
      <tmp>/.task-tree/expectations.json:7:16: invalid-count: count must be a whole number, 0 or more
      ",
        "<tmp>/.task-tree/expectations.json:1:2: unexpected-end: unexpected end of input
      ",
      ]
    `);
  });

  it("are skipped when the project itself has errors", () => {
    const { run } = cliProject({
      ...files,
      "types.json": { version: 2 },
      "expectations.json": expectations([{ title: "x", task: "nope", count: 0 }]),
    });
    expect(run("validate").stderr).toMatchInlineSnapshot(`
      "<tmp>/.task-tree/types.json:2:14: unsupported-version: unsupported version 2
      <tmp>/.task-tree/components/toolbar.json:10:17: undefined-type: type "link" is not defined
      <tmp>/.task-tree/overrides/pointer.json:6:9: undefined-type: type "link" is not defined
      "
    `);
  });
});
