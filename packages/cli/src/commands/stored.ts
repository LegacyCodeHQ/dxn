import { basename, dirname, join, resolve } from "node:path";
import {
  type Drawn,
  drawings,
  folderOf,
  type ParseResult,
  duplicates as repeated,
  repositoryOf,
  storedBeside,
  validate,
  withoutContext,
} from "@legacycodehq/dxn-language";
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
// in each record's folder, next to the file, as an editor reads them too.
function storedData(parsed: ParseResult, file: string, cwd: string): Stored[] {
  const directory = resolve(cwd, dirname(file));
  return storedBeside(parsed, directory).map(({ record, path, source }) => {
    const folder = folderOf(record);
    return { record, folder, shown: join(dirname(file), folder, basename(path)), path, source };
  });
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
  const stored = storedData(parsed, file, cwd);
  const uncontexted = withoutContext(parsed, stored);
  if (uncontexted.length > 0) return report.refuse(...uncontexted);
  const drawn = drawings(repositoryOf(resolve(cwd, file), cwd));
  return checkStored(parsed, stored, report, drawn) ? stored : report.fail();
}

// Checks stored data against the file, reporting every problem; whether all of
// it is valid. A warning, such as a record made before its element gained a
// state, leaves it valid. With a way to read drawings, each must show what the
// model has.
export function checkStored(
  parsed: ParseResult,
  stored: Stored[],
  report: Reporter,
  drawn?: Drawn,
): boolean {
  let valid = true;
  for (const { record, shown, source } of stored) {
    for (const found of validate(parsed, record, source, drawn)) {
      const { line, column, code, path, message } = found;
      const severity = found.severity ?? "error";
      report.problem({ file: shown, line, column, severity, code, path, message });
      if (severity === "error") valid = false;
    }
  }
  return valid && !duplicates(stored, report);
}

// Two stored records of one record that are the same in everything but at and
// fingerprint, which say when one was recorded, not what: each repeat is
// reported, across the record's files. Whether there was one.
function duplicates(stored: Stored[], report: Reporter): boolean {
  const found = repeated(stored);
  for (const { shown, line, column, path, message } of found) {
    report.problem({
      file: shown,
      line,
      column,
      severity: "error",
      code: "duplicate-record",
      path,
      message,
    });
  }
  return found.length > 0;
}
