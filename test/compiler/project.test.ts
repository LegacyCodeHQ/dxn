import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { compileDirectory } from "../../src/compiler/compile.js";
import {
  cleanup,
  compileFiles,
  diagnose,
  taskFile,
  tree,
  types,
  writeProject,
} from "../support/project.js";

afterAll(cleanup);

const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(parts.map((part) => Buffer.from(part as string)));

describe("compileDirectory", () => {
  it("compiles the website example without diagnostics", () => {
    const result = compileDirectory(
      fileURLToPath(new URL("../../examples/website", import.meta.url)),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.project?.tasks.map(({ id }) => id)).toEqual(["article-page"]);
    expect(Object.keys(result.project?.dimensions ?? {})).toEqual(["breakpoint", "pointer"]);
    expect(result.project?.overrides.pointer?.overrides.touch?.types?.link?.states).toEqual({
      remove: ["hovered"],
    });
    expect(result.project?.verification["article-page"]?.records).toHaveLength(1);
  });

  it("accepts a project with only types.json", () => {
    const result = compileFiles({ "types.json": types });
    expect(result.diagnostics).toEqual([]);
    expect(result.project).toEqual({
      types,
      tasks: [],
      dimensions: {},
      overrides: {},
      combinations: {},
      verification: {},
    });
  });

  it("requires types.json", () => {
    const result = compileFiles({ "tasks/a.json": taskFile({ id: "a", title: "A" }) });
    expect(result.project).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        file: "types.json",
        code: "missing-file",
        message: "types.json not found",
        path: "$",
        line: 1,
        column: 1,
      },
    ]);
  });

  it("ignores files and folders it does not know", () => {
    expect(
      diagnose({
        ...tree,
        "README.md": "# notes",
        "tree.json": {},
        "tasks/notes.txt": "x",
        "notes/a.json": {},
      }),
    ).toEqual([]);
  });

  it("ignores folders inside the task, dimension and override folders", () => {
    const directory = writeProject(tree);
    mkdirSync(join(directory, "tasks", "nested.json"));
    expect(compileDirectory(directory).diagnostics).toEqual([]);
  });

  it("returns no project when there are diagnostics", () => {
    expect(compileFiles({ "types.json": { ...types, extra: 1 } }).project).toBeUndefined();
  });
});

describe("filesystem", () => {
  it("reports a path that is a file, not a directory", () => {
    const directory = writeProject(tree);
    expect(compileDirectory(join(directory, "types.json")).diagnostics).toMatchObject([
      { file: ".", code: "not-a-directory", path: "$", line: 1, column: 1 },
    ]);
  });

  it("reports types.json that is a directory", () => {
    const directory = writeProject({});
    mkdirSync(join(directory, "types.json"));
    expect(compileDirectory(directory).diagnostics).toMatchObject([
      { file: "types.json", code: "not-a-file", path: "$" },
    ]);
  });

  it("reports a task, dimension or override folder that is a file", () => {
    for (const folder of ["tasks", "dimensions", "overrides", "verification"]) {
      const directory = writeProject({ "types.json": types });
      writeFileSync(join(directory, folder), "");
      expect(compileDirectory(directory).diagnostics).toMatchObject([
        { file: folder, code: "not-a-directory", path: "$" },
      ]);
    }
  });

  it("reports syntax errors with their file, line and column", () => {
    const result = compileFiles({ ...tree, "dimensions/pointer.json": "{\n  oops" });
    expect(result.diagnostics).toMatchObject([
      { file: "dimensions/pointer.json", code: "unexpected-token", line: 2, column: 3 },
    ]);
  });
});

describe("cascades", () => {
  it("stop at a types.json syntax error", () => {
    expect(diagnose({ ...tree, "types.json": "{" })).toEqual([
      { file: "types.json", code: "unexpected-end", path: "$" },
    ]);
  });

  it("stop before dimensions and overrides when a task file does not parse", () => {
    expect(
      diagnose({
        ...tree,
        "tasks/page.json": "{",
        "dimensions/pointer.json": { version: 1, values: ["touch"], appliesTo: ["page"] },
      }),
    ).toEqual([{ file: "tasks/page.json", code: "unexpected-end", path: "$" }]);
  });
});

describe("encoding", () => {
  it("reports invalid UTF-8 at the first bad byte", () => {
    const directory = writeProject({});
    const write = (content: Buffer) => writeFileSync(join(directory, "types.json"), content);
    write(bytes('{\n  "a": "é', [0xff], '" }'));
    expect(compileDirectory(directory).diagnostics).toMatchObject([
      { file: "types.json", code: "invalid-encoding", line: 2, column: 10 },
    ]);
    // Valid four-byte sequences (U+1F600) pass.
    write(bytes('{ "version": 1, "types": { "', [0xf0, 0x9f, 0x98, 0x80], '": {} } }'));
    expect(compileDirectory(directory).diagnostics).toEqual([]);
    // Above U+10FFFF, overlong, truncated, stray continuation and surrogate bytes do not.
    for (const bad of [
      [0xf4, 0x90, 0x80, 0x80],
      [0xe0, 0x80, 0x80],
      [0xe2, 0x82],
      [0x80],
      [0xed, 0xa0, 0x80],
    ]) {
      write(bytes('["', bad, '"]'));
      expect(compileDirectory(directory).diagnostics).toMatchObject([
        { file: "types.json", code: "invalid-encoding", line: 1, column: 3 },
      ]);
    }
    rmSync(directory, { recursive: true });
  });

  it("reports unreadable dimension and override files without follow-on errors", () => {
    expect(
      diagnose({
        ...tree,
        "dimensions/pointer.json": bytes("[", [0xff], "]"),
        "overrides/pointer.json": bytes("[", [0xff], "]"),
      }),
    ).toEqual([
      { file: "dimensions/pointer.json", code: "invalid-encoding", path: "$" },
      { file: "overrides/pointer.json", code: "invalid-encoding", path: "$" },
    ]);
  });

  it("reports invalid UTF-8 in a task file", () => {
    expect(diagnose({ ...tree, "tasks/page.json": bytes("[", [0xff], "]") })).toEqual([
      { file: "tasks/page.json", code: "invalid-encoding", path: "$" },
    ]);
  });
});
