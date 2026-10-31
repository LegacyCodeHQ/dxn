import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
