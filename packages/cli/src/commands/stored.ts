import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  Diagnostics,
  folderOf,
  type ParseResult,
  parseJson,
  type RecordDeclaration,
  storedFiles,
  validate,
} from "@legacycodehq/dxn-language";
import { canonical } from "../fingerprint.js";
import type { Reporter } from "./report.js";

// A stored data file of a record: its path as shown, and its content.
export interface Stored {
  record: string;
  folder: string;
  shown: string;
  path: string;
  source: string;
}

// Every stored data file of the file's records, by convention: the JSON files
// in each record's folder, next to the file.
function storedData(parsed: ParseResult, file: string, cwd: string): Stored[] {
  const directory = resolve(cwd, dirname(file));
  const seen = new Set<string>();
  const stored: Stored[] = [];
  for (const { name } of parsed.records) {
    if (seen.has(name)) continue;
    seen.add(name);
    const folder = folderOf(name);
    for (const data of storedFiles(directory, name) ?? []) {
      const path = join(directory, folder, data);
      const shown = join(dirname(file), folder, data);
      stored.push({ record: name, folder, shown, path, source: readFileSync(path, "utf8") });
    }
  }
  return stored;
}

// Why each record stored without a context cannot be: it would be a fact
// about nothing.
function storedWithoutContext(parsed: ParseResult, file: string, cwd: string): string[] {
  const directory = resolve(cwd, dirname(file));
  return parsed.records
    .filter(({ name, context }) => !context && storedFiles(directory, name) !== undefined)
    .map(
      ({ name }) =>
        `${name} is stored in ${folderOf(name)}/, but has no context; declare "record ${name} with context"`,
    );
}

// The stored records of the file's records, once each is a record with
// context and all of them check; otherwise the exit code, with what is wrong
// refused or reported.
export function loadStored(
  parsed: ParseResult,
  file: string,
  cwd: string,
  report: Reporter,
): Stored[] | number {
  const uncontexted = storedWithoutContext(parsed, file, cwd);
  if (uncontexted.length > 0) return report.refuse(...uncontexted);
  const stored = storedData(parsed, file, cwd);
  return checkStored(parsed, stored, report) ? stored : report.fail();
}

// Checks stored data against the file, reporting every problem; whether all of
// it is valid.
export function checkStored(parsed: ParseResult, stored: Stored[], report: Reporter): boolean {
  let valid = true;
  for (const { record, shown, source } of stored) {
    for (const { line, column, code, path, message } of validate(parsed, record, source)) {
      report.problem({ file: shown, line, column, severity: "error", code, path, message });
      valid = false;
    }
  }
  return valid && !duplicates(stored, report);
}

// Two stored records of one record that are the same in everything but at and
// fingerprint, which say when one was recorded, not what: each repeat is
// reported, across the record's files. Whether there was one.
function duplicates(stored: Stored[], report: Reporter): boolean {
  const seen = new Map<string, { shown: string; index: number }>();
  let found = false;
  for (const { record, shown, source } of stored) {
    const root = parseJson(source).root;
    (JSON.parse(source) as Record<string, unknown>[]).forEach((entry, index) => {
      const { at: _at, fingerprint: _fingerprint, ...what } = entry;
      const key = `${record}\u0000${JSON.stringify(canonical(what))}`;
      const earlier = seen.get(key);
      if (earlier === undefined) {
        seen.set(key, { shown, index });
        return;
      }
      const element = root?.kind === "array" ? root.elements[index] : undefined;
      const located = new Diagnostics(source);
      const path = `$[${index}]`;
      const message = `the same ${record} as $[${earlier.index}] in ${earlier.shown}, apart from at and fingerprint`;
      located.report("duplicate-record", message, path, element?.span.start ?? 0);
      const { line, column } = located.items[0] as { line: number; column: number };
      report.problem({
        file: shown,
        line,
        column,
        severity: "error",
        code: "duplicate-record",
        path,
        message,
      });
      found = true;
    });
  }
  return found;
}

// Who records with a record's tool, in messages: the value of the field the
// tool is derived from, or the record.
export function toolOwner(record: RecordDeclaration, entry: Record<string, unknown>): string {
  const on = record.fields.find(({ name }) => name === "tool")?.derived?.on.name;
  return on === undefined ? record.name : String(entry[on]);
}

// The repository a file is in: the nearest folder above it with a .git, or
// the working directory.
export function repositoryOf(file: string, cwd: string): string {
  for (let at = dirname(resolve(cwd, file)); ; at = dirname(at)) {
    if (statSync(join(at, ".git"), { throwIfNoEntry: false }) !== undefined) return at;
    if (dirname(at) === at) return cwd;
  }
}
