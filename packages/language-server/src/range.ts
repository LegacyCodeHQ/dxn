import type { Range } from "vscode-languageserver/node";

const word = /[A-Za-z0-9.+-]/;

// The range an editor shows for a line and a column of a text, both from one:
// from zero, over the word there, or one character where no word starts, or
// empty at the end of a line or of the text.
export function rangeAt(text: string, line: number, column: number): Range {
  const lines = text.split("\n");
  const row = Math.min(Math.max(line - 1, 0), lines.length - 1);
  // A Windows line's \r is its end, not a character on it.
  const content = (lines[row] ?? "").replace(/\r$/, "");
  const start = Math.min(Math.max(column - 1, 0), content.length);
  let end = start;
  while (end < content.length && word.test(content[end] ?? "")) end++;
  if (end === start && start < content.length && content[start] !== " ") end++;
  return { start: { line: row, character: start }, end: { line: row, character: end } };
}
