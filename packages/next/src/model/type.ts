import type { EnumDeclaration, Name, Span } from "@next/model/enumeration.js";
import type { RecordDeclaration } from "@next/model/record.js";

/** A type as written: its name and the enumerations it varies over, in written order. */
export interface TypeDeclaration {
  readonly kind: "type";
  readonly name: Name;
  readonly varies: readonly Name[];
  readonly span: Span;
}

export type Declaration = EnumDeclaration | TypeDeclaration | RecordDeclaration;

export function isType(d: Declaration): d is TypeDeclaration {
  return "varies" in d;
}

export function isEnumeration(d: Declaration): d is EnumDeclaration {
  return "values" in d;
}

export function isRecord(d: Declaration): d is RecordDeclaration {
  return "fields" in d;
}
