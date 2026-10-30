import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

function project() {
  const root = writeProject({ ".task-tree/types.json": { version: 1 } });
  return {
    run: (...argv: string[]) => capture(argv, root),
    attributes: () =>
      (
        JSON.parse(readFileSync(join(root, ".task-tree", "types.json"), "utf8")) as {
          customAttributes?: unknown;
        }
      ).customAttributes,
  };
}

describe("attribute commands", () => {
  it("add an attribute and its values", () => {
    const { run, attributes } = project();
    expect(run("attribute", "add", "design", "--values", "available,missing").code).toBe(0);
    expect(run("attribute", "add-value", "design", "draft").code).toBe(0);
    expect(attributes()).toEqual({ design: { values: ["available", "missing", "draft"] } });
  });

  it("remove values and attributes nothing uses", () => {
    const { run, attributes } = project();
    run("attribute", "add", "design", "--values", "available,missing");
    run("attribute", "add", "size", "--values", "s");
    expect(run("attribute", "remove-value", "design", "missing").code).toBe(0);
    expect(run("attribute", "remove", "size").code).toBe(0);
    expect(attributes()).toEqual({ design: { values: ["available"] } });
  });

  it("refuse to remove what is in use", () => {
    const { run } = project();
    run("attribute", "add", "design", "--values", "available,missing");
    run("type", "add", "link", "--states", "normal");
    run("type", "set", "link", "design", "normal=missing");
    expect(run("attribute", "remove-value", "design", "missing").stderr).toContain("unknown-value");
    expect(run("attribute", "remove", "design").stderr).toContain("undeclared-attribute");
  });

  it("report existing attributes, unknown ones and usage errors", () => {
    const { run } = project();
    run("attribute", "add", "design", "--values", "a");
    expect(run("attribute", "add", "design", "--values", "b")).toMatchObject({
      code: 1,
      stderr: 'task-tree: attribute "design" already exists\n',
    });
    expect(run("attribute", "add-value", "size", "x")).toMatchObject({
      code: 1,
      stderr: "task-tree: attribute not found: size\n",
    });
    expect(run("attribute", "add", "size").code).toBe(2);
    expect(run("attribute").code).toBe(2);
  });
});
