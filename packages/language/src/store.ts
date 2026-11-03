import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ParseResult } from "./ast.js";
import type { Diagnostic } from "./diagnostic.js";
import { duplicates } from "./duplicates.js";
import { message, words } from "./message.js";
import { type Drawn, validate } from "./validate.js";

// A stored data file of a record, by its path, and its content; and how a
// message names it, when not by its record's folder and its name.
export interface StoredFile {
  record: string;
  path: string;
  source: string;
  shown?: string;
}

// Where a record is stored, by convention: a folder named after it in
// kebab-case, with no plural, next to the file that declares it. Every JSON
// file in the folder holds a list of the record.
export const folderOf = (record: string): string =>
  record
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

// The names of the JSON files in a record's folder under a directory, in
// order, or undefined when it has no folder: it is not stored.
export function storedFiles(directory: string, record: string): string[] | undefined {
  const folder = join(directory, folderOf(record));
  if (statSync(folder, { throwIfNoEntry: false })?.isDirectory() !== true) return undefined;
  return readdirSync(folder)
    .filter(
      (name) =>
        name.endsWith(".json") &&
        statSync(join(folder, name), { throwIfNoEntry: false })?.isFile() === true,
    )
    .sort();
}

// Every stored data file of a file's records, in the folders next to it, in
// the directory it is in: what dxn and an editor both read, each by its
// path, from the disk or, for an editor, from its open buffer. A file gone by
// the time it is read is left out.
export function storedBeside(
  file: ParseResult,
  directory: string,
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
): StoredFile[] {
  const records = [...new Set(file.records.map(({ name }) => name))];
  return records.flatMap((record) =>
    (storedFiles(directory, record) ?? []).flatMap((name) => {
      const path = join(directory, folderOf(record), name);
      try {
        return [{ record, path, source: read(path) }];
      } catch {
        return [];
      }
    }),
  );
}

// Each record that has stored records, but no actor that records it, where
// it is declared, and why it cannot have them: each would be a fact about
// nothing.
export interface Unrecorded {
  name: string;
  line: number;
  column: number;
  message: string;
}

export function withoutContext(file: ParseResult, stored: StoredFile[]): Unrecorded[] {
  const records = new Set(stored.map(({ record }) => record));
  return file.records
    .filter(({ name, context }) => !context && records.has(name))
    .map(({ name, line, column }) => ({
      name,
      line,
      column,
      message: message`${name} is stored in ${words(folderOf(name))}/, but no actor records it; declare ${`actor <name> records ${name}`}`,
    }));
}

// A problem in a stored data file, by its path.
export interface StoredProblem extends Diagnostic {
  file: string;
}

// A stored data file as a message names it: its record's folder and its name.
export const shownOf = (path: string) => path.split(/[\\/]/).slice(-2).join("/");

// The stored records beside a file, checked the one way dxn and an editor
// both check them, against a file without errors: the records stored that no
// actor records, whose files are not read; then each file against its
// record, warnings too; and, once none has an error, each record that
// repeats another across them.
export function checkStored(
  file: ParseResult,
  stored: StoredFile[],
  drawn?: Drawn,
): { withoutContext: Unrecorded[]; problems: StoredProblem[] } {
  const unrecorded = withoutContext(file, stored);
  const recorded = new Set(file.records.filter(({ context }) => context).map(({ name }) => name));
  const checkable = stored
    .filter(({ record }) => recorded.has(record))
    .map((item) => ({ ...item, shown: item.shown ?? shownOf(item.path) }));
  const problems: StoredProblem[] = checkable.flatMap((item) =>
    validate(file, item.record, item.source, drawn).map((problem) => ({
      ...problem,
      file: item.path,
    })),
  );
  if (problems.some(({ severity }) => severity === undefined)) {
    return { withoutContext: unrecorded, problems };
  }
  for (const repeat of duplicates(checkable)) {
    problems.push({
      code: "duplicate-record",
      message: repeat.message,
      line: repeat.line,
      column: repeat.column,
      path: repeat.path,
      file: checkable.find(({ shown }) => shown === repeat.shown)?.path ?? repeat.shown,
    });
  }
  return { withoutContext: unrecorded, problems };
}
