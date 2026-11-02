import type { ParseResult } from "./ast.js";

// The words dxn and an editor say the model's facts in, written once: an
// editor and the dxn command place them, in a hint, a hover or a table, but
// never word them themselves.

// What was done to a state with evidence: drawn, for a record whose evidence
// is a drawing, a PenNode; recorded, for any other.
export type EvidenceVerb = "drawn" | "recorded";

// Whether a record's evidence is a drawing: it has a PenNode.
export const isDrawn = (file: ParseResult, record: string): boolean =>
  file.records
    .find(({ name }) => name === record)
    ?.fields.some(({ type }) => type.name === "PenNode") === true;

export const evidenceVerb = (file: ParseResult, record: string): EvidenceVerb =>
  isDrawn(file, record) ? "drawn" : "recorded";

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
  present: number;
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

// A count of evidence: "Evidence 2 of 10 states recorded", then what is
// stale, gone and outdated. Where a type places a component, what the type
// can show of it: "FeedScreen can show all 24 states of ArticleRow, all
// drawn".
export function evidenceLabel(count: EvidenceCount, verb: EvidenceVerb, usage?: Usage): string {
  const { record, combinations, present, stale, gone, outdated } = count;
  const states = combinations === 1 ? "state" : "states";
  const counted = (() => {
    if (usage === undefined) return `${record} ${present} of ${combinations} ${states} ${verb}`;
    const pinned = usage.pins.length === 0 ? "" : `, ${usage.pins.join(", ")}`;
    const done =
      present === combinations ? (combinations === 1 ? verb : `all ${verb}`) : `${present} ${verb}`;
    const shows =
      combinations === 1
        ? `shows 1 state`
        : `can show ${combinations === usage.own ? "all " : ""}${combinations} states`;
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

// Why stored records are outdated, and what to do about them.
export function outdatedWhy(outdated: OutdatedAt[]): string {
  const names = [...new Set(outdated.flatMap(({ added }) => added))];
  const and = names.join(" and ");
  const or = names.join(" or ");
  const elements = [...new Set(outdated.map(({ path }) => path))].join(" and ");
  const one = outdated.length === 1;
  return `${one ? "1 record is" : `${outdated.length} records are`} outdated: ${and} ${
    names.length === 1 ? "was" : "were"
  } added to ${elements} after ${one ? "it was" : "they were"} recorded, so ${
    one ? "it does" : "they do"
  } not say which ${or} ${one ? "it shows" : "they show"}. Add ${one ? "its" : "each one's"} ${and} ${
    names.length === 1 ? "value" : "values"
  } to count it again.`;
}

// The headings of what a count leaves out, each listed under one.
export const evidenceHeadings = {
  missing: "Missing",
  stale: "Stale",
  gone: "Gone",
  outdated: "Outdated",
} as const;

// The columns of a table of evidence, an element to a row.
export const evidenceColumns = (verb: EvidenceVerb): string[] => [
  "path",
  "states",
  verb,
  "stale",
  "gone",
  "missing",
];
