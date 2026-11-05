import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { checkProject } from "./check.mjs";

function project(t, files) {
  const root = mkdtempSync(join(tmpdir(), "dxn-boundaries-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  write("package.json", JSON.stringify({ workspaces: ["packages/language", "packages/cli"] }));
  write("packages/language/package.json", '{"name":"@legacycodehq/dxn-language"}');
  write("packages/cli/package.json", '{"name":"@legacycodehq/dxn"}');
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        paths: { "@language/*": ["./packages/language/src/*"], "@cli/*": ["./packages/cli/src/*"] },
      },
    }),
  );
  const defaults = {
    "packages/language/src/core/ast.ts": "export interface Type {}",
    "packages/language/src/model/names.ts": "export const names = [];",
    "packages/language/src/evaluation/evaluate.ts": "export const states = [];",
    "packages/language/src/analysis/semantic-analyzer.ts": "export function analyzeSemantics() {}",
    "packages/language/src/syntax/read.ts": "export function read() {}",
    "packages/language/src/syntax/parse.ts": "export function parse() {}",
    "packages/language/src/index.ts": 'export { parse } from "@language/syntax/parse.js";',
  };
  for (const [path, source] of Object.entries({ ...defaults, ...files })) write(path, source);
  return root;
}

test("accepts the facade, lower-layer imports, and the public package API", (t) => {
  const root = project(t, {
    "packages/language/src/syntax/parse.ts":
      'import { analyzeSemantics } from "@language/analysis/semantic-analyzer.js"; export function parse() { analyzeSemantics(); }',
    "packages/language/src/syntax/read.ts":
      'import type { Type } from "../core/ast.js"; export function read(): Type { return {}; }',
    "packages/cli/src/commands/check.ts": 'import { parse } from "@legacycodehq/dxn-language";',
  });
  assert.deepEqual(checkProject(root).problems, []);
});

for (const source of [
  'import { states } from "@language/evaluation/evaluate.js";',
  'export { states } from "../evaluation/evaluate.js";',
  'export type Leaked = import("@language/evaluation/evaluate.js").Type;',
  'const value = import("../evaluation/evaluate.js");',
  "const value = import(`@language/evaluation/evaluate.js`);",
  'import "@language/syntax/../evaluation/evaluate.js";',
  'import "@language/\\u0065valuation/evaluate.js";',
  'import { parse } from "@language/syntax/parse.js";',
  'import { parse } from "@legacycodehq/dxn-language";',
]) {
  test(`rejects a syntax reader's forbidden dependency: ${source}`, (t) => {
    const root = project(t, { "packages/language/src/syntax/read.ts": source });
    assert.match(checkProject(root).problems.join("\n"), /syntax\/read\.ts:1:.*cannot depend on/);
  });
}

for (const source of [
  'import type { Type } from "@language/core/ast.js";',
  'import type { Type } from "../../language/src/core/ast.js";',
  'import { parse } from "../../language/src/index.js";',
  'import { parse } from "@language/index.js";',
  'import { parse } from "@legacycodehq/dxn-language/syntax/parse.js";',
]) {
  test(`rejects bypassing the public package name: ${source}`, (t) => {
    const root = project(t, { "packages/cli/src/cli.ts": source });
    assert.match(checkProject(root).problems.join("\n"), /public package/);
  });
}

test("rejects computed imports rather than silently losing a dependency", (t) => {
  const root = project(t, {
    "packages/language/src/syntax/read.ts": "const name = 'x'; const value = import(name);",
  });
  assert.match(checkProject(root).problems.join("\n"), /literal module specifier/);
});

test("ignores comments and strings that look like imports, and leaves tests unrestricted", (t) => {
  const root = project(t, {
    "packages/language/src/syntax/read.ts":
      '// import "@language/evaluation/evaluate.js";\nconst example = \'import("bad")\';',
    "packages/language/test/probe.test.ts": 'import "@cli/cli.js";',
  });
  assert.deepEqual(checkProject(root).problems, []);
});

for (const folder of ["extra", "api", "parse"]) {
  test(`rejects an unreviewed source folder named ${folder}`, (t) => {
    const root = project(t, {
      [`packages/language/src/${folder}/new.ts`]: "export const value = 1;",
    });
    assert.match(checkProject(root).problems.join("\n"), /unclassified source/);
  });
}

