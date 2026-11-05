import { analyzeSemantics } from "@language/analysis/semantic-analyzer.js";
import type { ParseResult } from "@language/core/ast.js";
import { read } from "@language/syntax/read.js";

// The compatible entry point: read syntax and perform semantic analysis, including
// source conditions and expectations, returning all diagnostics in source order.
export function parse(source: string): ParseResult {
  return analyzeSemantics(read(source));
}
