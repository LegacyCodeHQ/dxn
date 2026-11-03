import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  checkStored,
  drawings,
  evidenceHeadings,
  evidenceLabel,
  fixes,
  folderOf,
  freshness,
  type Located,
  outdatedWhy,
  type ParseResult,
  type Progress,
  placement,
  progress,
  repositoryOf,
  type StoredSource,
  sourceLines,
  storedBeside,
  storedRecords,
  treePaths,
  treePlaces,
  type Unrecorded,
  type Usage,
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
  element?: { line: number; column: number };
}

// The stored files beside a file, each record's, and the problems in them,
// as dxn checks them: the records stored that no actor records; each file
// against its record; and, once they all check, each record that repeats
// another across them. Nothing for a file with problems, which records cannot
// be checked against; none for a file that is not on disk.
function checked(
  uri: string,
  file: ParseResult,
): { read: Read[]; problems: Problem[]; withoutContext: Unrecorded[] } | undefined {
  if (!uri.startsWith("file:")) return { read: [], problems: [], withoutContext: [] };
  if (file.diagnostics.some(({ severity }) => severity === "error")) return undefined;
  const stored = storedBeside(file, dirname(fileURLToPath(uri))).map((item) => ({
    ...item,
    shown: join(folderOf(item.record), basename(item.path)),
  }));
  const { withoutContext, problems } = checkStored(
    file,
    stored,
    drawings(repositoryOf(fileURLToPath(uri))),
  );
  // Each file read, by its path; but not those of a record no actor records,
  // which are not checked.
  const unrecorded = new Set(withoutContext.map(({ name }) => name));
  const byPath = new Map<string, Read>();
  for (const { record, shown, source, path } of stored) {
    if (!unrecorded.has(record)) {
      byPath.set(path, { record, shown, source, uri: pathToFileURL(path).href });
    }
  }
  return {
    read: [...byPath.values()],
    withoutContext,
    problems: problems.flatMap(({ file: path, ...problem }) => {
      const at = byPath.get(path);
      return at === undefined ? [] : [{ at, ...problem }];
    }),
  };
}

// The problems in the stored records beside a file, as an editor shows them:
// for each JSON file in each record's folder, by its URI, each problem over
// the value it is at; and, for the file itself, from its source, each problem
// about one place in the model there, such as a drawing that shows a child
// otherwise than the model has it, with the record it is in. Nothing for a
// file with problems; none for a file that is not on disk.
export function evidence(
  uri: string,
  file: ParseResult,
  source?: string,
): Map<string, Diagnostic[]> | undefined {
  const found = checked(uri, file);
  if (found === undefined) return undefined;
  const result = new Map<string, Diagnostic[]>(found.read.map(({ uri: each }) => [each, []]));
  if (source !== undefined) {
    result.set(uri, [
      // A record stored that no actor records, where it is declared.
      ...found.withoutContext.map(({ line, column, message }) => ({
        range: rangeAt(source, line, column),
        severity: DiagnosticSeverity.Error,
        code: "unrecorded-record",
        source: "dxn",
        message,
      })),
      ...found.problems.flatMap(({ at, line, code, message, severity, element }) =>
        element === undefined
          ? []
          : [
              {
                range: rangeAt(source, element.line, element.column),
                severity:
                  severity === "warning" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
                code,
                source: "dxn",
                message: `${message}, in ${at.shown}:${line}`,
              },
            ],
      ),
    ]);
  }
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
  const text = sourceLines(source)[line - 1] ?? "";
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
  // A usage of a component, whose own declaration has the hint: shown over
  // its name, not as a hint of its own.
  usage: boolean;
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
    if (problem.severity === "warning" || problem.code === "drawing-mismatch") continue;
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
  // The stored records whose drawings the model disagrees with, by where
  // their element is written and their record: counted, and said apart.
  const mismatched = new Map<string, Problem[]>();
  for (const problem of found.problems) {
    if (problem.code !== "drawing-mismatch") continue;
    const index = Number(problem.path.match(/^\$\[(\d+)\]/)?.[1]);
    const where = whereFor(elementOf(problem.at.source, index));
    if (where === undefined) continue;
    const key = `${where.line}:${where.column}#${problem.at.record}`;
    mismatched.set(key, [...(mismatched.get(key) ?? []), problem]);
  }
  const readsOf = (record: string) => found.read.filter((read) => read.record === record);
  // What is set apart at a place, for a record, by what the language says
  // of it.
  const apartAt = (line: number, column: number, record: string) => {
    const group = shown.get(`${line}:${column}#${record}`);
    if (group === undefined) return undefined;
    shown.delete(`${line}:${column}#${record}`);
    return stoppedBy(file, record, group.problems, readsOf(record));
  };
  // A usage, for a record: the type whose has line it is, the component it
  // places, how many states the component has on its own, and what the line
  // pins of it.
  const usageOf = ({ line, column }: Progress, record: string) => {
    for (const type of file.types) {
      const child = type.children.find((each) => each.line === line && each.column === column);
      if (child === undefined) continue;
      const component = file.types.find(({ name }) => name === child.type.name);
      const own = counted
        .find((place) => place.line === component?.line && place.column === component?.column)
        ?.records.find((each) => each.record === record)?.combinations;
      const pins = (child.bindings ?? [])
        .filter((binding) => fixes(type, binding))
        .map(({ state, from }) => `${state.name} = ${from.name}`);
      return { in: type.name, of: child.type.name, own: own ?? -1, pins };
    }
    return undefined;
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
      const usage = place.usage ? usageOf(place, each.record) : undefined;
      const wording: Wording = usage === undefined ? {} : { usage };
      const counting = outdated ? outdatedAt(each, wording) : countOf(each, wording);
      const disagree = mismatched.get(`${place.line}:${place.column}#${each.record}`) ?? [];
      const count = disagree.length === 0 ? counting : disagreeing(counting, disagree);
      const set = apartAt(place.line, place.column, each.record);
      // An element that never appears has nothing to show.
      if (each.combinations === 0 && !outdated && set === undefined) return [];
      const mark =
        outdated || each.stale > 0 || each.gone > 0 || disagree.length > 0 ? "◌" : moon(each);
      if (set === undefined) return [{ ...count, mark }];
      const label = `${count.label} · ${set.label.slice(`${each.record}: `.length)}`;
      const [, ...rest] = count.details.split("\n\n");
      return [{ label, details: [label, ...rest, set.details].join("\n\n"), mark: "◌" }];
    });
    if (parts.length === 0) return [];
    return [{ line: place.line, column: place.column, usage: place.usage, ...joined(parts) }];
  });
  // Set-apart records about a type no tree has at its root, at the type.
  for (const { at, record, problems } of shown.values()) {
    const part = { ...stoppedBy(file, record, problems, readsOf(record)), mark: "◌" as const };
    hints.push({ line: at.line, column: at.column, usage: false, ...joined([part]) });
  }
  return hints.sort((a, b) => a.line - b.line || a.column - b.column);
}

