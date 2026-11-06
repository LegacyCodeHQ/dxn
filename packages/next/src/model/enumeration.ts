// The parsed form of an enumeration: what lean/Dxn/Enumeration.lean calls an
// EnumDecl, with where each name is written.

/** Where text is in a source: from offset `start` up to, not including, `end`. */
export interface Span {
  start: number;
  end: number;
}

/** A name as written, and where. */
export interface Name {
  text: string;
  span: Span;
}

/** An enumeration as written: its name and its value names, in written order. */
export interface EnumDeclaration {
  name: Name;
  values: Name[];
  span: Span;
}

/** A value of an enumeration, tagged with the enumeration's name, as in a disjoint union. */
export interface Value {
  enum: string;
  name: string;
}
