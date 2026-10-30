import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { compileDirectory } from "../../src/compiler/compile.js";

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function project(files: Record<string, unknown>) {
  const directory = mkdtempSync(join(tmpdir(), "task-tree-"));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(
      join(directory, name),
      typeof content === "string" ? content : JSON.stringify(content, null, 2),
    );
  }
  return compileDirectory(directory);
}

function diagnose(files: Record<string, unknown>) {
  return project(files).diagnostics.map(({ file, code, path }) => ({ file, code, path }));
}

const tree = {
  version: 1,
  customAttributes: { design: { values: ["available", "missing"] } },
  types: { link: { states: ["normal", "hovered", "selected"] } },
  tasks: [
    {
      id: "page",
      title: "Page",
      children: [
        {
          id: "toolbar",
          title: "Toolbar",
          children: [
            { id: "blog-link", title: "Blog link", type: "link" },
            { id: "logo", title: "Logo" },
          ],
        },
      ],
    },
    { id: "footer-link", title: "Footer link", type: "link" },
  ],
};

const dimensions = {
  version: 1,
  dimensions: { pointer: { values: ["mouse", "touch"], appliesTo: ["page"] } },
};

function withDimensions(file: unknown) {
  return diagnose({ "tree.json": tree, "dimensions.json": file });
}

function dimension(declaration: unknown) {
  return withDimensions({ version: 1, dimensions: { pointer: declaration } });
}

function withOverrides(file: unknown) {
  return diagnose({ "tree.json": tree, "dimensions.json": dimensions, "overrides.json": file });
}

function touch(entry: unknown) {
  return withOverrides({ version: 1, overrides: { pointer: { touch: entry } } });
}

const at = (file: string, code: string, path: string) => ({ file, code, path });
const d = (code: string, path: string) => at("dimensions.json", code, path);
const o = (code: string, path: string) => at("overrides.json", code, path);

describe("compileDirectory", () => {
  it("compiles the article page example without diagnostics", () => {
    const result = compileDirectory(
      fileURLToPath(new URL("../../examples/article-page", import.meta.url)),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.project?.tree.tasks[0]?.id).toBe("article-page");
    expect(Object.keys(result.project?.dimensions?.dimensions ?? {})).toEqual([
      "breakpoint",
      "pointer",
    ]);
    expect(result.project?.overrides?.overrides.pointer?.touch?.types?.link?.states).toEqual({
      remove: ["hovered"],
    });
  });

  it("accepts a directory with only tree.json", () => {
    const result = project({ "tree.json": tree });
    expect(result.diagnostics).toEqual([]);
    expect(result.project).toEqual({ tree });
  });

  it("ignores files it does not know", () => {
    expect(diagnose({ "tree.json": tree, "README.md": "# notes" })).toEqual([]);
  });

  it("requires tree.json", () => {
    const result = project({ "dimensions.json": dimensions });
    expect(result.project).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        file: "tree.json",
        code: "missing-file",
        message: "tree.json not found",
        path: "$",
        line: 1,
        column: 1,
      },
    ]);
  });

  it("reports a path that is a file, not a directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "task-tree-"));
    directories.push(directory);
    writeFileSync(join(directory, "tree.json"), JSON.stringify(tree));
    expect(compileDirectory(join(directory, "tree.json")).diagnostics).toMatchObject([
      { file: ".", code: "not-a-directory", path: "$", line: 1, column: 1 },
    ]);
  });

  it("reports a known file that is a directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "task-tree-"));
    directories.push(directory);
    mkdirSync(join(directory, "tree.json"));
    expect(compileDirectory(directory).diagnostics).toMatchObject([
      { file: "tree.json", code: "not-a-file", path: "$" },
    ]);
    rmSync(join(directory, "tree.json"), { recursive: true });
    writeFileSync(join(directory, "tree.json"), JSON.stringify(tree));
    mkdirSync(join(directory, "dimensions.json"));
    expect(compileDirectory(directory).diagnostics).toMatchObject([
      { file: "dimensions.json", code: "not-a-file", path: "$" },
    ]);
  });

  it("tags tree.json diagnostics with their file", () => {
    expect(diagnose({ "tree.json": { ...tree, extra: 1 } })).toEqual([
      at("tree.json", "unknown-key", "$.extra"),
    ]);
  });

  it("reports syntax errors with their file, line and column", () => {
    const result = project({ "tree.json": tree, "dimensions.json": "{\n  oops" });
    expect(result.diagnostics).toMatchObject([
      { file: "dimensions.json", code: "unexpected-token", line: 2, column: 3 },
    ]);
  });

  it("stops at a tree.json syntax error instead of cascading", () => {
    expect(diagnose({ "tree.json": "{", "dimensions.json": dimensions })).toEqual([
      at("tree.json", "unexpected-end", "$"),
    ]);
  });

  it("returns no project when there are diagnostics", () => {
    expect(project({ "tree.json": { ...tree, extra: 1 } }).project).toBeUndefined();
  });
});

