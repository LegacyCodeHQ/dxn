import type { Located } from "./ast.js";

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
  | "×"
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
// character at a time for the rest, skipping spaces and tabs.
export function scan(source: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let column = 1;
  let index = 0;
  while (index < source.length) {
    const char = source[index] as string;
    if (char === " " || char === "\t" || char === "\r") {
      index += 1;
      column += 1;
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
      while (end < source.length && wordPart.test(source[end] as string)) end += 1;
      const text = source.slice(index, end);
      tokens.push({ kind: "word", text, line, column });
      column += text.length;
      index = end;
      continue;
    }
    const kind: TokenKind =
      char === "*" ? "×" : "=|{}:,()×".includes(char) ? (char as TokenKind) : "other";
    tokens.push({ kind, text: char, line, column });
    index += 1;
    column += 1;
  }
  tokens.push({ kind: "end", text: "", line, column });
  return tokens;
}

// How a token reads in a message: its text quoted, or what it stands for.
export function describe(token: Token): string {
  if (token.kind === "newline") return "the end of the line";
  if (token.kind === "end") return "the end of the file";
  return JSON.stringify(token.text);
}

// A word's text, where it is.
export const located = (token: Token): Located => ({
  name: token.text,
  line: token.line,
  column: token.column,
});
