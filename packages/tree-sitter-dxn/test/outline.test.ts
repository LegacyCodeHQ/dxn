import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// The outline Zed shows for a file, from the extension's outline query: each
// item by its keyword and name, indented under the item it is inside.

const grammar = join(__dirname, "..");
const query = join(grammar, "../zed/languages/dxn/outline.scm");
const sample = join(grammar, "../zed/test/highlight.dxn");

const treeSitter = (() => {
  for (let directory = grammar; ; directory = dirname(directory)) {
    const bin = join(directory, "node_modules/.bin/tree-sitter");
    if (existsSync(bin)) return bin;
    if (dirname(directory) === directory) throw new Error("tree-sitter-cli is not installed");
  }
})();

interface Capture {
  name: string;
  start: [number, number];
  end: [number, number];
  text: string;
}

// The captures of each match, as `tree-sitter query` prints them.
function matches(): Capture[][] {
  const run = spawnSync(treeSitter, ["query", query, sample], { cwd: grammar, encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr);
  const result: Capture[][] = [];
  for (const line of run.stdout.split("\n")) {
    if (/^\s*pattern: /.test(line)) result.push([]);
    const capture = line.match(
      /capture: (?:\d+ - )?(\w+), start: \((\d+), (\d+)\), end: \((\d+), (\d+)\)(?:, text: `(.*)`)?/,
    );
    if (capture === null) continue;
    const [, name, sr, sc, er, ec, text] = capture;
    result.at(-1)?.push({
      name: name as string,
      start: [Number(sr), Number(sc)],
      end: [Number(er), Number(ec)],
      text: text ?? "",
    });
  }
  return result;
}

const before = (a: [number, number], b: [number, number]) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);

function outline(): string[] {
  const items = matches().flatMap((captures) => {
    const item = captures.find(({ name }) => name === "item");
    const name = captures.find(({ name }) => name === "name");
    if (item === undefined || name === undefined) return [];
    const context = captures.filter(({ name }) => name === "context").map(({ text }) => text);
    return [{ item, label: [...context, name.text].join(" ") }];
  });
  items.sort((a, b) => (before(a.item.start, b.item.start) ? -1 : 1));
  return items.map(({ item, label }) => {
    const depth = items.filter(
      (other) =>
        other.item !== item &&
        before(other.item.start, item.start) &&
        before(item.end, other.item.end),
    ).length;
    return `${"  ".repeat(depth)}${label}`;
  });
}

describe("the outline", () => {
  it("lists the declarations, with each actor, inside a type its states, events, children and actions, and inside a record its fields", () => {
    expect(outline()).toMatchInlineSnapshot(`
      [
        "dimension Breakpoint",
        "dimension Pointer",
        "enum Hover",
        "enum Section",
        "enum Openness",
        "enum Selection",
        "enum Layout",
        "enum Focus",
        "type Link",
        "  receives current",
        "  event activate",
        "  state hover",
        "  state selection",
        "  state focus",
        "  action take-focus",
        "type Menu",
        "  event escape",
        "  state menu",
        "  state layout",
        "  has link",
        "  action close",
        "type Page",
        "  state current",
        "  has menu",
        "environment Device",
        "profile Phone",
        "profile Laptop",
        "modifier Trackpad",
        "actor Designer",
        "record Evidence",
        "  at",
        "  source",
        "enum Verdict",
        "enum Next",
        "actor Reviewer",
        "record Review",
        "  verdict",
        "  next",
        "expect "Escape closes the open menu"",
      ]
    `);
  });
});
