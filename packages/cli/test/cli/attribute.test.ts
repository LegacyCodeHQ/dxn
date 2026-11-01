import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

function project() {
  const root = writeProject({ ".dxn/types.json": { version: 1 } });
  return {
    run: (...argv: string[]) => capture(argv, root),
    attributes: () =>
      (
        JSON.parse(readFileSync(join(root, ".dxn", "types.json"), "utf8")) as {
          attributes?: unknown;
        }
      ).attributes,
  };
}

describe("attribute commands", () => {
  it("add an attribute and its values", () => {
    const snapshot: unknown[] = [];
    const { run, attributes } = project();
    snapshot.push(
      run("prototype", "attribute", "add", "design", "--values", "available,missing").code,
    );
    snapshot.push(run("prototype", "attribute", "add-value", "design", "draft").code);
    snapshot.push(attributes());

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    0,
    {
      "design": {
        "values": [
          "available",
          "missing",
          "draft",
        ],
      },
    },
  ]
`);
  });

  it("remove values and attributes nothing uses", () => {
    const snapshot: unknown[] = [];
    const { run, attributes } = project();
    run("prototype", "attribute", "add", "design", "--values", "available,missing");
    run("prototype", "attribute", "add", "size", "--values", "s");
    snapshot.push(run("prototype", "attribute", "remove-value", "design", "missing").code);
    snapshot.push(run("prototype", "attribute", "remove", "size").code);
    snapshot.push(attributes());

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    0,
    {
      "design": {
        "values": [
          "available",
        ],
      },
    },
  ]
`);
  });

  it("refuse to remove what is in use", () => {
    const snapshot: unknown[] = [];
    const { run } = project();
    run("prototype", "attribute", "add", "design", "--values", "available,missing");
    run("prototype", "type", "add", "link", "--states", "normal");
    run("prototype", "type", "set", "link", "design", "normal=missing");
    snapshot.push(run("prototype", "attribute", "remove-value", "design", "missing").stderr);
    snapshot.push(run("prototype", "attribute", "remove", "design").stderr);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.dxn/types.json:13:21: unknown-value: "missing" is not a declared value of "design"
  ",
    "<tmp>/.dxn/types.json:8:9: undeclared-attribute: attribute "design" is not declared
  ",
  ]
`);
  });

  it("report existing attributes, unknown ones and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = project();
    run("prototype", "attribute", "add", "design", "--values", "a");
    snapshot.push(run("prototype", "attribute", "add", "design", "--values", "b"));
    snapshot.push(run("prototype", "attribute", "add-value", "size", "x"));
    snapshot.push(run("prototype", "attribute", "add", "size").code);
    snapshot.push(run("prototype", "attribute").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "dxn: attribute "design" already exists
  ",
      "stdout": "",
    },
    {
      "code": 1,
      "stderr": "dxn: attribute not found: size
  ",
      "stdout": "",
    },
    2,
    2,
  ]
`);
  });
});
