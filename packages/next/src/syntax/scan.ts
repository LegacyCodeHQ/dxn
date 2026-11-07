import type { Span } from "@next/model/enumeration.js";

// The tokens of a source. A word is wider than any name the checker accepts:
// letters of any alphabet, digits, `-` and `_`, so the checker can report a bad
// name by name rather than the grammar rejecting it.

export type Token =
  | { kind: "word"; text: string; span: Span }
  | { kind: "{" | "}" | "," | ":"; span: Span }
  | { kind: "unexpected"; text: string; span: Span }
  | { kind: "end"; span: Span };

const word = /[\p{L}\p{N}_-]+/uy;
const space = /\s+/y;

/** The tokens of a source, in order, ending with one `end` token. */
export function scan(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < source.length) {
    space.lastIndex = offset;
    if (space.test(source)) {
      offset = space.lastIndex;
      continue;
    }
    word.lastIndex = offset;
    const match = word.exec(source);
    if (match) {
      const text = match[0];
      tokens.push({ kind: "word", text, span: { start: offset, end: offset + text.length } });
      offset += text.length;
      continue;
    }
    const character = String.fromCodePoint(source.codePointAt(offset) ?? 0);
    const span = { start: offset, end: offset + character.length };
    if (character === "{" || character === "}" || character === "," || character === ":") {
      tokens.push({ kind: character, span });
    } else {
      tokens.push({ kind: "unexpected", text: character, span });
    }
    offset += character.length;
  }
  tokens.push({ kind: "end", span: { start: source.length, end: source.length } });
  return tokens;
}
