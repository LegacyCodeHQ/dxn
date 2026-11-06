import { sourceLines } from "@legacycodehq/dxn-language";
import type { Range } from "vscode-languageserver/node";

const word = /[A-Za-z0-9.+-]/;

// The range an editor shows for a line and a column of a text, both from one:
// from zero, over the word there, or a quoted title there, quotes and all, or
// one character where neither starts, or empty at the end of a line or of the
// text.
export function rangeAt(text: string, line: number, column: number): Range {
  const lines = sourceLines(text);
  const row = Math.min(Math.max(line - 1, 0), lines.length - 1);
  const content = lines[row] ?? "";
  const start = Math.min(Math.max(column - 1, 0), content.length);
  let end = start;
  const closing = content[start] === '"' ? content.indexOf('"', start + 1) : -1;
  if (content.startsWith("##", start)) end = start + 2;
  else if (closing !== -1) end = closing + 1;
  else while (end < content.length && word.test(content[end] ?? "")) end++;
  if (end === start && start < content.length && content[start] !== " ") end++;
  return { start: { line: row, character: start }, end: { line: row, character: end } };
}
