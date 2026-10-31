import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { compileDirectory } from "../../src/compiler/compile.js";
import {
  cleanup,
  compileFiles,
  diagnose,
  rootFile,
  tree,
  types,
  writeProject,
} from "../support/project.js";

afterAll(cleanup);

const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(parts.map((part) => Buffer.from(part as string)));

describe("compileDirectory", () => {
  it("compiles the website example without diagnostics", () => {
    const snapshot: unknown[] = [];
    const result = compileDirectory(
      fileURLToPath(new URL("../../examples/website", import.meta.url)),
    );
    snapshot.push(result.diagnostics);
    snapshot.push(result.project?.roots.map(({ id }) => id));
    snapshot.push(Object.keys(result.project?.dimensions ?? {}));
    snapshot.push(result.project?.overrides.pointer?.overrides.touch?.types?.link?.states);
    snapshot.push(result.project?.verification["article-page"]?.records);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [
          "article-page",
        ],
        [
          "breakpoint",
          "pointer",
        ],
        {
          "remove": [
            "hovered",
          ],
        },
        [
          {
            "actor": "agent",
            "at": "2026-10-30T19:20:00Z",
            "check": "visual",
            "context": {
              "breakpoint": "lg",
              "pointer": "mouse",
              "state": "hovered",
            },
            "node": "blog-link",
            "result": "passed",
          },
        ],
      ]
    `);
  });

  it("accepts a project with only types.json", () => {
    const snapshot: unknown[] = [];
    const result = compileFiles({ "types.json": types });
    snapshot.push(result.diagnostics);
    snapshot.push(result.project);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        {
          "combinations": {},
          "dimensions": {},
          "fragments": [],
          "overrides": {},
          "roots": [],
          "types": {
            "attributes": {
              "design": {
                "values": [
                  "available",
                  "missing",
                ],
              },
            },
            "types": {
              "link": {
                "states": [
                  "normal",
                  "hovered",
                  "selected",
                ],
              },
            },
            "version": 1,
          },
          "verification": {},
        },
      ]
    `);
  });

  it("requires types.json", () => {
    const snapshot: unknown[] = [];
    const result = compileFiles({ "roots/a.json": rootFile({ id: "a", title: "A" }) });
    snapshot.push(result.project);
    snapshot.push(result.diagnostics);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    undefined,
    [
      {
        "code": "missing-file",
        "column": 1,
        "file": "types.json",
        "line": 1,
        "message": "types.json not found",
        "path": "$",
      },
    ],
  ]
`);
  });

  it("ignores files and folders it does not know", () => {
    expect(
      diagnose({
        ...tree,
        "README.md": "# notes",
        "tree.json": {},
        "roots/notes.txt": "x",
        "notes/a.json": {},
      }),
    ).toEqual([]);
  });

  it("ignores folders inside the root, dimension and override folders", () => {
    const directory = writeProject(tree);
    mkdirSync(join(directory, "roots", "nested.json"));
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

  it("reports a root, dimension or override folder that is a file", () => {
    for (const folder of ["fragments", "roots", "dimensions", "overrides", "verification"]) {
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

  it("stop before dimensions and overrides when a node file does not parse", () => {
    expect(
      diagnose({
        ...tree,
        "roots/page.json": "{",
        "dimensions/pointer.json": { version: 1, values: ["touch"], appliesTo: ["page"] },
      }),
    ).toEqual([{ file: "roots/page.json", code: "unexpected-end", path: "$" }]);
  });
});

describe("encoding", () => {
  it("reports invalid UTF-8 at the first bad byte", () => {
    const snapshot: unknown[] = [];
    const directory = writeProject({});
    const write = (content: Buffer) => writeFileSync(join(directory, "types.json"), content);
    write(bytes('{\n  "a": "é', [0xff], '" }'));
    snapshot.push(compileDirectory(directory).diagnostics);
    // Valid four-byte sequences (U+1F600) pass.
    write(bytes('{ "version": 1, "types": { "', [0xf0, 0x9f, 0x98, 0x80], '": {} } }'));
    snapshot.push(compileDirectory(directory).diagnostics);
    // Above U+10FFFF, overlong, truncated, stray continuation and surrogate bytes do not.
    for (const bad of [
      [0xf4, 0x90, 0x80, 0x80],
      [0xe0, 0x80, 0x80],
      [0xe2, 0x82],
      [0x80],
      [0xed, 0xa0, 0x80],
    ]) {
      write(bytes('["', bad, '"]'));
      snapshot.push(compileDirectory(directory).diagnostics);
    }
    rmSync(directory, { recursive: true });
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "invalid-encoding",
            "column": 10,
            "file": "types.json",
            "line": 2,
            "message": "invalid UTF-8 byte 0xff",
            "path": "$",
          },
        ],
        [],
        [
          {
            "code": "invalid-encoding",
            "column": 3,
            "file": "types.json",
            "line": 1,
            "message": "invalid UTF-8 byte 0xf4",
            "path": "$",
          },
        ],
        [
          {
            "code": "invalid-encoding",
            "column": 3,
            "file": "types.json",
            "line": 1,
            "message": "invalid UTF-8 byte 0xe0",
            "path": "$",
          },
        ],
        [
          {
            "code": "invalid-encoding",
            "column": 3,
            "file": "types.json",
            "line": 1,
            "message": "invalid UTF-8 byte 0xe2",
            "path": "$",
          },
        ],
        [
          {
            "code": "invalid-encoding",
            "column": 3,
            "file": "types.json",
            "line": 1,
            "message": "invalid UTF-8 byte 0x80",
            "path": "$",
          },
        ],
        [
          {
            "code": "invalid-encoding",
            "column": 3,
            "file": "types.json",
            "line": 1,
            "message": "invalid UTF-8 byte 0xed",
            "path": "$",
          },
        ],
      ]
    `);
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

  it("reports invalid UTF-8 in a node file", () => {
    expect(diagnose({ ...tree, "roots/page.json": bytes("[", [0xff], "]") })).toEqual([
      { file: "roots/page.json", code: "invalid-encoding", path: "$" },
    ]);
  });
});