describe("dimensions.json", () => {
  it("accepts dimensions over existing tasks", () => {
    expect(withDimensions(dimensions)).toEqual([]);
  });

  it("may point editors at the JSON schema", () => {
    expect(withDimensions({ $schema: "x", ...dimensions })).toEqual([]);
    expect(withDimensions({ $schema: 1, ...dimensions })).toEqual([d("wrong-type", "$.$schema")]);
  });

  it("must be an object with version and dimensions only", () => {
    expect(withDimensions([])).toEqual([d("wrong-type", "$")]);
    expect(withDimensions({})).toEqual([
      d("missing-key", "$.version"),
      d("missing-key", "$.dimensions"),
    ]);
    expect(withDimensions({ ...dimensions, extra: 1 })).toEqual([d("unknown-key", "$.extra")]);
    expect(withDimensions({ ...dimensions, version: 2 })).toEqual([
      d("unsupported-version", "$.version"),
    ]);
    expect(withDimensions({ version: 1, dimensions: [] })).toEqual([
      d("wrong-type", "$.dimensions"),
    ]);
  });

  it("requires dimension names to be non-blank without surrounding whitespace", () => {
    const declaration = { values: ["mouse"], appliesTo: ["page"] };
    expect(withDimensions({ version: 1, dimensions: { "": declaration } })).toEqual([
      d("empty-string", '$.dimensions[""]'),
    ]);
    expect(withDimensions({ version: 1, dimensions: { " pointer": declaration } })).toEqual([
      d("surrounding-whitespace", '$.dimensions[" pointer"]'),
    ]);
  });

  it("declares each dimension as an object with values and appliesTo", () => {
    expect(dimension("x")).toEqual([d("wrong-type", "$.dimensions.pointer")]);
    expect(dimension({})).toEqual([
      d("missing-key", "$.dimensions.pointer.values"),
      d("missing-key", "$.dimensions.pointer.appliesTo"),
    ]);
    expect(dimension({ values: ["a"], appliesTo: ["page"], kind: 1 })).toEqual([
      d("unknown-key", "$.dimensions.pointer.kind"),
    ]);
  });

  it("requires values to be at least one non-empty unique string", () => {
    const values = (v: unknown) => dimension({ values: v, appliesTo: ["page"] });
    expect(values("x")).toEqual([d("wrong-type", "$.dimensions.pointer.values")]);
    expect(values([])).toEqual([d("empty-values", "$.dimensions.pointer.values")]);
    expect(values([1])).toEqual([d("wrong-type", "$.dimensions.pointer.values[0]")]);
    expect(values([""])).toEqual([d("empty-string", "$.dimensions.pointer.values[0]")]);
    expect(values(["a", "a"])).toEqual([d("duplicate-value", "$.dimensions.pointer.values[1]")]);
    expect(values(["  "])).toEqual([d("empty-string", "$.dimensions.pointer.values[0]")]);
    expect(values(["sm "])).toEqual([
      d("surrounding-whitespace", "$.dimensions.pointer.values[0]"),
    ]);
  });

  it("requires appliesTo to name at least one existing task, once", () => {
    const appliesTo = (a: unknown) => dimension({ values: ["mouse"], appliesTo: a });
    expect(appliesTo("page")).toEqual([d("wrong-type", "$.dimensions.pointer.appliesTo")]);
    expect(appliesTo([])).toEqual([d("empty-applies-to", "$.dimensions.pointer.appliesTo")]);
    expect(appliesTo([1])).toEqual([d("wrong-type", "$.dimensions.pointer.appliesTo[0]")]);
    expect(appliesTo(["nope"])).toEqual([d("unknown-task", "$.dimensions.pointer.appliesTo[0]")]);
    expect(appliesTo(["page", "page"])).toEqual([
      d("duplicate-task", "$.dimensions.pointer.appliesTo[1]"),
    ]);
  });
});

