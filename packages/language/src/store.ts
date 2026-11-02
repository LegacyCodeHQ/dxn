import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ParseResult } from "./ast.js";
import { message, words } from "./message.js";

// A stored data file of a record, by its path, and its content.
export interface StoredFile {
  record: string;
  path: string;
  source: string;
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
// the directory it is in: what dxn and an editor both read.
export function storedBeside(file: ParseResult, directory: string): StoredFile[] {
  const records = [...new Set(file.records.map(({ name }) => name))];
  return records.flatMap((record) =>
    (storedFiles(directory, record) ?? []).map((name) => {
      const path = join(directory, folderOf(record), name);
      return { record, path, source: readFileSync(path, "utf8") };
    }),
  );
}

// Why each record that has stored records, but no actor that records it,
// cannot have them: each would be a fact about nothing.
export function withoutContext(file: ParseResult, stored: StoredFile[]): string[] {
  const records = new Set(stored.map(({ record }) => record));
  return file.records
    .filter(({ name, context }) => !context && records.has(name))
    .map(
      ({ name }) =>
        message`${name} is stored in ${words(folderOf(name))}/, but no actor records it; declare ${`actor <name> records ${name}`}`,
    );
}
