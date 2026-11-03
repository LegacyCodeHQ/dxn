import {
  states as evaluateStates,
  type InPlace,
  inPlace,
  message,
  type ParseResult,
  type Presence,
  profilesOf,
  subjects,
  type Type,
  words,
} from "@legacycodehq/dxn-language";
import { type Command, command } from "./support/context.js";
import { misused, options, Reporter, read } from "./support/report.js";
import { drawTable, NONE } from "./support/tables.js";
import { usage } from "./support/usage.js";

export const statesCommand: Command = command(usage, (args, { io, cwd }) => {
  const {
    json,
    rest: [file, typeName, ...rest],
  } = options(args);
  if (file === undefined || typeName === undefined || rest.length > 0) {
    return misused(io, json, "give a file and a type");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  // A path to a child, "<Type>.<child>...", is evaluated in place.
  if (typeName.split(".").some((segment) => /^[a-z]/.test(segment))) {
    return statesInPlace(parsed, typeName, report);
  }
  if (!parsed.types.some(({ name }) => name === typeName)) {
    return report.refuse(
      message`no type ${typeName} in ${words(file)} (${parsed.types.map(({ name }) => name)})`,
    );
  }
  const evaluated = evaluateStates(parsed, typeName);
  const stateType = parsed.types.find(({ name }) => name === typeName) as Type;
  const children = stateType.children.map(({ name }) => name);
  return report.succeed(evaluated, statesTable(parsed, typeName, stateType, evaluated, children));
});

// The states of a type, or of a child in place, as a compact table: each row
// keyed by its dimensions, the states of its parents on the way and the
// type's states that another depends on; then the type's other states; then
// where each of the children given is.
function statesTable(
  parsed: ParseResult,
  name: string,
  type: Type,
  evaluated: {
    dimensions: string[];
    rows: {
      profiles?: string[];
      when: Record<string, string>;
      parents?: Record<string, string>;
      states: Record<string, string[]>;
      children?: Record<string, Presence>;
    }[];
  },
  children: string[],
): string {
  const parents = [...new Set(evaluated.rows.flatMap((row) => Object.keys(row.parents ?? {})))];
  const [split, own] = splitStates(type);
  return compactTable(parsed, {
    name,
    keys: [...evaluated.dimensions, ...parents, ...split],
    states: own,
    children: children.map((child) => `has ${child}`),
    rows: evaluated.rows.map((row) => ({
      profiles: row.profiles,
      keys: [
        ...evaluated.dimensions.map((dimension) => row.when[dimension] ?? NONE),
        ...parents.map((parent) => row.parents?.[parent] ?? NONE),
        ...split.map((state) => values(row.states[state])),
      ],
      states: own.map((state) => values(row.states[state])),
      children: children.map((child) => presence(row.children?.[child])),
    })),
  });
}

// Where a child is: there, not there, or for which values of a state.
function presence(value: Presence | undefined): string {
  if (value === undefined || value === false) return NONE;
  if (value === true) return "✓";
  if (typeof value === "string") return value;
  return Object.entries(value)
    .map(([state, values]) =>
      values.length === 1 ? `${state} = ${values[0]}` : `${state} in (${values.join(", ")})`,
    )
    .join(", ");
}

// A type's states that another's rule depends on, which split its rows and so
// say where a row is, and its other states.
function splitStates(type: Type): [string[], string[]] {
  const named = new Set(type.rules.flatMap((rule) => subjects(rule.when).map(({ name }) => name)));
  const names = type.states.map(({ name }) => name);
  return [names.filter((name) => named.has(name)), names.filter((name) => !named.has(name))];
}

// The values a state has in a row, or none.
const values = (list: string[] | undefined) =>
  list === undefined || list.length === 0 ? NONE : list.join(", ");

// A matrix as a compact table. Each row says where it is, in its key columns
// (its profiles, dimensions, parents' states and states another depends on),
// then the values of each other state, then where each child is. Rows that
// read the same are one, naming each of their profiles; where every row is on
// every profile, there is no profiles column; and a key that is the same in
// every row is said once, above the table.
function compactTable(
  parsed: ParseResult,
  table: {
    // What the table is of: a type, or a child by its path.
    name: string;
    keys: string[];
    states: string[];
    children: string[];
    rows: { profiles?: string[]; keys: string[]; states: string[]; children: string[] }[];
  },
): string {
  const merged: { profiles: string[]; cells: string[] }[] = [];
  for (const row of table.rows) {
    const cells = [...row.keys, ...row.states, ...row.children];
    const same = merged.find((earlier) => earlier.cells.every((cell, i) => cell === cells[i]));
    if (same !== undefined) same.profiles.push(...(row.profiles ?? []));
    else merged.push({ profiles: [...(row.profiles ?? [])], cells });
  }
  const all = profilesOf(parsed).map(({ name }) => name);
  const profiled =
    all.length > 0 && !merged.every(({ profiles }) => all.every((name) => profiles.includes(name)));
  const said: string[] = [];
  const shown = (index: number) => {
    if (merged.length < 2 || index >= table.keys.length) return true;
    const first = merged[0]?.cells[index];
    if (merged.some(({ cells }) => cells[index] !== first)) return true;
    said.push(`${table.keys[index]} = ${first}`);
    return false;
  };
  const columns = [...table.keys, ...table.states, ...table.children]
    .map((header, index) => ({ header, index }))
    .filter(({ index }) => shown(index));
  const profilesText = (profiles: string[]) => profiles.join(", ");
  const sameProfiles =
    profiled && merged.length > 1
      ? merged.every(
          ({ profiles }) => profilesText(profiles) === profilesText(merged[0]?.profiles ?? []),
        )
      : false;
  if (sameProfiles) said.unshift(profilesText(merged[0]?.profiles ?? []));
  const withProfiles = profiled && !sameProfiles;
  // One combination with nothing in it has no table to draw.
  if (columns.length === 0 && !withProfiles && said.length === 0) {
    return `${table.name}: one combination, with no states\n`;
  }
  const drawn = drawTable(
    [...(withProfiles ? ["profiles"] : []), ...columns.map(({ header }) => header)],
    merged.map(({ profiles, cells }) => [
      ...(withProfiles ? [profilesText(profiles)] : []),
      ...columns.map(({ index }) => cells[index] as string),
    ]),
  );
  return said.length === 0 ? drawn : `In every row: ${said.join(", ")}\n\n${drawn}`;
}

// A child's states in place, as a table: each row a world and the states of
// its parents on the way, then the child's own.
function statesInPlace(parsed: ParseResult, path: string, report: Reporter): number {
  let evaluated: InPlace;
  try {
    evaluated = inPlace(parsed, path);
  } catch (error) {
    return report.refuse((error as Error).message);
  }
  const type = parsed.types.find(({ name }) => name === evaluated.type) as Type;
  return report.succeed(evaluated, statesTable(parsed, path, type, evaluated, []));
}
