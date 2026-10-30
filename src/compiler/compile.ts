import type { Tree } from "../tree.js";
import { check } from "./check.js";
import { type Diagnostic, Diagnostics } from "./diagnostic.js";
import { parseJson } from "./json.js";

export interface CompileResult {
  // Present only when the source has no diagnostics.
  document?: Tree;
  diagnostics: Diagnostic[];
}

export function compile(source: string): CompileResult {
  const parsed = parseJson(source);
  if (parsed.root === undefined) {
    return { diagnostics: parsed.diagnostics };
  }
  const diagnostics = new Diagnostics(source);
  check(parsed.root, diagnostics);
  const all = [...parsed.diagnostics, ...diagnostics.items];
  if (all.length > 0) {
    return { diagnostics: all };
  }
  return { document: JSON.parse(source) as Tree, diagnostics: [] };
}
