import { parse } from "./parse.js";

// A piece of a line: a word, a quoted string, a sign, or a comment, which runs
// to the end of the line.
type Piece = { kind: "word" | "string" | "sign"; text: string };

// The one way a .dxn file is written, as gofmt writes Go: two spaces of
// indentation for each brace or bracket left open, and one more for a line that continues the one
// above it; one way to space each sign; comments kept as written; at most one
// blank line in a row; line feeds, and one at the end. Nothing is reordered,
// joined or split. A file that does not parse is left alone: nothing.
export function format(source: string): string | undefined {
  if (parse(source).diagnostics.some(({ code }) => code === "syntax-error")) return undefined;
  const written: Written[] = [];
  let depth = 0;
  // Whether the last line with code ended with |, and or or, so the next one
  // goes on with it.
  let carried = false;
  const lines = source
    .replace(/^﻿/, "")
    .split(/\r\n|\r|\n/)
    .map(split);
  lines.forEach(({ pieces, comment }, index) => {
    const [first] = pieces;
    // A closing brace or bracket steps back; a line that goes on with |, and
    // or or, or after a line that ends with one, in. A comment on a line of
    // its own goes in with the lines it sits between.
    const closes = first?.text === "}" || first?.text === "]";
    const following = () => lines.find((line, at) => at > index && line.pieces.length > 0);
    const continues =
      first !== undefined
        ? goesOn(first) || carried
        : comment !== undefined && (carried || goesOn(following()?.pieces[0]));
    if (first !== undefined) carried = goesOn(pieces.at(-1));
    const indent = "  ".repeat(Math.max(0, depth - (closes ? 1 : 0)) + (continues ? 1 : 0));
    const code = joined(pieces);
    const after = comment === undefined ? "" : code === "" ? comment : `  ${comment}`;
    written.push({
      text: code === "" && comment === undefined ? "" : `${indent}${code}${after}`,
      opens: pieces.at(-1)?.text === "{" || pieces.at(-1)?.text === "[",
      closes,
    });
    for (const { text } of pieces) {
      if (text === "{" || text === "[") depth += 1;
      if (text === "}" || text === "]") depth = Math.max(0, depth - 1);
    }
  });
  return `${blanks(written).join("\n")}\n`;
}

// Whether a line that starts with this piece, or follows one that ends with
// it, goes on with the line before.
const goesOn = (piece: Piece | undefined) =>
  piece !== undefined && ["|", "and", "or"].includes(piece.text);

// A line's pieces, and its comment, without the spaces around them.
function split(line: string): { pieces: Piece[]; comment?: string } {
  const pieces: Piece[] = [];
  let at = 0;
  while (at < line.length) {
    const char = line[at] as string;
    if (char === " " || char === "\t") {
      at += 1;
    } else if (char === "#") {
      return { pieces, comment: line.slice(at).trimEnd() };
    } else if (char === '"') {
      const end = line.indexOf('"', at + 1);
      const close = end === -1 ? line.length : end + 1;
      pieces.push({ kind: "string", text: line.slice(at, close) });
      at = close;
    } else if (line.startsWith("->", at)) {
      pieces.push({ kind: "sign", text: "->" });
      at += 2;
    } else if (/[A-Za-z0-9]/.test(char)) {
      // A word ends before an arrow: "x->a" is "x", "->" and "a".
      let end = at + 1;
      while (
        end < line.length &&
        /[A-Za-z0-9-]/.test(line[end] as string) &&
        !line.startsWith("->", end)
      ) {
        end += 1;
      }
      pieces.push({ kind: "word", text: line.slice(at, end) });
      at = end;
    } else {
      pieces.push({ kind: "sign", text: char });
      at += 1;
    }
  }
  return { pieces };
}

// A line's pieces, spaced: one space between them, but none before a comma, a
// colon or a closing bracket, none around a dot or a plus, and none inside
// brackets.
function joined(pieces: Piece[]): string {
  let text = "";
  pieces.forEach((piece, index) => {
    const before = pieces[index - 1];
    if (before !== undefined && spaced(before.text, piece.text)) text += " ";
    text += piece.text;
  });
  return text;
}

function spaced(before: string, after: string): boolean {
  if ([",", ":", ")", "]", ".", "+"].includes(after)) return false;
  if (["(", "[", ".", "+"].includes(before)) return false;
  return true;
}

// A line as it is written, and whether it opens a brace at its end or closes
// one at its start.
type Written = { text: string; opens: boolean; closes: boolean };

// Lines with at most one blank line in a row, and none at the start or the
// end, after an opening brace or before a closing one.
function blanks(lines: Written[]): string[] {
  const kept: Written[] = [];
  for (const line of lines) {
    const previous = kept.at(-1);
    if (line.text !== "") {
      if (line.closes && previous?.text === "") kept.pop();
      kept.push(line);
    } else if (previous !== undefined && previous.text !== "" && !previous.opens) {
      kept.push(line);
    }
  }
  while (kept.at(-1)?.text === "") kept.pop();
  return kept.map(({ text }) => text);
}
