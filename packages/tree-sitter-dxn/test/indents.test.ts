import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// How Zed indents a dxn file as it is typed or pasted into, from the
// extension's indents query: what it indents, and where it ends.

const grammar = join(__dirname, "..");
const query = join(grammar, "../zed/languages/dxn/indents.scm");
const sample = join(grammar, "../zed/test/highlight.dxn");

const treeSitter = (() => {
  for (let directory = grammar; ; directory = dirname(directory)) {
    const bin = join(directory, "node_modules/.bin/tree-sitter");
    if (existsSync(bin)) return bin;
    if (dirname(directory) === directory) throw new Error("tree-sitter-cli is not installed");
  }
})();

// Each capture's name, and where it starts, as "name row:column".
function captures(): string[] {
  const run = spawnSync(treeSitter, ["query", query, sample], { cwd: grammar, encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr || "the indents query does not run");
  return [...run.stdout.matchAll(/capture: (?:\d+ - )?(\w+), start: \((\d+), (\d+)\)/g)].map(
    ([, name, row, column]) => `${name} ${row}:${column}`,
  );
}

describe("the indents", () => {
  it("indent what is inside each pair of braces and brackets, and end at its closing one", () => {
    const source = readFileSync(sample, "utf8");
    // Where each closing brace and bracket is, outside strings and comments.
    const closing: string[] = [];
    source.split("\n").forEach((line, row) => {
      const code = line
        .replace(/"[^"]*"/g, (quoted) => " ".repeat(quoted.length))
        .replace(/#.*$/, "");
      for (const [column, char] of [...code].entries()) {
        if (char === "}" || char === ")" || char === "]") closing.push(`end ${row}:${column}`);
      }
    });
    const found = captures();
    expect(found.filter((each) => each.startsWith("end ")).sort()).toEqual(closing.sort());
    expect(found.filter((each) => each.startsWith("indent ")).length).toBe(closing.length);
  });
});
