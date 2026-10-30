import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, compileFiles, diagnose, taskFile, types } from "../support/project.js";

afterAll(cleanup);

const k = at("tasks/a.json");
const file = (doc: unknown) => diagnose({ "types.json": types, "tasks/a.json": doc });
const task = (value: unknown) => file(taskFile(value));

describe("task files", () => {
  it("accept one root task named after the file", () => {
    expect(task({ id: "a", title: "A" })).toEqual([]);
  });

  it("must be an object with version and task", () => {
    const snapshot: unknown[] = [];
    snapshot.push(file([]));
    snapshot.push(file({}));
    snapshot.push(file({ ...taskFile({ id: "a", title: "A" }), extra: 1 }));
    snapshot.push(file({ version: 2, task: { id: "a", title: "A" } }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "tasks/a.json",
        "path": "$",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "tasks/a.json",
        "path": "$.version",
      },
      {
        "code": "missing-key",
        "file": "tasks/a.json",
        "path": "$.task",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "tasks/a.json",
        "path": "$.extra",
      },
    ],
    [
      {
        "code": "unsupported-version",
        "file": "tasks/a.json",
        "path": "$.version",
      },
    ],
  ]
`);
  });

  it("may point editors at the JSON schema", () => {
    const snapshot: unknown[] = [];
    snapshot.push(file({ $schema: "x", ...taskFile({ id: "a", title: "A" }) }));
    snapshot.push(file({ $schema: 1, ...taskFile({ id: "a", title: "A" }) }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      {
        "code": "wrong-type",
        "file": "tasks/a.json",
        "path": "$.$schema",
      },
    ],
  ]
`);
  });

  it("hold the task as an object", () => {
    expect(task([])).toEqual([k("wrong-type", "$.task")]);
  });

  it("must be named after the root task's id", () => {
    expect(task({ id: "b", title: "B" })).toEqual([k("file-name-mismatch", "$.task.id")]);
  });

  it("are returned in file name order", () => {
    const result = compileFiles({
      "types.json": types,
      "tasks/b.json": taskFile({ id: "b", title: "B" }),
      "tasks/a.json": taskFile({ id: "a", title: "A" }),
    });
    expect(result.project?.tasks.map(({ id }) => id)).toEqual(["a", "b"]);
  });
});

describe("task", () => {
  it("requires id and title", () => {
    const snapshot: unknown[] = [];
    snapshot.push(task({ id: "a" }));
    snapshot.push(task({ title: "A" }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "missing-key",
        "file": "tasks/a.json",
        "path": "$.task.title",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "tasks/a.json",
        "path": "$.task.id",
      },
    ],
  ]
`);
  });

  it("rejects keys outside the core DSL", () => {
    expect(task({ id: "a", title: "A", design: {} })).toEqual([k("unknown-key", "$.task.design")]);
  });

  it("reports deeply nested tasks instead of crashing", () => {
    // Built as text: JSON.stringify itself overflows the stack at this depth.
    const depth = 5000;
    const open = '{ "id": "t", "title": "T", "children": ['.repeat(depth);
    const source = `{ "version": 1, "task": ${open}${"] }".repeat(depth)} }`;
    expect(diagnose({ "types.json": types, "tasks/a.json": source })).toEqual([k("too-deep", "$")]);
  });
});

describe("task id", () => {
  const id = (value: unknown) => task({ id: value, title: "A" });

  it("must be a valid name", () => {
    const snapshot: unknown[] = [];
    snapshot.push(id(1));
    snapshot.push(id(""));
    snapshot.push(id("  "));
    snapshot.push(id("a "));
    snapshot.push(id("a\u0000"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "tasks/a.json",
        "path": "$.task.id",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "tasks/a.json",
        "path": "$.task.id",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "tasks/a.json",
        "path": "$.task.id",
      },
    ],
    [
      {
        "code": "surrounding-whitespace",
        "file": "tasks/a.json",
        "path": "$.task.id",
      },
    ],
    [
      {
        "code": "control-character",
        "file": "tasks/a.json",
        "path": "$.task.id",
      },
    ],
  ]
`);
  });

  it("must be unique within a file", () => {
    expect(task({ id: "a", title: "A", children: [{ id: "a", title: "Again" }] })).toEqual([
      k("duplicate-id", "$.task.children[0].id"),
    ]);
  });

  it("must be unique across files, naming where it was first used", () => {
    const result = compileFiles({
      "types.json": types,
      "tasks/a.json": taskFile({ id: "a", title: "A", children: [{ id: "x", title: "X" }] }),
      "tasks/b.json": taskFile({ id: "b", title: "B", children: [{ id: "x", title: "X" }] }),
    });
    expect(result.diagnostics).toMatchObject([
      {
        file: "tasks/b.json",
        code: "duplicate-id",
        path: "$.task.children[0].id",
        message: 'task id "x" is already used at tasks/a.json $.task.children[0]',
      },
    ]);
  });
});

describe("task title", () => {
  const title = (value: unknown) => task({ id: "a", title: value });

  it("must be a non-blank string without control characters", () => {
    const snapshot: unknown[] = [];
    snapshot.push(title(1));
    snapshot.push(title(""));
    snapshot.push(title(" \t"));
    snapshot.push(title("A\u0007"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "tasks/a.json",
        "path": "$.task.title",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "tasks/a.json",
        "path": "$.task.title",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "tasks/a.json",
        "path": "$.task.title",
      },
    ],
    [
      {
        "code": "control-character",
        "file": "tasks/a.json",
        "path": "$.task.title",
      },
    ],
  ]
`);
  });

  it("may have surrounding whitespace", () => {
    expect(title(" A ")).toEqual([]);
  });
});

describe("task type", () => {
  it("must be a string", () => {
    expect(task({ id: "a", title: "A", type: 1 })).toEqual([k("wrong-type", "$.task.type")]);
  });

  it("must name a type in types.json", () => {
    expect(task({ id: "a", title: "A", type: "button" })).toEqual([
      k("undefined-type", "$.task.type"),
    ]);
  });
});

describe("task children", () => {
  it("must be an array", () => {
    expect(task({ id: "a", title: "A", children: {} })).toEqual([
      k("wrong-type", "$.task.children"),
    ]);
  });

  it("are checked as tasks", () => {
    expect(task({ id: "a", title: "A", children: [{ id: "b" }] })).toEqual([
      k("missing-key", "$.task.children[0].title"),
    ]);
  });
});

describe("task customAttributes", () => {
  const withAttributes = (customAttributes: unknown, type: unknown = "link") =>
    task({ id: "a", title: "A", type, customAttributes });
  const path = "$.task.customAttributes";

  it("override the type's values", () => {
    expect(withAttributes({ design: { selected: "available" } })).toEqual([]);
  });

  it("require the task to have a type", () => {
    expect(task({ id: "a", title: "A", customAttributes: { design: {} } })).toEqual([
      k("attributes-without-type", path),
    ]);
  });

  it("must use declared attributes, the type's states and declared values", () => {
    expect(
      withAttributes({ implemented: {}, design: { pressed: "available", normal: "maybe" } }),
    ).toEqual([
      k("undeclared-attribute", `${path}.implemented`),
      k("unknown-state", `${path}.design.pressed`),
      k("unknown-value", `${path}.design.normal`),
    ]);
  });

  it("are not checked against an undefined type", () => {
    expect(withAttributes({ design: { pressed: "available" } }, "button")).toEqual([
      k("undefined-type", "$.task.type"),
    ]);
  });
});
