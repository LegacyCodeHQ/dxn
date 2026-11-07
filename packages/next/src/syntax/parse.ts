import type { EnumDeclaration, Name, Span } from "@next/model/enumeration.js";
import type { RecordDeclaration, RecordField } from "@next/model/record.js";
import type { Declaration, TypeDeclaration } from "@next/model/type.js";
import { scan, type Token } from "./scan.js";

// The syntax contract in notebook/reference/{enumerations,types}.md:
//
//   file        = declaration*
//   declaration = enumeration | type
//   enumeration = "enum" word "{" [ word { "," word } ] "}"
//   type        = "type" word "{" [ "varies" word { "," word } ] "}"
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
  declarations: Declaration[];
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

/** Read a source's enumeration and type declarations. */
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
  const punctuation = (kind: "{" | "}" | "," | ":", expected: string): Span => {
    const token = peek();
    if (token.kind !== kind) return fail(expected);
    next++;
    return token.span;
  };

  const enumeration = (): EnumDeclaration => {
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

  const typeDeclaration = (): TypeDeclaration => {
    const keyword = peek();
    next++;
    const name = word("a type name after 'type'");
    punctuation("{", "'{' after the type name");
    const varies: Name[] = [];
    if (peek().kind !== "}") {
      const token = peek();
      if (token.kind !== "word" || token.text !== "varies") fail("'varies' or '}'");
      next++;
      varies.push(word("an enumeration name after 'varies'"));
      while (peek().kind === ",") {
        const comma = punctuation(",", "','");
        if (peek().kind === "}") {
          throw new Stop({
            message: "a trailing comma is not allowed after the last enumeration",
            at: comma,
          });
        }
        varies.push(word("an enumeration name after ','"));
      }
    }
    const close = punctuation("}", varies.length ? "',' or '}' after an enumeration name" : "'}'");
    return { kind: "type", name, varies, span: { start: keyword.span.start, end: close.end } };
  };
  const recordDeclaration = (): RecordDeclaration => {
    const keyword = peek();
    next++;
    const name = word("a record name after 'record'");
    const open = punctuation("{", "'{' after the record name");
    const fields: RecordField[] = [];
    const requireSameLine = (previous: Span) => {
      if (/[\r\n\u2028\u2029]/u.test(source.slice(previous.end, peek().span.start)))
        fail("a field name, ':' and its type on the same line");
    };
    while (peek().kind !== "}") {
      const field = word("a field name or '}'");
      requireSameLine(field.span);
      const colon = punctuation(":", "':' after the field name");
      requireSameLine(colon);
      const type = word("an enumeration or record name after ':'");
      fields.push({ name: field, type });
      if (
        peek().kind !== "}" &&
        !/[\r\n\u2028\u2029]/u.test(source.slice(type.span.end, peek().span.start))
      )
        fail("a newline between fields or '}'");
    }
    const close = punctuation("}", "'}' after the record fields");
    return {
      kind: "record",
      name,
      fields,
      body: { start: open.start, end: close.end },
      span: { start: keyword.span.start, end: close.end },
    };
  };
  const declaration = (): Declaration => {
    const token = peek();
    if (token.kind === "word" && token.text === "record") return recordDeclaration();
    if (token.kind === "word" && token.text === "type") return typeDeclaration();
    if (token.kind === "word" && token.text === "enum") return enumeration();
    return fail("'enum', 'type' or 'record'");
  };
  const declarations: Declaration[] = [];
  try {
    while (peek().kind !== "end") declarations.push(declaration());
  } catch (error) {
    if (error instanceof Stop) return { declarations, problems: [error.problem] };
    throw error;
  }
  return { declarations, problems: [] };
}
