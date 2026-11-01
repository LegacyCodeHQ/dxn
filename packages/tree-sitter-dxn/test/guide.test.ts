import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Every dxn example in the language guide parses with the tree-sitter
// grammar, without an ERROR or a MISSING node, so the two cannot drift apart
// silently.

const grammar = join(__dirname, "..");
const guide = join(grammar, "../../docs/language/guide.md");

// The tree-sitter command the workspace installs, from the nearest
// node_modules/.bin.
const treeSitter = (() => {
  for (let directory = grammar; ; directory = dirname(directory)) {
    const bin = join(directory, "node_modules/.bin/tree-sitter");
    if (existsSync(bin)) return bin;
    if (dirname(directory) === directory) throw new Error("tree-sitter-cli is not installed");
  }
})();

// A fenced block with no language is dxn unless it is what a command prints,
// or the grammar itself.
const printed: { pattern: RegExp; reason: string }[] = [
  { pattern: /^\|/, reason: "a table a command prints" },
  { pattern: /^[\w./-]+:\d+:\d+: /, reason: "a problem, with its place" },
  { pattern: /^dxn: /, reason: "a refusal of the dxn command" },
  { pattern: /^[\w.-]+: /, reason: "a summary, or a problem without its place" },
  { pattern: /^(Attached|Renamed|Missing:|In every row:)/, reason: "a command's answer" },
  { pattern: /^\S+\.dxn\s+#/, reason: "a folder of stored records" },
  { pattern: /^file\s+=/, reason: "the grammar, in the Reference section" },
];

// dxn examples that are not meant to parse, each matched by a line in it.
const excluded: { line: string; reason: string }[] = [
  {
    line: "enum Hover = rest hovered",
    reason: "shows a syntax error: the missing | is the point of the example",
  },
  {
    line: "  ...",
    reason: "elides the rest of the type with ...",
  },
];

// A part of a type, shown on its own: its members, without the type around.
const member = /^(state|has|on|alike|action|event|provides) |^[a-z][\w-]* = \S+ only when /;

interface Example {
  line: number;
  source: string;
  fragment: boolean;
}

const examples: Example[] = [];
const used = new Set<string>();
const lines = readFileSync(guide, "utf8").split("\n");
for (let index = 0; index < lines.length; index += 1) {
  const fence = /^```(\w*)$/.exec(lines[index] as string);
  if (fence === null) continue;
  const start = index + 1;
  let end = start;
  while (lines[end] !== "```") end += 1;
  index = end;
  if (fence[1] !== "" && fence[1] !== "dxn") continue;
  const block = lines.slice(start, end);
  const first = block.find((line) => line.trim() !== "" && !line.startsWith("#")) ?? "";
  const output = fence[1] === "" ? printed.find(({ pattern }) => pattern.test(first)) : undefined;
  if (output !== undefined) {
    used.add(output.reason);
    continue;
  }
  const exclusion = excluded.find(({ line }) => block.includes(line));
  if (exclusion !== undefined) {
    used.add(exclusion.line);
    continue;
  }
  const source = `${block.join("\n")}\n`;
  const fragment = member.test(first);
  examples.push({
    line: start + 1,
    source: fragment ? `type Fragment {\n${source}}\n` : source,
    fragment,
  });
}

const folder = mkdtempSync(join(tmpdir(), "tree-sitter-dxn-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

// The tree, or the problems in it, of each source.
const parse = (sources: string[]) => {
  const files = sources.map((source, index) => {
    const file = join(folder, `example-${index}.dxn`);
    writeFileSync(file, source);
    return file;
  });
  // It exits 1 when a file has an error, and still prints the summary.
  const run = (args: string[]) =>
    spawnSync(treeSitter, args, { cwd: grammar, encoding: "utf8" }).stdout;
  const output = run(["parse", "--quiet", "--json-summary", ...files]);
  const json = output.slice(output.indexOf("{"));
  const { parse_summaries } = JSON.parse(json) as {
    parse_summaries: { file: string; successful: boolean }[];
  };
  return parse_summaries.map(({ file, successful }) =>
    successful ? "ok" : run(["parse", "--no-ranges", file]),
  );
};

describe("the guide's examples", () => {
  it("are found, with every kind of output and every exclusion still in the guide", () => {
    expect(examples.length).toBeGreaterThan(30);
    expect(examples.some(({ fragment }) => fragment)).toBe(true);
    expect(
      [...printed.map(({ reason }) => reason), ...excluded.map(({ line }) => line)].filter(
        (each) => !used.has(each),
      ),
    ).toEqual([]);
  });

  it("parse without an ERROR or a MISSING node", () => {
    const results = parse(examples.map(({ source }) => source));
    const broken = examples
      .map(({ line }, index) => ({ line, result: results[index] }))
      .filter(({ result }) => result !== "ok");
    expect(broken).toEqual([]);
  });
});
