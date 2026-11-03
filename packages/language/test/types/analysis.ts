// Compile-only contracts, included by make typecheck and never executed.
import { analyze } from "../../src/analysis/analyze.js";
import type { ParseResult } from "../../src/core/ast.js";
import { states } from "../../src/evaluation/evaluate.js";
import { scope } from "../../src/model/scope.js";
import { parse } from "../../src/syntax/parse.js";
import { read } from "../../src/syntax/read.js";

export function sourceStages(source: string): void {
  const syntax = read(source);
  const resolved = scope(read(source));
  const analyzed = analyze(read(source));
  const parsed = parse(source);

  states(analyzed, "Item");
  states(parsed, "Item");

  // @ts-expect-error Evaluation requires resolved names, not raw syntax.
  states(syntax, "Item");
  // @ts-expect-error The resolved result cannot be resolved a second time.
  scope(resolved);
  // @ts-expect-error Analysis starts from a fresh syntax read.
  analyze(resolved);
  // @ts-expect-error A completed parse cannot be analyzed a second time.
  analyze(parsed);
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
