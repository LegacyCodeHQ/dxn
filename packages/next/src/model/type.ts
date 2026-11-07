import type { EnumDeclaration, Name, Span } from "@next/model/enumeration.js";

/** A type as written: its name and the enumerations it varies over, in written order. */
export interface TypeDeclaration {
  readonly kind: "type";
  readonly name: Name;
  readonly varies: readonly Name[];
  readonly span: Span;
}

export type Declaration = EnumDeclaration | TypeDeclaration;

export function isType(d: Declaration): d is TypeDeclaration {
  return "varies" in d;
}

export function isEnumeration(d: Declaration): d is EnumDeclaration {
  return !isType(d);
}