// A count with the stored records the model disagrees with said after it,
// "1 doesn't match the model", and listed in its details.
function disagreeing(
  count: { label: string; details: string },
  problems: Problem[],
): { label: string; details: string } {
  const records = new Set(
    problems.map(({ at, path }) => `${at.uri}${path.match(/^\$\[\d+\]/)?.[0]}`),
  );
  const matches = records.size === 1 ? "doesn't match" : "don't match";
  const label = `${count.label}, ${records.size} ${matches} the model`;
  const [, ...rest] = count.details.split("\n\n");
  const listed = [
    `${evidenceHeadings.mismatched}:`,
    "",
    ...problems.map(
      ({ at, line, column, message }) => `- ${at.shown}:${line}:${column}: ${message}`,
    ),
  ].join("\n");
  return { label, details: [label, ...rest, listed].join("\n\n") };
}

// What a hint shows of one record, and its mark: ● every combination recorded, ◐
// some, ○ none, ◌ something needing a decision, stale, gone, outdated or
// with problems.
interface Part {
  label: string;
  details: string;
  mark: "●" | "◐" | "○" | "◌";
}

// How much of an element has evidence, as a moon.
const moon = ({ recorded, combinations }: Progress["records"][number]): Part["mark"] =>
  recorded === combinations ? "●" : recorded === 0 ? "○" : "◐";

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

// How a count is worded: for a usage of a component, the type it is placed
// in, the component, how many combinations the component has on its own,
// and what the type pins of it.
interface Wording {
  usage?: Usage;
}

// A record's evidence at a place: its count, "PenEvidence 4 of 6, 1 stale",
// then the combinations missing, stale and gone, each listed.
function countOf(
  each: Progress["records"][number],
  wording: Wording,
): { label: string; details: string } {
  const { label, lists } = countAndLists(each, wording);
  return { label, details: [label, ...lists].join("\n\n") };
}

// A record's count at a place, and its lists of what is missing, stale and
// gone.
function countAndLists(
  each: Progress["records"][number],
  wording: Wording,
): { label: string; lists: string[] } {
  const { listed } = each;
  const label = evidenceLabel({ ...each, outdated: [] }, wording.usage);
  const lists = (
    [
      [evidenceHeadings.missing, listed.missing],
      [evidenceHeadings.stale, listed.stale],
      [evidenceHeadings.gone, listed.gone],
    ] as const
  )
    .filter(([, those]) => those.length > 0)
    .map(([heading, those]) => `${heading}:\n${those.map((one) => `- ${one}`).join("\n")}`);
  return { label, lists };
}

// A record's evidence at a place where some stored records are outdated:
// its count and how many are, by what was added; then why, what to do, and
// each one, by what it says; then what is missing, stale and gone.
function outdatedAt(
  each: Progress["records"][number],
  wording: Wording,
): { label: string; details: string } {
  const here = each.outdated;
  const { lists } = countAndLists(each, wording);
  const label = evidenceLabel(each, wording.usage);
  const why = outdatedWhy(here);
  const list = `${evidenceHeadings.outdated}:\n${here.map(({ says }) => `- ${says}`).join("\n")}`;
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
      ? storedRecords(entries.size)
      : `${entries.size} of ${storedRecords(total)}`;
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
    const name = message.match(/ is missing `([^`]+)`$/)?.[1];
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
  const said = message.match(/^`([^`]*)` is not a value of `[^`]+`( on .*)? (\([^)]*\))$/);
  if (code !== "unknown-value" || state === undefined || said === null) {
    return as(`with ${message}`);
  }
  // The reason is in words: the names the message quotes, as they are.
  const [value, where, values] = said.slice(1).map((part) => part?.replaceAll("`", ""));
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
