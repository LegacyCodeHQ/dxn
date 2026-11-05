import type { ConcreteNode } from "@language/syntax/tree.js";
import Dxn from "@legacycodehq/tree-sitter-dxn";
import Parser from "tree-sitter";

// Exercise lowering against the real binding, including its UTF-16 offsets
// and field wrappers. The agreement tests independently exercise the CLI.
export function concreteTree(source: string): ConcreteNode {
  const parser = new Parser();
  parser.setLanguage(Dxn);
  return parser.parse(source).rootNode;
}
