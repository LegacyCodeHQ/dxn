import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// A toolbar whose link loses hover on touch.
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
      children: [{ id: "blog-link", title: "Blog link", type: "link" }],
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
          node: "toolbar",
          subtree: true,
          root: "article-page",
          where: { pointer: "touch", hover: "hovered" },
          count: 0,
        },
        { title: "A mouse can hover", node: "blog-link", where: { pointer: "mouse" }, count: 4 },
        { title: "Every combination", node: "toolbar", subtree: true, count: 8 },
      ]),
    });
    expect(run("validate")).toMatchInlineSnapshot(`
      {
        "code": 0,
        "stderr": "",
        "stdout": "{"project":"<tmp>/.dimensions","errors":0}
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
          node: "blog-link",
          where: { pointer: "touch", hover: "hovered" },
          count: 0,
        },
      ]),
    });
    expect(run("validate")).toMatchInlineSnapshot(`
      {
        "code": 1,
        "stderr": "<tmp>/.dimensions/expectations.json:11:16: expectation-failed: Touch screens never show hover: expected 0 contexts, found 2
      ",
        "stdout": "{"project":"<tmp>/.dimensions","errors":1}
      ",
      }
    `);
  });

  it("report unknown nodes, roots, names and values where they are written", () => {
    const { run } = cliProject({
      ...files,
      "expectations.json": expectations([
        { title: "Unknown node", node: "nope", count: 0 },
        { title: "Unknown root", node: "blog-link", root: "home", count: 0 },
        { title: "Unknown name", node: "blog-link", where: { keyboard: "none" }, count: 0 },
        { title: "Unknown value", node: "blog-link", where: { pointer: "pen" }, count: 0 },
      ]),
    });
    expect(run("validate").stderr).toMatchInlineSnapshot(`
      "<tmp>/.dimensions/expectations.json:6:15: unknown-node: node "nope" does not exist
      <tmp>/.dimensions/expectations.json:12:15: node-outside-root: node "blog-link" is not in root "home"
      <tmp>/.dimensions/expectations.json:19:9: unknown-name: "keyboard" is not a dimension, state group or shared node here (focus, hover, pointer)
      <tmp>/.dimensions/expectations.json:27:20: unknown-value: "pen" is not a value of pointer (mouse, touch)
      "
    `);
  });

  it("check the file's shape", () => {
    const snapshot: unknown[] = [];
    const shape = (doc: unknown) =>
      cliProject({ ...files, "expectations.json": doc }).run("validate").stderr;
    snapshot.push(shape([]));
    snapshot.push(shape({ version: 1 }));
    snapshot.push(shape(expectations([{ node: "blog-link" }])));
    snapshot.push(
      shape(expectations([{ title: "", node: "blog-link", count: -1, extra: 1, where: [] }])),
    );
    snapshot.push(shape("{"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "<tmp>/.dimensions/expectations.json:1:1: wrong-type: expected an object, found an array
      ",
        "<tmp>/.dimensions/expectations.json:1:1: missing-key: missing required key "expectations"
      ",
        "<tmp>/.dimensions/expectations.json:4:5: missing-key: missing required key "title"
      <tmp>/.dimensions/expectations.json:4:5: missing-key: missing required key "count"
      ",
        "<tmp>/.dimensions/expectations.json:8:7: unknown-key: unknown key "extra"
      <tmp>/.dimensions/expectations.json:5:16: empty-string: must not be empty or blank
      <tmp>/.dimensions/expectations.json:9:16: wrong-type: expected an object, found an array
      <tmp>/.dimensions/expectations.json:7:16: invalid-count: count must be a whole number, 0 or more
      ",
        "<tmp>/.dimensions/expectations.json:1:2: unexpected-end: unexpected end of input
      ",
      ]
    `);
  });

  it("are skipped when the project itself has errors", () => {
    const { run } = cliProject({
      ...files,
      "types.json": { version: 2 },
      "expectations.json": expectations([{ title: "x", node: "nope", count: 0 }]),
    });
    expect(run("validate").stderr).toMatchInlineSnapshot(`
      "<tmp>/.dimensions/types.json:2:14: unsupported-version: unsupported version 2
      <tmp>/.dimensions/fragments/toolbar.json:10:17: undefined-type: type "link" is not defined
      <tmp>/.dimensions/overrides/pointer.json:6:9: undefined-type: type "link" is not defined
      "
    `);
  });
});
