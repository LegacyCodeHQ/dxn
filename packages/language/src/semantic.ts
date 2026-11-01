import type { Located, ParseResult } from "./ast.js";
import { links, wordAt } from "./definition.js";
import { parse } from "./parse.js";
import { kindsOf } from "./rename-at.js";

// A name in a source, and what it is: its kind, as a declaration's, and
// whether it is where that is declared.
export interface Token {
  line: number;
  column: number;
  length: number;
  kind: string;
  declaration: boolean;
}

// Every name in a source that the file declares, where it is declared and
// where it is used, each with its kind, in the order they are written: for
// an editor to colour by what each name is, not by how it looks.
export function tokens(source: string, file: ParseResult = parse(source)): Token[] {
  const lines = source.split("\n");
  const kinds = kindsOf(file);
  const result: Token[] = [];
  const add = (at: Located, kind: string) =>
    result.push({
      line: at.line,
      column: at.column,
      length: wordAt(lines, at.line, at.column).length,
      kind,
      declaration: true,
    });
  for (const [at, { kind }] of kinds) add(at, kind);
  for (const record of file.records) for (const field of record.fields) add(field, "field");
  for (const { from, to } of links(source, file)) {
    const kind = kinds.get(to)?.kind;
    if (kind !== undefined) result.push({ ...from, kind, declaration: false });
  }
  result.sort((a, b) => a.line - b.line || a.column - b.column);
  // A name is one token: the first found where two start at one place.
  return result.filter(
    (token, index) =>
      index === 0 ||
      token.line !== result[index - 1]?.line ||
      token.column >= (result[index - 1]?.column ?? 0) + (result[index - 1]?.length ?? 0),
  );
}
