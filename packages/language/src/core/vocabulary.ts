import type { ParseResult } from "@language/core/ast.js";
import { message } from "@language/core/message.js";

// The words dxn and an editor say the model's facts in, written once: an
// editor and the dxn command place them, in a hint, a hover or a table, but
// never word them themselves.

// A combination with evidence is recorded, whatever the evidence is: drawn is
// a word of the user interface, not of the core.

// Whether a record's evidence is a drawing: it has a PenNode.
export const isDrawn = (file: ParseResult, record: string): boolean =>
  file.records
    .find(({ name }) => name === record)
    ?.fields.some(({ type }) => type.name === "PenNode") === true;

// A part of a whole, such as the combinations recorded of all an element
// has: made by ratio, and said by sayRatio alone, "2/6", so no one words it
// otherwise.
export interface Ratio {
  readonly part: number;
  readonly whole: number;
}

export const ratio = (part: number, whole: number): Ratio => ({ part, whole });

export const sayRatio = ({ part, whole }: Ratio): string => `${part}/${whole}`;

// A count of stored records, each one item of a record's stored files: a
// record is what a file declares, never one of them.
export const storedRecords = (count: number): string =>
  `${count} ${count === 1 ? "stored record" : "stored records"}`;

// A stored record made before its element gained a state or a dimension: the
// element, what it says, and what was added since.
export interface OutdatedAt {
  path: string;
  says: string;
  added: string[];
}

// How much of an element, or of every element, a record has evidence for.
export interface EvidenceCount {
  record: string;
  recorded: number;
  combinations: number;
  stale: number;
  gone: number;
  outdated: OutdatedAt[];
}

// A component where a type places it: the type, the component, how many
// states the component has on its own, and what the type pins of it.
export interface Usage {
  in: string;
  of: string;
  own: number;
  pins: string[];
}

// A count of evidence, by combination, one value of each state and dimension
// an element has: "Evidence 2/10 combinations recorded", then what is
// stale, gone and outdated. Where a type places a component, what the type
// can show of it: "FeedScreen can show all 24 combinations of ArticleRow,
// all recorded".
export function evidenceLabel(count: EvidenceCount, usage?: Usage): string {
  const { record, combinations, recorded, stale, gone, outdated } = count;
  const many = combinations === 1 ? "combination" : "combinations";
  const counted = (() => {
    if (usage === undefined) {
      return `${record} ${sayRatio(ratio(recorded, combinations))} ${many} recorded`;
    }
    const pinned = usage.pins.length === 0 ? "" : `, ${usage.pins.join(", ")}`;
    const done =
      recorded === combinations
        ? combinations === 1
          ? "recorded"
          : "all recorded"
        : `${recorded} recorded`;
    const shows =
      combinations === 1
        ? `shows 1 combination`
        : `can show ${combinations === usage.own ? "all " : ""}${combinations} combinations`;
    return `${record}: ${usage.in} ${shows} of ${usage.of}${pinned}, ${done}`;
  })();
  const label = [
    counted,
    ...(stale > 0 ? [`${stale} stale`] : []),
    ...(gone > 0 ? [`${gone} gone`] : []),
  ].join(", ");
  if (outdated.length === 0) return label;
  const names = [...new Set(outdated.flatMap(({ added }) => added))];
  return `${label} · ${outdated.length} outdated: ${names.join(", ")} added`;
}

// A count of evidence, short, for a hint beside the code, as an editor's
// hints are short: the count as a ratio, then how many need a look, by what,
// "Evidence 0/2 recorded · 1 stale, 1 set apart". All of it, "0/2
// combinations recorded" and why, is the hint's tooltip.
export function evidenceShort(count: {
  record: string;
  recorded: number;
  combinations: number;
  stale: number;
  gone: number;
  outdated: number;
  apart: number;
  mismatched: number;
}): string {
  const { record, recorded, combinations, stale, gone, outdated, apart, mismatched } = count;
  const notes = [
    ...(stale > 0 ? [`${stale} stale`] : []),
    ...(gone > 0 ? [`${gone} gone`] : []),
    ...(outdated > 0 ? [`${outdated} outdated`] : []),
    ...(apart > 0 ? [`${apart} set apart`] : []),
    ...(mismatched > 0
      ? [`${mismatched} ${mismatched === 1 ? "doesn't" : "don't"} match the model`]
      : []),
  ];
  const counted = `${record} ${sayRatio(ratio(recorded, combinations))} recorded`;
  return notes.length === 0 ? counted : `${counted} · ${notes.join(", ")}`;
}

// A record none of whose stored records can be counted, short: "Evidence: 3
// stored records set apart".
export const apartShort = (record: string, count: number): string =>
  `${record}: ${storedRecords(count)} set apart`;

// Names said together, each quoted: "`hover`", "`hover` and `size`".
const together = (names: string[], joiner: string) =>
  names.map((name) => message`${name}`).join(joiner);

// That records are outdated, in the one way dxn and an editor say it: what
// was added to which elements after they were recorded, "`hover` was added
// to `Button` after it was recorded"; without the elements, where the place
// says which.
export function outdatedFact(added: string[], elements: string[] = [], records = 1): string {
  const names = [...new Set(added)];
  const to = elements.length === 0 ? "" : ` to ${together([...new Set(elements)], " and ")}`;
  return `${together(names, " and ")} ${names.length === 1 ? "was" : "were"} added${to} after ${
    records === 1 ? "it was" : "they were"
  } recorded`;
}

// What to do about outdated records: "Add its `hover` value to count it
// again."
export function outdatedAction(outdated: OutdatedAt[]): string {
  const names = [...new Set(outdated.flatMap(({ added }) => added))];
  return `Add ${outdated.length === 1 ? "its" : "each one's"} ${together(names, " and ")} ${
    names.length === 1 ? "value" : "values"
  } to count it again.`;
}

// Why stored records are outdated, and what to do about them.
export function outdatedWhy(outdated: OutdatedAt[]): string {
  const names = [...new Set(outdated.flatMap(({ added }) => added))];
  const one = outdated.length === 1;
  const fact = outdatedFact(
    names,
    outdated.map(({ path }) => path),
    outdated.length,
  );
  return `${storedRecords(outdated.length)} ${one ? "is" : "are"} outdated: ${fact}, so ${
    one ? "it does" : "they do"
  } not say which ${together(names, " or ")} ${one ? "it shows" : "they show"}. ${outdatedAction(outdated)}`;
}

// Outdated records, for an agent: how many, and what to do about them.
export const outdatedSummary = (outdated: OutdatedAt[]): string =>
  `${storedRecords(outdated.length)}. ${outdatedAction(outdated)}`;

// One outdated record, for an agent: its element, what it says, and what was
// added to the element after it was recorded.
export const outdatedItem = ({ path, says, added }: OutdatedAt): string =>
  `${path}: ${says}; ${outdatedFact(added)}`;

// The headings of what a count leaves out, each listed under one.
export const evidenceHeadings = {
  missing: "Missing",
  stale: "Stale",
  gone: "Gone",
  outdated: "Outdated",
  // Stored records whose drawings show the element otherwise than the model.
  mismatched: "Drawn otherwise than the model has it",
} as const;

// The columns of a table of evidence, an element to a row.
export const evidenceColumns = (): string[] => [
  "path",
  "combinations",
  "recorded",
  "stale",
  "gone",
  "missing",
];
