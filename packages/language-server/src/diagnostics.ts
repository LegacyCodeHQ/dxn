import { parse } from "@legacycodehq/dxn-language";
import { type Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";

const word = /[A-Za-z0-9.+-]/;

// A file's problems, as an editor shows them: lines and characters from zero,
// each over the word it is at, or empty where no word is.
export function diagnose(text: string): Diagnostic[] {
  const lines = text.split("\n");
  return parse(text).diagnostics.map(({ severity, code, message, line, column }) => {
    const row = Math.min(Math.max(line - 1, 0), lines.length - 1);
    const content = lines[row] ?? "";
    const start = Math.min(Math.max(column - 1, 0), content.length);
    let end = start;
    while (end < content.length && word.test(content[end] ?? "")) end++;
    if (end === start && start < content.length && content[start] !== " ") end++;
    return {
      range: { start: { line: row, character: start }, end: { line: row, character: end } },
      severity: severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      code,
      source: "dxn",
      message,
    };
  });
}
