import { type ParseResult, parse } from "@legacycodehq/dxn-language";
import { type Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";
import { rangeAt } from "./range.js";

// A file's problems, as an editor shows them: lines and characters from zero,
// each over the word it is at, or empty where no word is.
export function diagnose(text: string, file: ParseResult = parse(text)): Diagnostic[] {
  return file.diagnostics.map(({ severity, code, message, line, column }) => ({
    range: rangeAt(text, line, column),
    severity: severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
    code,
    source: "dxn",
    message,
  }));
}
