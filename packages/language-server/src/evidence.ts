import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  duplicates,
  folderOf,
  freshness,
  type ParseResult,
  type Progress,
  placement,
  progress,
  repositoryOf,
  type StoredSource,
  storedFiles,
  treePaths,
  validate,
} from "@legacycodehq/dxn-language";
import { type Diagnostic, DiagnosticSeverity, type Range } from "vscode-languageserver/node";
import { rangeAt } from "./range.js";

// A stored file beside a .dxn file: its record, the path dxn validate shows it
// by, its URI and what it holds.
interface Read extends StoredSource {
  uri: string;
}

// A problem in a stored file, as dxn validate finds it.
interface Problem {
  at: Read;
  line: number;
  column: number;
  code: string;
  path: string;
  message: string;
}

// The stored files beside a file, each record's, and the problems in them:
// each against its declaration, and, once they all check, each record that
// repeats another across them. Nothing for a file with problems, which
// records cannot be checked against; none for a file that is not on disk.
function checked(
  uri: string,
  file: ParseResult,
): { read: Read[]; problems: Problem[] } | undefined {
  if (!uri.startsWith("file:")) return { read: [], problems: [] };
  if (file.diagnostics.some(({ severity }) => severity === "error")) return undefined;
  const directory = dirname(fileURLToPath(uri));
  const read: Read[] = [];
  const problems: Problem[] = [];
  for (const record of new Set(file.records.map(({ name }) => name))) {
    for (const name of storedFiles(directory, record) ?? []) {
      const path = join(directory, folderOf(record), name);
      let source: string;
      try {
        source = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      const at = {
        record,
        shown: join(folderOf(record), name),
        source,
        uri: pathToFileURL(path).href,
      };
      read.push(at);
      for (const found of validate(file, record, source)) problems.push({ at, ...found });
    }
  }
  if (problems.length === 0) {
    for (const { shown, line, column, path, message } of duplicates(read)) {
      const at = read.find((each) => each.shown === shown);
      if (at !== undefined) {
        problems.push({ at, line, column, code: "duplicate-record", path, message });
      }
    }
  }
  return { read, problems };
}

// The problems in the stored records beside a file, as an editor shows them:
// for each JSON file in each record's folder, by its URI, each problem over
// the value it is at. Nothing for a file with problems; none for a file that
// is not on disk.
export function evidence(uri: string, file: ParseResult): Map<string, Diagnostic[]> | undefined {
  const found = checked(uri, file);
  if (found === undefined) return undefined;
  const result = new Map<string, Diagnostic[]>(found.read.map(({ uri: each }) => [each, []]));
  for (const { at, line, column, code, path, message } of found.problems) {
    result.get(at.uri)?.push({
      range: valueAt(at.source, line, column),
      severity: DiagnosticSeverity.Error,
      code,
      source: "dxn",
      message: `${path}: ${message}`,
    });
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

// What to show of evidence where each element of a file's trees is written,
// a record at a time: how much of it has evidence, as dxn status counts it,
// each stored PenNode checked against what it points at now; and, for a
// record whose stored records have problems, which stop it being counted. A
// label for the place, and the details to show over it. Nothing for a file
// with problems, or whose trees cannot be placed; none for a file that is not
// on disk.
export interface Hint {
  line: number;
  column: number;
  label: string;
  details: string;
}

export function hintsBeside(uri: string, file: ParseResult): Hint[] | undefined {
  if (!uri.startsWith("file:")) return [];
  const found = checked(uri, file);
  if (found === undefined) return undefined;
  try {
    for (const path of treePaths(file)) placement(file, path);
  } catch {
    return undefined;
  }
  // The records that cannot be counted, each with its problems.
  const stopped = new Map<string, Problem[]>();
  for (const problem of found.problems) {
    stopped.set(problem.at.record, [...(stopped.get(problem.at.record) ?? []), problem]);
  }
  const counted = progress(
    file,
    found.read.filter(({ record }) => !stopped.has(record)),
    freshness(repositoryOf(fileURLToPath(uri))),
  );
  return counted.flatMap((place) => {
    const parts = place.records.map((each) => {
      const problems = stopped.get(each.record);
      return problems === undefined ? countOf(each) : stoppedBy(each.record, problems);
    });
    if (parts.length === 0) return [];
    return [
      {
        line: place.line,
        column: place.column,
        label: parts.map(({ label }) => label).join(" · "),
        details: parts.map(({ details }) => details).join("\n\n"),
      },
    ];
  });
}

// A record's evidence at a place: its count, "PenEvidence 4 of 6, 1 stale",
// then the combinations missing, stale and gone, each listed.
function countOf(each: Progress["records"][number]): { label: string; details: string } {
  const { record, combinations, present, stale, gone, listed } = each;
  const label = [
    `${record} ${present} of ${combinations}`,
    ...(stale > 0 ? [`${stale} stale`] : []),
    ...(gone > 0 ? [`${gone} gone`] : []),
  ].join(", ");
  const lists = (
    [
      ["Missing", listed.missing],
      ["Stale", listed.stale],
      ["Gone", listed.gone],
    ] as const
  )
    .filter(([, those]) => those.length > 0)
    .map(([heading, those]) => `${heading}:\n${those.map((one) => `- ${one}`).join("\n")}`);
  return { label, details: [label, ...lists].join("\n\n") };
}

// A record that cannot be counted: how many problems stop it, and the one
// most of them share; then each, as dxn validate prints it.
function stoppedBy(record: string, problems: Problem[]): { label: string; details: string } {
  const times = new Map<string, number>();
  for (const { message } of problems) times.set(message, (times.get(message) ?? 0) + 1);
  const [common] = [...times].sort((a, b) => b[1] - a[1])[0] ?? [""];
  const count = problems.length === 1 ? "1 problem" : `${problems.length} problems`;
  return {
    label: `${record}: ${count}, ${common}`,
    details: [
      `${record} is not counted until its stored records have no problems:`,
      "",
      ...problems.map(
        ({ at, line, column, path, message }) =>
          `- ${at.shown}:${line}:${column}: ${path}: ${message}`,
      ),
    ].join("\n"),
  };
}
