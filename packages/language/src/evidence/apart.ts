import type { Located, ParseResult } from "@language/core/ast.js";
import { storedRecords } from "@language/core/vocabulary.js";
import { treePlaces } from "@language/evaluation/status.js";
import { type StoredFile, type StoredProblem, shownOf } from "@language/evidence/store.js";

// Which stored records dxn and an editor count, when some have errors, and
// what both say of those they do not: one way, for both.

// Stored records with errors, about one element: where it is written, its
// record, and their problems.
export interface SetApart {
  at: Located;
  record: string;
  problems: StoredProblem[];
}

// The stored records to count, those set apart with errors, each about its
// element, and the records that cannot be counted at all, whose errors are
// not of one stored record, or are about nothing written in the file.
// Warnings, outdated records and drawings the model disagrees with, are
// counted, and said apart elsewhere.
export function countable(
  file: ParseResult,
  stored: StoredFile[],
  problems: StoredProblem[],
): { sources: StoredFile[]; apart: SetApart[]; stopped: Map<string, StoredProblem[]> } {
  const recordOf = (path: string) => stored.find((item) => item.path === path)?.record ?? "";
  const stopped = new Map<string, StoredProblem[]>();
  const stop = (record: string, those: StoredProblem[]) =>
    stopped.set(record, [...(stopped.get(record) ?? []), ...those]);
  const byEntry = new Map<string, { item: StoredFile; index: number; problems: StoredProblem[] }>();
  for (const problem of problems) {
    if (problem.severity === "warning" || problem.code === "drawing-mismatch") continue;
    const index = problem.path.match(/^\$\[(\d+)\]/)?.[1];
    const item = stored.find(({ path }) => path === problem.file);
    if (index === undefined || item === undefined) {
      stop(recordOf(problem.file), [problem]);
      continue;
    }
    const key = `${problem.file}#${index}`;
    const entry = byEntry.get(key) ?? { item, index: Number(index), problems: [] };
    entry.problems.push(problem);
    byEntry.set(key, entry);
  }
  // Where a set-apart stored record is about: where its element is written,
  // an element of a tree, or a type that is no tree's root.
  const places = new Map(treePlaces(file).map(({ path, at }) => [path, at]));
  const whereFor = (element: string | undefined): Located | undefined =>
    element === undefined
      ? undefined
      : (places.get(element) ?? file.types.find(({ name }) => name === element));
  const apart = new Map<string, SetApart>();
  for (const { item, index, problems: those } of byEntry.values()) {
    const where = whereFor(elementOf(item.source, index));
    if (where === undefined) {
      stop(item.record, those);
      continue;
    }
    const key = `${where.line}:${where.column}#${item.record}`;
    const group = apart.get(key) ?? { at: where, record: item.record, problems: [] };
    group.problems.push(...those);
    apart.set(key, group);
  }
  // The stored records to count: those of records that can be, without those
  // set apart.
  const sources = stored
    .filter(({ record }) => !stopped.has(record))
    .map((item) => {
      const skipped = new Set(
        [...byEntry.values()].filter((entry) => entry.item === item).map(({ index }) => index),
      );
      if (skipped.size === 0) return item;
      const list = JSON.parse(item.source) as unknown[];
      return { ...item, source: JSON.stringify(list.filter((_, index) => !skipped.has(index))) };
    });
  return { sources, apart: [...apart.values()], stopped };
}

// How many stored records some problems are about: each one item of a file.
export const apartCount = (problems: StoredProblem[]): number =>
  new Set(problems.map(({ file, path }) => `${file}#${path.match(/^\$\[(\d+)\]/)?.[1] ?? ""}`))
    .size;

// Stored records not counted for their errors: how many, of how many, and
// what most of them have, "Evidence: 1 of 2 stored records says hover =
// bogus, which Hover does not have (rest, hovered)"; then each problem, as
// dxn validate prints it.
export function apartLabel(
  file: ParseResult,
  record: string,
  problems: StoredProblem[],
  stored: StoredFile[],
): { label: string; details: string } {
  const shown = (path: string) => stored.find((item) => item.path === path)?.shown ?? shownOf(path);
  const sourceOf = (path: string) => stored.find((item) => item.path === path)?.source ?? "";
  // Each stored record by its file and its place in it, grouped by why it is
  // wrong, in the words of the reason most of its kind share.
  const why = new Map<string, { reason: Reason; entries: Set<string> }>();
  for (const problem of problems) {
    const index = problem.path.match(/^\$\[(\d+)\]/)?.[1];
    const reason = reasonOf(
      file,
      problem,
      sourceOf(problem.file),
      index === undefined ? undefined : Number(index),
    );
    const group = why.get(reason.many) ?? { reason, entries: new Set<string>() };
    group.entries.add(`${shown(problem.file)}#${index ?? ""}`);
    why.set(reason.many, group);
  }
  const entries = new Set([...why.values()].flatMap(({ entries: each }) => [...each]));
  const [top] = [...why.values()].sort((a, b) => b.entries.size - a.entries.size);
  const what = (count: number) => (count === 1 ? top?.reason.one : top?.reason.many) ?? "";
  // Of how many stored records, when every file of them is a list.
  const lengths = stored
    .filter((item) => item.record === record)
    .map(({ source }) => {
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
        ({ file: at, line, column, path, message }) =>
          `- ${shown(at)}:${line}:${column}: ${path}: ${message}`,
      ),
    ].join("\n"),
  };
}

// Why stored records are wrong, as it is said of one and of several.
interface Reason {
  one: string;
  many: string;
}

// Why a stored record is wrong, in the words of what it says against what
// the model has, never of why: dxn sees the model as it is, not what changed,
// so a value renamed since and one mistyped are said alike:
// - a value its state does not have: "say style = plain, which Style does
//   not have (primary, secondary)", or one it cannot have there: "… which
//   hover cannot be on Phone (rest)";
// - a state or a dimension it does not say: "say nothing of hover, a state
//   Button has", "… Pointer, which Button needs";
// - one the element does not have: "say press, a state Button does not have".
// Any other problem, as it is.
function reasonOf(
  file: ParseResult,
  { code, path, message }: StoredProblem,
  source: string,
  index?: number,
): Reason {
  const as = (many: string, one = many) => ({ one, many });
  const group = path.match(/\.context\.(states|dimensions)(?:\.([A-Za-z0-9-]+))?$/);
  const element = index === undefined ? undefined : elementOf(source, index);
  if (code === "missing-field" && group !== null && element !== undefined) {
    const name = message.match(/ is missing `([^`]+)`$/)?.[1];
    if (name !== undefined) {
      const has = group[1] === "states" ? `a state ${element} has` : `which ${element} needs`;
      return as(`say nothing of ${name}, ${has}`, `says nothing of ${name}, ${has}`);
    }
  }
  if (code === "unknown-field" && group?.[2] !== undefined && element !== undefined) {
    const name = group[2];
    const had =
      group[1] === "states" ? `a state ${element} does not have` : `which ${element} does not need`;
    return as(`say ${name}, ${had}`, `says ${name}, ${had}`);
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
      : `which ${ownerOf(file, state)} does not have ${values}`;
  return as(`say ${state} = ${value}, ${which}`, `says ${state} = ${value}, ${which}`);
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
export function elementOf(source: string, index: number): string | undefined {
  try {
    const list = JSON.parse(source) as { context?: { path?: unknown; type?: unknown } }[];
    const { path, type } = list[index]?.context ?? {};
    const element = path ?? type;
    return typeof element === "string" ? element : undefined;
  } catch {
    return undefined;
  }
}
