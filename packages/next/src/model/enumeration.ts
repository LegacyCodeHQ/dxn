// The parsed form of an enumeration: what lean/Dxn/Enumeration.lean calls an
// EnumDecl, with where each name is written.

/** Where text is in a source: from offset `start` up to, not including, `end`. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** A name as written, and where. */
export interface Name {
  readonly text: string;
  readonly span: Span;
}

/** An enumeration as written: its name and its value names, in written order. */
export interface EnumDeclaration {
  readonly name: Name;
  readonly values: readonly Name[];
  readonly span: Span;
}

/** A value of an enumeration, tagged with the enumeration's name, as in a disjoint union. */
export interface Value {
  readonly enum: string;
  readonly name: string;
}
