import type { ParseResult, SyntaxResult } from "@language/core/ast.js";
import { expectations } from "@language/evaluation/expect.js";
import { conditionsInMatrix } from "@language/evaluation/matrix.js";
import { validateSemantics } from "@language/evaluation/semantic-validator.js";
import { scope } from "@language/model/scope.js";

// Semantically analyzes a fresh syntax read in place, once. Scope resolution
// changes names and adds nested declarations, so an analyzed result is not input
// to this pass again. The public parse() entry point owns this sequence.
export function analyzeSemantics(syntax: SyntaxResult): ParseResult {
  // A record an actor records is stored, each one about a combination: it
  // has context.
  for (const actor of syntax.actors) {
    const record = syntax.records.find(({ name }) => name === actor.records.name);
    if (record !== undefined) record.context = true;
  }
  const result = scope(syntax);
  validateSemantics(result);
  // Conditions are checked against the combinations there really are, and
  // expectations against the tree in place: both need a file without other
  // problems. A condition error also prevents expectation execution.
  const clean = () => !result.diagnostics.some(({ severity }) => severity === "error");
  if (clean()) conditionsInMatrix(result);
  if (clean()) expectations(result);
  result.diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  return result as ParseResult;
}
