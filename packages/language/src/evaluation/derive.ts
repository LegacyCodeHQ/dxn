import type { RecordDeclaration } from "../core/ast.js";
import { resultFor } from "./evaluate.js";

// A field's value in a stored record: as stored, or, for a derived field, the
// value its when gives for the field it is on.
export function fieldValue(
  record: RecordDeclaration,
  entry: Record<string, unknown>,
  name: string,
): unknown {
  const field = record.fields.find((candidate) => candidate.name === name);
  if (field?.derived === undefined) return entry[name];
  const on = entry[field.derived.on.name];
  return typeof on === "string" ? resultFor(field.derived.branches, on) : undefined;
}
