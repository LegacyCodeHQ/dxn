import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// The scopes Zed knows a dxn file by, from the extension's overrides query:
// where its configuration says not to close a quote or bracket.

const grammar = join(__dirname, "..");
const zed = join(grammar, "../zed/languages/dxn");
const query = join(zed, "overrides.scm");
const sample = join(grammar, "../zed/test/highlight.dxn");

const treeSitter = (() => {
  for (let directory = grammar; ; directory = dirname(directory)) {
    const bin = join(directory, "node_modules/.bin/tree-sitter");
    if (existsSync(bin)) return bin;
    if (dirname(directory) === directory) throw new Error("tree-sitter-cli is not installed");
  }
})();

// Each capture's name, and the first line of the text it covers.
function captures(): string[] {
  const run = spawnSync(treeSitter, ["query", query, sample], { cwd: grammar, encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr || "the overrides query does not run");
  return [
    ...run.stdout.matchAll(/capture: (?:\d+ - )?([\w.]+), start: .*?(?:, text: `(.*)`)?$/gm),
  ].map(([, name, text]) => `${name} ${(text ?? "").split("\n")[0]}`);
}

describe("the overrides", () => {
  it("name the strings and comments of a file", () => {
    const snapshot: string[] = [];
    const found = captures();
    for (const name of ["string", "comment"]) {
      const covered = found.filter((each) => each.startsWith(`${name} `));
      snapshot.push(`${name}: ${covered.length}, the first ${covered[0]}`);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "string: 1, the first string "Escape closes the open menu"",
        "comment: 3, the first comment # Every construct of dxn, for checking the extension's queries.",
      ]
    `);
  });

  it("define every scope the configuration disables a pair in", () => {
    const config = readFileSync(join(zed, "config.toml"), "utf8");
    const named = [...config.matchAll(/not_in = \[(.*?)\]/g)].flatMap(([, list]) =>
      [...(list as string).matchAll(/"([^"]+)"/g)].map(([, scope]) => scope as string),
    );
    const defined = new Set(
      [...readFileSync(query, "utf8").matchAll(/@([\w]+)/g)].map(([, scope]) => scope),
    );
    expect(named.length).toBeGreaterThan(0);
    for (const scope of named) expect(defined, `scope ${scope}`).toContain(scope);
  });
});
