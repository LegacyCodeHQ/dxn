import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, diagnose, pointer, tree } from "../support/project.js";

afterAll(cleanup);

const d = at("dimensions/pointer.json");
const dimension = (doc: unknown) => diagnose({ ...tree, "dimensions/pointer.json": doc });
const field = (key: string, value: unknown) => dimension({ ...pointer, [key]: value });

describe("dimension files", () => {
  it("accept values and the tasks they apply to", () => {
    expect(dimension(pointer)).toEqual([]);
  });

  it("must be an object with version, values and appliesTo", () => {
    expect(dimension([])).toEqual([d("wrong-type", "$")]);
    expect(dimension({})).toEqual([
      d("missing-key", "$.version"),
      d("missing-key", "$.values"),
      d("missing-key", "$.appliesTo"),
    ]);
    expect(dimension({ ...pointer, extra: 1 })).toEqual([d("unknown-key", "$.extra")]);
    expect(dimension({ ...pointer, version: 2 })).toEqual([d("unsupported-version", "$.version")]);
  });

  it("may point editors at the JSON schema", () => {
    expect(dimension({ $schema: "x", ...pointer })).toEqual([]);
    expect(dimension({ $schema: 1, ...pointer })).toEqual([d("wrong-type", "$.$schema")]);
  });

  it("are named after a valid dimension name", () => {
    for (const name of [" pointer", ""]) {
      const file = `dimensions/${name}.json`;
      expect(diagnose({ ...tree, [file]: pointer })).toEqual([
        { file, code: "invalid-file-name", path: "$" },
      ]);
    }
  });

  it("must not be named state, which contexts use for task states", () => {
    expect(diagnose({ ...tree, "dimensions/state.json": pointer })).toEqual([
      { file: "dimensions/state.json", code: "reserved-name", path: "$" },
    ]);
  });

  it("ignore files that are not .json", () => {
    expect(diagnose({ ...tree, "dimensions/README.md": "# notes" })).toEqual([]);
  });
});

describe("dimension values", () => {
  it("must be an array with at least one value", () => {
    expect(field("values", "x")).toEqual([d("wrong-type", "$.values")]);
    expect(field("values", [])).toEqual([d("empty-values", "$.values")]);
  });

  it("must be valid unique names", () => {
    const value = (v: unknown) => field("values", [v, "z"]);
    expect(value(1)).toEqual([d("wrong-type", "$.values[0]")]);
    expect(value("")).toEqual([d("empty-string", "$.values[0]")]);
    expect(value("  ")).toEqual([d("empty-string", "$.values[0]")]);
    expect(value("sm ")).toEqual([d("surrounding-whitespace", "$.values[0]")]);
    expect(value("s\u0001m")).toEqual([d("control-character", "$.values[0]")]);
    expect(value("z")).toEqual([d("duplicate-value", "$.values[1]")]);
  });
});

describe("dimension appliesTo", () => {
  const appliesTo = (value: unknown) => field("appliesTo", value);

  it("may name tasks from any task file", () => {
    expect(appliesTo(["page", "footer-link"])).toEqual([]);
  });

  it("must be an array naming at least one task", () => {
    expect(appliesTo("page")).toEqual([d("wrong-type", "$.appliesTo")]);
    expect(appliesTo([])).toEqual([d("empty-applies-to", "$.appliesTo")]);
    expect(appliesTo([1])).toEqual([d("wrong-type", "$.appliesTo[0]")]);
  });

  it("must name existing tasks, once each", () => {
    expect(appliesTo(["nope"])).toEqual([d("unknown-task", "$.appliesTo[0]")]);
    expect(appliesTo(["page", "page"])).toEqual([d("duplicate-task", "$.appliesTo[1]")]);
  });
});

describe("dimension default", () => {
  it("may name one of the values", () => {
    expect(field("default", "touch")).toEqual([]);
  });

  it("must be a valid name among the values", () => {
    expect(field("default", 1)).toEqual([d("wrong-type", "$.default")]);
    expect(field("default", "")).toEqual([d("empty-string", "$.default")]);
    expect(field("default", "pen")).toEqual([d("unknown-dimension-value", "$.default")]);
  });
});
