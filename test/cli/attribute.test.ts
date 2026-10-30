import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

function project() {
  const root = writeProject({ ".dimensions/types.json": { version: 1 } });
  return {
    run: (...argv: string[]) => capture(argv, root),
    attributes: () =>
      (
        JSON.parse(readFileSync(join(root, ".dimensions", "types.json"), "utf8")) as {
          attributes?: unknown;
        }
      ).attributes,
  };
}

describe("attribute commands", () => {
  it("add an attribute and its values", () => {
    const snapshot: unknown[] = [];
    const { run, attributes } = project();
    snapshot.push(run("attribute", "add", "design", "--values", "available,missing").code);
    snapshot.push(run("attribute", "add-value", "design", "draft").code);
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
    run("attribute", "add", "design", "--values", "available,missing");
    run("attribute", "add", "size", "--values", "s");
    snapshot.push(run("attribute", "remove-value", "design", "missing").code);
    snapshot.push(run("attribute", "remove", "size").code);
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
    run("attribute", "add", "design", "--values", "available,missing");
    run("type", "add", "link", "--states", "normal");
    run("type", "set", "link", "design", "normal=missing");
    snapshot.push(run("attribute", "remove-value", "design", "missing").stderr);
    snapshot.push(run("attribute", "remove", "design").stderr);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.dimensions/types.json:13:21: unknown-value: "missing" is not a declared value of "design"
  ",
    "<tmp>/.dimensions/types.json:8:9: undeclared-attribute: attribute "design" is not declared
  ",
  ]
`);
  });

  it("report existing attributes, unknown ones and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = project();
    run("attribute", "add", "design", "--values", "a");
    snapshot.push(run("attribute", "add", "design", "--values", "b"));
    snapshot.push(run("attribute", "add-value", "size", "x"));
    snapshot.push(run("attribute", "add", "size").code);
    snapshot.push(run("attribute").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "dimensions: attribute "design" already exists
  ",
      "stdout": "",
    },
    {
      "code": 1,
      "stderr": "dimensions: attribute not found: size
  ",
      "stdout": "",
    },
    2,
    2,
  ]
`);
  });
});
