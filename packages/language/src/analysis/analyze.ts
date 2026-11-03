import type { ParseResult, SyntaxResult } from "../core/ast.js";
import { check } from "../evaluation/check.js";
import { expectations } from "../evaluation/expect.js";
import { conditionsInMatrix } from "../evaluation/matrix.js";
import { scope } from "../model/scope.js";

// Analyzes a fresh syntax read in place, once. Scope resolution changes names
// and adds nested declarations to the file, so an analyzed result is not input
// to this pass again. The public parse() entry point owns this sequence.
export function analyze(syntax: SyntaxResult): ParseResult {
  // A record an actor records is stored, each one about a combination: it
  // has context.
  for (const actor of syntax.actors) {
    const record = syntax.records.find(({ name }) => name === actor.records.name);
    if (record !== undefined) record.context = true;
  }
  const result = scope(syntax);
  check(result);
  // Conditions are checked against the combinations there really are, and
  // expectations against the tree in place: both need a file without other
  // problems. A condition error also prevents expectation execution.
  const clean = () => !result.diagnostics.some(({ severity }) => severity === "error");
  if (clean()) conditionsInMatrix(result);
  if (clean()) expectations(result);
  result.diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  return result as ParseResult;
}
