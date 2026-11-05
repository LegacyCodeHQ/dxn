import { analyzeSemantics } from "@language/analysis/semantic-analyzer.js";
import type { ParseResult } from "@language/core/ast.js";
import { declarationsFromTree } from "@language/syntax/tree.js";
import Dxn from "@legacycodehq/tree-sitter-dxn";
import Parser from "tree-sitter";

// Migration entry point for the declarations supported by the AST adapter.
// Kept out of the main barrel so CLI/editor bundles retain their current
// parser until lowering and error-recovery compatibility are complete.
// Unsupported constructs and trees with syntax errors throw explicitly.
export function parseTreeSitter(source: string): ParseResult {
  const parser = new Parser();
  parser.setLanguage(Dxn);
  const tree = parser.parse(source);
  return analyzeSemantics({
    ...declarationsFromTree(source, tree.rootNode),
    dimensions: [],
    environments: [],
    profiles: [],
    modifiers: [],
    records: [],
    actors: [],
    expectations: [],
    diagnostics: [],
  });
}
