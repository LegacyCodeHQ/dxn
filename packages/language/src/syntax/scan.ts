import type { Located } from "@language/core/ast.js";
import { type Words, words } from "@language/core/message.js";

export type TokenKind =
  | "word"
  | "="
  | "|"
  | "{"
  | "}"
  | ":"
  | ","
  | "("
  | ")"
  | "->"
  | "."
  | "string"
  | "unclosed"
  | "newline"
  | "end"
  | "other";

export interface Token {
  kind: TokenKind;
  text: string;
  line: number;
  column: number;
}

const wordStart = /[A-Za-z0-9]/;
const wordPart = /[A-Za-z0-9-]/;

// Splits the source into words, "=", "|", newlines and anything else, one
// character at a time for the rest, skipping spaces, tabs and comments. A
// line ends with a line feed, a carriage return and a line feed, or a
// carriage return alone; a byte order mark at the start is not text; and a
// column is a character, however it is encoded.
export function scan(source: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let column = 1;
  let index = source.startsWith("\uFEFF") ? 1 : 0;
  while (index < source.length) {
    const char = String.fromCodePoint(source.codePointAt(index) as number);
    if (char === "\r" && source[index + 1] !== "\n") {
      tokens.push({ kind: "newline", text: "\n", line, column });
      index += 1;
      line += 1;
      column = 1;
      continue;
    }
    // A \r before a \n is the end of a Windows line, as the \n is: it takes
    // no column, so a problem at the end of a line is where it is with \n.
    if (char === "\r") {
      index += 1;
      continue;
    }
    if (char === " " || char === "\t") {
      index += 1;
      column += 1;
      continue;
    }
    // A comment, from # to the end of the line; the line's end is kept.
    if (char === "#") {
      while (index < source.length && source[index] !== "\n" && source[index] !== "\r") {
        index += 1;
        column += 1;
      }
      continue;
    }
    if (char === "\n") {
      tokens.push({ kind: "newline", text: "\n", line, column });
      index += 1;
      line += 1;
      column = 1;
      continue;
    }
    if (wordStart.test(char)) {
      let end = index + 1;
      // A word ends before an arrow: "x->a" is "x", "->", "a".
      while (
        end < source.length &&
        wordPart.test(source[end] as string) &&
        !(source[end] === "-" && source[end + 1] === ">")
      ) {
        end += 1;
      }
      const text = source.slice(index, end);
      tokens.push({ kind: "word", text, line, column });
      column += text.length;
      index = end;
      continue;
    }
    // A quoted string, to its closing quote on the same line.
    if (char === '"') {
      let end = index + 1;
      while (
        end < source.length &&
        source[end] !== '"' &&
        source[end] !== "\n" &&
        source[end] !== "\r"
      ) {
        end += 1;
      }
      const closed = source[end] === '"';
      const text = source.slice(index + 1, end);
      tokens.push({ kind: closed ? "string" : "unclosed", text, line, column });
      index = end + (closed ? 1 : 0);
      column += [...text].length + (closed ? 2 : 1);
      continue;
    }
    if (char === "-" && source[index + 1] === ">") {
      tokens.push({ kind: "->", text: "->", line, column });
      index += 2;
      column += 2;
      continue;
    }
    const kind: TokenKind = "=|{}:,().".includes(char) ? (char as TokenKind) : "other";
    tokens.push({ kind, text: char, line, column });
    index += char.length;
    column += 1;
  }
  tokens.push({ kind: "end", text: "", line, column });
  return tokens;
}

// The lines of a source, however each ends: a line feed, a carriage return
// and a line feed, or a carriage return alone, as the scanner reads them.
export const sourceLines = (source: string): string[] => source.split(/\r\n|\r|\n/);

// How a token reads in a message: its text quoted, or what it stands for.
export function describe(token: Token): string | Words {
  if (token.kind === "newline") return words("the end of the line");
  if (token.kind === "end") return words("the end of the file");
  if (token.kind === "unclosed") return words("an unclosed quote");
  // A string, with its quotes, as it is written.
  if (token.kind === "string") return `"${token.text}"`;
  return token.text;
}

// A word's text, where it is, and how many characters it takes.
export const located = (token: Token): Located => ({
  name: token.text,
  line: token.line,
  column: token.column,
  length: [...token.text].length,
});
