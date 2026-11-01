import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  duplicates,
  folderOf,
  type ParseResult,
  type StoredSource,
  storedFiles,
  validate,
} from "@legacycodehq/dxn-language";
import { type Diagnostic, DiagnosticSeverity, type Range } from "vscode-languageserver/node";
import { rangeAt } from "./range.js";

// The problems in the stored records beside a file, as an editor shows them:
// for each JSON file in each record's folder, by its URI, each problem over
// the value it is at, and, once they all check, each record that repeats
// another across them, as dxn validate finds them. Nothing for a file with
// problems, which records cannot be checked against; none for a file that is
// not on disk.
export function evidence(uri: string, file: ParseResult): Map<string, Diagnostic[]> | undefined {
  if (!uri.startsWith("file:")) return new Map();
  if (file.diagnostics.some(({ severity }) => severity === "error")) return undefined;
  const directory = dirname(fileURLToPath(uri));
  const result = new Map<string, Diagnostic[]>();
  // Each file read, by the path dxn validate shows it by, to find repeats in.
  const read: (StoredSource & { uri: string })[] = [];
  for (const record of new Set(file.records.map(({ name }) => name))) {
    for (const name of storedFiles(directory, record) ?? []) {
      const path = join(directory, folderOf(record), name);
      let source: string;
      try {
        source = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      const uri = pathToFileURL(path).href;
      read.push({ record, shown: join(folderOf(record), name), source, uri });
      result.set(
        uri,
        validate(file, record, source).map(({ line, column, code, path: at, message }) => ({
          range: valueAt(source, line, column),
          severity: DiagnosticSeverity.Error,
          code,
          source: "dxn",
          message: `${at}: ${message}`,
        })),
      );
    }
  }
  if ([...result.values()].every((found) => found.length === 0)) {
    for (const { shown, line, column, path, message } of duplicates(read)) {
      const at = read.find((each) => each.shown === shown);
      if (at === undefined) continue;
      result.get(at.uri)?.push({
        range: valueAt(at.source, line, column),
        severity: DiagnosticSeverity.Error,
        code: "duplicate-record",
        source: "dxn",
        message: `${path}: ${message}`,
      });
    }
  }
  return result;
}

// The range of the JSON value at a line and a column, both from one: a string
// in its quotes, or the word there.
function valueAt(source: string, line: number, column: number): Range {
  const text = source.split("\n")[line - 1] ?? "";
  if (text[column - 1] === '"') {
    const end = text.indexOf('"', column);
    if (end !== -1) {
      return {
        start: { line: line - 1, character: column - 1 },
        end: { line: line - 1, character: end + 1 },
      };
    }
  }
  return rangeAt(source, line, column);
}
