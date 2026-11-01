import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  duplicates,
  folderOf,
  freshness,
  type Located,
  type ParseResult,
  type Progress,
  placement,
  progress,
  repositoryOf,
  type StoredSource,
  storedFiles,
  treePaths,
  treePlaces,
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
  severity?: "warning";
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
  if (problems.every(({ severity }) => severity === "warning")) {
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
  for (const { at, line, column, code, path, message, severity } of found.problems) {
    result.get(at.uri)?.push({
      range: valueAt(at.source, line, column),
      severity: severity === "warning" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
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
  // The stored records with errors, set apart, each about its element; and
  // the records that cannot be counted at all, whose errors are not of one
  // stored record or are about nothing written in the file. Outdated
  // records, a warning, are counted apart by the language.
  const stopped = new Map<string, Problem[]>();
  const apart = new Map<string, { at: Read; index: number; problems: Problem[] }>();
  for (const problem of found.problems) {
    if (problem.severity === "warning") continue;
    const index = problem.path.match(/^\$\[(\d+)\]/)?.[1];
    if (index === undefined) {
      stopped.set(problem.at.record, [...(stopped.get(problem.at.record) ?? []), problem]);
      continue;
    }
    const key = `${problem.at.uri}#${index}`;
    const entry = apart.get(key) ?? { at: problem.at, index: Number(index), problems: [] };
    entry.problems.push(problem);
    apart.set(key, entry);
  }
  // Where a set-apart record shows: where its element is written, an element
  // of a tree, or a type that is no tree's root.
  const places = new Map(treePlaces(file).map(({ path, at }) => [path, at]));
  const whereFor = (element: string | undefined): Located | undefined =>
    element === undefined
      ? undefined
      : (places.get(element) ?? file.types.find(({ name }) => name === element));
  const shown = new Map<string, { at: Located; record: string; problems: Problem[] }>();
  for (const { at, index, problems } of apart.values()) {
    const where = whereFor(elementOf(at.source, index));
    if (where === undefined) {
      stopped.set(at.record, [...(stopped.get(at.record) ?? []), ...problems]);
      continue;
    }
    const key = `${where.line}:${where.column}#${at.record}`;
    const group = shown.get(key) ?? { at: where, record: at.record, problems: [] };
    group.problems.push(...problems);
    shown.set(key, group);
  }
  // The stored records to count: those of records that can be, without
  // those set apart.
  const sources = found.read
    .filter(({ record }) => !stopped.has(record))
    .map((read) => {
      const skipped = new Set(
        [...apart.values()].filter(({ at }) => at === read).map(({ index }) => index),
      );
      if (skipped.size === 0) return read;
      const list = JSON.parse(read.source) as unknown[];
      return { ...read, source: JSON.stringify(list.filter((_, index) => !skipped.has(index))) };
    });
  const counted = progress(file, sources, freshness(repositoryOf(fileURLToPath(uri))));
  const readsOf = (record: string) => found.read.filter((read) => read.record === record);
  // What is set apart at a place, for a record, by what the language says
  // of it.
  const apartAt = (line: number, column: number, record: string) => {
    const group = shown.get(`${line}:${column}#${record}`);
    if (group === undefined) return undefined;
    shown.delete(`${line}:${column}#${record}`);
    return stoppedBy(file, record, group.problems, readsOf(record));
  };
  const hints = counted.flatMap((place) => {
    const parts = place.records.flatMap((each): Part[] => {
      const problems = stopped.get(each.record);
      if (problems !== undefined) {
        return [
          { ...stoppedBy(file, each.record, problems, readsOf(each.record)), mark: "◌" as const },
        ];
      }
      const outdated = each.outdated.length > 0;
      const count = outdated ? outdatedAt(each) : countOf(each);
      const set = apartAt(place.line, place.column, each.record);
      // An element that never appears has nothing to show.
      if (each.combinations === 0 && !outdated && set === undefined) return [];
      const mark = outdated || each.stale > 0 || each.gone > 0 ? "◌" : moon(each);
      if (set === undefined) return [{ ...count, mark }];
      const label = `${count.label} · ${set.label.slice(`${each.record}: `.length)}`;
      const [, ...rest] = count.details.split("\n\n");
      return [{ label, details: [label, ...rest, set.details].join("\n\n"), mark: "◌" }];
    });
    if (parts.length === 0) return [];
    return [{ line: place.line, column: place.column, ...joined(parts) }];
  });
  // Set-apart records about a type no tree has at its root, at the type.
  for (const { at, record, problems } of shown.values()) {
    const part = { ...stoppedBy(file, record, problems, readsOf(record)), mark: "◌" as const };
    hints.push({ line: at.line, column: at.column, ...joined([part]) });
  }
  return hints.sort((a, b) => a.line - b.line || a.column - b.column);
}

// What a hint shows of one record, and its mark: ● every look present, ◐
// some, ○ none, ◌ something needing a decision, stale, gone, outdated or
// with problems.
interface Part {
  label: string;
  details: string;
  mark: "●" | "◐" | "○" | "◌";
}

// How much of an element has evidence, as a moon.
const moon = ({ present, combinations }: Progress["records"][number]): Part["mark"] =>
  present === combinations ? "●" : present === 0 ? "○" : "◐";

// A hint's label and details from its records', each marked, the details
// starting with the line the label gives of it.
function joined(parts: Part[]): { label: string; details: string } {
  const marked = parts.map(({ label, details, mark }) => ({
    label: `${mark} ${label}`,
    details: details.startsWith(label) ? `${mark} ${details}` : details,
  }));
  return {
    label: marked.map(({ label }) => label).join(" · "),
    details: marked.map(({ details }) => details).join("\n\n"),
  };
}

// A record's evidence at a place: its count, "PenEvidence 4 of 6, 1 stale",
// then the combinations missing, stale and gone, each listed.
function countOf(each: Progress["records"][number]): { label: string; details: string } {
  const { label, lists } = countAndLists(each);
  return { label, details: [label, ...lists].join("\n\n") };
}

// A record's count at a place, and its lists of what is missing, stale and
// gone.
function countAndLists(each: Progress["records"][number]): { label: string; lists: string[] } {
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
  return { label, lists };
}

// A record's evidence at a place where some stored records are outdated:
// its count and how many are, by what was added; then why, what to do, and
// each one, by what it says; then what is missing, stale and gone.
function outdatedAt(each: Progress["records"][number]): { label: string; details: string } {
  const here = each.outdated;
  const { label: count, lists } = countAndLists(each);
  const names = [...new Set(here.flatMap(({ added }) => added))];
  const and = names.join(" and ");
  const or = names.join(" or ");
  const elements = [...new Set(here.map(({ path }) => path))].join(" and ");
  const label = `${count} · ${here.length} outdated: ${names.join(", ")} added`;
  const one = here.length === 1;
  const why = `${one ? "1 record is" : `${here.length} records are`} outdated: ${and} ${
    names.length === 1 ? "was" : "were"
  } added to ${elements} after ${one ? "it was" : "they were"} recorded, so ${
    one ? "it does" : "they do"
  } not say which ${or} ${one ? "it shows" : "they show"}. Add ${one ? "its" : "each one's"} ${and} ${
    names.length === 1 ? "value" : "values"
  } to count it again.`;
  const list = `Outdated:\n${here.map(({ says }) => `- ${says}`).join("\n")}`;
  return { label, details: [label, why, list, ...lists].join("\n\n") };
}

// A record that cannot be counted: how many of its stored records have
// problems, of how many, and what most of them have; then each problem, as
// dxn validate prints it.
function stoppedBy(
  file: ParseResult,
  record: string,
  problems: Problem[],
  read: Read[],
): { label: string; details: string } {
  // Each stored record by its file and its place in it, grouped by why it is
  // wrong, in the words of the reason most of its kind share.
  const why = new Map<string, { reason: Reason; entries: Set<string> }>();
  for (const problem of problems) {
    const index = problem.path.match(/^\$\[(\d+)\]/)?.[1];
    const reason = reasonOf(file, problem, index === undefined ? undefined : Number(index));
    const group = why.get(reason.many) ?? { reason, entries: new Set<string>() };
    group.entries.add(`${problem.at.shown}#${index ?? ""}`);
    why.set(reason.many, group);
  }
  const entries = new Set([...why.values()].flatMap(({ entries: each }) => [...each]));
  const [top] = [...why.values()].sort((a, b) => b.entries.size - a.entries.size);
  const what = (count: number) => (count === 1 ? top?.reason.one : top?.reason.many) ?? "";
  // Of how many stored records, when every file of them is a list.
  const lengths = read.map(({ source }) => {
    try {
      const list: unknown = JSON.parse(source);
      return Array.isArray(list) ? list.length : undefined;
    } catch {
      return undefined;
    }
  });
  const total = lengths.every((length) => length !== undefined)
    ? lengths.reduce((sum: number, length) => sum + (length ?? 0), 0)
    : undefined;
  const records =
    total === undefined
      ? `${entries.size} ${entries.size === 1 ? "record" : "records"}`
      : `${entries.size} of ${total} ${total === 1 ? "record" : "records"}`;
  const those = top?.entries.size ?? 0;
  const label =
    those === entries.size
      ? `${record}: ${records} ${what(entries.size)}`
      : `${record}: ${records} have problems, ${those} ${what(those)}`;
  return {
    label,
    details: [
      "Not counted until their problems are fixed:",
      "",
      ...problems.map(
        ({ at, line, column, path, message }) =>
          `- ${at.shown}:${line}:${column}: ${path}: ${message}`,
      ),
    ].join("\n"),
  };
}

// Why stored records are wrong, as a hint says it of one and of several.
interface Reason {
  one: string;
  many: string;
}

// Why a stored record is wrong, in the words of what changed in the model
// since it was recorded, where that is what happened:
// - a value its state no longer has: "still say style = plain, which Style no
//   longer has (primary, secondary)", or one it cannot have there: "… which
//   hover cannot be on Phone (rest)";
// - a state or a dimension added since: "say nothing of hover, a state Button
//   now has", "… Pointer, which Button now needs";
// - one taken away since: "still say press, a state Button no longer has".
// Any other problem, as it is.
function reasonOf(file: ParseResult, { at, code, path, message }: Problem, index?: number): Reason {
  const as = (many: string, one = many) => ({ one, many });
  const group = path.match(/\.context\.(states|dimensions)(?:\.([A-Za-z0-9-]+))?$/);
  const element = index === undefined ? undefined : elementOf(at.source, index);
  if (code === "missing-field" && group !== null && element !== undefined) {
    const name = message.match(/ is missing (\S+)$/)?.[1];
    if (name !== undefined) {
      const has =
        group[1] === "states" ? `a state ${element} now has` : `which ${element} now needs`;
      return as(`say nothing of ${name}, ${has}`, `says nothing of ${name}, ${has}`);
    }
  }
  if (code === "unknown-field" && group?.[2] !== undefined && element !== undefined) {
    const name = group[2];
    const had =
      group[1] === "states"
        ? `a state ${element} no longer has`
        : `which ${element} no longer needs`;
    return as(`still say ${name}, ${had}`, `still says ${name}, ${had}`);
  }
  const state = group?.[2];
  const said = message.match(/^"([^"]*)" is not a value of \S+( on .*)? (\([^)]*\))$/);
  if (code !== "unknown-value" || state === undefined || said === null) {
    return as(`with ${message}`);
  }
  const [, value, where, values] = said;
  const which =
    where !== undefined
      ? `which ${state} cannot be${where} ${values}`
      : `which ${ownerOf(file, state)} no longer has ${values}`;
  return as(`still say ${state} = ${value}, ${which}`, `still says ${state} = ${value}, ${which}`);
}

// The enum a state takes its values from, when every state of that name
// takes them from one; a dimension is its own.
function ownerOf(file: ParseResult, state: string): string {
  if (/^[A-Z]/.test(state)) return state;
  const enums = new Set(
    file.types.flatMap(({ states }) =>
      states.filter(({ name }) => name === state).map(({ enum: of }) => of.name),
    ),
  );
  return enums.size === 1 ? ([...enums][0] as string) : state;
}

// The element a stored record is about, by its place in its file: its
// context's path, or type.
function elementOf(source: string, index: number): string | undefined {
  try {
    const list = JSON.parse(source) as { context?: { path?: unknown; type?: unknown } }[];
    const { path, type } = list[index]?.context ?? {};
    const element = path ?? type;
    return typeof element === "string" ? element : undefined;
  } catch {
    return undefined;
  }
}
