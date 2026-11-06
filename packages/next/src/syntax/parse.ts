import type { EnumDeclaration, Name, Span } from "@next/model/enumeration.js";
import { scan, type Token } from "./scan.js";

// The grammar of lean/notes/enumerations.md:
//
//   file        = declaration*
//   declaration = "enum" word "{" [ word { "," word } ] "}"
//
// Empty braces are read, so the checker can report an enumeration with no
// values. A trailing comma is a syntax error. Reading stops at the first
// syntax error, keeping the declarations read before it.

/** Text the grammar cannot read, and where. */
export interface SyntaxProblem {
  message: string;
  at: Span;
}

/** What a source reads as: its declarations, and the syntax error that stopped reading, if any. */
export interface ParsedFile {
  declarations: EnumDeclaration[];
  problems: SyntaxProblem[];
}

class Stop {
  constructor(readonly problem: SyntaxProblem) {}
}

/** How a token is written in a message. */
function shown(token: Token): string {
  switch (token.kind) {
    case "word":
    case "unexpected":
      return `'${token.text}'`;
    case "end":
      return "the end of the file";
    default:
      return `'${token.kind}'`;
  }
}

/** Read a source's enumeration declarations. */
export function parse(source: string): ParsedFile {
  const tokens = scan(source);
  const end: Token = { kind: "end", span: { start: source.length, end: source.length } };
  let next = 0;
  const peek = (): Token => tokens[next] ?? end;
  const fail = (expected: string): never => {
    const token = peek();
    throw new Stop({ message: `expected ${expected}, found ${shown(token)}`, at: token.span });
  };
  const word = (expected: string): Name => {
    const token = peek();
    if (token.kind !== "word") return fail(expected);
    next++;
    return { text: token.text, span: token.span };
  };
  const punctuation = (kind: "{" | "}" | ",", expected: string): Span => {
    const token = peek();
    if (token.kind !== kind) return fail(expected);
    next++;
    return token.span;
  };

  const declaration = (): EnumDeclaration => {
    const keyword = peek();
    if (keyword.kind !== "word" || keyword.text !== "enum") fail("'enum'");
    next++;
    const name = word("an enumeration name after 'enum'");
    punctuation("{", "'{' after the enumeration name");
    const values: Name[] = [];
    if (peek().kind !== "}") {
      values.push(word("a value name or '}'"));
      while (peek().kind === ",") {
        const comma = punctuation(",", "','");
        if (peek().kind === "}") {
          throw new Stop({
            message: "a trailing comma is not allowed after the last value",
            at: comma,
          });
        }
        values.push(word("a value name after ','"));
      }
    }
    const close = punctuation("}", values.length === 0 ? "'}'" : "',' or '}' after a value");
    return { name, values, span: { start: keyword.span.start, end: close.end } };
  };

  const declarations: EnumDeclaration[] = [];
  try {
    while (peek().kind !== "end") declarations.push(declaration());
  } catch (error) {
    if (error instanceof Stop) return { declarations, problems: [error.problem] };
    throw error;
  }
  return { declarations, problems: [] };
}
