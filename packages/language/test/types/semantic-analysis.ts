// Compile-only contracts, included by make typecheck and never executed.
import { analyzeSemantics } from "@language/analysis/semantic-analyzer.js";
import type { ParseResult } from "@language/core/ast.js";
import { states } from "@language/evaluation/evaluate.js";
import { scope } from "@language/model/scope.js";
import { parse } from "@language/syntax/parse.js";
import { read } from "@language/syntax/read.js";

export function sourceStages(source: string): void {
  const syntax = read(source);
  const resolved = scope(read(source));
  const semanticResult = analyzeSemantics(read(source));
  const parsed = parse(source);

  states(semanticResult, "Item");
  states(parsed, "Item");

  // @ts-expect-error Evaluation requires resolved names, not raw syntax.
  states(syntax, "Item");
  // @ts-expect-error The resolved result cannot be resolved a second time.
  scope(resolved);
  // @ts-expect-error Semantic analysis starts from a fresh syntax read.
  analyzeSemantics(resolved);
  // @ts-expect-error A completed parse cannot be analyzed a second time.
  analyzeSemantics(parsed);
  // @ts-expect-error A completed parse cannot be resolved a second time.
  scope(parsed);
}

// Existing callers may construct the public data shape without a phase tag.
export function constructedFile(): ParseResult {
  return {
    enums: [],
    dimensions: [],
    types: [],
    environments: [],
    profiles: [],
    modifiers: [],
    records: [],
    actors: [],
    expectations: [],
    diagnostics: [],
  };
}