describe("overrides.json", () => {
  it("may point editors at the JSON schema", () => {
    expect(withOverrides({ $schema: "x", version: 1, overrides: {} })).toEqual([]);
    expect(withOverrides({ $schema: 1, version: 1, overrides: {} })).toEqual([
      o("wrong-type", "$.$schema"),
    ]);
  });

  it("must be an object with version and overrides only", () => {
    expect(withOverrides([])).toEqual([o("wrong-type", "$")]);
    expect(withOverrides({})).toEqual([
      o("missing-key", "$.version"),
      o("missing-key", "$.overrides"),
    ]);
    expect(withOverrides({ version: 1, overrides: {}, extra: 1 })).toEqual([
      o("unknown-key", "$.extra"),
    ]);
    expect(withOverrides({ version: 1, overrides: [] })).toEqual([o("wrong-type", "$.overrides")]);
  });

  it("keys overrides by declared dimensions and their values", () => {
    expect(withOverrides({ version: 1, overrides: { theme: {} } })).toEqual([
      o("undeclared-dimension", "$.overrides.theme"),
    ]);
    expect(withOverrides({ version: 1, overrides: { pointer: [] } })).toEqual([
      o("wrong-type", "$.overrides.pointer"),
    ]);
    expect(withOverrides({ version: 1, overrides: { pointer: { pen: {} } } })).toEqual([
      o("unknown-dimension-value", "$.overrides.pointer.pen"),
    ]);
  });

  it("reports every override dimension as undeclared without dimensions.json", () => {
    expect(
      diagnose({ "tree.json": tree, "overrides.json": { version: 1, overrides: { pointer: {} } } }),
    ).toEqual([o("undeclared-dimension", "$.overrides.pointer")]);
  });

  it("targets only types and tasks under a dimension value", () => {
    expect(touch([])).toEqual([o("wrong-type", "$.overrides.pointer.touch")]);
    expect(touch({ screens: {} })).toEqual([o("unknown-key", "$.overrides.pointer.touch.screens")]);
    expect(touch({ types: [] })).toEqual([o("wrong-type", "$.overrides.pointer.touch.types")]);
    expect(touch({ tasks: [] })).toEqual([o("wrong-type", "$.overrides.pointer.touch.tasks")]);
  });
});

