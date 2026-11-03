import type { ParseResult } from "./ast.js";
import { message } from "./message.js";

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
// an element has: "Evidence 2 of 10 combinations recorded", then what is
// stale, gone and outdated. Where a type places a component, what the type
// can show of it: "FeedScreen can show all 24 combinations of ArticleRow,
// all recorded".
export function evidenceLabel(count: EvidenceCount, usage?: Usage): string {
  const { record, combinations, recorded, stale, gone, outdated } = count;
  const many = combinations === 1 ? "combination" : "combinations";
  const counted = (() => {
    if (usage === undefined) return `${record} ${recorded} of ${combinations} ${many} recorded`;
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
  return `${one ? "1 record is" : `${outdated.length} records are`} outdated: ${fact}, so ${
    one ? "it does" : "they do"
  } not say which ${together(names, " or ")} ${one ? "it shows" : "they show"}. ${outdatedAction(outdated)}`;
}

// Outdated records, for an agent: how many, and what to do about them.
export const outdatedSummary = (outdated: OutdatedAt[]): string =>
  `${outdated.length === 1 ? "1 record" : `${outdated.length} records`}. ${outdatedAction(outdated)}`;

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
