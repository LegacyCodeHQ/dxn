import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { snippets } from "../../language/test/agreement/read.js";

// What the grammar reads in each snippet it shares with parse.ts: without an
// error or a missing node, or not.

const grammar = join(__dirname, "..");

const treeSitter = (() => {
  for (let directory = grammar; ; directory = dirname(directory)) {
    const bin = join(directory, "node_modules/.bin/tree-sitter");
    if (existsSync(bin)) return bin;
    if (dirname(directory) === directory) throw new Error("tree-sitter-cli is not installed");
  }
})();

const shared = snippets();
const folder = mkdtempSync(join(tmpdir(), "dxn-agreement-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

// Each snippet's file, and the files the grammar reads with an error, from one
// run: `tree-sitter parse --quiet` prints a line only for those.
const files = shared.map(({ source }, index) => {
  const file = join(folder, `${index}.dxn`);
  writeFileSync(file, source);
  return file;
});
const run = spawnSync(treeSitter, ["parse", "--quiet", ...files], {
  cwd: grammar,
  encoding: "utf8",
});
const failed = new Set(
  run.stdout
    .split("\n")
    .filter((line) => /\((ERROR|MISSING)\b/.test(line))
    .map((line) => line.split("\t")[0]),
);

describe("the snippets the grammar shares with parse.ts", () => {
  it.each(shared.map((snippet, index) => [`${snippet.file}: ${snippet.title}`, index] as const))(
    "%s",
    (_, index) => {
      const file = files[index] as string;
      expect(failed.has(file) ? "error" : "ok").toBe(shared[index]?.treeSitter);
    },
  );
});
