import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "../../src/compiler/compile.js";

function diagnose(doc: unknown) {
  return compile(JSON.stringify(doc, null, 2)).diagnostics.map(({ code, path }) => ({
    code,
    path,
  }));
}

const declarations = { design: { values: ["available", "missing"] } };
const types = { link: { states: ["normal", "hovered", "selected"] } };

function withTask(task: unknown) {
  return { version: 1, customAttributes: declarations, types, tasks: [task] };
}

describe("compile", () => {
  it("compiles the article page example without diagnostics", () => {
    const source = readFileSync(
      new URL("../../examples/article-page/tree.json", import.meta.url),
      "utf8",
    );
    const result = compile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.tasks[0]?.id).toBe("article-page");
  });

  it("returns no document when there are diagnostics", () => {
    const result = compile("{");
    expect(result.document).toBeUndefined();
    expect(result.diagnostics.map((d) => d.code)).toEqual(["unexpected-end"]);
  });

  it("reports the position and message of a diagnostic", () => {
    const result = compile('{\n  "version": 1,\n  "tasks": [],\n  "extra": true\n}');
    expect(result.diagnostics).toEqual([
      { code: "unknown-key", message: 'unknown key "extra"', path: "$.extra", line: 4, column: 3 },
    ]);
  });
});

describe("root", () => {
  it("accepts the smallest valid document", () => {
    expect(diagnose({ version: 1, tasks: [] })).toEqual([]);
  });

  it("must be an object", () => {
    expect(diagnose([])).toEqual([{ code: "wrong-type", path: "$" }]);
  });

  it("requires version and tasks", () => {
    expect(diagnose({})).toEqual([
      { code: "missing-key", path: "$.version" },
      { code: "missing-key", path: "$.tasks" },
    ]);
  });

  it("rejects unknown keys", () => {
    expect(diagnose({ version: 1, tasks: [], extra: 1 })).toEqual([
      { code: "unknown-key", path: "$.extra" },
    ]);
  });
});

describe("$schema", () => {
  it("may point editors at the JSON schema", () => {
    expect(diagnose({ $schema: "../../schema/tree.schema.json", version: 1, tasks: [] })).toEqual(
      [],
    );
  });

  it("must be a string", () => {
    expect(diagnose({ $schema: 1, version: 1, tasks: [] })).toEqual([
      { code: "wrong-type", path: "$.$schema" },
    ]);
  });
});

describe("version", () => {
  it("must be a number", () => {
    expect(diagnose({ version: "1", tasks: [] })).toEqual([
      { code: "wrong-type", path: "$.version" },
    ]);
  });

  it("must be 1", () => {
    expect(diagnose({ version: 2, tasks: [] })).toEqual([
      { code: "unsupported-version", path: "$.version" },
    ]);
  });
});

describe("tasks", () => {
  it("must be an array", () => {
    expect(diagnose({ version: 1, tasks: {} })).toEqual([{ code: "wrong-type", path: "$.tasks" }]);
  });

  it("must contain objects", () => {
    expect(diagnose({ version: 1, tasks: [1] })).toEqual([
      { code: "wrong-type", path: "$.tasks[0]" },
    ]);
  });
});

describe("task", () => {
  it("requires id and title", () => {
    expect(diagnose(withTask({ id: "a" }))).toEqual([
      { code: "missing-key", path: "$.tasks[0].title" },
    ]);
    expect(diagnose(withTask({ title: "A" }))).toEqual([
      { code: "missing-key", path: "$.tasks[0].id" },
    ]);
  });

  it("rejects keys outside the core DSL", () => {
    expect(diagnose(withTask({ id: "a", title: "A", design: {} }))).toEqual([
      { code: "unknown-key", path: "$.tasks[0].design" },
    ]);
  });
});

