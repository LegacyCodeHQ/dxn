import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// Where Zed shows a run button, from the extension's runnables query: each
// match's captures, by name, with the text they capture.

const grammar = join(__dirname, "..");
const query = join(grammar, "../zed/languages/dxn/runnables.scm");
const sample = join(grammar, "../zed/test/runnables.dxn");

const treeSitter = (() => {
  for (let directory = grammar; ; directory = dirname(directory)) {
    const bin = join(directory, "node_modules/.bin/tree-sitter");
    if (existsSync(bin)) return bin;
    if (dirname(directory) === directory) throw new Error("tree-sitter-cli is not installed");
  }
})();

// Each match as its captures, "<name>=<text>", in the order they are printed.
function matches(): string[] {
  const run = spawnSync(treeSitter, ["query", query, sample], { cwd: grammar, encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr);
  const result: string[][] = [];
  for (const line of run.stdout.split("\n")) {
    if (/^\s*pattern: /.test(line)) result.push([]);
    const capture = line.match(/capture: (?:\d+ - )?(\w+), .*text: `(.*)`/);
    if (capture !== null) result.at(-1)?.push(`${capture[1]}=${capture[2]}`);
  }
  return result.map((captures) => captures.join(" "));
}

describe("the run buttons", () => {
  it("are on each type's name, with its full name, and on each expectation's title", () => {
    expect(matches()).toMatchInlineSnapshot(`
      [
        "run=Menu type=Menu",
        "parent=Menu run=Toggle type=Toggle",
        "run=Page type=Page",
        "run="The menu can be open" title="The menu can be open"",
      ]
    `);
  });
});
