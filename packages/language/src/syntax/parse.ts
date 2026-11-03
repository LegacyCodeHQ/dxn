import { analyze } from "../analysis/analyze.js";
import type { ParseResult } from "../core/ast.js";
import { read } from "./read.js";

// The compatible full-analysis entry point: read, resolve, check and evaluate
// source conditions and expectations, returning all diagnostics in source order.
export function parse(source: string): ParseResult {
  return analyze(read(source));
}
