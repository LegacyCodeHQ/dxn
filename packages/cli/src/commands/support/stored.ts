import { basename, dirname, join, resolve } from "node:path";
import type { Reporter } from "@cli/commands/support/report.js";
import {
  checkStored,
  drawings,
  folderOf,
  type ParseResult,
  repositoryOf,
  type StoredProblem,
  storedBeside,
} from "@legacycodehq/dxn-language";

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

// The stored records of the file's records, and the problems in them, each
// reported, as an editor checks them too; or the exit code, refused, for
// records stored that no actor records. A command that counts them goes on
// with those that check.
export function loadStoredToCount(
  parsed: ParseResult,
  file: string,
  cwd: string,
  report: Reporter,
): { stored: Stored[]; problems: StoredProblem[] } | number {
  const stored = storedData(parsed, file, cwd);
  const drawn = drawings(repositoryOf(resolve(cwd, file)));
  const { withoutContext, problems } = checkStored(parsed, stored, drawn);
  const shown = new Map(stored.map((item) => [item.path, item.shown]));
  for (const { file: at, line, column, code, path, message, severity } of problems) {
    report.problem({
      file: shown.get(at) ?? at,
      line,
      column,
      severity: severity ?? "error",
      code,
      path,
      message,
    });
  }
  if (withoutContext.length > 0)
    return report.refuse(...withoutContext.map(({ message }) => message));
  return { stored, problems };
}

// The stored records of the file's records, once each is a record with
// context and all of them check; otherwise the exit code, with what is wrong
// refused or reported. A warning, such as a record made before its element
// gained a state, leaves them usable.
export function loadStored(
  parsed: ParseResult,
  file: string,
  cwd: string,
  report: Reporter,
): Stored[] | number {
  const loaded = loadStoredToCount(parsed, file, cwd, report);
  if (typeof loaded === "number") return loaded;
  return loaded.problems.some(({ severity }) => severity === undefined)
    ? report.fail()
    : loaded.stored;
}