describe("task id", () => {
  it("must be a string", () => {
    expect(diagnose(withTask({ id: 1, title: "A" }))).toEqual([
      { code: "wrong-type", path: "$.tasks[0].id" },
    ]);
  });

  it("must not be empty", () => {
    expect(diagnose(withTask({ id: "", title: "A" }))).toEqual([
      { code: "empty-string", path: "$.tasks[0].id" },
    ]);
  });

  it("must be unique across the whole tree", () => {
    expect(
      diagnose(withTask({ id: "a", title: "A", children: [{ id: "a", title: "Again" }] })),
    ).toEqual([{ code: "duplicate-id", path: "$.tasks[0].children[0].id" }]);
  });
});

describe("task title", () => {
  it("must be a string", () => {
    expect(diagnose(withTask({ id: "a", title: 1 }))).toEqual([
      { code: "wrong-type", path: "$.tasks[0].title" },
    ]);
  });

  it("must not be empty", () => {
    expect(diagnose(withTask({ id: "a", title: "" }))).toEqual([
      { code: "empty-string", path: "$.tasks[0].title" },
    ]);
  });
});

describe("task type", () => {
  it("must be a string", () => {
    expect(diagnose(withTask({ id: "a", title: "A", type: 1 }))).toEqual([
      { code: "wrong-type", path: "$.tasks[0].type" },
    ]);
  });

  it("must name a defined type", () => {
    expect(diagnose(withTask({ id: "a", title: "A", type: "button" }))).toEqual([
      { code: "undefined-type", path: "$.tasks[0].type" },
    ]);
  });
});

describe("task children", () => {
  it("must be an array", () => {
    expect(diagnose(withTask({ id: "a", title: "A", children: {} }))).toEqual([
      { code: "wrong-type", path: "$.tasks[0].children" },
    ]);
  });

  it("are checked as tasks", () => {
    expect(diagnose(withTask({ id: "a", title: "A", children: [{ id: "b" }] }))).toEqual([
      { code: "missing-key", path: "$.tasks[0].children[0].title" },
    ]);
  });
});

describe("customAttributes declarations", () => {
  function declare(customAttributes: unknown) {
    return diagnose({ version: 1, customAttributes, tasks: [] });
  }

  it("must be an object", () => {
    expect(declare([])).toEqual([{ code: "wrong-type", path: "$.customAttributes" }]);
  });

  it("declare each attribute as an object", () => {
    expect(declare({ design: "x" })).toEqual([
      { code: "wrong-type", path: "$.customAttributes.design" },
    ]);
  });

  it("require values", () => {
    expect(declare({ design: {} })).toEqual([
      { code: "missing-key", path: "$.customAttributes.design.values" },
    ]);
  });

  it("reject unknown keys", () => {
    expect(declare({ design: { values: ["a"], color: 1 } })).toEqual([
      { code: "unknown-key", path: "$.customAttributes.design.color" },
    ]);
  });

  it("require values to be an array", () => {
    expect(declare({ design: { values: "x" } })).toEqual([
      { code: "wrong-type", path: "$.customAttributes.design.values" },
    ]);
  });

  it("require at least one value", () => {
    expect(declare({ design: { values: [] } })).toEqual([
      { code: "empty-values", path: "$.customAttributes.design.values" },
    ]);
  });

  it("require values to be non-empty unique strings", () => {
    expect(declare({ design: { values: [1] } })).toEqual([
      { code: "wrong-type", path: "$.customAttributes.design.values[0]" },
    ]);
    expect(declare({ design: { values: [""] } })).toEqual([
      { code: "empty-string", path: "$.customAttributes.design.values[0]" },
    ]);
    expect(declare({ design: { values: ["a", "a"] } })).toEqual([
      { code: "duplicate-value", path: "$.customAttributes.design.values[1]" },
    ]);
  });
});

describe("types", () => {
  function define(typeMap: unknown) {
    return diagnose({ version: 1, customAttributes: declarations, types: typeMap, tasks: [] });
  }

  it("must be an object", () => {
    expect(define([])).toEqual([{ code: "wrong-type", path: "$.types" }]);
  });

  it("define each type as an object", () => {
    expect(define({ link: 1 })).toEqual([{ code: "wrong-type", path: "$.types.link" }]);
  });

  it("reject unknown keys", () => {
    expect(define({ link: { kind: "x" } })).toEqual([
      { code: "unknown-key", path: "$.types.link.kind" },
    ]);
  });
});

