import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  apartCount,
  apartLabel,
  apartShort,
  checkStored,
  countable,
  drawings,
  elementOf,
  evidenceHeadings,
  evidenceLabel,
  evidenceShort,
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
  type StoredFile,
  type StoredProblem,
  type StoredSource,
  sourceLines,
  storedBeside,
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
  read?: (path: string) => string,
):
  | {
      read: Read[];
      problems: Problem[];
      withoutContext: Unrecorded[];
      stored: StoredFile[];
      found: StoredProblem[];
    }
  | undefined {
  if (!uri.startsWith("file:")) {
    return { read: [], problems: [], withoutContext: [], stored: [], found: [] };
  }
  if (file.diagnostics.some(({ severity }) => severity === "error")) return undefined;
  const stored = storedBeside(file, dirname(fileURLToPath(uri)), read).map((item) => ({
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
    stored: stored.filter(({ path }) => byPath.has(path)),
    found: problems,
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
  read?: (path: string) => string,
): Map<string, Diagnostic[]> | undefined {
  const found = checked(uri, file, read);
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
  // The label, short, for an editor that shows hints short: the count, and how
  // many need a look; what each is, is in the details.
  short: string;
  details: string;
  // A usage of a component, whose own declaration has the hint: shown over
  // its name, not as a hint of its own.
  usage: boolean;
}

export function hintsBeside(
  uri: string,
  file: ParseResult,
  read?: (path: string) => string,
): Hint[] | undefined {
  if (!uri.startsWith("file:")) return [];
  const found = checked(uri, file, read);
  if (found === undefined) return undefined;
  try {
    for (const path of treePaths(file)) placement(file, path);
  } catch {
    return undefined;
  }
  // The stored records to count, those set apart with errors, each about its
  // element, and the records that cannot be counted at all: as dxn status
  // counts them.
  const { sources, apart, stopped } = countable(file, found.stored, found.found);
  const shown = new Map(
    apart.map((group) => [`${group.at.line}:${group.at.column}#${group.record}`, group]),
  );
  // Where a stored record is about: where its element is written, an element
  // of a tree, or a type that is no tree's root.
  const places = new Map(treePlaces(file).map(({ path, at }) => [path, at]));
  const whereFor = (element: string | undefined): Located | undefined =>
    element === undefined
      ? undefined
      : (places.get(element) ?? file.types.find(({ name }) => name === element));
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
  const storedOf = (record: string) => found.stored.filter((item) => item.record === record);
  // What is set apart at a place, for a record, by what the language says
  // of it.
  const apartAt = (line: number, column: number, record: string) => {
    const group = shown.get(`${line}:${column}#${record}`);
    if (group === undefined) return undefined;
    shown.delete(`${line}:${column}#${record}`);
    return {
      ...apartLabel(file, record, group.problems, storedOf(record)),
      count: apartCount(group.problems),
    };
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
          {
            ...apartLabel(file, each.record, problems, storedOf(each.record)),
            short: apartShort(each.record, apartCount(problems)),
            mark: "◌" as const,
          },
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
      // Short, the count and how many need a look; a usage's, as it is.
      const short =
        usage !== undefined
          ? count.label
          : evidenceShort({
              ...each,
              outdated: each.outdated.length,
              apart: set === undefined ? 0 : set.count,
              mismatched: new Set(
                disagree.map(({ at, path }) => `${at.uri}${path.match(/^\$\[\d+\]/)?.[0]}`),
              ).size,
            });
      if (set === undefined) return [{ ...count, short, mark }];
      const label = `${count.label} · ${set.label.slice(`${each.record}: `.length)}`;
      const [, ...rest] = count.details.split("\n\n");
      return [{ label, short, details: [label, ...rest, set.details].join("\n\n"), mark: "◌" }];
    });
    if (parts.length === 0) return [];
    return [{ line: place.line, column: place.column, usage: place.usage, ...joined(parts) }];
  });
  // Set-apart records about a type no tree has at its root, at the type.
  for (const { at, record, problems } of shown.values()) {
    const part = {
      ...apartLabel(file, record, problems, storedOf(record)),
      short: apartShort(record, apartCount(problems)),
      mark: "◌" as const,
    };
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
  short: string;
  details: string;
  mark: "●" | "◐" | "○" | "◌";
}

// How much of an element has evidence, as a moon.
const moon = ({ recorded, combinations }: Progress["records"][number]): Part["mark"] =>
  recorded === combinations ? "●" : recorded === 0 ? "○" : "◐";

// A hint's label and details from its records', each marked, the details
// starting with the line the label gives of it.
function joined(parts: Part[]): { label: string; short: string; details: string } {
  const marked = parts.map(({ label, short, details, mark }) => ({
    label: `${mark} ${label}`,
    short: `${mark} ${short}`,
    details: details.startsWith(label) ? `${mark} ${details}` : details,
  }));
  return {
    label: marked.map(({ label }) => label).join(" · "),
    short: marked.map(({ short }) => short).join(" · "),
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
