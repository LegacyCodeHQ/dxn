import type { Located, ParseResult } from "@language/core/ast.js";
import { links } from "@language/editor/definition.js";
import { kindsOf } from "@language/editor/rename-at.js";
import { parse } from "@language/syntax/parse.js";
import { scan } from "@language/syntax/scan.js";

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
  const kinds = kindsOf(file);
  const result: Token[] = [];
  const add = (at: Located, kind: string) =>
    result.push({
      line: at.line,
      column: at.column,
      length: at.length,
      kind,
      declaration: true,
    });
  for (const [at, { kind }] of kinds) add(at, kind);
  for (const record of file.records) for (const field of record.fields) add(field, "field");
  for (const { from, to } of links(source, file)) {
    const kind = kinds.get(to)?.kind;
    if (kind !== undefined) result.push({ ...from, kind, declaration: false });
  }
  result.push(...documentationTokens(source));
  result.sort((a, b) => a.line - b.line || a.column - b.column);
  // A name is one token: the first found where two start at one place.
  return result.filter(
    (token, index) =>
      index === 0 ||
      token.line !== result[index - 1]?.line ||
      token.column >= (result[index - 1]?.column ?? 0) + (result[index - 1]?.length ?? 0),
  );
}

// Documentation is styled while it is being written, even before it attaches
// to a declaration or passes validation. The scanner excludes quoted markers.
function documentationTokens(source: string): Token[] {
  const result: Token[] = [];
  for (const comment of scan(source, { comments: true })) {
    if (comment.kind !== "comment" || !comment.text.startsWith("##")) continue;
    const tag = /^(##[ \t]*)(@[A-Za-z][A-Za-z0-9-]*)(?:([ \t]+)([^ \t]+))?/.exec(comment.text);
    let column = comment.column;
    const add = (text: string, kind = "dxnDocumentation") => {
      const length = [...text].length;
      if (length) result.push({ line: comment.line, column, length, kind, declaration: false });
      column += length;
    };
    if (!tag) {
      add(comment.text);
      continue;
    }
    const [, marker = "", name = "", gap = "", target = ""] = tag;
    add(marker);
    add(name, "dxnDocumentationTag");
    add(gap);
    add(target, "dxnDocumentationTarget");
    add(comment.text.slice(tag[0].length));
  }
  return result;
}