for (const [from, to, specifier] of [
  ["language/src/core/ast.ts", "language/src/editor/hover.ts", "@language/editor/hover.js"],
  ["language/src/model/names.ts", "language/src/evidence/store.ts", "@language/evidence/store.js"],
  [
    "language/src/evaluation/evaluate.ts",
    "language/src/editor/hover.ts",
    "@language/editor/hover.js",
  ],
  [
    "language/src/data/json.ts",
    "language/src/evaluation/evaluate.ts",
    "@language/evaluation/evaluate.js",
  ],
  [
    "language/src/editor/hover.ts",
    "language/src/analysis/semantic-analyzer.ts",
    "@language/analysis/semantic-analyzer.js",
  ],
  [
    "language/src/analysis/semantic-analyzer.ts",
    "language/src/syntax/parse.ts",
    "@language/syntax/parse.js",
  ],
  ["cli/src/commands/support/context.ts", "cli/src/cli.ts", "../../cli.js"],
  ["language-server/src/protocol/range.ts", "language-server/src/server.ts", "../server.js"],
]) {
  test(`rejects the reversed dependency ${from} -> ${to}`, (t) => {
    const root = project(t, {
      [`packages/${to}`]: "export const value = 1;",
      [`packages/${from}`]: `import ${JSON.stringify(specifier)};`,
    });
    assert.match(checkProject(root).problems.join("\n"), /cannot depend on/);
  });
}

test("rejects cross-package imports expressed as file URLs", (t) => {
  const root = project(t, { "packages/cli/src/cli.ts": "" });
  const target = pathToFileURL(join(root, "packages/language/src/core/ast.ts")).href;
  writeFileSync(join(root, "packages/cli/src/cli.ts"), `import ${JSON.stringify(target)};`);
  assert.match(checkProject(root).problems.join("\n"), /public package/);
});

test("checks actual alias destinations, including newly named aliases", (t) => {
  const root = project(t, {
    "packages/language/src/syntax/read.ts": 'import "@innocent/evaluate.js";',
  });
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        paths: {
          "@language/*": ["./packages/language/src/*"],
          "@innocent/*": ["./packages/language/src/evaluation/*"],
        },
      },
    }),
  );
  assert.match(
    checkProject(root).problems.join("\n"),
    /syntax cannot depend on language\/evaluation/,
  );
});

test("rejects unresolved local imports and malformed TypeScript", (t) => {
  const root = project(t, {
    "packages/language/src/model/broken.ts": "export const =;",
    "packages/language/src/syntax/read.ts": 'import "./missing.js";',
  });
  const problems = checkProject(root).problems.join("\n");
  assert.match(problems, /cannot resolve/);
  assert.match(problems, /cannot parse/);
});

for (const [file, specifier, permitted] of [
  ["syntax/parse-tree-sitter.ts", "@legacycodehq/tree-sitter-dxn", true],
  ["syntax/read.ts", "@legacycodehq/tree-sitter-dxn", false],
  ["syntax/parse.ts", "@legacycodehq/tree-sitter-dxn", false],
  ["evaluation/evaluate.ts", "@legacycodehq/tree-sitter-dxn", false],
  ["syntax/parse-tree-sitter.ts", "@legacycodehq/tree-sitter-dxn/bindings/node", false],
]) {
  test(`grammar binding dependency: ${file} -> ${specifier}`, (t) => {
    const root = project(t, {
      [`packages/language/src/${file}`]: `import ${JSON.stringify(specifier)};`,
      "packages/tree-sitter-dxn/package.json": '{"name":"@legacycodehq/tree-sitter-dxn"}',
    });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        workspaces: ["packages/language", "packages/cli", "packages/tree-sitter-dxn"],
      }),
    );
    assert.equal(checkProject(root).problems.length, permitted ? 0 : 1);
  });
}

test("only parsing facades may orchestrate semantic analysis", (t) => {
  const root = project(t, {
    "packages/language/src/syntax/parse-tree-sitter.ts":
      'import { analyzeSemantics } from "@language/analysis/semantic-analyzer.js";',
    "packages/language/src/syntax/tree.ts":
      'import { analyzeSemantics } from "@language/analysis/semantic-analyzer.js";',
  });
  assert.match(checkProject(root).problems.join("\n"), /syntax\/tree\.ts:1:.*cannot depend on/);
  assert.equal(checkProject(root).problems.length, 1);
});