describe("type overrides", () => {
  const link = (entry: unknown) => touch({ types: { link: entry } });
  const base = "$.overrides.pointer.touch.types.link";

  it("must target a defined type with states and customAttributes only", () => {
    expect(touch({ types: { button: {} } })).toEqual([
      o("undefined-type", "$.overrides.pointer.touch.types.button"),
    ]);
    expect(link([])).toEqual([o("wrong-type", base)]);
    expect(link({ title: "x" })).toEqual([o("unknown-key", `${base}.title`)]);
  });

  it("remove and add states", () => {
    expect(link({ states: { remove: ["hovered"], add: ["pressed"] } })).toEqual([]);
  });

  it("change states with add and remove lists only", () => {
    expect(link({ states: [] })).toEqual([o("wrong-type", `${base}.states`)]);
    expect(link({ states: { rename: [] } })).toEqual([o("unknown-key", `${base}.states.rename`)]);
    expect(link({ states: { remove: "hovered" } })).toEqual([
      o("wrong-type", `${base}.states.remove`),
    ]);
    expect(link({ states: { add: [""] } })).toEqual([o("empty-string", `${base}.states.add[0]`)]);
    expect(link({ states: { add: [" pressed"] } })).toEqual([
      o("surrounding-whitespace", `${base}.states.add[0]`),
    ]);
  });

  it("remove only states the type has, once", () => {
    expect(link({ states: { remove: ["pressed"] } })).toEqual([
      o("unknown-state", `${base}.states.remove[0]`),
    ]);
    expect(link({ states: { remove: ["hovered", "hovered"] } })).toEqual([
      o("duplicate-state", `${base}.states.remove[1]`),
    ]);
  });

  it("add only states the type does not have", () => {
    expect(link({ states: { add: ["normal"] } })).toEqual([
      o("duplicate-state", `${base}.states.add[0]`),
    ]);
  });

  it("do not add a state they remove", () => {
    expect(link({ states: { remove: ["hovered"], add: ["hovered"] } })).toEqual([
      o("conflicting-state", `${base}.states.add[0]`),
    ]);
  });

  it("set declared values for the states they leave and add", () => {
    expect(
      link({
        states: { remove: ["hovered"], add: ["pressed"] },
        customAttributes: { design: { normal: "missing", pressed: "missing" } },
      }),
    ).toEqual([]);
  });

  it("reject values for undeclared attributes, unknown states and undeclared values", () => {
    expect(
      link({
        customAttributes: { implemented: {}, design: { pressed: "missing", normal: "maybe" } },
      }),
    ).toEqual([
      o("undeclared-attribute", `${base}.customAttributes.implemented`),
      o("unknown-state", `${base}.customAttributes.design.pressed`),
      o("unknown-value", `${base}.customAttributes.design.normal`),
    ]);
  });

  it("reject values for a state they remove", () => {
    expect(
      link({
        states: { remove: ["hovered"] },
        customAttributes: { design: { hovered: "missing" } },
      }),
    ).toEqual([o("removed-state", `${base}.customAttributes.design.hovered`)]);
  });
});

describe("task overrides", () => {
  const base = "$.overrides.pointer.touch.tasks";

  it("override a typed task within the dimension's scope", () => {
    expect(
      touch({ tasks: { "blog-link": { customAttributes: { design: { normal: "missing" } } } } }),
    ).toEqual([]);
  });

  it("must target an existing task", () => {
    expect(touch({ tasks: { nope: {} } })).toEqual([o("unknown-task", `${base}.nope`)]);
  });

  it("must target a task the dimension applies to", () => {
    expect(touch({ tasks: { "footer-link": {} } })).toEqual([
      o("task-out-of-scope", `${base}.footer-link`),
    ]);
  });

  it("require the task to have a type", () => {
    expect(touch({ tasks: { logo: {} } })).toEqual([o("override-without-type", `${base}.logo`)]);
  });

  it("start from the type's states after the type's override for the same value", () => {
    expect(
      touch({
        types: { link: { states: { remove: ["hovered"] } } },
        tasks: {
          "blog-link": {
            states: { remove: ["hovered"] },
            customAttributes: { design: { hovered: "missing" } },
          },
        },
      }),
    ).toEqual([
      o("removed-state", `${base}.blog-link.states.remove[0]`),
      o("removed-state", `${base}.blog-link.customAttributes.design.hovered`),
    ]);
  });
});
