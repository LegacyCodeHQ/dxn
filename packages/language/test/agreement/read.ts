import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Shared snippets record both implementations' current outcomes. Enums,
// types, states and documentation are migrating to the agreed syntax contract
// in Tree-sitter first; each difference must say why it is intentional.

export type Outcome = "ok" | "error";

export interface Snippet {
  file: string;
  title: string;
  parse: Outcome;
  treeSitter: Outcome;
  // Why the grammar reads it otherwise than parse.ts.
  reason?: string;
  source: string;
}

// Every snippet, from each .txt file beside this one: "=== <title>", the two
// outcomes, "---", then the source, to the next "===".
export function snippets(): Snippet[] {
  return readdirSync(__dirname)
    .filter((name) => name.endsWith(".txt"))
    .sort()
    .flatMap((file) =>
      readFileSync(join(__dirname, file), "utf8")
        .split(/^=== /m)
        .slice(1)
        .map((block) => {
          const [head = "", source = ""] = block.split(/^---\n/m);
          const [title = "", ...outcomes] = head.trim().split("\n");
          const outcome = (tool: string) => {
            const line = outcomes.find((each) => each.startsWith(`${tool}: `)) ?? "";
            const [, value, reason] = line.match(/^[\w.-]+: (ok|error)(?: \((.+)\))?$/) ?? [];
            if (value === undefined) throw new Error(`${file}: "${title}" has no ${tool} outcome`);
            return { value: value as Outcome, reason };
          };
          const parse = outcome("parse.ts");
          const treeSitter = outcome("tree-sitter");
          return {
            file,
            title,
            parse: parse.value,
            treeSitter: treeSitter.value,
            reason: treeSitter.reason,
            source: `${source.trimEnd()}\n`,
          };
        }),
    );
}
