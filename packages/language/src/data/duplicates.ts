import { Diagnostics } from "../core/diagnostic.js";
import { message, words } from "../core/message.js";
import { parseJson } from "./json.js";

// A stored data file of a record, by the path it is shown by, and its
// content.
export interface StoredSource {
  record: string;
  shown: string;
  source: string;
}

// A stored record that repeats an earlier one: where it is, and which one.
export interface Duplicate {
  shown: string;
  line: number;
  column: number;
  path: string;
  message: string;
}

// Two stored records of one record that are the same in everything but their
// PenNodes' fingerprints, which dxn takes, not the actor: each repeat, after
// the first, across the record's files in the order they are given. Data that
// checks, so each file holds a list.
export function duplicates(stored: StoredSource[]): Duplicate[] {
  const seen = new Map<string, { shown: string; index: number }>();
  const result: Duplicate[] = [];
  for (const { record, shown, source } of stored) {
    const root = parseJson(source).root;
    (JSON.parse(source) as Record<string, unknown>[]).forEach((entry, index) => {
      const key = `${record}\u0000${JSON.stringify(sorted(unprinted(entry)))}`;
      const earlier = seen.get(key);
      if (earlier === undefined) {
        seen.set(key, { shown, index });
        return;
      }
      const element = root?.kind === "array" ? root.elements[index] : undefined;
      const located = new Diagnostics(source);
      const path = `$[${index}]`;
      const said = message`the same ${record} as $[${earlier.index}] in ${words(earlier.shown)}, apart from their fingerprints`;
      located.error("duplicate-record", said, path, element?.span.start ?? 0);
      const { line, column } = located.items[0] as { line: number; column: number };
      result.push({ shown, line, column, path, message: said });
    });
  }
  return result;
}

// A stored record without the fingerprints of its PenNodes, which dxn takes
// of what they point at, so that a recording taken again is the same record.
function unprinted(entry: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(entry).map(([name, value]) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return [name, value];
      const { fingerprint: _fingerprint, ...rest } = value as Record<string, unknown>;
      return [name, rest];
    }),
  );
}

// The same value with object keys sorted, so key order does not count.
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, sorted(object[key])]),
    );
  }
  return value;
}
