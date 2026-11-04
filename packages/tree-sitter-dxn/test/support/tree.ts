import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ConcreteNode } from "@language/syntax/tree.js";

// Test-only bridge from the native CLI's named tree to the adapter's node port.
// This keeps CLI launching and byte-offset conversion out of production code.
export function concreteTree(source: string): ConcreteNode {
  const grammar = join(__dirname, "../..");
  let directory = grammar;
  while (!existsSync(join(directory, "node_modules/.bin/tree-sitter"))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error("tree-sitter-cli is not installed");
    directory = parent;
  }
  const folder = mkdtempSync(join(tmpdir(), "dxn-adapter-"));
  try {
    const file = join(folder, "source.dxn");
    writeFileSync(file, source);
    const result = spawnSync(join(directory, "node_modules/.bin/tree-sitter"), ["parse", file], {
      cwd: grammar,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr);
    const bytes = Buffer.from(source);
    const lines = [0];
    for (let index = 0; index < bytes.length; index++) {
      if (bytes[index] === 10) lines.push(index + 1);
    }
    const offset = (row: string, column: string) =>
      bytes.subarray(0, (lines[Number(row)] ?? 0) + Number(column)).toString().length;
    const stack: { indent: number; node: Node }[] = [];
    let root: Node | undefined;
    for (const line of result.stdout.split("\n")) {
      const match = /^( *)(?:(\w+): )?\((\w+) \[(\d+), (\d+)\] - \[(\d+), (\d+)\]/.exec(line);
      if (!match) continue;
      const [
        ,
        spaces = "",
        field,
        type = "",
        row = "0",
        column = "0",
        endRow = "0",
        endColumn = "0",
      ] = match;
      const startIndex = offset(row, column);
      const endIndex = offset(endRow, endColumn);
      const node = new Node(type, startIndex, endIndex, source.slice(startIndex, endIndex));
      while (stack.length && (stack.at(-1)?.indent ?? 0) >= spaces.length) stack.pop();
      const parent = stack.at(-1)?.node;
      if (parent) {
        parent.namedChildren.push(node);
        if (field) parent.fields.set(field, node);
      } else root = node;
      stack.push({ indent: spaces.length, node });
    }
    if (!root) throw new Error(result.stderr + result.stdout);
    root.hasError = result.status !== 0;
    return root;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

class Node implements ConcreteNode {
  namedChildren: Node[] = [];
  fields = new Map<string, Node>();
  hasError = false;
  constructor(
    readonly type: string,
    readonly startIndex: number,
    readonly endIndex: number,
    readonly text: string,
  ) {}
  childForFieldName(name: string) {
    // Bindings may create a fresh wrapper for the same underlying node.
    const node = this.fields.get(name);
    return node ? new Proxy(node, {}) : null;
  }
}