describe("type states", () => {
  function states(value: unknown) {
    return diagnose({ version: 1, types: { link: { states: value } }, tasks: [] });
  }

  it("may be empty", () => {
    expect(states([])).toEqual([]);
  });

  it("must be an array", () => {
    expect(states("x")).toEqual([{ code: "wrong-type", path: "$.types.link.states" }]);
  });

  it("must be non-empty unique strings", () => {
    expect(states([1])).toEqual([{ code: "wrong-type", path: "$.types.link.states[0]" }]);
    expect(states([""])).toEqual([{ code: "empty-string", path: "$.types.link.states[0]" }]);
    expect(states(["a", "a"])).toEqual([
      { code: "duplicate-state", path: "$.types.link.states[1]" },
    ]);
  });
});

describe("type customAttributes", () => {
  function values(customAttributes: unknown) {
    return diagnose({
      version: 1,
      customAttributes: declarations,
      types: { link: { states: ["normal", "hovered", "selected"], customAttributes } },
      tasks: [],
    });
  }

  it("accept a value for each state", () => {
    expect(values({ design: { normal: "available", selected: "missing" } })).toEqual([]);
  });

  it("must be an object", () => {
    expect(values([])).toEqual([{ code: "wrong-type", path: "$.types.link.customAttributes" }]);
  });

  it("must use declared attributes", () => {
    expect(values({ implemented: {} })).toEqual([
      { code: "undeclared-attribute", path: "$.types.link.customAttributes.implemented" },
    ]);
  });

  it("map states to values with an object", () => {
    expect(values({ design: "available" })).toEqual([
      { code: "wrong-type", path: "$.types.link.customAttributes.design" },
    ]);
  });

  it("must use the type's states", () => {
    expect(values({ design: { pressed: "available" } })).toEqual([
      { code: "unknown-state", path: "$.types.link.customAttributes.design.pressed" },
    ]);
  });

  it("must use declared values", () => {
    expect(values({ design: { normal: 1 } })).toEqual([
      { code: "wrong-type", path: "$.types.link.customAttributes.design.normal" },
    ]);
    expect(values({ design: { normal: "maybe" } })).toEqual([
      { code: "unknown-value", path: "$.types.link.customAttributes.design.normal" },
    ]);
  });
});

describe("task customAttributes", () => {
  it("override the type's values", () => {
    expect(
      diagnose(
        withTask({
          id: "a",
          title: "A",
          type: "link",
          customAttributes: { design: { selected: "available" } },
        }),
      ),
    ).toEqual([]);
  });

  it("require the task to have a type", () => {
    expect(diagnose(withTask({ id: "a", title: "A", customAttributes: { design: {} } }))).toEqual([
      { code: "attributes-without-type", path: "$.tasks[0].customAttributes" },
    ]);
  });

  it("must use declared attributes, the type's states and declared values", () => {
    expect(
      diagnose(
        withTask({
          id: "a",
          title: "A",
          type: "link",
          customAttributes: {
            implemented: {},
            design: { pressed: "available", normal: "maybe" },
          },
        }),
      ),
    ).toEqual([
      { code: "undeclared-attribute", path: "$.tasks[0].customAttributes.implemented" },
      { code: "unknown-state", path: "$.tasks[0].customAttributes.design.pressed" },
      { code: "unknown-value", path: "$.tasks[0].customAttributes.design.normal" },
    ]);
  });

  it("are not checked against an undefined type", () => {
    expect(
      diagnose(
        withTask({
          id: "a",
          title: "A",
          type: "button",
          customAttributes: { design: { pressed: "available" } },
        }),
      ),
    ).toEqual([{ code: "undefined-type", path: "$.tasks[0].type" }]);
  });
});
