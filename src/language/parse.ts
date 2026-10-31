// A hand-written parser for the dimensions language. It grows one concept at
// a time; so far a file is a list of enum declarations:
//
//   file  = { blank-line | enum }
//   enum  = "enum" name "=" value { "|" [newline] value } newline
//   name  = capital letter, then letters and digits
//   value = a letter or digit, then letters, digits and hyphens
//
// Every name and value keeps its line and column, so later checks can point
// at it.

export interface Located {
  name: string;
  line: number;
  column: number;
}

export interface Enum extends Located {
  values: Located[];
}

export interface Diagnostic {
  code: string;
  message: string;
  line: number;
  column: number;
}

export interface ParseResult {
  enums: Enum[];
  diagnostics: Diagnostic[];
}

type TokenKind = "word" | "=" | "|" | "newline" | "end" | "other";

interface Token {
  kind: TokenKind;
  text: string;
  line: number;
  column: number;
}

const wordStart = /[A-Za-z0-9]/;
const wordPart = /[A-Za-z0-9-]/;

// Splits the source into words, "=", "|", newlines and anything else, one
// character at a time for the rest, skipping spaces and tabs.
function scan(source: string): Token[] {
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
    const kind: TokenKind = char === "=" ? "=" : char === "|" ? "|" : "other";
    tokens.push({ kind, text: char, line, column });
    index += 1;
    column += 1;
  }
  tokens.push({ kind: "end", text: "", line, column });
  return tokens;
}

// How a token reads in a message: its text quoted, or what it stands for.
function describe(token: Token): string {
  if (token.kind === "newline") return "the end of the line";
  if (token.kind === "end") return "the end of the file";
  return JSON.stringify(token.text);
}

class ParseFailure extends Error {}

export function parse(source: string): ParseResult {
  const tokens = scan(source);
  const result: ParseResult = { enums: [], diagnostics: [] };
  let position = 0;
  const peek = () => tokens[position] as Token;
  // The current token, moving past it; the end of the file is never passed.
  const next = () => {
    const token = tokens[position] as Token;
    if (token.kind !== "end") position += 1;
    return token;
  };
  const fail = (token: Token, expected: string): never => {
    result.diagnostics.push({
      code: "syntax-error",
      message: `expected ${expected}, found ${describe(token)}`,
      line: token.line,
      column: token.column,
    });
    throw new ParseFailure();
  };
  const report = (code: string, message: string, at: Located) => {
    result.diagnostics.push({ code, message, line: at.line, column: at.column });
  };

  // A value: a word that is not followed by anything but separators.
  const value = (after: string): Located => {
    const token = next();
    if (token.kind !== "word") fail(token, `a value after ${after}`);
    return { name: token.text, line: token.line, column: token.column };
  };

  const enumDeclaration = (): Enum => {
    next(); // "enum"
    const nameToken = next();
    if (nameToken.kind !== "word") fail(nameToken, 'an enum name after "enum"');
    const name: Located = { name: nameToken.text, line: nameToken.line, column: nameToken.column };
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name.name)) {
      report(
        "enum-name",
        `enum names start with a capital letter: ${JSON.stringify(name.name)}`,
        name,
      );
    }
    const equals = next();
    if (equals.kind !== "=") fail(equals, '"=" after the enum name');
    const values = [value('"="')];
    for (;;) {
      const token = peek();
      if (token.kind === "|") {
        next();
        if (peek().kind === "newline") next();
        values.push(value('"|"'));
        continue;
      }
      if (token.kind === "newline" || token.kind === "end") break;
      const last = values[values.length - 1] as Located;
      fail(token, `"|" or the end of the line after ${JSON.stringify(last.name)}`);
    }
    return { ...name, values };
  };

  while (peek().kind !== "end") {
    const token = peek();
    if (token.kind === "newline") {
      next();
      continue;
    }
    try {
      if (token.kind !== "word" || token.text !== "enum") fail(token, '"enum"');
      result.enums.push(enumDeclaration());
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      // Skip to the next line and carry on, so one mistake does not hide others.
      while (peek().kind !== "newline" && peek().kind !== "end") next();
    }
  }
  check(result);
  return result;
}

// Checks across declarations: each enum and each value of an enum once.
function check(result: ParseResult): void {
  const declared = new Map<string, Enum>();
  for (const declaration of result.enums) {
    const earlier = declared.get(declaration.name);
    if (earlier !== undefined) {
      result.diagnostics.push({
        code: "duplicate-enum",
        message: `${declaration.name} is already declared at line ${earlier.line}`,
        line: declaration.line,
        column: declaration.column,
      });
    } else {
      declared.set(declaration.name, declaration);
    }
    const seen = new Set<string>();
    for (const item of declaration.values) {
      if (seen.has(item.name)) {
        result.diagnostics.push({
          code: "duplicate-value",
          message: `${JSON.stringify(item.name)} appears twice in ${declaration.name}`,
          line: item.line,
          column: item.column,
        });
      }
      seen.add(item.name);
    }
  }
}
