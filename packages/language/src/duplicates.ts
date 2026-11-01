import { Diagnostics } from "./diagnostic.js";
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

// Two stored records of one record that are the same in everything but at and
// fingerprint, which say when one was recorded, not what: each repeat, after
// the first, across the record's files in the order they are given. Data that
// checks, so each file holds a list.
export function duplicates(stored: StoredSource[]): Duplicate[] {
  const seen = new Map<string, { shown: string; index: number }>();
  const result: Duplicate[] = [];
  for (const { record, shown, source } of stored) {
    const root = parseJson(source).root;
    (JSON.parse(source) as Record<string, unknown>[]).forEach((entry, index) => {
      const { at: _at, fingerprint: _fingerprint, ...what } = entry;
      const key = `${record}\u0000${JSON.stringify(sorted(what))}`;
      const earlier = seen.get(key);
      if (earlier === undefined) {
        seen.set(key, { shown, index });
        return;
      }
      const element = root?.kind === "array" ? root.elements[index] : undefined;
      const located = new Diagnostics(source);
      const path = `$[${index}]`;
      const message = `the same ${record} as $[${earlier.index}] in ${earlier.shown}, apart from at and fingerprint`;
      located.report("duplicate-record", message, path, element?.span.start ?? 0);
      const { line, column } = located.items[0] as { line: number; column: number };
      result.push({ shown, line, column, path, message });
    });
  }
  return result;
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
